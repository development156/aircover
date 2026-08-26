import { auth } from '@clerk/nextjs/server'
import { reconcileAccounts } from '@sahoda/publishing'
import { isZernioPlatform, ZERNIO_PLATFORMS } from '@sahoda/shared'

import { checkCountableLimit } from '@/lib/billing/entitlements'
import { CLEAR_PENDING_CONNECT, readPendingConnect } from '@/lib/connections/pending-connect'
import { connectionKey, readConnectionSlots } from '@/lib/connections/read'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { readActiveWorkspace } from '@/lib/workspaces'
import { RETURN_MODE_PARAM, RETURN_PLATFORM_PARAM } from '@/lib/zernio/return-url'
import { zernioClient } from '@/lib/zernio/server'

/**
 * GET /api/oauth/zernio/return — where Zernio sends the browser after connecting.
 *
 * ── EVERY QUERY PARAMETER ON THIS REQUEST IS IGNORED ──────────────────────────
 * Zernio appends `connected=…&profileId=…&accountId=…&username=…`. None of it is
 * read. It arrives through the user's browser, which makes it attacker-influenceable,
 * and doc 13 §3 is explicit that a wrong accountId does not error — it publishes
 * successfully to someone else's Instagram and returns HTTP 200. There is no error
 * to catch downstream, so the id must never be taken from here in the first place.
 *
 * Instead: re-derive the workspace from the session, look up ITS profile, and ask
 * Zernio what accounts sit under that profile. The answer is the same information,
 * obtained from a source the browser cannot influence.
 *
 * That also makes the route safe to replay. Someone who bookmarks it, or is tricked
 * into loading it while signed into a different workspace, reconciles THAT
 * workspace — finds nothing new — and nothing is written.
 */
export const dynamic = 'force-dynamic'

/**
 * One account Zernio returned, tagged with the platform it was asked for.
 *
 * Derived from `reconcileAccounts` rather than restated — a field added there shows
 * up here as a type error rather than being silently dropped on the way to the RPC.
 */
type ReconciledForPlatform = Awaited<ReturnType<typeof reconcileAccounts>>[number] & {
  platform: (typeof ZERNIO_PLATFORMS)[number]
}

/**
 * Where the browser ends up, whatever the HTTP status is.
 *
 * The origin comes from the incoming request URL rather than a header, so this can
 * only ever point at the host that was actually reached.
 */
function connectionsUrl(request: Request, status: string, detail?: string): string {
  const url = new URL('/connections', request.url)
  url.searchParams.set('zernio', status)
  if (detail) url.searchParams.set('reason', detail)
  return url.toString()
}

/** Minimal escaping for an HTML attribute — the URL carries `&` between params. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * THE POPUP'S LAST DOCUMENT — it tells the opener and shuts itself.
 *
 * ── WHY IT DOES NOT USE `window.opener` AS ITS PRIMARY SIGNAL ────────────────
 * It did, and it failed every time in the real world. Google's sign-in pages
 * serve `Cross-Origin-Opener-Policy: same-origin`; the moment the popup lands on
 * one the browser moves it into a NEW browsing context group and **severs
 * `window.opener` permanently**. Coming back to our own origin afterwards does
 * not restore it. Our own headers were never the question.
 *
 * So the closer's `opener`-is-null fallback ran, and its fallback was
 * `location.replace('/connections?…')` — which loaded the ENTIRE APP inside a
 * 620px window while the opener sat on "Opening…". Reported as "it opens a popup
 * and it opens another new website and connects there".
 *
 * `BroadcastChannel` is scoped by ORIGIN rather than by window relationship, so
 * it crosses that boundary. `opener.postMessage` is still attempted for the case
 * where the chain survived, and costs nothing when it did not.
 *
 * ── AND IT NEVER LOADS THE APP AGAIN ─────────────────────────────────────────
 * `window.close()` can also be refused once COOP has changed the browsing context
 * group, so this page must be readable on its own. It says one sentence and
 * stops. The old fallback replaced a self-contained confirmation with a second
 * copy of the product in a window too small to use it, which is worse than doing
 * nothing at all.
 *
 * ── THE STATUS LINE IS UNTOUCHED ─────────────────────────────────────────────
 * This route exists in its current shape because a failure leaving as 303 was
 * invisible to a 4xx/5xx log filter. A popup does not change what happened, so it
 * does not change the status code: a failed popup connect is still a 5xx, and
 * only the BODY differs.
 */
