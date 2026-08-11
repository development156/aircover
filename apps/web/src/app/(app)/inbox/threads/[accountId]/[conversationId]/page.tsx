import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MessageList } from '@/components/inbox/message-list'
import { ReplyAffordanceCard } from '@/components/inbox/reply-affordance'
import { SurfaceBanner, SurfaceNotice } from '@/components/inbox/surface-notice'
import { readThread } from '@/lib/inbox/read'

export const metadata = { title: 'Inbox · Thread' }

/**
 * `GET /inbox/conversations/{id}/messages`, read-only.
 *
 * ── WHY THE ROUTE HAS TWO SEGMENTS ───────────────────────────────────────────
 * A thread is `(conversationId, accountId)`. Zernio resolves a conversation id only
 * within an account, so `/inbox/threads/[id]` would carry half a key and read against
 * whichever account matched — across tenants, since Zernio's profile filter defaults to
 * every profile on the API key. Two segments make the pair structural: a URL missing
 * the account cannot match this route at all, and one naming an account that is not
 * this workspace's 404s before any read goes out (`accountByIdForWorkspace`).
 *
 * This is also the only place a send window can be known, because it is the only read
 * that returns message timestamps and directions.
 */
export default async function ThreadPage({
  params,
}: {
  params: Promise<{ accountId: string; conversationId: string }>
}) {
  const { accountId, conversationId } = await params
  // `now` is passed in rather than read inside the window rule, so the decision is a
  // pure function of its inputs and testable without freezing the clock.
  const thread = await readThread(accountId, conversationId, new Date().toISOString())

  // The account is not this workspace's. A 404 rather than an explanation: confirming
  // that some other tenant's account id exists is itself a disclosure.
  if (thread === null) notFound()

  return (
    <div className="space-y-grid">
      <Link
        href="/inbox"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-micro hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        Back to messages
      </Link>

      {thread.messages.length === 0 ? (
        <SurfaceNotice state={thread.decision.state} showConnectAction={false} />
      ) : (
        <>
          <SurfaceBanner state={thread.decision.state} />
          <MessageList messages={thread.messages} />
        </>
      )}

      {/* No affordance means no message stated a platform we model, and a send window
          is a per-platform rule — so there is nothing to state and nothing is shown.
          Guessing a platform here would fabricate the very answer this card exists to
          give honestly. */}
      {thread.affordance === null ? null : (
        <ReplyAffordanceCard
          affordance={thread.affordance}
          accountId={accountId}
          conversationId={conversationId}
        />
      )}
    </div>
  )
}
