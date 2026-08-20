'use client'

import { CardEmpty } from '@/components/empty-state'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'

import { PaneHeader, PaneScroll } from '@/components/inbox/inbox-panes'
import { platformLabel } from '@/components/inbox/platform-label'
import { threadHref } from '@/components/inbox/thread-href'
import { cn } from '@/lib/utils'
import type { ZernioConversation } from '@sahoda/publishing'

/**
 * The list pane (reference `.inbox__col--list`).
 *
 * Search and the channel chips filter rows ALREADY FETCHED — no request goes out
 * on a keystroke. That matches what the data allows: `readConversations` reads
 * every platform in one call precisely because the platform filter cannot
 * express WhatsApp, so filtering client-side over the full set is the honest
 * version and a per-channel refetch would silently drop a channel.
 *
 * The chips are built from the platforms PRESENT in the rows, not from a fixed
 * list. A chip for a channel this workspace has never received a message on is
 * a filter that can only ever return nothing.
 */

/** Initials for the avatar, as the reference's `initials()` does. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const letters = parts.map((p) => p[0]).join('')
  return (letters || '?').toUpperCase()
}

function nameOf(c: ZernioConversation): string {
  return c.participantName ?? c.participantId ?? 'Unknown sender'
}

export function ConversationList({
  conversations,
  emptyLine,
}: {
  conversations: ZernioConversation[]
  /** One short line for when there is nothing. The REASON lives in the thread pane. */
  emptyLine: string
}) {
  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState<string>('all')

  const channels = useMemo(() => {
    const present = new Set(conversations.map((c) => c.platform))
    return ['all', ...Array.from(present)]
  }, [conversations])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return conversations.filter((c) => {
      if (channel !== 'all' && c.platform !== channel) return false
      if (needle === '') return true
      return (
        nameOf(c).toLowerCase().includes(needle) ||
        (c.lastMessage ?? '').toLowerCase().includes(needle)
      )
    })
  }, [conversations, query, channel])

  const unread = conversations.reduce((n, c) => n + (c.unreadCount ?? 0), 0)

  return (
    <>
      <PaneHeader>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Inbox</h2>
          {unread > 0 ? (
            <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-tint px-[5px] text-[11px] font-bold text-accent tabular-nums">
              {unread}
            </span>
          ) : null}
        </div>

        {/* Both controls are hidden when there is nothing to filter — a search
            box over zero rows is a control that cannot succeed. */}
        {conversations.length > 0 ? (
          <>
            <div className="surface-ring mb-3 flex h-9 items-center gap-2 rounded-sm bg-s2 px-[10px]">
              <Search size={15} className="shrink-0 text-muted" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search conversations…"
                aria-label="Search conversations"
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
              />
            </div>

            {channels.length > 2 ? (
              <div className="flex flex-wrap gap-[6px]">
                {channels.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setChannel(key)}
                    aria-pressed={channel === key}
                    className={cn(
                      'inline-flex h-7 items-center rounded-full px-[10px] text-[12px] font-[550] transition-micro',
                      channel === key
                        ? 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
                        : 'text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink',
                    )}
                  >
                    {key === 'all' ? 'All' : platformLabel(key as ZernioConversation['platform'])}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </PaneHeader>

      <PaneScroll>
        {conversations.length === 0 ? (
          // `CardEmpty`, not bare prose. MEASURED on /inbox: this pane, the
          // thread pane and the context pane each said "nothing" in a DIFFERENT
          // visual language on the same screen — the same failure docs/27 §1
          // found on /analytics. The thread pane stays loud because it carries
          // the REASON and the REMEDY; these two are quiet because they do not.
          <CardEmpty body={emptyLine} />
        ) : shown.length === 0 ? (
          // Filtered to nothing is a DIFFERENT state from having nothing, and
          // it has a different remedy: change the filter, not connect a channel.
          <CardEmpty body="Nothing matches that. Clear the search or pick another channel." />
        ) : (
          <ul>
            {shown.map((conversation) => {
              const who = nameOf(conversation)
              const count = conversation.unreadCount ?? 0
              return (
                <li key={`${conversation.accountId}:${conversation.id}`}>
                  <Link
                    href={threadHref({
                      accountId: conversation.accountId,
                      conversationId: conversation.id,
                    })}
                    className="flex items-start gap-[10px] border-b border-line-soft px-3 py-3 transition-micro last:border-b-0 hover:bg-s2"
                  >
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white dark:bg-white dark:text-[var(--canvas)]"
                    >
                      {initialsOf(who)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-[650] text-ink">
                          {who}
                        </span>
                      </span>
                      <span className="mt-[2px] flex items-center gap-2">
                        <span className="shrink-0 text-[11px] text-muted">
                          {platformLabel(conversation.platform)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
                          {conversation.lastMessage ?? 'No message text'}
                        </span>
                        {count > 0 ? (
                          <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-brand px-[5px] text-[11px] font-bold text-white tabular-nums">
                            {count}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </PaneScroll>
    </>
  )
}
