import { CardEmpty } from '@/components/empty-state'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ConversationRow } from '@/components/inbox/conversation-row'
import { InboxShell } from '@/components/inbox/inbox-shell'
import { PaneHeader, PaneScroll } from '@/components/inbox/inbox-panes'
import { MessageList } from '@/components/inbox/message-list'
import { ReplyAffordanceCard } from '@/components/inbox/reply-affordance'
import { SaveAsLead } from '@/components/leads/save-as-lead'
import { SurfaceBanner } from '@/components/inbox/surface-notice'
import { SurfaceList, SurfaceRow } from '@/components/inbox/surface-list'
import { readConversations, readThread } from '@/lib/inbox/read'
import { messageDirection } from '@sahoda/publishing'

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
  /**
   * ── THE SIBLING LIST DEPENDS ON NOTHING, SO IT DOES NOT WAIT ───────────────
   * `readConversations()` takes no argument and reads a different table; it was
   * simply awaited after the thread, which cost one extra round trip to
   * ap-south-1 on every thread opened. MEASURED 2026-08-23: a PostgREST call
   * from this server has a p50 of 105ms.
   *
   * The trade is explicit: on the 404 path the sibling list is now fetched for a
   * thread that does not resolve. That read is RLS-scoped to this workspace and
   * discloses nothing — the 404 below is unchanged, and it is still the thread's
   * own read that decides it. One wasted query on the rare path buys a round
   * trip back on every ordinary one.
   */
  const [thread, { rows: siblings, decision: listDecision }] = await Promise.all([
    readThread(accountId, conversationId, new Date().toISOString()),
    readConversations(),
  ])

  // The account is not this workspace's. A 404 rather than an explanation: confirming
  // that some other tenant's account id exists is itself a disclosure.
  if (thread === null) notFound()

  // The newest message the OTHER side sent. A conversation with none is one
  // nobody has enquired through, so there is nothing to promote.
  const newestInbound =
    thread.messages.find((message) => messageDirection(message) === 'inbound') ?? null

  // The sibling list exists so the thread opens BESIDE it rather than after
  // navigating away from it — which is the reference's whole point. It is read
  // above, in the same wait as the thread.

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
          waitingLine="Other conversations from this account appear here."
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
              // One language across all five inbox routes (docs/26 §4.1). The
              // CLAIM is the classifier's own — `lib/inbox/emptiness.ts` keeps
              // eight of these sentences apart on purpose — and only the
              // treatment moved.
              <CardEmpty body={thread.decision.state.body} />
            ) : (
              <MessageList messages={thread.messages} />
            )}
          </PaneScroll>

          {/* DOOR TWO into `leads`, and only where there is something to save:
              a conversation with no inbound message is not somebody enquiring.
              `newestInbound` is found with `messageDirection` rather than by
              comparing the raw field — Zernio says "incoming", doc 13 said
              "inbound", and two call sites comparing it by hand is the defect
              that put the customer's words in the shop owner's mouth. */}
          {newestInbound ? (
            <div className="flex-none border-t border-line-soft p-3">
              <SaveAsLead
                conversationRef={conversationId}
                channel={newestInbound.platform}
                authorName={newestInbound.senderName ?? null}
                // NULL, and deliberately. `ZernioMessage` has `senderId` and no
                // handle field at all, and an id stored under `author_handle`
                // reads as a handle to every later reader — the same defect as
                // putting "@cornerbakery" in the email column, which the
                // function refuses to do for exactly this reason.
                authorHandle={null}
                message={newestInbound.message}
              />
            </div>
          ) : null}

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
