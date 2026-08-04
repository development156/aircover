import { auth } from '@clerk/nextjs/server'
import { reconcileAccounts } from '@sahoda/publishing'

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

const PLATFORM = 'instagram'

/**
 * Back to /connections with a short status the page can render.
 *
 * The origin comes from the incoming request URL rather than a header, so the
 * redirect can only ever point at the host that was actually reached.
 */
function backTo(
  request: Request,
  status: 'connected' | 'nothing' | 'error',
  detail?: string,
): Response {
  const url = new URL('/connections', request.url)
  url.searchParams.set('zernio', status)
  if (detail) url.searchParams.set('reason', detail)
  return Response.redirect(url.toString(), 303)
}

export async function GET(request: Request): Promise<Response> {
  const back = (status: 'connected' | 'nothing' | 'error', detail?: string) =>
    backTo(request, status, detail)

  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return back('error', 'signin')

    const client = zernioClient()
    if (!client) return back('error', 'unavailable')

    const workspace = await getActiveWorkspace()
    if (!workspace) return back('error', 'no-workspace')
    workspaceId = workspace.id

    const supabase = createServerSupabase()

    // The profile is READ from our own table, keyed by the workspace we just
    // derived from the session — not taken from the redirect.
    const { data: mapping, error: mapErr } = await supabase
      .from('zernio_profiles')
      .select('profile_id')
      .eq('workspace_id', workspace.id)
      .maybeSingle()

    if (mapErr) return back('error', 'lookup')
    const profileId = mapping?.profile_id as string | undefined
    if (!profileId) {
      // They returned without ever having started here. Nothing to reconcile.
      return back('nothing', 'no-profile')
    }

    const accounts = await reconcileAccounts(client, { profileId, platform: PLATFORM })
    if (accounts.length === 0) return back('nothing')

    let written = 0
    for (const account of accounts) {
      const { error } = await supabase.rpc('upsert_zernio_connection', {
        p_workspace_id: workspace.id,
        p_platform: PLATFORM,
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

    return back(written > 0 ? 'connected' : 'error', written > 0 ? undefined : 'write')
  } catch (error) {
    await reportServerError(error, { action: 'zernioReturn', workspaceId })
    return back('error')
  }
}
