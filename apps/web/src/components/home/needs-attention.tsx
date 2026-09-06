import Link from 'next/link'
import type { Route } from 'next'

import { Badge } from '@/components/ui/badge'
import { HomeSection } from '@/components/home/section'
import { CHANNEL_SHORT } from '@/components/posts/channel-label'
import { needsAPerson } from '@/lib/approvals/queue'
import { STATUS_WORD } from '@/lib/posts/status-word'
import type { DisplayPost } from '@/lib/posts/display-post'

/**
 * "Needs your attention" — question 3 of the reference's four
 * (SPECIFICATION.md §1), and the one this app was missing entirely.
 *
 * Home answered "what happened" and "what is happening" and then stopped, so
 * the screen was a report rather than a queue. This is the part that gives
 * someone a reason to open the app on a Tuesday.
 *
 * ── WHAT COUNTS AS NEEDING YOU ───────────────────────────────────────────────
 * `needsAPerson` — one predicate, in `lib/approvals/queue.ts`, shared with the
 * rail's badge and with /approvals itself. It used to be `rungFor(intent) ===
 * 'urgent'` written out here, which was the same answer and the wrong shape:
 * the moment a second screen counted the same thing, two copies of a filter
 * could drift exactly as badly as two queries, and less visibly.
 *
 * The definition itself is unchanged — the ladder's own "needs you now", which
 * is `review`, `failed` and `partial`. A draft is NOT on this list: it is
 * waiting on you in the sense that everything unfinished is, and a queue that
 * includes every unfinished thing is a list of everything, which nobody reads.
 * Drafts have their own home on /posts.
 *
 * NO ACTION BUTTONS. The reference's `.att` card carries Approve / Review
 * inline, and approving from the dashboard is a real interaction there. Here
 * each row is a LINK into the editor instead: approving is a state change on a
 * real post, and a one-click approve on a summary screen — where you cannot see
 * the body you are approving — is the wrong place to put it. The row opens the
 * post; the decision happens where the content is.
 */
/**
 * ── ONE FULL ROW, WHATEVER THE COUNT ─────────────────────────────────────────
 * The queue shows at most four, and the column count IS the number shown, so
 * the row always fills exactly. Three columns holding four items leaves one
 * card alone above two empty cells — MEASURED on this layout at 1440 before the
 * fix, an orphan at y=452 with 828px of nothing beside it, which is the same
 * "card that failed to finish" the old `wide:grid-cols-2` produced with one
 * item, one size up.
 *
 * Indexed by count, and the impossible index (0) never reaches a class because
 * an empty queue renders the sentence instead.
 */
const COLUMNS = [
  '',
  '',
  'narrow:grid-cols-2',
  'narrow:grid-cols-2 wide:grid-cols-3',
  'narrow:grid-cols-2 wide:grid-cols-4',
] as const

export function NeedsAttention({ posts }: { posts: DisplayPost[] }) {
  // `intent` — NOT `status`. `DisplayPost` seals `status` behind an
  // uninhabitable type precisely so a summary screen cannot read it and claim
  // an outcome the variant rows never reported (see display-post.ts).
  const waiting = posts.filter((post) => needsAPerson(post))
  const shown = waiting.slice(0, 4)

  return (
    <HomeSection
      id="home-attention"
      title="Needs your OK"
      count={waiting.length}
      guide="home.attention"
      /* /approvals, not /posts. This card is a preview of the QUEUE — same
         collection, same count — and sending "View all" to the full post list
         would answer a different question with a different number. */
      action={{ href: '/approvals', label: 'View all' }}
    >
      {waiting.length === 0 ? (
        /* Honest, and specific about WHY it is empty. "Nothing needs you" is a
           real and good answer; it must not read like a failure to load — so it
           is left-aligned in the body's own padding rather than centred in a
           box, which is the shape `ChartSparse` exists to stop. */
        <p className="max-w-[var(--measure-prose)] type-sm text-muted">
          Nothing needs your OK right now. Posts that are ready to go out, posts waiting for a
          check, and posts that could not go out will show up here.
        </p>
      ) : (
        /* See COLUMNS above. Its ancestor was a `wide:grid-cols-2` that put a
           single waiting post in column one of two and left the other half of
           an 870px card empty — a card that reads as unfinished rather than as
           a queue with one thing in it. */
        <ul className={`grid gap-3 ${COLUMNS[shown.length]}`}>
          {shown.map((post) => (
            <li key={post.id}>
              <Link
                href={`/posts/${post.id}` as Route}
                className="surface-ring block rounded-[8px] p-3 transition-micro hover:shadow-[inset_0_0_0_1px_var(--line-firm)]"
              >
                <div className="flex items-start gap-2">
                  {/* `line-clamp-2`, not `truncate`. At four columns a card is
                      ~300px and a real title does not fit on one line — MEASURED,
                      "Tuesday roast is back on the counter" cut to "…back on
                      the…", which loses the half of the sentence that says what
                      the post is. Two lines hold it, and the grid equalises the
                      row's height anyway. */}
                  <span className="type-sm line-clamp-2 min-w-0 flex-1 font-[550] text-ink">
                    {post.title?.trim() || 'Untitled post'}
                  </span>
                  <Badge rung="urgent">{STATUS_WORD[post.intent]}</Badge>
                </div>
                {post.body?.trim() ? (
                  <p className="mt-1 line-clamp-2 type-meta text-muted">{post.body}</p>
                ) : (
                  // R7: an empty body is an empty body. No lorem, no preview
                  // stitched from the title.
                  <p className="mt-1 type-meta text-muted">Nothing written yet.</p>
                )}
                {post.channels.length > 0 ? (
                  <p className="mt-2 type-meta text-muted">
                    {post.channels.map((c) => CHANNEL_SHORT[c]).join(' · ')}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HomeSection>
  )
}
