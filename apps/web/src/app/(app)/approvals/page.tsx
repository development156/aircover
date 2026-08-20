import Link from 'next/link'
import type { Route } from 'next'
import { CheckCheck, TriangleAlert } from 'lucide-react'

import { ReviewQueue } from '@/components/approvals/review-queue'
import { Badge } from '@/components/ui/badge'
import { CHANNEL_SHORT } from '@/components/posts/channel-label'
import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { Unreadable } from '@/components/design-system/absence-row'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { readApprovalQueue } from '@/lib/approvals/read'
import { STATUS_WORD } from '@/lib/posts/status-word'
import type { DisplayPost } from '@/lib/posts/display-post'

export const metadata = { title: 'Approvals' }

/**
 * APPROVALS — a real queue over real rows.
 *
 * ── WHAT THIS REPLACED ───────────────────────────────────────────────────────
 * A drawing: three fictional rows reading "A post waiting on you" / "One that is
 * due soon" / "One Sahoda drafted", with an em dash where a reach figure would
 * be, and a comment arguing that wiring it to `posts` would produce "a second,
 * competing approvals screen". That argument was right about the danger and
 * wrong about the remedy — the answer to two screens disagreeing is one
 * collection, not one screen fewer. There is a queue, it is `posts`, and nothing
 * on this route is invented.
 *
 * ── ITS OWN SECTION, NOT A TAB OF THE PLANNER ────────────────────────────────
 * Founder's ruling, and the shape of the day agrees with it: at L2 on the
 * Autonomy Dial, deciding is the ONE thing you open Sahoda to do. The Planner
 * answers "when is this going out"; this answers "does it go out at all". A tab
 * would put the second question behind the first.
 *
 * ── ONE COLLECTION, THREE READERS ────────────────────────────────────────────
 * The rail's badge, this header and Home's "Needs your attention" all call
 * `readApprovalQueue`, which is `cache()`-wrapped so the layout's tree and the
 * page's tree share ONE select in a request. `lib/approvals/queue.ts` holds the
 * predicate so the three cannot filter the same rows differently. That is the
 * defect `nav-item.tsx` predicted in prose, closed at runtime rather than by
 * convention.
 *
 * ── THE DIAL IS NOT ON THIS SCREEN ───────────────────────────────────────────
 * The brief calls this "the Autonomy Dial's L2 surface", and it is — but no
 * autonomy level is stored anywhere in this product, so a control reading "You
 * are on L2" would be an invented claim about the reader's workspace on the one
 * screen that must be trustworthy. The note at the foot links to /loop, where
 * the dial is drawn honestly as unbuilt.
 */

export default async function ApprovalsPage() {
  const read = await readApprovalQueue()

  return (
    <div className="space-y-grid">
      <PageTitle sub="Everything waiting on a decision from you, in one place.">
        Approvals
      </PageTitle>

      {read.status === 'no-workspace' ? (
        <EmptyState
          icon={CheckCheck}
          title="Create a workspace first"
          body="Posts belong to a workspace, and so does the queue of ones waiting on you."
          action={<CreateWorkspaceButton />}
        />
      ) : read.status === 'unreadable' ? (
        // NOT an empty state. "Nothing needs you" and "we could not read what
        // needs you" are different claims, and the first one told over the
        // second is how somebody closes the app with five posts waiting.
        <section className="surface-ring flex flex-col items-center gap-2 rounded-card bg-surface px-5 py-10 text-center">
          <Unreadable what="Your queue" />
          <h2 className="type-h3 mt-1">Sahoda could not read what is waiting on you</h2>
          <p className="type-body max-w-[42ch] text-muted">
            The queue did not come back this time. Reload &mdash; this is not a sign that nothing
            needs you.
          </p>
        </section>
      ) : read.total === 0 ? (
        <EmptyState
          icon={CheckCheck}
          title="Nothing is waiting on you"
          body="Anything sent for review, and anything that failed to go out, appears here. That is a real answer — not a screen that has yet to load."
          tip="Posts you are still writing live under Posts. They are not waiting on a decision, so they are not here."
        />
      ) : (
        <>
          {read.decisions.length > 0 ? <ReviewQueue posts={read.decisions} /> : null}
          {read.repairs.length > 0 ? <RepairList posts={read.repairs} /> : null}
        </>
      )}

      <p className="type-sm text-muted">
        How much Sahoda may do before asking you is the{' '}
        <Link href="/loop" className="font-[550] text-accent underline underline-offset-2">
          autonomy setting
        </Link>
        . It is not built yet, so every post reaches this queue.
      </p>
    </div>
  )
}

/**
 * The other half of the queue: posts that went wrong.
 *
 * ── WHY THEY ARE NOT IN THE SAME LIST WITH A CHECKBOX ────────────────────────
 * They need a person for a different reason and take a different action. The
 * approve transition does not accept `failed` or `partial` at all
 * (`APPROVABLE_FROM`), so a checkbox beside one would offer a bulk action that
 * silently does nothing for it — and `approvePosts` would honestly report it as
 * "had already moved on", which is a true sentence about a thing the user never
 * should have been able to select.
 *
 * So: no checkboxes, no Approve. Each row opens the post, which is where the
 * channel that failed can be seen and retried.
 */
function RepairList({ posts }: { posts: readonly DisplayPost[] }) {
  return (
    <section aria-labelledby="approvals-repairs" className="surface-ring rounded-card bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
        <TriangleAlert size={15} strokeWidth={1.8} aria-hidden className="shrink-0 text-muted" />
        <h2 id="approvals-repairs" className="text-[13px] font-semibold">
          Did not go out
        </h2>
        <span className="type-sm text-muted">
          <span className="num">{posts.length}</span>
          {posts.length === 1 ? ' post' : ' posts'}
        </span>
      </header>
      <ul>
        {posts.map((post) => (
          <li
            key={post.id}
            className="flex flex-wrap items-center gap-3 border-b border-line-soft px-3 py-3 last:border-b-0"
          >
            <Link
              href={`/posts/${post.id}` as Route}
              className="min-w-0 flex-1 rounded-sm text-[13px] font-[550] text-ink hover:text-accent"
            >
              <span className="block truncate">{post.title?.trim() || 'Untitled post'}</span>
              {post.channels.length > 0 ? (
                <span className="type-sm block truncate text-muted">
                  {post.channels.map((channel) => CHANNEL_SHORT[channel]).join(' · ')}
                </span>
              ) : null}
            </Link>
            <Badge rung="urgent">{STATUS_WORD[post.intent]}</Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}
