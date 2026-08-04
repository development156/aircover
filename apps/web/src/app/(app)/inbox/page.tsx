import { MessagesSquare } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { ThreadCard } from '@/components/inbox/thread-card'
import { listMessages, listThreads, ratingSummary } from '@/lib/inbox/read'

export const metadata = { title: 'Inbox' }

/**
 * Reviews and replies (FSD M7).
 *
 * ── WHY THIS IS EMPTY, AND SAYS SO IN WORDS ──────────────────────────────────
 * The tables, the reads, the RLS and the reply path are all real. What does not
 * exist is an INGEST: there is no verified read API for Google Business Profile
 * reviews available to us — Zernio publishes posts, and nothing in doc 13 or their
 * reachable surface documents reviews in either direction.
 *
 * The empty state therefore explains the actual reason rather than saying "no
 * reviews yet", which would read as "your business has none" and be a claim about
 * the customer's shop that we are in no position to make.
 */
export default async function InboxPage() {
  const threads = await listThreads()
  const summary = ratingSummary(threads)

  // One read per thread would be N+1; on an empty list it is zero reads, and the
  // page cap is 50, so this stays bounded either way.
  const messagesByThread = await Promise.all(threads.map((t) => listMessages(t.id)))

  return (
    <div className="space-y-grid">
      <PageTitle>Inbox</PageTitle>

      {summary.average !== null ? (
        <section className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-bg p-4 shadow-card">
          <div>
            <p className="type-eyebrow text-muted">Average rating</p>
            <p className="text-[24px] leading-7 font-bold tabular-nums">
              {summary.average.toFixed(1)}
            </p>
          </div>
          <p className="text-[13px] text-muted tabular-nums">
            {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
          </p>
        </section>
      ) : null}

      {threads.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Nothing to show here yet"
          body="Reviews and comments will land here once we can read them from your channels. We can't do that yet — our publishing partner sends posts out but doesn't hand reviews back, so there's nothing to fetch. This isn't a count of your reviews."
        />
      ) : (
        <ul className="space-y-3">
          {threads.map((thread, index) => (
            <li key={thread.id}>
              <ThreadCard thread={thread} messages={messagesByThread[index] ?? []} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
