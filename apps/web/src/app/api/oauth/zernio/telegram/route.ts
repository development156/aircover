import { auth } from '@clerk/nextjs/server'
import { ensureZernioProfile, reconcileFromAccounts } from '@sahoda/publishing'

import { checkCountableLimit } from '@/lib/billing/entitlements'
import {
  CLEAR_PENDING_TELEGRAM,
  readPendingTelegram,
  setPendingTelegramHeader,
} from '@/lib/connections/pending-telegram'
import { connectionKey, readConnectionSlots } from '@/lib/connections/read'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { readActiveWorkspace } from '@/lib/workspaces'
import { zernioClient } from '@/lib/zernio/server'

/**
 * TELEGRAM'S OWN RAIL — issue a pairing code, then poll until it lands.
 *
 * ── WHY THIS PLATFORM NEEDED A SECOND SURFACE ────────────────────────────────
 * Every other channel on /connections is OAuth. MEASURED against the live API,
 * `GET /v1/connect/telegram` returns **no authUrl at all**: it answers
 * `{ code, botUsername, expiresAt, expiresIn, instructions }`, valid fifteen
 * minutes. The customer adds Zernio's bot as an administrator of their channel
 * and messages it the code; the link completes inside Telegram, with no consent
 * screen, no popup and no return trip.
 *
 * Shipped on the OAuth rail anyway, the button answered "Couldn't start the
 * connection. Try again." on every press — a retry that could never succeed.
 * `catalogue.ts` has carried the note "what building it needs: a code-and-poll
 * surface of its own" since. This is it.
 *
 *   POST  issue a code for this workspace's profile
 *   GET   has it landed yet — and if so, record it
 *
 * ── NOTHING THE POLL RETURNS IS TRUSTED ──────────────────────────────────────
 * `PATCH /v1/connect/telegram?code=` answers with an `account` object once the
 * link lands. It is dropped on the floor. doc 13 §3: Zernio validates an
 * accountId against your whole TEAM, so a wrong one does not error — it names
 * somebody else's account and returns 200. The account is re-derived exactly the
 * way the OAuth return route does it: ask for the accounts under the profile we
 * read from OUR table, keyed by the workspace derived from the Clerk session.
 */
export const dynamic = 'force-dynamic'

function fail(message: string, status: number, extra: Record<string, string> = {}): Response {
  return Response.json(
    { ok: false, message },
    { status, headers: { 'cache-control': 'no-store', ...extra } },
  )
}

/** The workspace and its Zernio profile, or a refusal both verbs can return. */
async function workspaceProfile(): Promise<
  { ok: true; workspaceId: string; profileId: string } | { ok: false; response: Response }
> {
  const workspaceRead = await readActiveWorkspace()
  if (workspaceRead.status === 'unreadable') {
    return { ok: false, response: fail('Couldn’t check your workspace just now. Try again.', 503) }
  }
  if (workspaceRead.status === 'none') {
    return { ok: false, response: fail('Create a workspace first.', 400) }
  }
  const workspace = workspaceRead.workspace

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('zernio_profiles')
    .select('profile_id')
    .eq('workspace_id', workspace.id)
    .maybeSingle()
  if (error) return { ok: false, response: fail('Couldn’t start the connection. Try again.', 500) }

  const profileId = data?.profile_id as string | undefined
  if (!profileId) {
    // No mapping yet means nothing has ever been connected here. The POST creates
    // one; a GET arriving first has nothing to poll about.
    return { ok: false, response: fail('Start the Telegram connection first.', 400) }
  }
  return { ok: true, workspaceId: workspace.id, profileId }
}

/** POST — issue a pairing code. */
export async function POST(): Promise<Response> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return fail('Sign in to connect an account.', 401)

    const client = zernioClient()
    if (!client) {
      return fail('Connecting isn’t available right now. The publishing key isn’t set.', 503)
    }

    const workspaceRead = await readActiveWorkspace()
    if (workspaceRead.status === 'unreadable') {
      return fail('Couldn’t check your workspace just now. Try again.', 503)
    }
    if (workspaceRead.status === 'none') return fail('Create a workspace first.', 400)
    const workspace = workspaceRead.workspace
    workspaceId = workspace.id

    /**
     * ── THE PLAN GATE, BEFORE THE CODE AND NOT AFTER ─────────────────────────
     * The same line the OAuth start route draws, for the same reason: by the time
     * a customer has added a bot as an administrator of their channel they have
     * done real work in another product, and refusing them afterwards is the
     * failure-after-commitment this gate exists to prevent. A pairing code costs
     * nothing to withhold and everything to honour and then decline.
     */
    const slots = await readConnectionSlots(workspace.id)
    if (slots === null) return fail('Couldn’t check your plan. Try again.', 500)
    const limit = await checkCountableLimit(workspace.id, 'channels', slots.count)
    if (limit.kind === 'blocked') return fail(limit.sentence, 403)
    if (limit.kind === 'unknown') return fail('Couldn’t check your plan. Try again.', 503)

    const profileId = await ensureZernioProfile(client, {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    })
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
      return fail('Couldn’t start the connection. Try again.', 500)
    }

    const issued = await client.telegramCode(profileId)

    /**
     * The code is in the BODY as well as the cookie, and those are two different
     * jobs. The body is what the customer reads and types into Telegram — it has
     * to be visible or the flow is impossible. The cookie is what authorises the
     * poll, and it is httpOnly so that a poll can only ever ask about a code this
     * browser was issued. See lib/connections/pending-telegram.ts.
     */
    return Response.json(
      {
        ok: true,
        code: issued.code,
        botUsername: issued.botUsername,
        expiresAt: issued.expiresAt,
        // Zernio's own step list, passed through rather than rewritten. It names
        // the bot and the code inline and it is the instruction the customer is
        // following inside another product; paraphrasing it here would put two
        // slightly different sets of steps in front of the same person.
        instructions: issued.instructions,
      },
      {
        status: 200,
        headers: {
          'cache-control': 'no-store',
          'set-cookie': setPendingTelegramHeader(issued.code),
        },
      },
    )
  } catch (error) {
    await reportServerError(error, { action: 'zernioTelegramCode', workspaceId })
    return fail('Couldn’t start the connection. Try again.', 500)
  }
}

