import { ConversationList } from '@/components/inbox/conversation-list'
import { InboxShell } from '@/components/inbox/inbox-shell'
import { ThreadPlaceholder } from '@/components/inbox/thread-placeholder'
import { readConversations } from '@/lib/inbox/read'

export const metadata = { title: 'Inbox' }

/**
 * `GET /inbox/conversations`, read-only — now in the reference's three panes.
 *
 * The list shows no send-window state on purpose — see `ConversationRow`. A
 * window is measured from the newest inbound message, which only the thread read
 * returns.
 *
 * ── THE PANES ────────────────────────────────────────────────────────────────
 *   list     every conversation, with client-side search and channel chips
 *   thread   empty here by definition — opening one navigates to
 *            /inbox/threads/[account]/[conversation], which owns the messages
 *            and the composer and is NOT touched by this run
 *   context  structure only; the reference's customer data has no source here
 *
 * `decision.showList` is no longer used to replace the whole screen. That was
 * right for a single-pane list — with nothing to show, showing nothing but the
 * reason was the honest thing. In three panes it is wrong: blanking the screen
 * would also remove the list pane's header and the layout itself, so a new user
 * would never see what the inbox IS. The reason now lives in the thread pane and
 * the panes stay standing.
 */
export default async function InboxMessagesPage() {
  const { rows, decision } = await readConversations()

  // `showList` false means the rows cannot be trusted as a reading — treat the
  // list as empty rather than rendering rows the classifier has disowned.
  const conversations = decision.showList ? rows : []

  return (
    <InboxShell
      emptiness={decision.state}
      mobileShow={conversations.length > 0 ? 'list' : 'thread'}
      hasSomethingToOpen={conversations.length > 0}
      list={
        <ConversationList
          conversations={conversations}
          emptyLine={decision.showList ? 'No conversations yet.' : 'Nothing read yet.'}
        />
      }
      thread={
        <ThreadPlaceholder
          emptiness={decision.state}
          hasConversations={conversations.length > 0}
          selectLine="Pick a conversation to read it and reply."
        />
      }
    />
  )
}