function popupCloser(
  request: Request,
  httpStatus: number,
  status: string,
  detail?: string,
): Response {
  const target = connectionsUrl(request, status, detail)
  const safe = escapeAttr(target)
  const worked = status === 'connected' || status === 'nothing' || status === 'limit'
  const line = worked
    ? 'Connected. You can close this window.'
    : 'That connection didn’t finish. You can close this window and try again.'

  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${worked ? 'Connected' : 'Didn’t finish'}</title>` +
      `<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;` +
      `place-items:center;min-height:100vh;padding:24px;text-align:center}` +
      `a{color:inherit}</style></head>` +
      `<body><div><p>${line}</p>` +
      // A link, never an auto-navigate. Someone whose window will not close can
      // get back to the app deliberately; nobody has the app loaded at them.
      `<p><a href="${safe}">Open Connections</a></p></div>` +
      `<script>(function(){` +
      // FIRST, and the one that actually works: origin-scoped, so COOP cannot
      // reach it. The channel name matches lib/connections/use-connect-flow.ts.
      `try{var c=new BroadcastChannel("sahoda-connect");` +
      `c.postMessage({type:"sahoda:connect-outcome"});c.close();}catch(e){}` +
      // SECOND, for the case where the opener chain did survive. `location.origin`
      // and nothing else — a wildcard would post the outcome to whatever happened
      // to open this window.
      `try{if(window.opener&&!window.opener.closed){` +
      `window.opener.postMessage({type:"sahoda:connect-outcome"},window.location.origin);}}catch(e){}` +
      // THIRD. May be refused after COOP changed the browsing context group, which
      // is why the sentence above stands on its own.
      `try{window.close();}catch(e){}` +
      `})();</script></body></html>`,
    {
      status: httpStatus,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'set-cookie': CLEAR_PENDING_CONNECT,
        // Kept for the log reader and for `curl -I`, exactly as `backError` does.
        location: target,
      },
    },
  )
}

/**
 * A real outcome: the connect worked, or there was genuinely nothing new to record.
 * 303 is correct here and the logs are already truthful about it.
 */
function backOk(
  request: Request,
  status: 'connected' | 'nothing' | 'limit',
  detail?: string,
): Response {
  // Hand-built rather than `Response.redirect`, whose headers are immutable, so
  // the pending-connect cookie can be spent on the way out. Same 303, same
  // `Location` — `real outcomes keep their 303` still holds.
  return new Response(null, {
    status: 303,
    headers: {
      location: connectionsUrl(request, status, detail),
      'set-cookie': CLEAR_PENDING_CONNECT,
      'cache-control': 'no-store',
    },
  })
}

/** The sentence in the fallback body. Ours, never a message from Zernio or Postgres. */
const DID_NOT_FINISH = 'That connection didn’t finish.'
const SOME_DID_NOT_FINISH =
  'Some of your accounts connected and some didn’t. The list on Connections shows which.'

/**
 * A FAILED connect — answered with its real status code.
 *
 * ── WHY THIS IS NOT A REDIRECT ────────────────────────────────────────────────
 * Every outcome used to leave here as `Response.redirect(..., 303)`. A 303 is a
 * SUCCESS status, so a failed connect was indistinguishable from a working one in
 * production logs: filtering `/api/oauth/zernio/return` by 4xx/5xx returned nothing
 * and read as "no connect failures", which was not true — the reason was in the
 * `Location` header, which Vercel's log view does not expose. Twenty-four hours of
 * logs could not answer whether a single customer had failed to connect.
 *
 * The browser still has to land somewhere, though: this URL is where Zernio sends a
 * signed-in customer, and a bare error page would strand them. A 4xx/5xx `Location`
 * header is not followed, so the redirect moves into the body — meta-refresh, plus a
 * real link for anyone whose browser ignores it. The status line becomes the
 * observable outcome; the body stays the user-facing one.
 */
function backError(
  request: Request,
  httpStatus: number,
  detail: string,
  /**
   * `error` for an outright failure, `partial` for "some accounts recorded and some
   * did not". A partial keeps the 5xx STATUS deliberately — this route exists in its
   * current shape because a failure that leaves as 303 is invisible to a 4xx/5xx log
   * filter, and a half-failure is a failure by that measure. Only the words change.
   */
  kind: 'error' | 'partial' = 'error',
): Response {
  const target = connectionsUrl(request, kind, detail)
  const safe = escapeAttr(target)
  const sentence = kind === 'partial' ? SOME_DID_NOT_FINISH : DID_NOT_FINISH
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta http-equiv="refresh" content="0; url=${safe}">` +
      `<title>Connection didn’t finish</title></head>` +
      `<body><p>${sentence} ` +
      `<a href="${safe}">Go back to Connections</a> to try again.</p></body></html>`,
    {
      status: httpStatus,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        // Spent on a failure too. A cookie surviving a failed trip would sit
        // there authorising a create on whatever the customer did next.
        'set-cookie': CLEAR_PENDING_CONNECT,
        // Not followed by browsers on a 4xx/5xx, and deliberately kept anyway: it is
        // what makes the intended destination visible to a log reader and to curl -I.
        location: target,
      },
    },
  )
}

