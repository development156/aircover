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
function backError(request: Request, httpStatus: number, detail: string): Response {
  const target = connectionsUrl(request, 'error', detail)
  const safe = escapeAttr(target)
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta http-equiv="refresh" content="0; url=${safe}">` +
      `<title>Connection didn’t finish</title></head>` +
      `<body><p>That connection didn’t finish. ` +
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
    const accounts = (
      await Promise.all(
        ZERNIO_PLATFORMS.map(async (platform) =>
          (await reconcileAccounts(client, { profileId, platform })).map((a) => ({
            ...a,
            platform,
          })),
        ),
      )
    ).flat()
    // Zernio has no accounts under our profile. Nothing went wrong — the user may
    // simply have cancelled at the consent screen — so this stays a 303.
    if (accounts.length === 0) return ok('nothing')

    let written = 0
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
        continue
      }
      written += 1
    }

    // Accounts existed at Zernio and NONE of them recorded. The customer's account is
    // connected on their side and unreachable from ours — a 500, loudly.
    if (written === 0) return fail(500, 'write')
    return ok('connected')
  } catch (error) {
    await reportServerError(error, { action: 'zernioReturn', workspaceId })
    return fail(500, 'unexpected')
  }
}
