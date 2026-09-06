import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { platformLabel } from './platform-label'
import { conversationHref } from './thread-href'
import type { InboxListRow } from '@/lib/inbox/list-row'
import { DEFAULT_ZONE } from '@/lib/time/zone'

const WHEN = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: DEFAULT_ZONE,
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
export function ConversationRow({ conversation }: { conversation: InboxListRow }) {
  const when = formatWhen(conversation.updatedTime)
  const unread = conversation.unreadCount ?? 0
  const who = conversation.participantName ?? conversation.participantId ?? 'Unknown sender'

  /* ── EVERY ROW WITH A MESSAGE BEHIND IT IS NOW A DOOR ──────────────────────
     A stored thread carries no account of its own, and this row used to render
     `<a href="/inbox/threads//qa-thread-1">` — MEASURED 2026-09-06 on the
     wt-core preview, where the click landed on "This page isn't here". That was
     replaced with a sentence, which stopped the broken link and left the message
     unreadable: it is in THIS database, and reading our own row needs no Zernio
     account. `conversationHref` sends such a row to the store route instead, and
     returns null only for a row with neither an account nor a row id of ours. */
  const href = conversationHref(conversation)
  const canOpen = href !== null
  const body = (
    <>
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
          ) : conversation.needsReply ? (
            /* WORDS, NOT A NUMERAL. `unreadCount` is Zernio's count and the store
               has none to give; what the store knows is which side spoke last.
               A "1" here would be a number nobody counted. */
            <span className="rounded-pill bg-warn-bg px-2 py-0.5 type-chip font-semibold text-warn">
              Needs a reply
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
      {canOpen ? <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden /> : null}
    </>
  )

  if (href === null) {
    return (
      <div className="rounded-card border border-line bg-bg px-4 py-3 shadow-card">
        <div className="flex items-center gap-3">{body}</div>
        <p className="type-meta mt-1.5 text-muted">
          Sahoda has no way to open this thread: it holds no copy of it, and no connected{' '}
          {platformLabel(conversation.platform)} account can address it.
        </p>
      </div>
    )
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-card border border-line bg-bg px-4 py-3 shadow-card transition-micro hover:border-ink"
    >
      {body}
    </Link>
  )
}