export async function GET(request: Request): Promise<Response> {
  /**
   * ── WHAT THE CUSTOMER PRESSED, READ FIRST ─────────────────────────────────
   * Read from an httpOnly cookie our own start route set, never from the query
   * string — see lib/connections/pending-connect.ts for why that distinction is
   * load-bearing on this route in particular.
   *
   * Read at the TOP because it decides the SHAPE of every answer below, failures
   * included: a popup that gets a 303 just leaves a second copy of /connections
   * sitting in a 620px window, and the customer has to close it and work out for
   * themselves whether anything happened.
   *
   * `null` when the cookie expired, was never set (a bookmarked replay), or the
   * browser dropped it. That is not an error: the trip still REFRESHES every row
   * we already hold, which is the whole of the documented self-heal that matters.
   * What it may not do without this is CREATE.
   */
  const pending = await readPendingConnect()

  /**
   * ── THE ONE QUERY PARAMETER THIS ROUTE READS, AND WHY IT IS ALLOWED ────────
   * The cookie above is still the only thing that can authorise a CREATE, and
   * that has not changed. But it turned out not to survive the round trip
   * reliably, and the popup flag rode on it: the customer pressed Connect, a
   * popup opened, and the return trip answered with a 303 because `pending` was
   * null — so the popup loaded a second copy of /connections instead of closing.
   * Reported three times, most recently as "the popup still not closing".
   *
   * `mode` steers PRESENTATION and nothing else: an HTML page that says "you can
   * close this window" versus a redirect. Forging it changes which of those two a
   * customer sees. It cannot name a workspace, a platform, an account or a plan,
   * and it cannot cause one row to be written. That is the whole distinction the
   * header of this file draws, and this value sits on the safe side of it.
   *
   * EITHER source is enough. The cookie still works where it survives, and the
   * absence of both still means redirect, so the older path remains what a
   * stripped or mangled value produces.
   */
  const params = new URL(request.url).searchParams
  const popup = pending?.mode === 'popup' || params.get(RETURN_MODE_PARAM) === 'popup'

  /**
   * WHICH PLATFORM MAY HAVE A ROW CREATED FOR IT ON THIS TRIP.
   *
   * The cookie first, always. The parameter is the fallback for the trip it did
   * not survive, and it is validated against the shared allowlist rather than
   * used as given: an unknown string produces `null`, which is the fail-closed
   * branch, not a create for a channel nobody has heard of.
   *
   * `null` still means no create. Losing both a cookie and a query parameter
   * leaves the trip doing what it has always done for a replay — refreshing every
   * row we already hold and creating none.
   */
  const askedPlatform = params.get(RETURN_PLATFORM_PARAM)
  const createFor: string | null =
    pending?.platform ??
    (askedPlatform !== null && isZernioPlatform(askedPlatform) ? askedPlatform : null)

  const ok = (status: 'connected' | 'nothing' | 'limit', detail?: string) =>
    popup ? popupCloser(request, 303, status, detail) : backOk(request, status, detail)
  /** Each failure carries the status a log reader would expect for that cause. */
  const fail = (httpStatus: number, detail: string) =>
    popup
      ? popupCloser(request, httpStatus, 'error', detail)
      : backError(request, httpStatus, detail)

  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return fail(401, 'signin')

    const client = zernioClient()
    // The rail is not provisioned in this environment — ours to fix, not the user's.
    if (!client) return fail(503, 'unavailable')

    /**
     * ── THE SAME CONFLATION, AND HERE IT MISLABELS AN OUTAGE ───────────────────
     * The workspace lookup returned null for "no workspace" AND for "the read
     * failed", so a broken query left this route as a 400 tagged `no-workspace`.
     * This file exists in its current shape precisely because a failure that
     * leaves as a success status is invisible to a log filter — and a 4xx on a
     * server-side read failure is the same lie one class down: it says the
     * customer's request was wrong when our database did not answer.
     *
     * 503, and the visible status stays `error`: `ConnectOutcomeNotice` matches
     * an ALLOWLIST and renders nothing for a value it does not know, so inventing
     * a sixth status here would silently show the customer no notice at all. The
     * truth rides in the HTTP status and in `reason`, which is what the log reader
     * needs; `error`'s copy — "Nothing was changed. Try connecting the channel
     * again." — is true of this case and is the right advice for it.
     */
    const workspaceRead = await readActiveWorkspace()
    if (workspaceRead.status === 'unreadable') return fail(503, 'workspace-unreadable')
    if (workspaceRead.status === 'none') return fail(400, 'no-workspace')
    const workspace = workspaceRead.workspace
    workspaceId = workspace.id

    const supabase = createServerSupabase()

    // The profile is READ from our own table, keyed by the workspace we just
    // derived from the session — not taken from the redirect.
    const { data: mapping, error: mapErr } = await supabase
      .from('zernio_profiles')
      .select('profile_id')
      .eq('workspace_id', workspace.id)
      .maybeSingle()

    if (mapErr) return fail(500, 'lookup')
    const profileId = mapping?.profile_id as string | undefined
    if (!profileId) {
      // They returned without ever having started here. Nothing to reconcile — a real
      // outcome, not a failure, so this one keeps its 303.
      return ok('nothing', 'no-profile')
    }

    // EVERY platform, not the one the redirect claims. The query string is
    // attacker-influenceable and is ignored wholesale; asking Zernio for each
    // platform under our own profile costs a few reads and cannot be steered.
    // It also self-heals: a connection that failed to record on an earlier pass is
    // picked up by the next return trip, whatever the user just connected.
    //
    // ── ONE PLATFORM'S FAILURE IS ONE PLATFORM'S FAILURE ──────────────────────
    // This was a bare `Promise.all`, which rejects on the first failure — so a
    // single platform's `listAccounts` throwing threw away the accounts every
    // OTHER platform had already returned, and the whole trip left as a generic
    // `unexpected`. Each read is now caught where it happens and becomes its own
    // recorded outcome, so the platforms that answered are still recorded.
    const reads = await Promise.all(
      ZERNIO_PLATFORMS.map(async (platform) => {
        try {
          const found = await reconcileAccounts(client, { profileId, platform })
          return { platform, read: true, accounts: found.map((a) => ({ ...a, platform })) }
        } catch (error) {
          await reportServerError(error, { action: 'zernioReturn', workspaceId })
          return { platform, read: false, accounts: [] as ReconciledForPlatform[] }
        }
      }),
    )

    const unreadable = reads.filter((r) => !r.read).map((r) => r.platform)
    const accounts = reads.flatMap((r) => r.accounts)

    // NOTHING could be read. Deliberately not `ok('nothing')`: that status claims we
    // asked Zernio and it had no accounts, and here we never successfully asked. A
    // measurement we did not make must not be reported as a measurement.
    if (unreadable.length === ZERNIO_PLATFORMS.length) return fail(500, 'read')

    // Zernio has no accounts under our profile, and every platform answered to say
    // so. Nothing went wrong — the user may simply have cancelled at the consent
    // screen — so this stays a 303.
    if (accounts.length === 0 && unreadable.length === 0) return ok('nothing')

    // ── PLAN LIMIT ON CHANNELS (owner ruling #5) ─────────────────────────────
    // Free allows 2 channels; this loop used to write every account Zernio
    // returned, so a free workspace could hold all four platforms.
    //
    // ── WHY THIS ADMITS UP TO THE LIMIT AND NEVER REFUSES THE TRIP ───────────
    // By the time this route runs, the account is ALREADY connected on Zernio's
    // side — the user approved it on the platform's own screen. Rejecting the whole
    // return would produce precisely the failure this file's comments are built to
    // avoid: "an account they connected at Zernio that this app cannot see." It
    // would also break the documented self-heal, where a later trip picks up a
    // connection an earlier one failed to record, and it would misfire on every
    // repeat visit, since re-upserting EXISTING rows would be counted as new.
    //
    // So the accounts are partitioned. A key already in `slots` is a REFRESH: it
    // updates a row that already exists and consumes no allowance, so it is written
    // unconditionally — that is what keeps the self-heal working. Only genuinely new
    // rows draw down headroom, and the remainder are left unwritten and reported.
    const slots = await readConnectionSlots(workspace.id)
    // Fail CLOSED. Without this read there is no way to tell a refresh from a new
    // row, and writing blind is the hole being closed. The self-heal covers it: the
    // next trip back reconciles everything this one declined to touch.
    if (slots === null) return fail(500, 'slots')

    const limitVerdict = await checkCountableLimit(workspace.id, 'channels', slots.count)
    // `blocked` and `unknown` are both zero headroom. They differ in what the
    // customer is told, not in what gets written — an unreadable plan must not
    // admit a channel.
    const headroom =
      limitVerdict.kind === 'allowed' ? Math.max(0, limitVerdict.limit - slots.count) : 0

    let written = 0
    /** Platforms whose account came back from Zernio and did NOT reach our table. */
    const unwritten: string[] = []
    /** New accounts the plan had no room for. Deliberately not written, not an error. */
    const overLimit: string[] = []
    /** Upserts actually ATTEMPTED — see the `written === 0` branch below. */
    let attempted = 0
    /** New rows admitted so far this trip. */
    let admitted = 0

    for (const account of accounts) {
      const isRefresh = slots.keys.has(connectionKey(account.platform, account.accountId))

      if (!isRefresh) {
        /**
         * ── A ROW IS ONLY EVER CREATED FOR THE PLATFORM THE CUSTOMER PRESSED ──
         * This is the disconnect-then-reconnect fix, and it is deliberately the
         * narrowest rule that closes it. Every account we ALREADY hold is still
         * refreshed, whatever platform it is on, so the self-heal this route was
         * built around keeps working. What can no longer happen is a platform the
         * customer never touched — or one they explicitly disconnected — arriving
         * back in the table as a side effect of connecting something else.
         *
         * Skipped SILENTLY rather than counted as `overLimit` or `unwritten`. It
         * is neither: the plan had room and the write did not fail. Nothing was
         * refused and nothing broke, so there is no outcome to report — reporting
         * one would put correct behaviour in the failure channel, which is the
         * mistake the `overLimit` branch below already exists to avoid.
         */
        if (createFor !== null && account.platform !== createFor) continue

        /**
         * NO RECORD OF A PRESS, NO CREATE — neither cookie nor parameter. A
         * replay of this URL, or an attempt abandoned long enough for both to be
         * gone. Refusing to create is
         * the fail-closed direction: the customer presses Connect again and the
         * next trip has a fresh cookie, which costs one click. Creating instead
         * costs them the disconnect they asked for, silently, and that is the
         * defect being fixed.
         */
        if (createFor === null) continue

        if (admitted >= headroom) {
          overLimit.push(account.platform)
          continue
        }
        admitted += 1
      }

      attempted += 1
      const { error } = await supabase.rpc('upsert_zernio_connection', {
        p_workspace_id: workspace.id,
        p_platform: account.platform,
        p_external_account: {
          id: account.accountId,
          profileId: account.profileId,
          ...(account.username ? { handle: account.username } : {}),
          ...(account.platformStatus ? { platformStatus: account.platformStatus } : {}),
          needsReconnection: account.needsReconnection,
        },
        p_profile_id: profileId,
        // Zernio issues 60-day tokens with no proactive expiry signal (doc 13 §2.5),
        // so this column is what the T-7 warning job will read. Storing it is the
        // difference between warning a customer and letting a silent stop happen.
        p_expires_at: account.tokenExpiresAt,
      })
      if (error) {
        await reportServerError(new Error(`upsert_zernio_connection: ${error.message}`), {
          action: 'zernioReturn',
          workspaceId,
        })
        unwritten.push(account.platform)
        // The row was not created, so the slot it claimed is free again — give it
        // back rather than letting a failed write shut a later account out of a
        // place the plan still has room for.
        if (!isRefresh) admitted -= 1
        continue
      }
      written += 1
    }

    // Accounts existed at Zernio and every write we ATTEMPTED failed. The customer's
    // account is connected on their side and unreachable from ours — a 500, loudly.
    //
    // The guard is `attempted > 0`, not `accounts.length > 0`. It was the latter, to
    // exclude one live path that arrives here with an empty list (some platforms read
    // cleanly and had no accounts, at least one other failed to read — which falls
    // past `ok('nothing')` because that is guarded on `unreadable.length === 0`).
    // The plan limit adds a SECOND such path: when every returned account is over
    // the limit, nothing is attempted and `written` is 0 while `accounts.length` is
    // not. Reported as "every write failed" that would be a fabricated outage — the
    // writes did not fail, they were never made. Counting attempts states the real
    // condition directly and covers both paths.
    if (written === 0 && attempted > 0) return fail(500, 'write')

    // ── A PARTIAL CONNECT IS NOT A CONNECT ────────────────────────────────────
    // This used to be the whole test: `written === 0`. So ONE platform succeeding
    // reported `connected` while every other platform's account was silently
    // dropped — the customer was told it worked, the row they were waiting for was
    // never written, and the only trace was a Sentry event.
    //
    // Both halves count as missed, because from the customer's side they are the
    // same thing: an account they connected at Zernio that this app cannot see.
    const missed = [...unreadable, ...unwritten]
    if (missed.length > 0)
      return popup
        ? popupCloser(request, 500, 'partial', `${missed.length}-not-recorded`)
        : backError(request, 500, `${missed.length}-not-recorded`, 'partial')

    // Some accounts were declined by the PLAN. Ranked below `partial` on purpose: a
    // genuine failure outranks a policy decision, and reporting a limit while a write
    // silently died would hide the write.
    //
    // A 303, not a 5xx. Nothing went wrong — every write we chose to make succeeded,
    // and the accounts we skipped are still connected at Zernio and will be picked up
    // by the next return trip once there is room. Sending this to the 4xx/5xx log
    // filter would fill the failure channel with correct behaviour.
    if (overLimit.length > 0) return ok('limit', `${overLimit.length}-over-limit`)

    return ok('connected')
  } catch (error) {
    await reportServerError(error, { action: 'zernioReturn', workspaceId })
    return fail(500, 'unexpected')
  }
}
