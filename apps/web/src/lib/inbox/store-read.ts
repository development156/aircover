import 'server-only'

import { cache } from 'react'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

import { zernioPlatform } from './platform-spelling'
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

/** How many stored messages one thread render reads. Matches the list's page. */
const STORED_THREAD_PAGE = 200

/**
 * A stored message in the shape the thread already speaks. Structurally a
 * `ZernioMessage`; declared here rather than imported so this module keeps no
 * dependency on the publishing package.
 */
export interface StoredThreadMessage {
  id: string
  conversationId: string
  accountId: string
  platform: string
  message: string
  direction: string
  createdAt: string
  /** What came attached, as the `attachments` column holds it. Empty, never absent. */
  attachments: StoredMessageAttachment[]
}

/**
 * One attachment on a stored message.
 *
 * Structurally the subset of Zernio's attachment object that survives being stored:
 * the `url` on Instagram and Facebook is a SIGNED Meta CDN link that expires, and
 * Zernio's own spec says not to persist it. We persist it anyway because it is the
 * only value the webhook carries, and the renderer treats a dead image as a dead
 * image rather than pretending. `refreshUrl` is stamped only on the REST read and is
 * carried through when a REST read is what filled the row.
 */
export interface StoredMessageAttachment {
  /** `image`, `video`, `audio`, `file`, `sticker`, `share`. Zernio's own vocabulary. */
  type: string
  url: string
  name?: string
  thumbnailUrl?: string
}

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

/**
 * One conversation's MESSAGES, from the store.
 *
 * ── WHY THE LIST HAD THIS AND THE THREAD DID NOT ─────────────────────────────
 * The webhook receiver files DMs into `inbox_threads` AND `inbox_messages`, and
 * the list was migrated to read the store. The thread was not: `readThread`
 * resolved messages exclusively through Zernio, so opening a stored conversation
 * went back to the network for data this database already held. On the day
 * Zernio is unwell — the case the store exists for, and the case the list's own
 * tests exercise — the list offered rows whose destination rendered zero
 * messages under "Sahoda could not reach your connected accounts". A list whose
 * rows lead nowhere is the impossible-remedy rule failing at the link.
 *
 * ── SHAPED AS `ZernioMessage` ON PURPOSE ─────────────────────────────────────
 * So the thread has ONE message type and one set of helpers. `direction` passes
 * through unchanged because `messageDirection` already accepts our column's
 * `inbound`/`outbound` spelling; the platform comes from the thread's channel
 * through the same map the list uses.
 *
 * Returns `[]` for every failure and never throws. A thread that could not be
 * read from the store is not a thread with no messages, and the CALLER decides
 * what to say about that — this function has no business guessing.
 */
export async function readStoredThreadMessages(
  platformThreadId: string,
): Promise<StoredThreadMessage[]> {
  const workspaceId = await activeWorkspaceId()
  if (workspaceId === null) return []

  try {
    const supabase = createServerSupabase()
    const { data: thread, error: threadError } = await supabase
      .from('inbox_threads')
      .select('id, channel')
      .eq('workspace_id', workspaceId)
      .eq('platform_thread_id', platformThreadId)
      .maybeSingle()

    if (threadError || !thread) return []

    return await messagesForThread({
      workspaceId,
      threadId: thread.id as string,
      channel: thread.channel as string,
      conversationId: platformThreadId,
    })
  } catch {
    return []
  }
}

/**
 * The rows of one thread, in the thread view's own message shape.
 *
 * Extracted so the two ways of naming a thread — by the platform's id (the live
 * route) and by our own row id (the store route) — read the SAME columns through
 * the same mapping. Two copies of this projection would drift on the first column
 * added, and the column being added right now is `attachments`.
 */
async function messagesForThread(args: {
  workspaceId: string
  threadId: string
  channel: string
  conversationId: string
}): Promise<StoredThreadMessage[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('inbox_messages')
    .select('id, direction, body, platform_message_id, sent_at, created_at, attachments')
    .eq('workspace_id', args.workspaceId)
    .eq('thread_id', args.threadId)
    .order('created_at', { ascending: true })
    .limit(STORED_THREAD_PAGE)

  if (error || !data) return []

  return data.map((row) => ({
    id: row.id as string,
    conversationId: args.conversationId,
    // The store has no Zernio account id and inventing one would be a claim.
    // Nothing on the thread render path reads it.
    accountId: '',
    platform: zernioPlatform(args.channel),
    message: (row.body as string | null) ?? '',
    direction: row.direction as string,
    // `sent_at` is when the platform says it happened; `created_at` is when we
    // filed it. The first is the truth when we have it.
    createdAt: (row.sent_at as string | null) ?? (row.created_at as string),
    attachments: storedAttachments(row.attachments),
  }))
}

/**
 * `attachments` as the column holds it, narrowed to the entries a renderer can use.
 *
 * The column is `jsonb not null default '[]'`, but a JSON column is not a type:
 * anything the projector was ever asked to write is in there, including rows
 * written before the projector knew the shape. An entry with no `url` cannot be
 * rendered as anything, so it is dropped rather than rendered as a broken link.
 */
