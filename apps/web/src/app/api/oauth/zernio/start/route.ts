import { auth } from '@clerk/nextjs/server'
import { ensureZernioProfile } from '@sahoda/publishing'
import { isZernioPlatform, type ZernioPlatform } from '@sahoda/shared'

import { checkCountableLimit } from '@/lib/billing/entitlements'
import { setPendingConnectHeader, type ConnectMode } from '@/lib/connections/pending-connect'
import { readConnectionSlots } from '@/lib/connections/read'
import { connectPlatformFor } from '@/lib/zernio/connect-platform'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { readActiveWorkspace } from '@/lib/workspaces'
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
    /**
     * How the customer started this. `redirect` is the default because it is the
     * behaviour that has always worked and the one every caller falls back to when
     * the browser blocks a popup — a missing or unrecognised value must never
     * produce the newer path.
     */
    let mode: ConnectMode = 'redirect'
    try {
      const body: unknown = await request.json()
      const asked = (body as { platform?: unknown } | null)?.platform
      if (asked !== undefined) {
        if (!isZernioPlatform(asked)) return fail('That channel cannot be connected here.', 400)
        platform = asked
      }
      if ((body as { mode?: unknown } | null)?.mode === 'popup') mode = 'popup'
    } catch {
      // No body at all is fine — instagram is the default.
    }

    const client = zernioClient()
    if (!client) {
      // Honest, not a 500: the rail simply is not provisioned in this environment.
      return fail('Connecting isn’t available right now. The publishing key isn’t set.', 503)
    }

    /**
     * ── A 400 SAYING "CREATE A WORKSPACE FIRST" FOR A READ THAT BROKE ───────────
     * The workspace lookup used to return null for BOTH "this account has no
     * workspace" and "the workspace read failed" — the conflation run 23 split at
     * the reader. The handlers were named as unaudited then, and this is what it
     * cost here: a Supabase hiccup told a customer who HAS a workspace to create
     * one, under a 4xx that blames them for a fault on our side. A log reader
     * filtering 5xx saw nothing; the outage read as a client error.
     *
     * `none` keeps its 400 — the request genuinely cannot be served and the remedy
     * is real. `unreadable` is a 503: our side, transient, and retrying is the only
     * honest advice.
     */
    const workspaceRead = await readActiveWorkspace()
    if (workspaceRead.status === 'unreadable') {
      return fail('Couldn’t check your workspace just now. Try again.', 503)
    }
    if (workspaceRead.status === 'none') return fail('Create a workspace first.', 400)
    const workspace = workspaceRead.workspace
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
    if (slots === null) return fail('Couldn’t check your plan. Try again.', 500)

    const limit = await checkCountableLimit(workspace.id, 'channels', slots.count)
    if (limit.kind === 'blocked') return fail(limit.sentence, 403)
    if (limit.kind === 'unknown') return fail('Couldn’t check your plan. Try again.', 503)

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
      return fail('Couldn’t start the connection. Try again.', 500)
    }

    // ── REFUSE RATHER THAN SEND THEM SOMEWHERE THAT CANNOT RECEIVE THEM ──────
    // `zernioReturnUrl()` is null when no environment variable can name an
    // absolute origin. It used to fall back to `''`, producing the relative
    // `/api/oauth/zernio/return`, which Zernio resolves against its OWN host —
    // so the customer approved access at the platform and was returned to
    // zernio.com. Stopping here costs them nothing; the grant they would have
    // given is real and cannot be taken back.
    //
    // ── AND THE INTENT RIDES ON IT, NOT ONLY IN THE COOKIE ───────────────────
    // Both the mode and the platform were carried by `sahoda_connect` alone, and
    // it kept not arriving: our origin -> Zernio -> Google -> Zernio -> us is four
    // hops and two cross-site boundaries, and a `SameSite=Lax` cookie that
    // "should" survive that evidently does not in every browser. Two reported
    // defects came out of the one missing cookie — the popup answered with a 303
    // and loaded the app inside itself, and create-scoping fell to its fail-closed
    // branch so a real connect wrote no row. Zernio appends its own result params
    // with the URL API and preserves an existing query string, so what we put here
    // comes back. The cookie is still set, still read first, and this is the
    // fallback for the trip it does not survive. RETURN_MODE_PARAM in
    // lib/zernio/return-url.ts carries the argument for why neither value can
    // widen anything.
    const returnTo = zernioReturnUrl({ mode, platform })
    if (!returnTo) {
      return fail(
        'Connecting isn’t available right now. This deployment has no return address.',
        503,
      )
    }

    // ── OUR NAME FOR THE CHANNEL IS NOT ZERNIO'S ─────────────────────────────
    // `x` and `gbp` are OUR ids. Connect wants `twitter` and `googlebusiness`,
    // and passing ours straight through is why those two buttons answered
    // "Couldn't start the connection. Try again." on every press, while
    // Instagram, LinkedIn and Facebook worked — for those three the two names
    // happen to be the same string. See lib/zernio/connect-platform.ts: this is
    // the FOURTH platform vocabulary in this integration and the only one nobody
    // had mapped.
    const connectName = connectPlatformFor(platform)
    if (connectName === null) {
      // Telegram. `GET /v1/connect/telegram` returns an access CODE for a bot,
      // not an authUrl, so there is no consent screen to open. Refused here
      // rather than discovered downstream when `connectUrl` throws for want of a
      // field — which is exactly how it was found.
      return fail('This channel is connected a different way, and that flow isn’t built yet.', 400)
    }

    const authUrl = await client.connectUrl(connectName, profileId, returnTo)

    // ── THE ONLY RECORD OF WHAT THE CUSTOMER ASKED FOR ────────────────────────
    // Written as a HEADER on this very response, not through `cookies()`. This
    // route answers with a `Response` it builds itself, and mutating the
    // request-scoped cookie store put nothing on it — so the cookie was never
    // sent and the return trip always read `null`. Two reported bugs came out of
    // that one omission: the popup showed the app instead of closing, and a
    // genuine connect wrote no row at all. See lib/connections/pending-connect.ts.
    //
    // Attached LAST, after every refusal above has had its chance. A cookie set
    // before a 403 would authorise a create for a connect that never happened.
    return Response.json(
      { ok: true, authUrl },
      {
        status: 200,
        headers: {
          'cache-control': 'no-store',
          'set-cookie': setPendingConnectHeader({ platform, mode }),
        },
      },
    )
  } catch (error) {
    await reportServerError(error, { action: 'zernioStart', workspaceId })
    return fail('Couldn’t start the connection. Try again.', 500)
  }
}
