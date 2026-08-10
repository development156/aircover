import { auth } from '@clerk/nextjs/server'
import { reconcileAccounts } from '@sahoda/publishing'
import { ZERNIO_PLATFORMS } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'
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
 * A real outcome: the connect worked, or there was genuinely nothing new to record.
 * 303 is correct here and the logs are already truthful about it.
 */
function backOk(request: Request, status: 'connected' | 'nothing', detail?: string): Response {
  return Response.redirect(connectionsUrl(request, status, detail), 303)
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
        // Not followed by browsers on a 4xx/5xx, and deliberately kept anyway: it is
        // what makes the intended destination visible to a log reader and to curl -I.
        location: target,
      },
    },
  )
}

export async function GET(request: Request): Promise<Response> {
  const ok = (status: 'connected' | 'nothing', detail?: string) => backOk(request, status, detail)
  /** Each failure carries the status a log reader would expect for that cause. */
  const fail = (httpStatus: number, detail: string) => backError(request, httpStatus, detail)

  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return fail(401, 'signin')

    const client = zernioClient()
    // The rail is not provisioned in this environment — ours to fix, not the user's.
    if (!client) return fail(503, 'unavailable')

    const workspace = await getActiveWorkspace()
    if (!workspace) return fail(400, 'no-workspace')
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

    let written = 0
    /** Platforms whose account came back from Zernio and did NOT reach our table. */
    const unwritten: string[] = []
    for (const account of accounts) {
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
        continue
      }
      written += 1
    }

    // Accounts existed at Zernio and NONE of them recorded. The customer's account is
    // connected on their side and unreachable from ours — a 500, loudly.
    //
    // `accounts.length > 0` is NOT redundant, though it reads that way. One live path
    // arrives here with an empty list: some platforms read cleanly and had no
    // accounts, and at least one other failed to read. `ok('nothing')` above is
    // guarded on `unreadable.length === 0`, so that case falls through — and without
    // this clause it would be reported as "every write failed" when no write was ever
    // attempted. It belongs to the partial branch below.
    if (written === 0 && accounts.length > 0) return fail(500, 'write')

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
      return backError(request, 500, `${missed.length}-not-recorded`, 'partial')

    return ok('connected')
  } catch (error) {
    await reportServerError(error, { action: 'zernioReturn', workspaceId })
    return fail(500, 'unexpected')
  }
}
