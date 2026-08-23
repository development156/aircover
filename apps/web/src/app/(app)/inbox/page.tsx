import { ConversationList } from '@/components/inbox/conversation-list'
import { InboxShell } from '@/components/inbox/inbox-shell'
import { ThreadPlaceholder } from '@/components/inbox/thread-placeholder'
import { readConversationsList } from '@/lib/inbox/conversations'
import { toInboxEmptiness } from '@/lib/inbox/store-decision'

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
  // STORE FIRST. The rows come from this database, filled by the Zernio webhook
  // receiver; the live call is a history supplement whose failure is a label, not
  // an exception. Zernio being unreachable degrades this page to what the store
  // holds and says so — it does not blank it.
  const { rows, decision } = await readConversationsList()

  // `showList` false means the rows cannot be trusted as a reading — treat the
  // list as empty rather than rendering rows the classifier has disowned.
  const conversations = decision.showList ? rows : []
  const emptiness = toInboxEmptiness(decision)

  return (
    <InboxShell
      emptiness={emptiness}
      mobileShow={conversations.length > 0 ? 'list' : 'thread'}
      hasSomethingToOpen={conversations.length > 0}
      list={
        <ConversationList
          conversations={conversations}
          title="Conversations"
          /* Future tense, subject Sahoda: what this column holds, never whether
             it holds anything. The absence, its reason and its remedy are stated
             once, in the thread pane, from `InboxEmptiness`. */
          waitingLine="Conversations appear here as they arrive, newest first."
        />
      }
      thread={
        <ThreadPlaceholder
          emptiness={emptiness}
          hasConversations={conversations.length > 0}
          selectLine="Pick a conversation to read it and reply."
        />
      }
    />
  )
}
