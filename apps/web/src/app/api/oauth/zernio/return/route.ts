import { auth } from '@clerk/nextjs/server'
import { reconcileFromAccounts } from '@sahoda/publishing'
import { isZernioPlatform, ZERNIO_PLATFORMS, type ZernioPlatform } from '@sahoda/shared'

import { checkCountableLimit } from '@/lib/billing/entitlements'
import { CLEAR_PENDING_CONNECT, readPendingConnect } from '@/lib/connections/pending-connect'
import { connectionKey, readConnectionSlots } from '@/lib/connections/read'
import { connectPlatformFor } from '@/lib/zernio/connect-platform'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { readActiveWorkspace } from '@/lib/workspaces'
import { setPendingSelectionHeader } from '@/lib/connections/pending-selection'
import { pickerCopyFor, SELECT_PATH } from '@/lib/zernio/picker-copy'
import { connectFailedPage, nothingToPickPage, pickerPage } from '@/lib/zernio/picker-page'
import { connectFailureCopy, readConnectFailure } from '@/lib/zernio/connect-error'
import { PLATFORM_LABELS } from '@/components/posts/channel-label'
import {
  CLEAR_CONNECT_NONCE,
  readSelectionRedirect,
  unresolvedSelection,
  verifyConnectNonce,
  type NonceVerdict,
} from '@/lib/zernio/selection'
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
 * Derived from `reconcileFromAccounts` rather than restated — a field added there
 * shows up here as a type error rather than being silently dropped on the way to
 * the RPC.
 */
type ReconciledForPlatform = ReturnType<typeof reconcileFromAccounts>[number] & {
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
 * ── AND IT MUST NOT BE A REDIRECT, WHICH IS WHAT IT ACTUALLY WAS ────────────
 * THIS is why every earlier attempt at closing the popup failed, including the
 * COOP work above and the query-parameter work below it. This page was served
 * with `status: 303` and a `Location` header. A browser FOLLOWS a 303 — the body
 * is never rendered, no script in it ever runs, and the popup navigates to
 * /connections. Reported four times, most precisely as: "it is opening this
 * website in the same popup itself ... /connections?zernio=connected".
 *
 * The `Location` header was copied from `backError`, where it is inert because a
 * 4xx/5xx `Location` is not followed and it exists only to make the intended
 * destination visible to a log reader and to `curl -I`. On a 303 it is not inert
 * at all. So the closer sends NO `Location`, ever: the destination is in the body
 * as a real link, which is the only place a popup should be offered one.
 *
 * ── THE STATUS LINE STILL TELLS THE TRUTH ────────────────────────────────────
 * This route exists in its current shape because a failure leaving as 303 was
 * invisible to a 4xx/5xx log filter, and that property is kept: a failed popup
 * connect is still a 5xx. What changes is the SUCCESS status, from 303 to 200.
 * Both are "this worked" to the filter that matters, and only one of them makes
 * the browser walk away from the page before it can run.
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
      // NO `location`. See the header: this response is HTML that must RENDER,
      // and a `Location` on the 3xx this used to send made the browser follow
      // it instead. `backError` can keep one only because 4xx/5xx are not
      // followed.
      headers: spentCookies({
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      }),
    },
  )
}

/**
 * The headers every FINISHED trip leaves with: the given ones, plus both
 * one-press cookies spent. Two `Set-Cookie` lines need a `Headers` object; a
 * plain record holds one and the second silently replaces the first.
 *
 * The nonce goes with the pending-connect cookie because they authorise the
 * same press. A nonce that survived a finished trip would still match a
 * bookmarked copy of that trip's URL.
 */
function spentCookies(base: Record<string, string>): Headers {
  const headers = new Headers(base)
  headers.append('set-cookie', CLEAR_PENDING_CONNECT)
  headers.append('set-cookie', CLEAR_CONNECT_NONCE)
  return headers
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
    headers: spentCookies({
      location: connectionsUrl(request, status, detail),
      'cache-control': 'no-store',
    }),
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
      // Spent on a failure too. A cookie surviving a failed trip would sit
      // there authorising a create on whatever the customer did next.
      headers: spentCookies({
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        // Not followed by browsers on a 4xx/5xx, and deliberately kept anyway: it is
        // what makes the intended destination visible to a log reader and to curl -I.
        location: target,
      }),
    },
  )
}

