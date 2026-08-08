import { ConversationRow } from '@/components/inbox/conversation-row'
import { SurfaceBanner, SurfaceNotice } from '@/components/inbox/surface-notice'
import { readConversations } from '@/lib/inbox/read'

export const metadata = { title: 'Inbox' }

/**
 * `GET /inbox/conversations`, read-only.
 *
 * The list shows no send-window state on purpose — see `ConversationRow`. A window is
 * measured from the newest inbound message, which only the thread read returns.
 */
export default async function InboxMessagesPage() {
  const { rows, decision } = await readConversations()

  if (!decision.showList) {
    return <SurfaceNotice state={decision.state} />
  }

  return (
    <div className="space-y-grid">
      <SurfaceBanner state={decision.state} />
      <ul className="space-y-2" data-guide="inbox.conversations">
        {rows.map((conversation) => (
          <li key={`${conversation.accountId}:${conversation.id}`}>
            <ConversationRow conversation={conversation} />
          </li>
        ))}
      </ul>
    </div>
  )
}