/** GET — has the customer finished in Telegram, and if so record it. */
export async function GET(): Promise<Response> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return fail('Sign in to connect an account.', 401)

    const client = zernioClient()
    if (!client) return fail('Connecting isn’t available right now.', 503)

    const code = await readPendingTelegram()
    // No cookie means no attempt in flight — an expired one, a different browser,
    // or a poll nobody started. Not an error, and deliberately not `pending`:
    // pending claims we asked and are waiting, and we did not ask.
    if (code === null) {
      return Response.json(
        { ok: true, status: 'expired' },
        { status: 200, headers: { 'cache-control': 'no-store' } },
      )
    }

    const found = await workspaceProfile()
    if (!found.ok) return found.response
    workspaceId = found.workspaceId
    const { profileId } = found

    const verdict = await client.telegramStatus(code)
    if (verdict.status === 'pending') {
      return Response.json(
        { ok: true, status: 'pending', expiresAt: verdict.expiresAt },
        { status: 200, headers: { 'cache-control': 'no-store' } },
      )
    }
    if (verdict.status === 'expired') {
      return Response.json(
        { ok: true, status: 'expired' },
        {
          status: 200,
          headers: { 'cache-control': 'no-store', 'set-cookie': CLEAR_PENDING_TELEGRAM },
        },
      )
    }

    /**
     * ── LANDED. NOW FIND IT OURSELVES ────────────────────────────────────────
     * `verdict` says only that something connected. Which account it is comes
     * from asking Zernio for the accounts under OUR profile — the same move the
     * OAuth return route makes, and for the same reason its header spells out at
     * length: an id that arrives through a channel the customer's browser
     * touched cannot be allowed to name a resource.
     */
    const all = await client.listAccounts(profileId)
    const mine = reconcileFromAccounts(all, { profileId, zernioPlatform: 'telegram' })
    if (mine.length === 0) {
      // Zernio says connected and its own account list does not show it. Reported
      // as a failure rather than smoothed over: this is the one shape that would
      // otherwise leave a customer who HAS done the work looking at "waiting".
      await reportServerError(
        new Error('zernioTelegram: status connected but no telegram account under the profile'),
        { action: 'zernioTelegramPoll', workspaceId },
      )
      return fail('Telegram says it’s linked and we can’t see it yet. Try again in a moment.', 502)
    }

    const slots = await readConnectionSlots(found.workspaceId)
    if (slots === null) return fail('Couldn’t check your plan. Try again.', 500)

    let written = 0
    for (const account of mine) {
      const isRefresh = slots.keys.has(connectionKey('telegram', account.accountId))
      if (!isRefresh) {
        // Re-checked at the moment of writing, not only when the code was issued:
        // fifteen minutes is long enough for another tab to have filled the last
        // slot, and the gate that matters is the one at the write.
        const limit = await checkCountableLimit(found.workspaceId, 'channels', slots.count)
        const headroom = limit.kind === 'allowed' ? Math.max(0, limit.limit - slots.count) : 0
        if (written >= headroom) break
      }
      const supabase = createServerSupabase()
      const { error } = await supabase.rpc('upsert_zernio_connection', {
        p_workspace_id: found.workspaceId,
        p_platform: 'telegram',
        p_external_account: {
          id: account.accountId,
          profileId: account.profileId,
          ...(account.username ? { handle: account.username } : {}),
          ...(account.platformStatus ? { platformStatus: account.platformStatus } : {}),
          needsReconnection: account.needsReconnection,
        },
        p_profile_id: profileId,
        p_expires_at: account.tokenExpiresAt,
      })
      if (error) {
        await reportServerError(new Error(`upsert_zernio_connection: ${error.message}`), {
          action: 'zernioTelegramPoll',
          workspaceId,
        })
        continue
      }
      written += 1
    }

    if (written === 0) {
      return fail('Your plan has no room for another channel right now.', 403, {
        'set-cookie': CLEAR_PENDING_TELEGRAM,
      })
    }

    return Response.json(
      { ok: true, status: 'connected' },
      {
        status: 200,
        headers: { 'cache-control': 'no-store', 'set-cookie': CLEAR_PENDING_TELEGRAM },
      },
    )
  } catch (error) {
    await reportServerError(error, { action: 'zernioTelegramPoll', workspaceId })
    return fail('Couldn’t check the connection. Try again.', 500)
  }
}
