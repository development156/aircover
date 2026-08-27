import { auth } from '@clerk/nextjs/server'

import { CLEAR_PENDING_SELECTION, readPendingSelection } from '@/lib/connections/pending-selection'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { readActiveWorkspace } from '@/lib/workspaces'
import { ourPlatformFor } from '@/lib/zernio/selection'
import {
  RETURN_MODE_PARAM,
  RETURN_PLATFORM_PARAM,
  ZERNIO_RETURN_PATH,
} from '@/lib/zernio/return-url'
import { zernioClient } from '@/lib/zernio/server'

/**
 * POST /api/oauth/zernio/select — the customer picked a Facebook Page or a Google
 * Business location, and THIS is the call that creates the account at Zernio.
 *
 * ── WHY THERE IS A SECOND ROUTE AT ALL ───────────────────────────────────────
 * Those two platforms do not resolve to one account when the customer approves.
 * Facebook hands back every Page they administer; Google Business every location.
 * Zernio creates NOTHING until one is chosen — MEASURED 2026-08-27, which is the
 * whole of "facebook is not connecting": zero facebook accounts existed on this
 * key while the connect endpoint returned a perfectly good authUrl every time.
 *
 * The return route renders the picker; this commits it.
 *
 * ── AND WHY IT ENDS WITH A REDIRECT BACK TO THE RETURN ROUTE ─────────────────
 * Everything after "the account now exists at Zernio" is already written and
 * already careful: re-derive the workspace from the session, ask Zernio for the
 * accounts under OUR profile, refuse to trust any id that arrived through the
 * browser, enforce the plan limit, scope the create, close the popup. Duplicating
 * a hundred and fifty lines of that here to save one redirect would mean two
 * copies of the tenant boundary, and they would drift.
 *
 * So this route does one thing and hands back. A 303 is exactly right here, unlike
 * on the closer page: we WANT the browser to navigate.
 *
 * ── NOTHING THE FORM SENDS IS TRUSTED ────────────────────────────────────────
 * The only field is `choiceId`, and it is checked against a list this route
 * fetches for itself rather than against the page it rendered. The owning account
 * id for a GBP location is read off that same list and never off the form, so a
 * submit cannot pair one location's id with another location's account. The
 * platform credential is read from an httpOnly cookie, not from the body.
 */
export const dynamic = 'force-dynamic'

/** Minimal escaping for a URL in an attribute — the URL carries `&` between params. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * A failure, as a page the popup can read on its own.
 *
 * The status stays a real 4xx/5xx, for the reason the return route's own comments
 * spell out at length: a failure that leaves as a 303 is invisible to the log
 * filter that matters, and this flow spent a day being un-diagnosable for exactly
 * that. The customer-facing half is the body.
 */
