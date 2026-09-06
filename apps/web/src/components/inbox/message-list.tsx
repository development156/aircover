import { messageDirection, type ZernioMessage } from '@sahoda/publishing'

import { attachmentHref } from '@/lib/inbox/attachment-href'
import { cn } from '@/lib/utils'
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
 * The messages in one thread.
 *
 * ── THE RULE THIS USED TO GET WRONG `[LIVE 2026-08-10]` ──────────────────────
 * It compared `m.direction === 'inbound'` and treated everything else as ours, on the
 * stated grounds that no payload had been observed and an unclassifiable message was
 * "safer rendered as our own". That premise is gone, and the fallback was the damage:
 * Zernio sends `'incoming'`, so EVERY message — including the customer's — rendered on
 * the right, in the owner's colour, labelled **"You"**. Sahoda was putting the
 * customer's words in the shop owner's mouth, in a thread the owner was reading to
 * decide how to reply.
 *
 * So there are three states now, not two, and `messageDirection` decides them in one
 * place shared with the send-window calculation. An unattributable message is rendered
 * as unattributed — visibly neither party — rather than silently assigned to whichever
 * side the fallback happens to pick. Guessing wrong here is not a cosmetic error.
 */
export function MessageList({ messages }: { messages: ZernioMessage[] }) {
  return (
    <ol className="flex flex-col gap-2" data-guide="inbox.thread">
      {messages.map((m) => {
        const direction = messageDirection(m)
        const when = formatWhen(m.createdAt)

        return (
          <li
            key={m.id}
            data-direction={direction}
            className={cn(
              'flex flex-col gap-0.5',
              direction === 'inbound' && 'items-start',
              direction === 'outbound' && 'items-end',
              direction === 'unknown' && 'items-center',
            )}
          >
            <div
              className={cn(
                'max-w-[46ch] rounded-card px-3 py-2 text-[14px] leading-[21px]',
                direction === 'outbound' ? 'bg-primary text-primary-foreground' : 'bg-s2 text-ink',
                // Dashed, so an unattributed message reads as incomplete at a glance
                // rather than as a normal bubble that happens to sit in the middle.
                direction === 'unknown' && 'border border-dashed border-line',
                m.isDeleted && 'italic opacity-60',
              )}
            >
              {m.isDeleted ? 'This message was deleted' : m.message}
              {!m.isDeleted && m.attachments && m.attachments.length > 0 ? (
                <Attachments message={m} />
              ) : null}
            </div>
            <span className="px-1 text-[12px] text-muted tabular-nums">
              {direction === 'inbound' ? (m.senderName ?? 'Customer') : null}
              {direction === 'outbound' ? 'You' : null}
              {direction === 'unknown' ? 'Sahoda could not tell who sent this' : null}
              {when ? ` · ${when}` : ''}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * What came attached, under the words.
 *
 * An image is shown; everything else is a link that says what it is, because a
 * video or a voice note rendered inline would be a player this thread does not
 * have. Each `src` goes through `attachmentHref`, so a Meta link that expired
 * since the message arrived is re-minted on the way rather than shown broken.
 * The `alt` is the TYPE, never a description Sahoda did not have.
 */
function Attachments({ message }: { message: ZernioMessage }) {
  const items = (message.attachments ?? []).filter((a) => typeof a.url === 'string' && a.url !== '')
  if (items.length === 0) return null
  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Attachments">
      {(message.attachments ?? []).map((a, index) => {
        if (typeof a.url !== 'string' || a.url === '') return null
        const href = attachmentHref({
          accountId: message.accountId ?? '',
          conversationId: message.conversationId,
          messageId: message.id,
          index,
          url: a.url,
        })
        const kind = a.type === 'image' || a.type === 'sticker' ? 'image' : a.type
        return (
          <li key={index}>
            {kind === 'image' ? (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived CDN url that next/image cannot optimise */}
                <img
                  src={href}
                  alt={a.type === 'sticker' ? 'Sticker' : 'Image attachment'}
                  loading="lazy"
                  className="max-h-64 max-w-full rounded-sm object-contain"
                />
              </a>
            ) : (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center rounded-sm bg-surface px-2 py-1 type-meta text-ink underline"
              >
                {ATTACHMENT_WORDS[a.type] ?? 'Attachment'}
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const ATTACHMENT_WORDS: Record<string, string> = {
  video: 'Video',
  audio: 'Voice note',
  file: 'File',
  share: 'Shared post',
}
