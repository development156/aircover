import { auth } from '@clerk/nextjs/server'
import { ensureZernioProfile } from '@sahoda/publishing'
import { isZernioPlatform, type ZernioPlatform } from '@sahoda/shared'

import { checkCountableLimit } from '@/lib/billing/entitlements'
import { readConnectionSlots } from '@/lib/connections/read'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'
import { zernioClient, zernioReturnUrl } from '@/lib/zernio/server'

/**
 * POST /api/oauth/zernio/start — begin connecting an Instagram account.
 *
 * The workspace comes from the SESSION, never from the request body. That is the
 * whole design: Zernio validates an accountId against your entire team rather than
 * against the profile in the request (doc 13 §3), so the tenant boundary has to be
 * ours, and it has to be established here — before the user ever leaves the app.
 *
 * Sequence:
 *   1. resolve the workspace from the Clerk session + active-workspace cookie
 *   2. find-or-create THAT workspace's Zernio profile (1:1, enforced in Postgres)
 *   3. record the mapping via ensure_zernio_profile — an RPC that takes identity
 *      from auth.jwt() and refuses Zernio's shared Default profile
 *   4. ask Zernio for an authUrl scoped to that profile, and redirect
 *
 * Nothing sensitive travels in the redirect, and nothing needs to: the return route
 * re-derives the workspace the same way rather than trusting anything sent back.
 */
export const dynamic = 'force-dynamic'

function fail(message: string, status: number): Response {
  return Response.json({ ok: false, message }, { status, headers: { 'cache-control': 'no-store' } })
}

export async function POST(request: Request): Promise<Response> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return fail('Sign in to connect an account.', 401)

    // Validated against the shared allowlist, never passed through: an arbitrary
    // string here would send a customer to a Zernio consent screen for a platform
    // no adapter can publish, producing a connection that looks live and is not.
    // Defaults to instagram so the existing caller keeps working unchanged.
    let platform: ZernioPlatform = 'instagram'
    try {
      const body: unknown = await request.json()
      const asked = (body as { platform?: unknown } | null)?.platform
      if (asked !== undefined) {
        if (!isZernioPlatform(asked)) return fail('That channel cannot be connected here.', 400)
        platform = asked
      }
    } catch {
      // No body at all is fine — instagram is the default.
    }

    const client = zernioClient()
    if (!client) {
      // Honest, not a 500: the rail simply is not provisioned in this environment.
      return fail('Connecting isn’t available right now — the publishing key isn’t set.', 503)
    }

    const workspace = await getActiveWorkspace()
    if (!workspace) return fail('Create a workspace first.', 400)
    workspaceId = workspace.id

    // ── THE CHANNELS PLAN LIMIT, ENFORCED BEFORE THE CONSENT SCREEN ──────────
    // The return route enforces this too, and has to — it is the only place that
    // knows what Zernio actually handed back. But enforcing ONLY there means the
    // refusal lands after the customer has approved third-party access to their
    // Instagram account on the platform's own screen. That grant is real and
    // external; we cannot undo it, and "your plan is full" afterwards is precisely
    // the failure-after-commitment this gate exists to prevent. For a paid action
    // the commitment is a credit hold; for a channel it is an OAuth grant, and this
    // is the line before it.
    //
    // Placed above `ensureZernioProfile` on purpose: that call CREATES a profile at
    // Zernio for workspaces that have none, and there is no reason to provision one
    // for a connect that is about to be refused.
    //
    // The disabled buttons on /connections are courtesy, not enforcement — a stale
    // page, a second tab, or a direct POST all reach this route with the buttons
    // never consulted.
    const slots = await readConnectionSlots(workspace.id)
    // Fail closed: without the count we cannot say there is room.
    if (slots === null) return fail('Couldn’t check your plan — try again.', 500)

    const limit = await checkCountableLimit(workspace.id, 'channels', slots.count)
    if (limit.kind === 'blocked') return fail(limit.sentence, 403)
    if (limit.kind === 'unknown') return fail('Couldn’t check your plan — try again.', 503)

    const profileId = await ensureZernioProfile(client, {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    })

    // Persist the mapping BEFORE sending the user away. If they connect and we have
    // no record of which profile is theirs, the account exists at Zernio and is
    // unreachable from here — an orphan we cannot even name.
    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('ensure_zernio_profile', {
      p_workspace_id: workspace.id,
      p_profile_id: profileId,
    })
    if (error) {
      const msg = error.message ?? ''
      if (msg.includes('FORBIDDEN_ROLE')) {
        return fail('Only an owner or editor can connect an account.', 403)
      }
      if (msg.includes('PROFILE_ALREADY_BOUND') || msg.includes('PROFILE_IN_USE')) {
        // Both mean the 1:1 already resolved differently. Refusing beats repointing
        // a workspace at another profile, which moves a tenant boundary silently.
        return fail('This workspace is already linked to a different publishing profile.', 409)
      }
      return fail('Couldn’t start the connection — try again.', 500)
    }

    const authUrl = await client.connectUrl(platform, profileId, zernioReturnUrl())
    return Response.json(
      { ok: true, authUrl },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    await reportServerError(error, { action: 'zernioStart', workspaceId })
    return fail('Couldn’t start the connection — try again.', 500)
  }
}
