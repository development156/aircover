import type { ZernioConversation } from '@sahoda/publishing'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { platformLabel } from './platform-label'
import { threadHref } from './thread-href'

const WHEN = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
})

function formatWhen(value: string | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : WHEN.format(parsed)
}

/**
 * One conversation in the list.
 *
 * ── WHAT THIS ROW DELIBERATELY DOES NOT SHOW ─────────────────────────────────
 * There is no send-window badge here. A window is measured from the newest INBOUND
 * message, and this row only has `updatedTime` — last activity in EITHER direction,
 * which our own outbound reply also advances. Rendering "replies closed" from that
 * would be a guess dressed as a fact. The thread view reads the messages and can say
 * for certain; the list links to it instead of pretending.
 */
export function ConversationRow({ conversation }: { conversation: ZernioConversation }) {
  const when = formatWhen(conversation.updatedTime)
  const unread = conversation.unreadCount ?? 0
  const who = conversation.participantName ?? conversation.participantId ?? 'Unknown sender'

  return (
    <Link
      href={threadHref({ accountId: conversation.accountId, conversationId: conversation.id })}
      className="flex items-center gap-3 rounded-card border border-line bg-bg px-4 py-3 shadow-card transition-micro hover:border-ink"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-bold">{who}</span>
          <span className="rounded-pill bg-s2 px-2 py-[2px] text-[12px] leading-[18px] font-semibold text-muted">
            {platformLabel(conversation.platform)}
          </span>
          {unread > 0 ? (
            <span
              className="rounded-pill bg-primary px-2 py-[2px] text-[12px] leading-[18px] font-semibold text-primary-foreground tabular-nums"
              aria-label={`${unread} unread`}
            >
              {unread}
            </span>
          ) : null}
        </div>
        {conversation.lastMessage ? (
          <p className="mt-0.5 truncate text-[14px] text-muted">{conversation.lastMessage}</p>
        ) : null}
        {conversation.accountUsername ? (
          <p className="mt-0.5 truncate text-[12px] text-muted">
            via {conversation.accountUsername}
          </p>
        ) : null}
      </div>
      {when ? <span className="shrink-0 text-[13px] text-muted tabular-nums">{when}</span> : null}
      <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
    </Link>
  )
}
