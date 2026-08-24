import Link from 'next/link'
import { CalendarClock, ChevronRight, FileText, Timer } from 'lucide-react'

import { needsAPerson } from '@/lib/approvals/queue'
import type { DisplayPost } from '@/lib/posts/display-post'
import { formatScheduledAt } from '@/lib/posts/schedule-format'

/**
 * The four figures above the planner.
 *
 * ── EVERY COUNT COMES FROM AN EXISTING DEFINITION ────────────────────────────
 * "Needs approval" is `needsAPerson`, which `lib/approvals/queue.ts` exists to
 * own: its header says the sidebar badge, the Home count and the Approvals page
 * must read ONE collection "because a separate pendingCount field will
 * eventually disagree with it". A fifth reader here filtering by its own idea of
 * pending is exactly the drift that file was written to stop — and note it
 * deliberately EXCLUDES drafts, so this card is not "everything unfinished".
 *
 * Scheduled and Draft are the literal intents, which is what those words mean on
 * every other surface.
 *
 * ── NEXT UP IS THE NEXT FUTURE POST, OR THE SLOT SAYS SO ─────────────────────
 * Not "the first row", which is a different claim and would name a post that has
 * already gone out. With nothing ahead the card renders the absence rather than
 * borrowing the most recent past post to fill itself.
 */

/** The route type, taken from Link itself so typed routes stay enforced. */
type Href = React.ComponentProps<typeof Link>['href']

function Tile({
  Icon,
  value,
  label,
  href,
}: {
  Icon: typeof FileText
  value: string
  label: string
  href: Href
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-card border border-line-soft bg-surface p-3.5 transition-micro hover:border-brand-lift max-narrow:min-h-[44px]"
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-sm bg-brand-wash text-accent"
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="num block type-h3 text-ink">{value}</span>
        <span className="block truncate type-meta text-muted">{label}</span>
      </span>
    </Link>
  )
}

export function PlannerSummary({ posts }: { posts: readonly DisplayPost[] }) {
  const scheduled = posts.filter((p) => p.intent === 'scheduled').length
  const awaiting = posts.filter((p) => needsAPerson(p.intent)).length
  const drafts = posts.filter((p) => p.intent === 'draft').length

  const now = Date.now()
  const next = posts
    .filter((p) => p.scheduled_at !== null && new Date(p.scheduled_at).getTime() > now)
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())[0]

  return (
    <div className="grid grid-cols-4 gap-3 max-wide:grid-cols-2 max-narrow:grid-cols-1">
      <Tile Icon={CalendarClock} value={String(scheduled)} label="Scheduled" href="/planner" />
      <Tile Icon={Timer} value={String(awaiting)} label="Needs approval" href="/approvals" />
      <Tile Icon={FileText} value={String(drafts)} label="Draft" href="/posts" />

      {next !== undefined ? (
        <Link
          href={`/posts/${next.id}`}
          className="flex items-center gap-3 rounded-card border border-line-soft bg-surface p-3.5 transition-micro hover:border-brand-lift max-narrow:min-h-[44px]"
        >
          <span className="min-w-0 flex-1">
            <span className="block type-eyebrow text-ink-mute">Next up</span>
            <span className="block truncate type-sm font-semibold text-ink">
              {next.title?.trim() || 'Untitled post'}
            </span>
            <span className="block truncate type-meta text-muted">
              {formatScheduledAt(next.scheduled_at)}
            </span>
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-mute" />
        </Link>
      ) : (
        <div className="rounded-card border border-line-soft bg-surface p-3.5">
          <span className="block type-eyebrow text-ink-mute">Next up</span>
          {/* The absence mark, not a borrowed past post. */}
          <span className="block type-sm text-muted">
            <span aria-hidden>—</span>
            <span className="sr-only">Nothing scheduled ahead</span>
          </span>
          <span className="block type-meta text-muted">Nothing scheduled ahead</span>
        </div>
      )}
    </div>
  )
}
