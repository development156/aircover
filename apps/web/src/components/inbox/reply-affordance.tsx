import type { ReplyAffordance } from '@sahoda/shared'
import { Clock, Lock, MessageSquareDashed, ShieldQuestion, Tag } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { ReplyComposer } from './reply-composer'

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
 * ── WHAT CHANGED WHEN SENDING WAS WIRED ──────────────────────────────────────
 * `canSendFromSahoda` used to be the literal `false` on every state, so this card also
 * had to explain a second, independent blocker: Sahoda's own missing send path. That
 * blocker is gone, and the copy that named it went with it — a note saying "cannot send
 * yet" beside a working box would be the fabrication in the other direction.
 *
 * The flag now varies per state, so exactly one thing stands between the customer and a
 * reply: the platform's window. `ReplyComposer` reads the same flag to decide whether to
 * offer a live box, which means the badge, the sentence and the control cannot disagree.
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
  /** Both halves of the thread key — a send is addressed to (account, conversation). */
  accountId: string
  conversationId: string
  className?: string
}

export function ReplyAffordanceCard({
  affordance,
  accountId,
  conversationId,
  className,
}: ReplyAffordanceCardProps) {
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

      {/* The allowed tags used to be listed here as static chips. They are now the
          composer's radio group instead — one place, and a place where choosing one
          does something. Two renderings of the same set would eventually disagree
          about which tags a thread still has, and the timed HUMAN_AGENT tag is exactly
          the one that would drift. */}

      <ReplyComposer
        affordance={affordance}
        accountId={accountId}
        conversationId={conversationId}
      />
    </section>
  )
}
