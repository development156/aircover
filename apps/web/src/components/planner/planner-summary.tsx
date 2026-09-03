import Link from 'next/link'
import { CalendarClock, ChevronRight, FileText, Sun, Timer } from 'lucide-react'

import { needsAPerson } from '@/lib/approvals/queue'
import type { DisplayPost } from '@/lib/posts/display-post'
import { formatScheduledAt } from '@/lib/posts/schedule-format'
import { istDayKey } from '@/lib/planner/week-window'
import { cn } from '@/lib/utils'

/**
 * The figures above the planner — one surface, four readings, ONE of them lead.
 *
 * ── WHY IT IS NOT FOUR CARDS ANY MORE ────────────────────────────────────────
 * It was a `grid-cols-4` of four identical bordered tiles. docs/37 §16 names
 * that shape as the failure it is trying to fix: "five cards explaining an
 * absence the page could state once… every one an individually defensible
 * decision nobody weighed against its neighbours". Four equal boxes tell the
 * reader that four things matter equally, which is never true.
 *
 * So: one surface, hairline-divided, and the reading that has an ACTION behind
 * it is the one that gets weight — and only when there is something to act on.
 * With nothing awaiting approval the row is four quiet numbers, which is the
 * honest picture of a quiet week.
 *
 * ── EVERY COUNT STILL COMES FROM AN EXISTING DEFINITION ──────────────────────
 * "Needs approval" is `needsAPerson`, which `lib/approvals/queue.ts` exists to
 * own: its header says the sidebar badge, the Home count and the Approvals page
 * must read ONE collection "because a separate pendingCount field will
 * eventually disagree with it". A fifth reader here filtering by its own idea of
 * pending is exactly the drift that file was written to stop — and note it
 * deliberately EXCLUDES drafts, so this is not "everything unfinished".
 *
 * Scheduled and Draft are the literal intents, which is what those words mean on
 * every other surface.
 *
 * ── "TODAY" IS A NEW FIGURE AND IT IS COMPUTED, NOT RELABELLED ───────────────
 * The founder asked for a TODAY group. The temptation was to file the existing
 * "Needs approval" under it, and that would have been a false claim: an approval
 * has no date, so nothing about it is today-scoped. What IS today-scoped is how
 * many scheduled posts fall inside today's IST day, so that is what the tile
 * counts — keyed with `istDayKey`, the same function the week window and the
 * month grid bucket by, so this number can never disagree with the grid below.
 *
 * ── NEXT UP IS THE NEXT FUTURE POST, OR THE SLOT SAYS SO ─────────────────────
 * Not "the first row", which is a different claim and would name a post that has
 * already gone out. With nothing ahead the card renders the absence rather than
 * borrowing the most recent past post to fill itself.
 */

/** The route type, taken from Link itself so typed routes stay enforced. */
type Href = React.ComponentProps<typeof Link>['href']

function Figure({
  Icon,
  value,
  label,
  note,
  href,
  lead = false,
}: {
  Icon: typeof FileText
  value: string
  label: string
  note?: string
  href: Href
  /** Where the tile goes, said out loud. See the sr-only span below. */
  destination: string
  /** The one reading with something to act on. At most one is ever true. */
  lead?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex min-w-0 flex-col gap-1 rounded-md p-4 transition-micro',
        'hover:bg-s2 max-narrow:min-h-11',
        lead && 'bg-brand-wash hover:bg-brand-tint',
      )}
    >
      <span className="flex items-center gap-2">
        {/* NOT `text-accent` on the wash. MEASURED from tokens.css: `--acc`
            (#ff6600) on `--t50` over white is 2.75:1, under the 3:1 floor for a
            non-text mark and nowhere near 4.5:1 for the numeral below it. The
            wash is doing the emphasising; the mark and the number stay ink. */}
        <Icon size={14} strokeWidth={2} aria-hidden className="shrink-0 text-ink-mute" />
        <span className="truncate type-meta text-muted">{label}</span>
      </span>
      {/* `type-h2`, NOT `type-h1`. docs/37 §16: "Exactly one `type-h1` per
          view" — the page heading owns it, and four figures set at the same
          rung would each be claiming to be the title of the screen. */}
      <span className="num type-h2 text-ink">{value}</span>
      {note !== undefined ? <span className="truncate type-meta text-muted">{note}</span> : null}
    </Link>
  )
}

