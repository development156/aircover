import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ConversationRow } from '@/components/inbox/conversation-row'
import { InboxShell } from '@/components/inbox/inbox-shell'
import { PaneHeader, PaneScroll } from '@/components/inbox/inbox-panes'
import { MessageList } from '@/components/inbox/message-list'
import { ReplyAffordanceCard } from '@/components/inbox/reply-affordance'
import { SurfaceBanner } from '@/components/inbox/surface-notice'
import { SurfaceList, SurfaceRow } from '@/components/inbox/surface-list'
import { readConversations, readThread } from '@/lib/inbox/read'

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

  // The sibling list, fetched so the thread opens BESIDE it rather than after
  // navigating away from it — which is the reference's whole point. An extra
  // read per thread view, and the reason the three panes are real here.
  const { rows: siblings, decision: listDecision } = await readConversations()

  return (
    <InboxShell
      emptiness={thread.decision.state}
      // A thread is open, so on a phone the THREAD is the screen — the reference
      // hides the list once you are reading one.
      mobileShow="thread"
      list={
        <SurfaceList
          title="Inbox"
          isEmpty={!listDecision.showList || siblings.length === 0}
          emptyLine="Nothing else to show."
        >
          {(listDecision.showList ? siblings : []).map((conversation) => (
            <SurfaceRow key={`${conversation.accountId}:${conversation.id}`}>
              <ConversationRow conversation={conversation} />
            </SurfaceRow>
          ))}
        </SurfaceList>
      }
      thread={
        <>
          <PaneHeader>
            <div className="flex items-center gap-2">
              {/* Back is the mobile affordance: above 700px the list is right
                  there and a back button would point at a visible pane. */}
              <Link
                href="/inbox"
                aria-label="Back to messages"
                className="surface-ring grid size-8 shrink-0 place-items-center rounded-sm text-muted transition-micro hover:text-ink wide:hidden"
              >
                <ArrowLeft size={15} aria-hidden />
              </Link>
              <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Conversation</h2>
            </div>
          </PaneHeader>

          <PaneScroll className="p-4">
            <SurfaceBanner state={thread.decision.state} />
            {thread.messages.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">
                {thread.decision.state.body}
              </p>
            ) : (
              <MessageList messages={thread.messages} />
            )}
          </PaneScroll>

          {/* No affordance means no message stated a platform we model, and a
              send window is a per-platform rule — so there is nothing to state
              and nothing is shown. Guessing a platform here would fabricate the
              very answer this card exists to give honestly. */}
          {thread.affordance === null ? null : (
            <div className="flex-none border-t border-line-soft p-3">
              <ReplyAffordanceCard
                affordance={thread.affordance}
                accountId={accountId}
                conversationId={conversationId}
              />
            </div>
          )}
        </>
      }
    />
  )
}
