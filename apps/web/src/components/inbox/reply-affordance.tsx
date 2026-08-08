import type { ReplyAffordance } from '@sahoda/shared'
import { Clock, Lock, MessageSquareDashed, ShieldQuestion, Tag } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { platformLabel } from './platform-label'

/**
 * The reply affordance — a send window explained BEFORE the compose box, never after
 * a failed submit.
 *
 * ── THE FAILURE THIS PREVENTS ────────────────────────────────────────────────
 * Every messaging platform closes free-form replies some hours after the customer's
 * last message. If the UI offers an ordinary compose box regardless, the user writes a
 * reply, presses send, and Meta rejects it — having already spent the effort, and with
 * an error that explains nothing. The window is knowable before the box renders, so
 * the box states its own terms.
 *
 * ── WHY THE CONTROL IS ALWAYS DISABLED TODAY ─────────────────────────────────
 * `canSendFromSahoda` is the literal type `false` in @sahoda/shared: reads are the only
 * wired surface. So there are two independent reasons a reply may be impossible — the
 * platform's window, and Sahoda's own missing send path — and both are shown. Hiding
 * the second would make a disabled box look like a platform restriction it is not.
 */

interface StateStyle {
  label: string
  icon: LucideIcon
  /** Token pairs only. */
  className: string
}

/**
 * `satisfies Record<ReplyAffordance['state'], StateStyle>` so a new window state cannot
 * ship as an unstyled grey chip nobody thought about.
 */
const STATE_STYLES = {
  open: { label: 'Replies open', icon: Clock, className: 'bg-ok-bg text-ok' },
  tagged: { label: 'Tagged replies only', icon: Tag, className: 'bg-warn-bg text-warn' },
  template_only: {
    label: 'Template only',
    icon: MessageSquareDashed,
    className: 'bg-warn-bg text-warn',
  },
  closed: { label: 'Replies closed', icon: Lock, className: 'bg-s2 text-muted' },
  // Not an error — an honest "we have not measured this". Neutral, never alarming.
  unknown: { label: 'Window not known', icon: ShieldQuestion, className: 'bg-s2 text-muted' },
} satisfies Record<ReplyAffordance['state'], StateStyle>

const WHEN = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
})

/** An unparseable instant renders nothing rather than "Invalid Date". */
function formatWhen(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : `${WHEN.format(parsed)} IST`
}

export interface ReplyAffordanceCardProps {
  affordance: ReplyAffordance
  className?: string
}

export function ReplyAffordanceCard({ affordance, className }: ReplyAffordanceCardProps) {
  const style = STATE_STYLES[affordance.state]
  const Icon = style.icon
  const closesAt =
    affordance.state === 'open' || affordance.state === 'tagged'
      ? formatWhen(affordance.closesAt)
      : null

  return (
    <section
      data-guide="inbox.reply"
      data-window-state={affordance.state}
      aria-labelledby="reply-window-heading"
      className={cn('rounded-card border border-line bg-bg p-4 shadow-card', className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-[3px] text-[12px] leading-[18px] font-semibold',
            style.className,
          )}
        >
          <Icon size={13} strokeWidth={2} aria-hidden />
          {style.label}
        </span>
        <h2 id="reply-window-heading" className="text-[13px] font-semibold text-muted">
          {platformLabel(affordance.platform)}
        </h2>
        {closesAt ? (
          <span className="text-[13px] text-muted tabular-nums">
            {affordance.state === 'open' ? 'Closes' : 'Narrows'} {closesAt}
          </span>
        ) : null}
      </div>

      {/* The reason is the whole point of the component — it renders verbatim from
          the shared model, so the copy cannot drift between here and the rules. It is
          stated ONCE and the compose field points at it by id; a component test caught
          an earlier version repeating the whole sentence inside the composer. */}
      <p
        id="reply-window-reason"
        className="mt-2 max-w-[70ch] text-[14px] leading-[22px] text-muted"
      >
        {affordance.reason}
      </p>

      {affordance.state === 'tagged' ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Allowed message tags">
          {affordance.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-pill bg-s2 px-2 py-[2px] font-mono text-[11px] font-semibold tracking-[0.04em] text-muted"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}

      <ReplyComposer affordance={affordance} />
    </section>
  )
}

/**
 * The compose control, disabled with a stated cause.
 *
 * It renders even when replying is impossible, on purpose: an absent control leaves the
 * user wondering whether the feature exists, while a disabled one that says why answers
 * the question.
 *
 * `aria-describedby` lists BOTH causes, because they are independent and a thread can
 * have either, both, or only the second: the platform's window, and Sahoda's own
 * missing send path. A screen reader hears the reasons, not just "textbox, disabled".
 * The window reason is referenced by id rather than repeated — one sentence, one place.
 */
function ReplyComposer({ affordance }: { affordance: ReplyAffordance }) {
  const blockedByPlatform = affordance.state !== 'open'

  return (
    <div className="mt-4 border-t border-line pt-4">
      <label htmlFor="reply-body" className="text-[13px] font-semibold">
        Reply
      </label>
      <textarea
        id="reply-body"
        disabled
        rows={3}
        aria-describedby={
          blockedByPlatform ? 'reply-window-reason reply-send-note' : 'reply-send-note'
        }
        placeholder={
          blockedByPlatform ? 'Replying is not available on this thread' : 'Write a reply'
        }
        className="mt-1.5 w-full resize-none rounded-card border border-line bg-s2 px-3 py-2 text-[14px] text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-45"
      />
      <p id="reply-send-note" className="mt-1.5 text-[13px] text-muted">
        Sahoda can read this thread but cannot send yet — the reply path is not wired in this build.
      </p>
    </div>
  )
}
