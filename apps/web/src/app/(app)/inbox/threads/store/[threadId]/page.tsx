import { CardEmpty } from '@/components/empty-state'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ConversationRow } from '@/components/inbox/conversation-row'
import { InboxShell } from '@/components/inbox/inbox-shell'
import { PaneHeader, PaneScroll } from '@/components/inbox/inbox-panes'
import { MessageList } from '@/components/inbox/message-list'
import { ReplyAffordanceCard } from '@/components/inbox/reply-affordance'
import { SurfaceList, SurfaceRow } from '@/components/inbox/surface-list'
import { accountIdsByChannel, readConversationsList } from '@/lib/inbox/conversations'
import { newestInboundAt, threadPlatform } from '@/lib/inbox/messages'
import { readStoredThreadById } from '@/lib/inbox/store-read'
import { toInboxEmptiness } from '@/lib/inbox/store-decision'
import { evaluateSendWindow } from '@sahoda/shared'
import type { ZernioMessage } from '@sahoda/publishing'

export const metadata = { title: 'Inbox · Thread' }

/**
 * A conversation this database holds, addressed by OUR row id.
 *
 * ── WHY A SECOND THREAD ROUTE EXISTS ─────────────────────────────────────────
 * The live route is `/inbox/threads/[accountId]/[conversationId]`, and both
 * segments are load-bearing: Zernio resolves a conversation id only within an
 * account, so a one-segment live URL would read against whichever account matched,
 * across tenants.
 *
 * None of that applies to a row in `inbox_threads`. It is ours, RLS scopes it, and
 * the id is used as a query FILTER against this workspace's own rows rather than as
 * something to trust. Until now a stored thread whose channel had no connected
 * Zernio account had no destination at all — the list rendered it as a paragraph
 * explaining that the message it was showing could not be opened. The message was
 * real and there was no door to it.
 *
 * ── WHAT THIS ROUTE CANNOT DO ────────────────────────────────────────────────
 * Reply, unless a connected account on that channel can carry it. A send is
 * addressed to `(account, conversation)` and no amount of local data supplies an
 * account nobody has connected. The page says that in one sentence rather than
 * offering a box that could only fail.
 */
export default async function StoredThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>
}) {
  const { threadId } = await params

  // The sibling list depends on nothing this read produces, so it does not wait
  // for it — the same trade the live thread route documents. On the 404 path one
  // RLS-scoped query is wasted and discloses nothing.
  const [detail, list] = await Promise.all([
    readStoredThreadById(threadId),
    readConversationsList(),
  ])

  // Not this workspace's thread, or not a thread at all. A 404 rather than an
  // explanation: confirming that some other tenant's thread id exists is itself a
  // disclosure.
  if (detail === null) notFound()

  const messages = detail.messages as ZernioMessage[]
  const siblings = list.decision.showList ? list.rows : []
  const emptiness = toInboxEmptiness(list.decision)

  // Can a reply leave from here at all? A send needs a Zernio account on this
  // thread's channel, and the absence of one is exactly why this route exists.
  const accountId = (await accountIdsByChannel()).get(detail.thread.channel) ?? null

  const platform = threadPlatform(messages)
  const affordance =
    accountId === null || platform === null
      ? null
      : evaluateSendWindow({
          platform,
          lastInboundAt: newestInboundAt(messages),
          now: new Date().toISOString(),
        })

  return (
    <InboxShell
      emptiness={emptiness}
      mobileShow="thread"
      list={
        <SurfaceList
          title="Inbox"
          isEmpty={siblings.length === 0}
          waitingLine="Other conversations appear here."
        >
          {siblings.map((conversation) => (
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
              <Link
                href="/inbox"
                aria-label="Back to messages"
                className="surface-ring grid size-8 shrink-0 place-items-center rounded-sm text-muted transition-micro hover:text-ink wide:hidden"
              >
                <ArrowLeft size={15} aria-hidden />
              </Link>
              <h2 className="type-body font-semibold tracking-[-0.01em]">
                {detail.thread.authorName ?? 'Conversation'}
              </h2>
            </div>
          </PaneHeader>

          <PaneScroll className="p-4">
            {messages.length === 0 ? (
              /* The THREAD is here and its messages are not, which is a different
                 nothing from an empty inbox. Sahoda filed the conversation and no
                 message with it — a bare star rating does exactly that. */
              <CardEmpty body="Sahoda holds this conversation but no message text for it. Nothing has been lost: the platform sent the thread without a body." />
            ) : (
              <MessageList messages={messages} />
            )}
          </PaneScroll>

          <div className="flex-none border-t border-line-soft p-3">
            {affordance === null ? (
              <p className="type-meta text-muted">
                Sahoda can read this conversation because it holds a copy of it. Replying goes
                through the platform, and no connected account can carry it right now. Reconnect the
                account from Connections to reply.
              </p>
            ) : (
              <ReplyAffordanceCard
                affordance={affordance}
                // Non-null by construction: `affordance` is only built when an
                // account resolved. Narrowing rather than asserting would need a
                // second branch that renders the same thing.
                accountId={accountId ?? ''}
                // The PLATFORM's id, which is what a send is addressed by. Our own
                // row id names the page and never leaves it.
                conversationId={detail.thread.platformThreadId}
              />
            )}
          </div>
        </>
      }
    />
  )
}
