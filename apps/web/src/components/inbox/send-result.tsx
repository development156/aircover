'use client'

import { AlertTriangle, Check, TriangleAlert } from 'lucide-react'

import type { InboxSendState } from '@/app/actions/inbox-send'
import { cn } from '@/lib/utils'

/**
 * What happened to a reply, in the customer's terms. Shared by every send surface.
 *
 * ── FOUR OUTCOMES, FOUR TREATMENTS ───────────────────────────────────────────
 * A confirmed send names the platform's OWN id, because that id is the evidence — the
 * same rule `.is-real` applies to a published post: a thing is real when the platform
 * has named it. Everything else is styled apart from success on purpose:
 *
 *  · `unconfirmed` — a warning, not an error. Nothing went wrong that we can point at
 *    and the reply may well have landed, so the action is "check on the platform", NOT
 *    "try again": retrying could double-send a reply that already went.
 *  · `refused` — neutral. The platform's rules are information, not a fault, and
 *    colouring them red would read as something being broken.
 *  · `failed` — ours, and worth retrying.
 *
 * One component rather than one per surface, so a DM reply and a comment reply cannot
 * end up disagreeing about what "we could not confirm this" looks like.
 */
export function SendResult({ result }: { result: InboxSendState | null }) {
  if (result === null) return null

  if (result.ok) {
    return (
      <p
        role="status"
        aria-live="polite"
        data-send-result="sent"
        className="mt-3 inline-flex items-center gap-1.5 rounded-card bg-ok-bg px-3 py-2 text-[13px] text-ok"
      >
        <Check size={14} strokeWidth={2} aria-hidden />
        Sent. The platform’s id for this reply is{' '}
        <span className="font-mono tabular-nums">{result.platformId}</span>.
      </p>
    )
  }

  const tone =
    result.status === 'unconfirmed'
      ? { className: 'bg-warn-bg text-warn', Icon: TriangleAlert }
      : result.status === 'refused'
        ? { className: 'bg-s2 text-muted', Icon: AlertTriangle }
        : { className: 'bg-danger-bg text-danger', Icon: AlertTriangle }

  return (
    <p
      role="status"
      aria-live="polite"
      data-send-result={result.status}
      className={cn(
        'mt-3 flex max-w-[70ch] items-start gap-1.5 rounded-card px-3 py-2 text-[13px]',
        tone.className,
      )}
    >
      <tone.Icon size={14} strokeWidth={2} aria-hidden className="mt-[2px] shrink-0" />
      <span>{result.message}</span>
    </p>
  )
}
