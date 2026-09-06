'use client'

import { CardEmpty } from '@/components/empty-state'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'

import { PaneHeader, PaneScroll } from '@/components/inbox/inbox-panes'
import { platformLabel } from '@/components/inbox/platform-label'
import { conversationHref } from '@/components/inbox/thread-href'
import type { InboxListRow } from '@/lib/inbox/list-row'
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

function nameOf(c: InboxListRow): string {
  return c.participantName ?? c.participantId ?? 'Unknown sender'
}

export function ConversationList({
  conversations,
  waitingLine,
  title = 'Conversations',
}: {
  conversations: InboxListRow[]
  /**
   * ── NOT AN EMPTY STATE. A STATEMENT OF WHAT THIS COLUMN HOLDS ─────────────
   * This prop used to be `emptyLine`, and the pages passed an absence claim into
   * it — "No conversations yet." / "Nothing read yet." — while the thread pane
   * two columns over stated the SAME absence with its reason and its remedy.
   * That is two announcements of one nothing, and the shell's own header
   * forbids it: "EMPTINESS IS STATED ONCE PER SCREEN, NEVER ONCE PER PANE."
   *
   * Worse, the two could disagree. MEASURED at 1440 on a workspace that had
   * connected nothing: this pane said "Nothing read yet" (a claim about a READ)
   * while the thread pane said the account was never connected (a claim about a
   * CONNECTION). Neither was false; together they described two different
   * situations, on the screen every beta user meets on day one.
   *
   * So the line is now future tense with Sahoda as its subject — what will
   * appear in this column — which asserts nothing about presence or absence and
   * therefore cannot contradict the pane that does.
   */
  waitingLine: string
  /** The surface's own noun. NEVER "Inbox" — the page <h1> already says that. */
  title?: string
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
          {/* The page <h1> above these panes already says "Inbox", 109px away.
              docs/37 §16: a page that says the same thing in more than one place
              says it once, at the top. This header names the COLUMN instead,
              which on a three-surface tab bar also says which one you are on. */}
          <h2 className="type-h3">{title}</h2>
          {unread > 0 ? (
            <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-brand-tint px-[5px] text-[11px] font-bold text-accent tabular-nums">
              {unread}
            </span>
          ) : null}
        </div>

        {/* Both controls are hidden when there is nothing to filter — a search
            box over zero rows is a control that cannot succeed. */}
        {conversations.length > 0 ? (
          <>
            <div className="surface-ring mb-3 flex h-9 items-center gap-2 rounded-sm bg-s2 px-[10px] transition-micro focus-within:shadow-[inset_0_0_0_1.5px_var(--brand)]">
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
                      'inline-flex h-7 items-center rounded-pill px-[10px] type-meta font-[550] transition-micro max-narrow:min-h-[44px]',
                      channel === key
                        ? 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
                        : 'text-muted surface-ring-firm hover:text-ink',
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
          // Quiet, and top-aligned rather than floated to the middle of a 730px
          // column. The thread pane stays loud because it carries the REASON and
          // the REMEDY; this one only says what the column is for.
          <p className="p-3 type-meta text-muted">{waitingLine}</p>
        ) : shown.length === 0 ? (
          // Filtered to nothing is a DIFFERENT state from having nothing, and
          // it has a different remedy: change the filter, not connect a channel.
          <CardEmpty body="Nothing matches that. Clear the search or pick another channel." />
        ) : (
          <ul>
            {shown.map((conversation) => {
              const who = nameOf(conversation)
              const count = conversation.unreadCount ?? 0
              /* ── EVERY ROW WITH A MESSAGE BEHIND IT IS A DOOR ───────────
                 A stored thread carries no account; this row rendered
                 `/inbox/threads//qa-thread-1` and the click landed on "This
                 page isn't here" (MEASURED 2026-09-06, wt-core preview). The
                 sentence that replaced the link stopped the 404 and left the
                 message unreadable — it is in THIS database, and our own row
                 needs no Zernio account. `conversationHref` routes such a row
                 to the store thread instead. */
              const href = conversationHref(conversation)
              const rowClass =
                'flex items-start gap-[10px] border-b border-line-soft px-3 py-3 last:border-b-0'
              const body = (
                <>
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-pill bg-ink text-[11px] font-bold text-white dark:bg-white dark:text-[var(--canvas)]"
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
                        <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-pill bg-brand px-[5px] text-[11px] font-bold text-primary-foreground tabular-nums">
                          {count}
                        </span>
                      ) : conversation.needsReply ? (
                        /* Words, not a numeral: `unreadCount` is Zernio's and
                           the store has no read state to count. What it knows
                           is which side spoke last. */
                        <span className="shrink-0 rounded-pill bg-warn-bg px-1.5 type-chip font-semibold text-warn">
                          Needs a reply
                        </span>
                      ) : null}
                    </span>
                    {href === null ? (
                      <span className="mt-1 block type-meta text-muted">
                        Sahoda holds no copy of this thread and no connected{' '}
                        {platformLabel(conversation.platform)} account can address it.
                      </span>
                    ) : null}
                  </span>
                </>
              )
              return (
                <li key={`${conversation.accountId}:${conversation.id}`}>
                  {href === null ? (
                    <div className={rowClass}>{body}</div>
                  ) : (
                    <Link href={href} className={cn(rowClass, 'transition-micro hover:bg-s2')}>
                      {body}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </PaneScroll>
    </>
  )
}