function fail(request: Request, httpStatus: number, detail: string): Response {
  const back = new URL('/connections', request.url)
  back.searchParams.set('zernio', 'error')
  back.searchParams.set('reason', detail)
  const safe = escapeAttr(back.toString())
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>That didn’t finish</title>` +
      `<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;` +
      `place-items:center;min-height:100vh;padding:24px;text-align:center}</style>` +
      `</head><body><div><p>That connection didn’t finish, and nothing was ` +
      `changed. You can close this window and try again.</p>` +
      `<p><a href="${safe}">Open Connections</a></p></div>` +
      /**
       * TELL THE OPENER THE WAIT IS OVER.
       *
       * Without this the Connect button sits on "Opening Facebook…" until the
       * customer closes this window by hand — reported exactly that way against
       * the empty-state page, which had the same omission. Every signal
       * `useConnectFlow` waits for was emitted only by `popupCloser`, the page a
       * SUCCESSFUL connect ends on; this is one of the ways one can fail.
       *
       * No `window.close()`: this page carries a sentence the customer needs.
       */
      `<script>(function(){` +
      `try{var c=new BroadcastChannel("sahoda-connect");` +
      `c.postMessage({type:"sahoda:connect-outcome"});c.close();}catch(e){}` +
      `try{if(window.opener&&!window.opener.closed){` +
      `window.opener.postMessage({type:"sahoda:connect-outcome"},window.location.origin);}}catch(e){}` +
      `})();</script></body></html>`,
    {
      status: httpStatus,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        // Spent on failure too. A platform credential left in a cookie after the
        // attempt it belonged to is over is what the ten-minute cap exists to bound.
        'set-cookie': CLEAR_PENDING_SELECTION,
      },
    },
  )
}

export async function POST(request: Request): Promise<Response> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return fail(request, 401, 'signin')

    const client = zernioClient()
    if (!client) return fail(request, 503, 'unavailable')

    const workspaceRead = await readActiveWorkspace()
    if (workspaceRead.status === 'unreadable') return fail(request, 503, 'workspace-unreadable')
    if (workspaceRead.status === 'none') return fail(request, 400, 'no-workspace')
    const workspace = workspaceRead.workspace
    workspaceId = workspace.id

    /**
     * The OAuth state, from the httpOnly cookie the picker page set. Null means
     * the ten minutes ran out, the browser dropped it, or this URL was posted to
     * without a pick in flight. All three are the same answer: there is nothing to
     * commit, and pressing Connect again is the remedy that works.
     */
    const pending = await readPendingSelection()
    if (pending === null) return fail(request, 400, 'pick-expired')

    const supabase = createServerSupabase()
    const { data: mapping, error: mapErr } = await supabase
      .from('zernio_profiles')
      .select('profile_id')
      .eq('workspace_id', workspace.id)
      .maybeSingle()
    if (mapErr) return fail(request, 500, 'lookup')
    const profileId = mapping?.profile_id as string | undefined
    if (!profileId) return fail(request, 400, 'no-profile')

    /**
     * THE TENANT BOUNDARY. The cookie is httpOnly and our own, but it still made
     * the round trip through a browser, and doc 13 §3 is the standing reason
     * nothing that did may name a resource: Zernio validates ids against the whole
     * TEAM, so a wrong profile does not error, it acts on somebody else's account.
     * Compared, never used.
     */
    if (pending.state.profileId !== profileId) return fail(request, 403, 'profile-mismatch')

    const form = await request.formData()
    const asked = form.get('choiceId')
    if (typeof asked !== 'string' || asked.trim() === '') return fail(request, 400, 'no-choice')
    const choiceId = asked.trim()

    /**
     * ── THE ID IS CHECKED AGAINST A LIST WE FETCH, NOT AGAINST THE ONE WE SENT ─
     * Re-listing costs one request and buys two things. It confirms the id is one
     * this customer may actually connect, and it produces the GBP owning-account id
     * from a source the form cannot influence. Zernio's own note says listing with
     * a `pendingDataToken` "preserves server-side token storage", i.e. it does not
     * spend the token, so the select below still has one.
     */
    let listed: Awaited<ReturnType<typeof client.listConnectChoices>>
    try {
      listed = await client.listConnectChoices(pending.platform, pending.state)
    } catch (error) {
      await reportServerError(error, { action: 'zernioSelect', workspaceId })
      return fail(request, 502, 'choices-unreadable')
    }

    const choice = listed.choices.find((c) => c.id === choiceId)
    if (choice === undefined) return fail(request, 400, 'unknown-choice')

    try {
      await client.selectConnectChoice(pending.platform, pending.state, {
        id: choice.id,
        ownerId: choice.ownerId,
      })
    } catch (error) {
      await reportServerError(error, { action: 'zernioSelect', workspaceId })
      return fail(request, 502, 'select-failed')
    }

    /**
     * The account exists at Zernio now. Hand back to the return route, which does
     * every remaining thing — and does it the same way for this platform as for
     * every other, which is the point of not reimplementing it here.
     *
     * `platform` is OUR channel id, derived from the selection platform rather than
     * read off anything: `googlebusiness` is `gbp` to us and passing Zernio's name
     * would land on the fail-closed branch that creates no row. That mistranslation
     * has already cost this integration two reported defects.
     */
    const ours = ourPlatformFor(pending.platform)
    const back = new URL(ZERNIO_RETURN_PATH, request.url)
    if (ours !== null) back.searchParams.set(RETURN_PLATFORM_PARAM, ours)
    if (new URL(request.url).searchParams.get(RETURN_MODE_PARAM) === 'popup') {
      back.searchParams.set(RETURN_MODE_PARAM, 'popup')
    }

    return new Response(null, {
      status: 303,
      headers: {
        location: back.toString(),
        'cache-control': 'no-store',
        'set-cookie': CLEAR_PENDING_SELECTION,
      },
    })
  } catch (error) {
    await reportServerError(error, { action: 'zernioSelect', workspaceId })
    return fail(request, 500, 'unexpected')
  }
}