function storedAttachments(value: unknown): StoredMessageAttachment[] {
  if (!Array.isArray(value)) return []
  const out: StoredMessageAttachment[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const url = typeof record.url === 'string' ? record.url : null
    if (url === null || url === '') continue
    out.push({
      type: typeof record.type === 'string' ? record.type : 'file',
      url,
      ...(typeof record.name === 'string' ? { name: record.name } : {}),
      ...(typeof record.thumbnailUrl === 'string' ? { thumbnailUrl: record.thumbnailUrl } : {}),
    })
  }
  return out
}

/**
 * How far back the "who spoke last" scan reaches, across the whole page of threads.
 *
 * The question — is the newest message on this thread inbound? — is per thread, and
 * PostgREST cannot express "the newest row per group". So one query walks the
 * workspace's messages newest-first and the first row seen for a thread is that
 * thread's newest. The bound is what stops a busy shop turning a list render into an
 * unbounded read; a thread whose newest message falls outside it simply gets NO flag,
 * which is the absence of a claim rather than a wrong one.
 */
const REPLY_SCAN_ROWS = 1_000

/**
 * Which of these threads are waiting on us: the newest stored message is INBOUND.
 *
 * Never a count. `unreadCount` is Zernio's, taken from the platform's own read state,
 * and this store has none — so the list renders these as the words "Needs a reply"
 * and never as a numeral. Returns an EMPTY set on any failure, which reads as "no
 * flag" rather than as "nothing needs a reply", because the flag is only ever
 * additive on the row.
 */
export async function threadsNeedingReply(threadIds: string[]): Promise<ReadonlySet<string>> {
  const empty: ReadonlySet<string> = new Set()
  if (threadIds.length === 0) return empty
  const workspaceId = await activeWorkspaceId()
  if (workspaceId === null) return empty

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('thread_id, direction, created_at')
      .eq('workspace_id', workspaceId)
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false })
      .limit(REPLY_SCAN_ROWS)

    if (error || !data) return empty

    const decided = new Set<string>()
    const needsReply = new Set<string>()
    for (const row of data) {
      const threadId = row.thread_id as string
      // Newest-first, so the FIRST row seen for a thread is its newest message and
      // every later one is history. Deciding again from an older row is how a
      // conversation we already answered would light up as unanswered.
      if (decided.has(threadId)) continue
      decided.add(threadId)
      if ((row.direction as string) === 'inbound') needsReply.add(threadId)
    }
    return needsReply
  } catch {
    return empty
  }
}

/** A thread and its messages, addressed by OUR row id rather than the platform's. */
export interface StoredThreadDetail {
  thread: StoredConversation
  messages: StoredThreadMessage[]
}

/** Postgres refuses a non-uuid `= uuid` comparison with 22P02, which is noise, not news. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One stored thread, addressed by `inbox_threads.id`.
 *
 * ── WHY A SECOND WAY IN ──────────────────────────────────────────────────────
 * The live thread route is keyed `(accountId, conversationId)` because Zernio
 * resolves a conversation only within an account. A thread we hold in this
 * database needs no account to be READ — it is our own row — and until now a
 * stored thread whose channel had no connected Zernio account had no destination
 * at all: the list rendered it as a dead row with a sentence. The message was
 * real and there was no door to it.
 *
 * `null` means "not this workspace's", and the route turns that into a 404 rather
 * than an explanation: confirming that some other tenant's thread id exists is
 * itself a disclosure. A malformed id takes the same path, for the same reason.
 *
 * RLS already scopes the query; the explicit `workspace_id` filter is the
 * correctness filter, because a member can belong to several workspaces.
 */
export async function readStoredThreadById(threadId: string): Promise<StoredThreadDetail | null> {
  if (!UUID.test(threadId)) return null
  const workspaceId = await activeWorkspaceId()
  if (workspaceId === null) return null

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('inbox_threads')
      .select(
        'id, channel, platform_thread_id, author_name, author_handle, body, posted_at, status, kind',
      )
      .eq('workspace_id', workspaceId)
      .eq('id', threadId)
      .maybeSingle()

    if (error || !data) return null

    const thread: StoredConversation = {
      id: data.id as string,
      channel: data.channel as string,
      platformThreadId: data.platform_thread_id as string,
      authorName: (data.author_name as string | null) ?? null,
      authorHandle: (data.author_handle as string | null) ?? null,
      preview: (data.body as string | null) ?? null,
      postedAt: (data.posted_at as string | null) ?? null,
      status: data.status as string,
      kind: data.kind as string,
    }

    return {
      thread,
      messages: await messagesForThread({
        workspaceId,
        threadId: thread.id,
        channel: thread.channel,
        conversationId: thread.platformThreadId,
      }),
    }
  } catch {
    // A store that could not answer is NOT a thread that does not exist, but the
    // route has only two shapes to render and a 404 claims nothing about the
    // customer. The alternative — a 500 — says less and looks like our fault
    // twice over.
    return null
  }
}