export function PlannerSummary({
  posts,
  now,
  zone,
}: {
  posts: readonly DisplayPost[]
  now: Date
  zone?: string | null
}) {
  const scheduled = posts.filter((p) => p.intent === 'scheduled').length
  const awaiting = posts.filter((p) => needsAPerson(p.intent)).length
  const drafts = posts.filter((p) => p.intent === 'draft').length

  const todayKey = istDayKey(now)
  // The NaN guard is not defensive padding: `Intl.DateTimeFormat.format` THROWS
  // `RangeError: Invalid time value` on an unparseable date, so one bad row in
  // the column would take the whole screen down rather than render one tile
  // wrong. `lib/planner/filters.ts` guards the same read for the same reason.
  const today = posts.filter((p) => {
    if (p.scheduled_at === null) return false
    const at = new Date(p.scheduled_at)
    return !Number.isNaN(at.getTime()) && istDayKey(at) === todayKey
  }).length

  const at = now.getTime()
  const next = posts
    .filter((p) => p.scheduled_at !== null && new Date(p.scheduled_at).getTime() > at)
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())[0]

  return (
    <section
      aria-label="Planner at a glance"
      className="surface-ring grid grid-cols-4 gap-1 rounded-card bg-surface p-1 max-wide:grid-cols-2"
    >
      <Figure
        Icon={Timer}
        value={String(awaiting)}
        label="Needs approval"
        note={awaiting > 0 ? 'Waiting on you' : 'Nothing waiting'}
        href="/approvals"
        destination="open Approvals"
        lead={awaiting > 0}
      />
      <Figure
        Icon={Sun}
        value={String(today)}
        label="Going out today"
        note={`${scheduled} scheduled in all`}
        href="/planner"
        destination="open the plan"
      />
      <Figure
        Icon={FileText}
        value={String(drafts)}
        label="Drafts"
        note="Not scheduled yet"
        href="/posts"
        destination="open Posts"
      />

      {next !== undefined ? (
        <Link
          href={`/posts/${next.id}`}
          className="group flex min-w-0 items-center gap-2 rounded-md p-4 transition-micro hover:bg-s2"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <CalendarClock
                size={14}
                strokeWidth={2}
                aria-hidden
                className="shrink-0 text-ink-mute"
              />
              <span className="truncate type-meta text-muted">Next up</span>
            </span>
            <span className="mt-1 block truncate type-h3 text-ink">
              {next.title?.trim() || 'Untitled post'}
            </span>
            <span className="block truncate type-meta text-muted tabular-nums">
              {formatScheduledAt(next.scheduled_at, zone)}
            </span>
          </span>
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-ink-mute transition-micro group-hover:text-ink"
          />
        </Link>
      ) : (
        <div className="flex min-w-0 flex-col gap-1 rounded-md p-4">
          <span className="flex items-center gap-2">
            <CalendarClock
              size={14}
              strokeWidth={2}
              aria-hidden
              className="shrink-0 text-ink-mute"
            />
            <span className="truncate type-meta text-muted">Next up</span>
          </span>
          {/* The absence mark, not a borrowed past post. `aria-hidden` with no
              sr-only twin: the visible sentence below already carries the claim,
              and naming it twice makes a screen reader say it twice. */}
          <span aria-hidden className="block type-h2 text-muted">
            &mdash;
          </span>
          <span className="block truncate type-meta text-muted">Nothing scheduled ahead</span>
        </div>
      )}
    </section>
  )
}
