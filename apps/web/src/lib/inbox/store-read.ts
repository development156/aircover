import 'server-only'

import { cache } from 'react'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

import { decideStoreSurface, type StoreDecision } from './store-decision'
import type { InboxSurfaceKey } from './emptiness'

/**
 * The inbox, read from THIS database instead of from Zernio on every page load.
 *
 * ── WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT ─────────────────────────────
 * Before: every inbox surface issued a live Zernio call per render. That is why the
 * inbox is slow, why it cannot be searched, and why it shows nothing on a day Zernio
 * is unwell.
 *
 * After: the rows come from `inbox_threads` / `inbox_messages`, which the webhook
 * receiver fills. The live read is NOT deleted — it is demoted to a HISTORY
 * SUPPLEMENT, because webhooks deliver only what happens after the subscription
 * exists and Zernio has no replay endpoint (docs/29 §0). Deleting it would make six
 * months of a customer's conversations vanish from the screen the day this ships.
 *
 * ── THE PROPERTY THIS FILE IS BUILT TO HAVE ──────────────────────────────────
 * NOTHING ON THE RENDER PATH TOUCHES THE NETWORK. The supplement is a separate,
 * optional call whose failure is a label, never an exception — so the inbox renders
 * fully with Zernio unreachable, and says which part is missing rather than
 * pretending the store is the whole truth.
 *
 * RLS is the security boundary here, as everywhere else a member reads: the queries
 * run through the normal authenticated client, and the explicit `workspace_id`
 * filter is a correctness filter (a member can belong to several workspaces), not
 * the thing keeping tenants apart.
 */

/** One conversation, as the list renders it. */
export interface StoredConversation {
  id: string
  channel: string
  platformThreadId: string
  authorName: string | null
  authorHandle: string | null
  preview: string | null
  postedAt: string | null
  status: string
  kind: string
}

export interface StoredInboxView {
  rows: StoredConversation[]
  decision: StoreDecision
}

/** One page. A busy shop has hundreds of threads; the list is not the archive. */
const PAGE = 50

/** Memoised per request so several surfaces on one screen share the lookup. */
const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const read = await activeWorkspaceRead()
  return read.status === 'ok' ? read.workspace.id : null
})

/**
 * Has any Zernio event EVER been recorded for this workspace?
 *
 * Counted on `zernio_webhook_events`, not on the projected rows, and the difference
 * is the point: an event that arrived and could not be filed — a Reddit comment, an
 * account nobody has connected — still proves the pipe works. Counting only filed
 * rows would report a working subscription as "nothing has arrived".
 *
 * `head: true` with `count: 'exact'` and `limit(1)`: this asks whether the number is
 * zero, so fetching rows to find out would be the wrong question and an unbounded
 * one. RLS makes unattributed rows (`workspace_id is null`) invisible here, which is
 * correct — they are operator data and prove nothing about this customer.
 */
async function hasEverReceivedEvents(workspaceId: string): Promise<boolean | null> {
  try {
    const supabase = createServerSupabase()
    const { count, error } = await supabase
      .from('zernio_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .limit(1)
    if (error) return null
    return (count ?? 0) > 0
  } catch {
    // null, NOT false. "We could not tell" and "none have arrived" are different
    // facts, and the classifier is entitled to know which one this is.
    return null
  }
}

/** Which thread kinds feed each surface. */
const SURFACE_KINDS: Record<InboxSurfaceKey, readonly string[]> = {
  conversations: ['dm'],
  comments: ['comment'],
  reviews: ['review'],
  thread: ['dm'],
}

/**
 * Read one surface's threads from the store.
 *
 * `historyAvailable` is passed straight through to the classifier rather than
 * decided here: whether the supplementary Zernio call succeeded is the CALLER's
 * observation, and this function has no business guessing at it.
 */
export async function readStoredThreads(
  surface: InboxSurfaceKey,
  /*
   * `connectedAccounts` is `number | null`, and the default is `null`, not `0`.
   *
   * A DEFAULT OF ZERO IS A CLAIM. It means "this workspace has connected
   * nothing", which sends the classifier to `never_connected` — "No
   * conversations yet, once you connect an account" — on behalf of a caller that
   * simply did not pass the option. `null` means "nobody counted", which is
   * what a missing argument actually is.
   */
  options: {
    connectedAccounts: number | null
    historyAvailable?: boolean
    historyRows?: number
  } = { connectedAccounts: null },
): Promise<StoredInboxView> {
  const workspaceId = await activeWorkspaceId()
  if (workspaceId === null) {
    return {
      rows: [],
      decision: decideStoreSurface({
        surface,
        // A real zero, not a failed count: there is no workspace, so there is
        // nothing that could be connected.
        connectedAccounts: 0,
        storedRows: 0,
        eventsEverReceived: false,
      }),
    }
  }

  let rows: StoredConversation[]
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('inbox_threads')
      .select(
        'id, channel, platform_thread_id, author_name, author_handle, body, posted_at, status, kind',
      )
      .eq('workspace_id', workspaceId)
      .in('kind', SURFACE_KINDS[surface])
      .order('posted_at', { ascending: false, nullsFirst: false })
      .limit(PAGE)

    if (error) throw new Error(error.message)

    rows = (data ?? []).map((r) => ({
      id: r.id as string,
      channel: r.channel as string,
      platformThreadId: r.platform_thread_id as string,
      authorName: (r.author_name as string | null) ?? null,
      authorHandle: (r.author_handle as string | null) ?? null,
      preview: (r.body as string | null) ?? null,
      postedAt: (r.posted_at as string | null) ?? null,
      status: r.status as string,
      kind: r.kind as string,
    }))
  } catch {
    // The store itself failed. This says NOTHING about what is in it, and the
    // classifier's first branch is written to refuse every later claim.
    return {
      rows: [],
      decision: decideStoreSurface({
        surface,
        connectedAccounts: options.connectedAccounts,
        storedRows: 0,
        eventsEverReceived: false,
        historyRows: options.historyRows,
        storeUnreadable: true,
      }),
    }
  }

  // Only asked when it can change the answer. With rows on screen the distinction
  // between "no events yet" and "events but none of these" is not being rendered,
  // so the count is a query nobody reads.
  //
  // ── THE THIRD VALUE IS USED, NOT COALESCED AWAY ─────────────────────────────
  // `hasEverReceivedEvents` returns null for "we could not tell", and its own
  // comment says at length that this differs from "none have arrived". The first
  // version of this line then wrote `?? false`, discarding exactly that — the same
  // class of defect as the dead `updated_at` expression deleted from the ingest: a
  // comment asserting a guarantee the code does not provide.
  //
  // A count we could not take is a store we could not fully read, so it reports
  // `storeUnreadable` and the classifier refuses every claim about the contents.
  // Coalescing to false would render "nothing has come through yet" on the strength
  // of a query that failed.
  const everReceived = rows.length > 0 ? true : await hasEverReceivedEvents(workspaceId)

  if (everReceived === null) {
    return {
      rows,
      decision: decideStoreSurface({
        surface,
        connectedAccounts: options.connectedAccounts,
        storedRows: rows.length,
        eventsEverReceived: false,
        historyRows: options.historyRows,
        storeUnreadable: true,
      }),
    }
  }

  return {
    rows,
    decision: decideStoreSurface({
      surface,
      connectedAccounts: options.connectedAccounts,
      storedRows: rows.length,
      eventsEverReceived: everReceived,
      historyAvailable: options.historyAvailable,
      historyRows: options.historyRows,
    }),
  }
}
