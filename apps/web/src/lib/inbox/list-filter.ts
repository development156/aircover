import type { InboxListRow } from './list-row'

/**
 * Client-side filtering and sorting over rows ALREADY LOADED by the list.
 *
 * ── WHY THIS IS PURE AND SEPARATE FROM `conversation-list.tsx` ───────────────
 * `readConversations` reads every platform in one call because Zernio's own filter
 * cannot express WhatsApp, so a per-channel refetch would silently drop one. Filtering
 * the loaded set client-side is the honest version of "narrow this list" and it needs
 * no server round trip on a keystroke. Keeping the logic here, rather than inline in the
 * component, is what makes it testable without a DOM and what stops a future edit from
 * changing the rule in one branch and not the other.
 */

export type ListSort = 'newest' | 'oldest'

export interface ListFilter {
  /** A platform present in the rows, or `'all'`. */
  platform: string | 'all'
  /** An `accountId` present in the rows, or `'all'`. */
  accountId: string | 'all'
  /** Free text, matched against participant name, account username and last message. */
  query: string
  sort: ListSort
}

export const EMPTY_LIST_FILTER: ListFilter = {
  platform: 'all',
  accountId: 'all',
  query: '',
  sort: 'newest',
}

/** The platforms present in the rows, in first-seen order, each named once. */
export function listPlatformOptions(rows: readonly InboxListRow[]): string[] {
  const seen = new Set<string>()
  const options: string[] = []
  for (const row of rows) {
    if (seen.has(row.platform)) continue
    seen.add(row.platform)
    options.push(row.platform)
  }
  return options
}

export interface AccountOption {
  accountId: string
  accountUsername: string | undefined
  platform: string
}

/** The accounts present in the rows, one entry per `accountId`, in first-seen order. */
export function listAccountOptions(rows: readonly InboxListRow[]): AccountOption[] {
  const seen = new Set<string>()
  const options: AccountOption[] = []
  for (const row of rows) {
    if (row.accountId === '' || seen.has(row.accountId)) continue
    seen.add(row.accountId)
    options.push({
      accountId: row.accountId,
      accountUsername: row.accountUsername,
      platform: row.platform,
    })
  }
  return options
}

function matchesQuery(row: InboxListRow, needle: string): boolean {
  if (needle === '') return true
  const haystack = [row.participantName, row.accountUsername, row.lastMessage]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

/**
 * A row with no `updatedTime` sorts LAST regardless of direction: it is not a claim
 * that the row is oldest or newest, only that Sahoda cannot place it on the timeline.
 */
function updatedMs(row: InboxListRow): number | null {
  if (!row.updatedTime) return null
  const ms = Date.parse(row.updatedTime)
  return Number.isNaN(ms) ? null : ms
}

/** Filter and sort a loaded list of rows against one `ListFilter`. Never mutates. */
export function applyListFilter(rows: readonly InboxListRow[], filter: ListFilter): InboxListRow[] {
  const needle = filter.query.trim().toLowerCase()

  const shown = rows.filter((row) => {
    if (filter.platform !== 'all' && row.platform !== filter.platform) return false
    if (filter.accountId !== 'all' && row.accountId !== filter.accountId) return false
    return matchesQuery(row, needle)
  })

  const direction = filter.sort === 'newest' ? -1 : 1

  return [...shown].sort((a, b) => {
    const aMs = updatedMs(a)
    const bMs = updatedMs(b)
    if (aMs === null && bMs === null) return 0
    if (aMs === null) return 1
    if (bMs === null) return -1
    return (aMs - bMs) * direction
  })
}

/** Whether any control differs from its default: whether "Clear filters" has work to do. */
export function isListFilterActive(filter: ListFilter): boolean {
  return (
    filter.platform !== EMPTY_LIST_FILTER.platform ||
    filter.accountId !== EMPTY_LIST_FILTER.accountId ||
    filter.query.trim() !== '' ||
    filter.sort !== EMPTY_LIST_FILTER.sort
  )
}