/**
 * A picker this browser did not ask for, refused in one sentence.
 *
 * ── WHY THIS IS ITS OWN PAGE AND NOT `fail(403, …)` ──────────────────────────
 * `backError` says "That connection didn't finish", which is true and useless
 * here: nothing was attempted. The two facts this page can state are different
 * from each other and from that, and each has a remedy that works.
 *
 *   absent      the record of the press did not reach us. A dropped cookie, or a
 *               URL with the nonce stripped. Pressing Connect again mints both.
 *   mismatched  the link belongs to another attempt: an old return URL replayed,
 *               or one built by somebody else. Pressing Connect again is still
 *               the only way a real one starts.
 *
 * No token from the URL is read, echoed or stored on this path: the response is
 * built before `readSelectionRedirect`'s state is used for anything.
 */
function attemptUnverifiedPage(request: Request, verdict: NonceVerdict): Response {
  const body =
    verdict === 'mismatched'
      ? 'This link belongs to a different connect attempt, so nothing was connected and no account was chosen.'
      : 'The record of your press did not reach Sahoda, so nothing was connected and no account was chosen.'
  return new Response(
    connectFailedPage(
      {
        headline: 'Sahoda could not confirm this connect started from your Connections page',
        body,
        remedy: 'Go back to Connections and press Connect again.',
      },
      null,
      connectionsUrl(request, 'error', `attempt-${verdict}`),
    ),
    {
      // A 403: the request was understood and is refused. Visible to the
      // 4xx/5xx log filter this route was rebuilt around.
      status: 403,
      headers: spentCookies({
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      }),
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
  // Typed as the union rather than `string`. Both sources are already narrowed —
  // the cookie parses against the allowlist and the query parameter is checked by
  // `isZernioPlatform` — and stating that in the type is what lets this value be
  // handed to the selection helpers without a cast that would erase the check.
  const urlPlatform: ZernioPlatform | null =
    askedPlatform !== null && isZernioPlatform(askedPlatform) ? askedPlatform : null

  /**
   * ── DID THIS TRIP START FROM A PRESS IN THIS BROWSER? ─────────────────────
   * The start route mints a random value per press and puts it in an httpOnly
   * cookie AND on the return URL. They agree only for a trip that press
   * started. A link somebody else built cannot carry the cookie's value, and an
   * old URL's value stops matching once the next press overwrites the cookie.
   *
   * Two things below depend on it. A PICKER is refused without it, because
   * every parameter a picker runs on came through the browser and a profile id
   * is not a secret. And the URL's `platform` may scope a CREATE only with it:
   * the pending-connect cookie is still the first authority (it is httpOnly
   * and only our own start route sets it), and the URL is the fallback for the
   * trip that cookie did not survive, which is now a fallback that has to
   * prove itself rather than one that is taken at its word.
   */
  const nonce = verifyConnectNonce(request.headers.get('cookie'), params)

  /** What was pressed, as far as PRESENTATION and recognising a pick are concerned. */
  const pressed: ZernioPlatform | null = pending?.platform ?? urlPlatform
  /** Which platform may have a row CREATED on this trip. See the nonce note. */
  const createFor: ZernioPlatform | null =
    pending?.platform ?? (nonce === 'matched' ? urlPlatform : null)

  const ok = (status: 'connected' | 'nothing' | 'limit', detail?: string) =>
    // 200, NOT 303. A 303 is a redirect and a browser follows it, so the closer's
    // body never rendered and its script never ran — the whole reason the popup
    // kept showing /connections instead of shutting. Still a success status, so
    // the 4xx/5xx log filter this route was built around reads it the same way.
    popup ? popupCloser(request, 200, status, detail) : backOk(request, status, detail)
  /** Each failure carries the status a log reader would expect for that cause. */
  const fail = (httpStatus: number, detail: string) =>
    popup
      ? popupCloser(request, httpStatus, 'error', detail)
      : backError(request, httpStatus, detail)

  /**
   * ── THE PLATFORM REFUSED, AND WE USED TO THROW THAT AWAY ──────────────────
   * Zernio's spec: "On failure every platform appends error details, starting
   * with `error` and `platform`." This route ignores every query parameter, and
   * that rule is right about IDS — an accountId from the browser can name
   * somebody else's account — and wrong about this one. An error string names no
   * resource and decides nothing; it is read here, matched against a small
   * allowlist to choose OUR sentence, and shown with the provider's own words
   * underneath.
   *
   * Dropping it is how the founder ended up reading Zernio's dashboard to find
   * out that Google had answered `invalid_grant` — a fact we were handed and
   * discarded, while our own screen said only that nothing had been found.
   *
   * FIRST, before the session is even resolved: a refusal is a refusal whether
   * or not the workspace reads cleanly, and answering it needs nothing else.
   */
  const failure = readConnectFailure(params)
  if (failure !== null) {
    await reportServerError(
      new Error(`zernioReturn: ${pressed ?? 'unknown'} refused — ${failure.code}`),
      { action: 'zernioReturn' },
    )
    const channel = pressed === null ? 'That channel' : PLATFORM_LABELS[pressed]
    const copy = connectFailureCopy(failure, channel)
    const body = connectFailedPage(
      copy,
      failure.detail,
      connectionsUrl(request, 'error', 'refused'),
    )
    // A 502: the customer's request was fine and so was ours; the platform said
    // no. Visible to the 4xx/5xx log filter this route was rebuilt around, which
    // is the whole reason a failure never leaves here as a success status.
    return popup
      ? new Response(body, {
          status: 502,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
        })
      : backError(request, 502, 'refused')
  }

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

    /**
     * ── THE CONNECT THAT IS NOT FINISHED YET ─────────────────────────────────
     * Facebook and Google Business come back here BEFORE an account exists: the
     * customer approved, and Zernio is waiting to be told which Page or which
     * location. `step` is Zernio's own marker for that state and nothing else sets
     * it, so its absence is every connect that has ever worked.
     *
     * MEASURED 2026-08-27: this is the entire reason "facebook is not connecting".
     * The reconcile below ran correctly, found no facebook account, and reported
     * that honestly — because there was none to find. See lib/zernio/selection.ts.
     *
     * Placed AFTER the profile lookup because the check it performs needs it: the
     * `profileId` on this URL came through the browser and is compared against the
     * one we read from our own table, never used. That is the same tenant boundary
     * `upsert_zernio_connection` enforces as PROFILE_MISMATCH, applied a layer up
     * so a mismatched pick never reaches Zernio at all.
     */
    const selection = readSelectionRedirect(params, pressed)
    if (selection !== null) {
      /**
       * ── THE NONCE FIRST, BEFORE ANYTHING ON THIS URL IS COMPARED OR USED ──
       * `profileId === ours` was the only binding here, and a profile id is on
       * every return URL this browser ever visited. A top-level GET carrying
       * the victim's profile id and an attacker's `tempToken` rendered a normal
       * picker, and one click committed the attacker's Page under the victim's
       * profile. Refused here, with the reason named, and with no token from
       * the URL read into anything.
       */
      if (nonce !== 'matched') {
        await reportServerError(
          new Error(`zernioReturn: ${selection.platform} pick refused, nonce ${nonce}`),
          { action: 'zernioReturn', workspaceId },
        )
        return attemptUnverifiedPage(request, nonce)
      }
      if (selection.state.profileId !== profileId) return fail(403, 'profile-mismatch')

      const copy = pickerCopyFor(selection.platform)
      const owedPlatform = selection.platform
      let listed: Awaited<ReturnType<typeof client.listConnectChoices>>
      try {
        listed = await client.listConnectChoices(selection.platform, selection.state)
      } catch (error) {
        await reportServerError(error, { action: 'zernioSelectList', workspaceId })
        // Ours, not theirs: the grant at the platform is real and the only thing
        // that failed is our read of what it unlocked.
        return fail(502, 'choices-unreadable')
      }

      if (listed.choices.length === 0) {
        /**
         * REPORTED, because it is the one branch here nobody can measure from
         * outside. MEASURED 2026-08-27: the founder reached this page, which
         * proves headless mode, the redirect parsing and our picker all work —
         * Facebook simply handed back no Pages. Whether that keeps happening,
         * and for which platform, is a fact worth having rather than inferring
         * from a screenshot next time.
         *
         * The count and the platform only. Nothing about the account, and no
         * token.
         */
        await reportServerError(
          new Error(`zernioReturn: ${owedPlatform} returned zero choices to pick from`),
          { action: 'zernioReturn', workspaceId },
        )
        // NOT `ok('nothing')`. That status renders "Connected", and nothing was —
        // Zernio creates no account until a choice is committed. This says what
        // actually happened and offers the only remedy that can work.
        return new Response(
          nothingToPickPage(copy, connectionsUrl(request, 'nothing', copy.empty)),
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
          },
        )
      }

      /**
       * The page carries the ids and NOT the token. `tempToken` is a live Facebook
       * user access token; it goes into an httpOnly cookie the POST reads back, so
       * it never reaches the markup. See lib/connections/pending-selection.ts.
       *
       * The pending-connect cookie is deliberately NOT cleared here. This trip
       * created nothing, the customer has not finished pressing Connect, and the
       * create it authorises is still owed on the trip after the pick.
       */
      return new Response(
        pickerPage(copy, listed.choices, {
          // The mode rides the form action so the trip AFTER the pick still knows
          // it is in a popup and still ends on the closer rather than loading the
          // whole app into a 620px window. Presentation only — the same value
          // RETURN_MODE_PARAM already carries, and the same argument covers it.
          action: popup ? `${SELECT_PATH}?${RETURN_MODE_PARAM}=popup` : SELECT_PATH,
          hasMore: listed.hasMore,
        }),
        {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'set-cookie': setPendingSelectionHeader({
              platform: selection.platform,
              state: selection.state,
            }),
          },
        },
      )
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
    /**
     * ── ONE REQUEST, THIRTEEN QUESTIONS ──────────────────────────────────────
     * This was `Promise.all(ZERNIO_PLATFORMS.map(… reconcileAccounts …))`, and
     * `reconcileAccounts` fetches the WHOLE account list and filters it. So a
     * single connect fired one identical request per platform — thirteen, twelve
     * of them discarded.
     *
     * MEASURED from the live response headers: `x-ratelimit-limit: 60` a minute.
     * Three connect attempts inside a minute therefore approached the ceiling on
     * their own, and a 429 arrives here as a READ FAILURE — so the account the
     * customer connected seconds ago is reported as not found, on a trip where
     * nothing about it was wrong. The list was five long before 2026-08-26, so
     * the change that added the connect-only platforms made this 2.6x worse.
     *
     * `listAccounts` is not platform-filtered, so one call answers every
     * platform. The per-platform loop below is now pure in-memory filtering.
     */
    let all: Awaited<ReturnType<typeof client.listAccounts>> | null = null
    try {
      all = await client.listAccounts(profileId)
    } catch (error) {
      await reportServerError(error, { action: 'zernioReturn', workspaceId })
    }

    /**
     * ── AND THE FAILURE SEMANTICS ARE UNCHANGED ON PURPOSE ───────────────────
     * Each platform used to catch its own error so one platform's failure could
     * not discard the accounts another had already returned. With a single call
     * there is only one thing to fail, and when it does EVERY platform is
     * genuinely unreadable — which is what the shape below still says. The
     * downstream branches (`unreadable.length === ZERNIO_PLATFORMS.length` and
     * the `partial` report) therefore keep working without knowing anything
     * changed, and "we never successfully asked" is still never reported as
     * "we asked and there was nothing".
     */
    const reads = ZERNIO_PLATFORMS.map((platform) => {
      if (all === null) {
        return { platform, read: false, accounts: [] as ReconciledForPlatform[] }
      }
      // See the header on connect-platform.ts: `x` is `twitter` to Zernio and
      // `gbp` is `googlebusiness`. Asking in our own vocabulary is what made a
      // real X connect invisible.
      const zernioPlatform = connectPlatformFor(platform)
      if (zernioPlatform === null) {
        return { platform, read: true, accounts: [] as ReconciledForPlatform[] }
      }
      const found = reconcileFromAccounts(all, { profileId, zernioPlatform })
      // Tagged with OUR id on the way out. Only the question was theirs.
      return { platform, read: true, accounts: found.map((a) => ({ ...a, platform })) }
    })

    const unreadable = reads.filter((r) => !r.read).map((r) => r.platform)
    const accounts = reads.flatMap((r) => r.accounts)

    // NOTHING could be read. Deliberately not `ok('nothing')`: that status claims we
    // asked Zernio and it had no accounts, and here we never successfully asked. A
    // measurement we did not make must not be reported as a measurement.
    if (unreadable.length === ZERNIO_PLATFORMS.length) return fail(500, 'read')

    /**
     * ── "WE ASKED AND THERE WAS NOTHING" IS THE WRONG SENTENCE FOR TWO OF THEM ─
     * Facebook and Google Business create NO account at Zernio until a Page or a
     * location is committed. So for those two, arriving here with an empty list
     * after the customer pressed Connect is not the ordinary empty answer — it is
     * the selection step having failed to reach us, and reporting it as `nothing`
     * is what made this defect cost three rounds: the screen said the same words
     * for "you cancelled" and for "the step we depend on did not happen".
     *
     * The report carries the PARAMETER NAMES that came back and never their
     * values. `tempToken` is a live Facebook user access token; its name says
     * which shape arrived, which is the entire diagnostic, and it is safe to put
     * in an error report where the token is not.
     */
    if (accounts.length === 0 && unreadable.length === 0) {
      const owed = unresolvedSelection(pressed, params)
      if (owed !== null) {
        await reportServerError(
          new Error(
            `zernioReturn: ${owed.platform} came back with no account and no readable pick. ` +
              `Params seen: ${owed.sawParams.join(',') || '(none)'}`,
          ),
          { action: 'zernioReturn', workspaceId },
        )
        // A 502, not a 303. Nothing is wrong with the customer's request and
        // nothing is wrong with their grant — the step between them did not
        // land, which is ours, and a failure that leaves as a success status is
        // exactly what this route was rebuilt to stop hiding.
        return fail(502, 'pick-not-received')
      }
      // Every other platform: genuinely nothing, and the user may simply have
      // cancelled at the consent screen. Still a success.
      return ok('nothing')
    }

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
