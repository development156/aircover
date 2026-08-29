import type { DisplayPost } from '@/lib/posts/display-post'
import { needsAPerson } from '@/lib/approvals/queue'
import { istDayKey } from '@/lib/planner/week-window'

/**
 * What the planner's toolbar filters, decided ONCE and in a file the tests can
 * reach without a browser.
 *
 * ── WHY THE FILTERS LIVE IN THE URL ──────────────────────────────────────────
 * `flow-journeys.spec.ts` already pins `?view=` for exactly this reason, and its
 * comment is the whole argument: "The view lives in the URL rather than in
 * state… moving it into React state would be an easy, invisible regression."
 * A tab, a search term and a picked calendar date are the same kind of fact, so
 * they are the same kind of parameter — which also means the toolbar and the
 * calendar cost the page no client JavaScript at all.
 *
 * ── EVERY TAB IS AN EXISTING DEFINITION, NOT A NEW ONE ───────────────────────
 * `needs-approval` is `needsAPerson`, the collection `lib/approvals/queue.ts`
 * owns. `drafts` and `scheduled` are the literal intents, which is what those
 * words mean on every other surface. Nothing here invents a fourth idea of what
 * "pending" means — that is the drift the queue file was written to stop.
 */
export const PLANNER_TABS = ['all', 'drafts', 'scheduled', 'needs-approval'] as const
export type PlannerTab = (typeof PLANNER_TABS)[number]

export const TAB_LABELS: Readonly<Record<PlannerTab, string>> = {
  all: 'All',
  drafts: 'Drafts',
  scheduled: 'Scheduled',
  'needs-approval': 'Needs approval',
}

/** An unknown or absent value is `all` — a filter nobody chose must not hide work. */
export function parseTab(raw: string | undefined): PlannerTab {
  return PLANNER_TABS.includes(raw as PlannerTab) ? (raw as PlannerTab) : 'all'
}

/**
 * A date key only if it IS one. A malformed `?date=` must fall back to "no date
 * picked" rather than to a key that matches nothing, which would render an empty
 * planner and no explanation for it.
 */
export function parseDate(raw: string | undefined): string | null {
  if (raw === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const at = new Date(`${raw}T00:00:00Z`)
  return Number.isNaN(at.getTime()) ? null : raw
}

/** Trimmed, and capped so a pathological URL cannot become a pathological regex. */
export function parseQuery(raw: string | undefined): string {
  return (raw ?? '').trim().slice(0, 120)
}

export function matchesTab(post: DisplayPost, tab: PlannerTab): boolean {
  switch (tab) {
    case 'drafts':
      return post.intent === 'draft'
    case 'scheduled':
      return post.intent === 'scheduled'
    case 'needs-approval':
      return needsAPerson(post.intent)
    case 'all':
      return true
  }
}

/**
 * Title search only, and deliberately so. The body is the long field and a
 * substring hit inside 2 kB of caption gives a row the reader cannot see the
 * reason for — a result they cannot explain reads as a bug.
 */
function matchesQuery(post: DisplayPost, query: string): boolean {
  if (query === '') return true
  return (post.title ?? '').toLowerCase().includes(query.toLowerCase())
}

function matchesDate(post: DisplayPost, dateKey: string | null): boolean {
  if (dateKey === null) return true
  if (post.scheduled_at === null) return false
  const at = new Date(post.scheduled_at)
  return !Number.isNaN(at.getTime()) && istDayKey(at) === dateKey
}

export interface PlannerFilter {
  tab: PlannerTab
  query: string
  dateKey: string | null
}

/** All three narrowings, applied together, in the order the toolbar reads. */
export function applyFilter(
  posts: readonly DisplayPost[],
  { tab, query, dateKey }: PlannerFilter,
): DisplayPost[] {
  return posts.filter(
    (post) => matchesTab(post, tab) && matchesQuery(post, query) && matchesDate(post, dateKey),
  )
}

/** True when the reader has narrowed the list — decides which empty state is honest. */
export function isFiltered({ tab, query, dateKey }: PlannerFilter): boolean {
  return tab !== 'all' || query !== '' || dateKey !== null
}

/**
 * The next few scheduled posts, soonest first. Future only: an "Upcoming" list
 * that includes this morning is not upcoming, and the reader cannot act on it.
 */
export function upcoming(posts: readonly DisplayPost[], now: Date, limit: number): DisplayPost[] {
  const at = now.getTime()
  return posts
    .filter((p) => p.scheduled_at !== null && new Date(p.scheduled_at).getTime() > at)
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())
    .slice(0, limit)
}
