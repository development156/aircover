import 'server-only'

import { InboxMessageSchema, InboxThreadSchema, type InboxMessage, type InboxThread } from '@sahoda/shared'

import { cache } from 'react'

import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/** Memoised per request, so a page's thread + message reads share one lookup. */
const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const workspace = await getActiveWorkspace()
  return workspace?.id ?? null
})

/**
 * Inbox reads, RLS-scoped.
 *
 * Every one of these returns an empty list today and that is the honest answer,
 * not a bug: nothing writes `inbox_threads` because there is no verified read API
 * for GBP reviews. The list is real, the query is real, and there is nothing in it.
 * The UI says exactly that rather than showing a spinner forever or seeding
 * examples that would be indistinguishable from a customer's actual reviews.
 */

/** Cap on one page of threads. A busy shop can have hundreds of reviews. */
const PAGE = 50

export async function listThreads(
  filter: { kind?: InboxThread['kind']; status?: InboxThread['status'] } = {},
): Promise<InboxThread[]> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return []

    const supabase = createServerSupabase()
    let query = supabase
      .from('inbox_threads')
      .select('*')
      .eq('workspace_id', workspaceId)
      // Newest by the PLATFORM's clock. Ordering by our own ingest time would
      // reshuffle the list every time a poll ran late.
      .order('posted_at', { ascending: false, nullsFirst: false })
      .limit(PAGE)

    if (filter.kind) query = query.eq('kind', filter.kind)
    if (filter.status) query = query.eq('status', filter.status)

    const { data, error } = await query
    if (error || !data) return []
    return data.flatMap((row) => {
      const parsed = InboxThreadSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return []
  }
}

export async function listMessages(threadId: string): Promise<InboxMessage[]> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return []

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('*')
      .eq('thread_id', threadId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })

    if (error || !data) return []
    return data.flatMap((row) => {
      const parsed = InboxMessageSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return []
  }
}

/** Star distribution for the ratings header. Only reviews carry a rating. */
export function ratingSummary(threads: readonly InboxThread[]): {
  count: number
  average: number | null
  distribution: Record<1 | 2 | 3 | 4 | 5, number>
} {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>
  let total = 0
  let count = 0
  for (const thread of threads) {
    const rating = thread.rating
    if (rating === null) continue
    distribution[rating as 1 | 2 | 3 | 4 | 5] += 1
    total += rating
    count += 1
  }
  // Null rather than 0: an average of zero is a claim about the business, and no
  // reviews is not a rating of zero.
  return { count, average: count === 0 ? null : total / count, distribution }
}
