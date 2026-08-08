import type { ZernioMessage } from '@sahoda/publishing'

import { cn } from '@/lib/utils'

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
 * The messages in one thread.
 *
 * `direction` decides the side. Anything that is not exactly `'inbound'` is treated as
 * ours: a message we cannot classify is safer rendered as our own than attributed to
 * the customer, and it also keeps an unlabelled message from opening a send window it
 * did not earn (see `newestInboundAt`).
 */
export function MessageList({ messages }: { messages: ZernioMessage[] }) {
  return (
    <ol className="flex flex-col gap-2" data-guide="inbox.thread">
      {messages.map((m) => {
        const inbound = m.direction === 'inbound'
        const when = formatWhen(m.createdAt)

        return (
          <li
            key={m.id}
            data-direction={inbound ? 'inbound' : 'outbound'}
            className={cn('flex flex-col gap-0.5', inbound ? 'items-start' : 'items-end')}
          >
            <div
              className={cn(
                'max-w-[46ch] rounded-card px-3 py-2 text-[14px] leading-[21px]',
                inbound ? 'bg-s2 text-ink' : 'bg-primary text-primary-foreground',
                m.isDeleted && 'italic opacity-60',
              )}
            >
              {m.isDeleted ? 'This message was deleted' : m.message}
            </div>
            <span className="px-1 text-[12px] text-muted tabular-nums">
              {inbound ? (m.senderName ?? 'Customer') : 'You'}
              {when ? ` · ${when}` : ''}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
