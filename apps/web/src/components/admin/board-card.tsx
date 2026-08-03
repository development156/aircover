import { ChevronRight, GitCommitHorizontal } from 'lucide-react'

import { CardControls } from '@/components/admin/card-controls'
import { shortAge, type BoardCard as Card, type QaDot } from '@/lib/ops/board'
import { splitCardDetail } from '@/lib/ops/card-copy'
import { cn } from '@/lib/utils'

/** doc 13 §10: Claude blade · D · G · D+G. */
const ASSIGNEE_INITIAL: Record<string, string> = {
  claude: '◆',
  divas: 'D',
  girija: 'G',
  both: 'D+G',
}

const QA_STYLE: Record<QaDot, string> = {
  pass: 'bg-ok',
  fail: 'bg-danger',
  // Hollow, not grey-filled: "no run" should read as an empty slot rather than
  // a third verdict.
  none: 'border border-line bg-transparent',
}

const QA_TITLE: Record<QaDot, string> = {
  pass: 'Latest QA run passed',
  fail: 'Latest QA run failed',
  none: 'No QA run recorded',
}

export function BoardCardTile({
  card,
  canWrite = false,
  draggable = canWrite,
  onDragStart,
}: {
  card: Card
  canWrite?: boolean
  /**
   * Whether this card may be picked up — SEPARATE from `canWrite`, and it has
   * to be.
   *
   * Drag needs somewhere to drop, and only the four-column view has drop zones.
   * The rolled-up stage view renders the same tile with the same write rights,
   * so tying `draggable` to `canWrite` made a card lift under the cursor in a
   * view where nothing could receive it — the exact control-that-does-nothing
   * this file's own comment forbids for viewers, arrived at from the other side.
   *
   * Turning drag off does NOT take the write away: `CardControls`' select posts
   * the same move, works on a keyboard and a touch screen, and is described
   * there as the mechanism to drag's shortcut.
   */
  draggable?: boolean
  onDragStart?: (code: string) => void
}) {
  const age = shortAge(card.ageMs)
  const { plain, technical } = splitCardDetail(card.detail)

  return (
    // The anchor the hero card's blocked list and "To reach Done" link to.
    <article
      id={`task-${card.code}`}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', card.code)
        event.dataTransfer.effectAllowed = 'move'
        onDragStart?.(card.code)
      }}
      className={cn(
        'scroll-mt-24 rounded-input border bg-bg p-3 shadow-card transition-micro',
        card.blocked ? 'border-danger' : 'border-line',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      {card.blocked ? (
        <p className="mb-2 rounded-[4px] bg-danger-bg px-2 py-1 text-[12px] font-medium text-danger">
          {/* A blocked card with no reason says so. Silence would read as
              "blocked for a good reason", and it is not one. */}
          {card.blockedReason ?? 'Blocked, with no reason recorded.'}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-muted tabular-nums">
          {card.code}
        </span>
        {card.roadmapCode ? (
          <span className="rounded-pill bg-s2 px-1.5 py-[1px] font-mono text-[10px] font-semibold text-muted">
            {card.roadmapCode}
          </span>
        ) : null}
        <span
          aria-hidden
          title={QA_TITLE[card.qa]}
          className={cn('ml-auto size-2 shrink-0 rounded-pill', QA_STYLE[card.qa])}
        />
        <span className="sr-only">{QA_TITLE[card.qa]}</span>
      </div>

      <h4 className="mt-1 text-[13px] leading-[18px] font-medium text-ink">{card.title}</h4>

      {plain ? <p className="mt-1.5 text-[12px] leading-[17px] text-muted">{plain}</p> : null}

      {/* The engineering half, one click away and never on the face of the card
          (SL-062 §2). `open` is never defaulted true: a card that expands itself
          would put us back where we started. */}
      {technical ? (
        <details className="group mt-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-input text-[11px] font-medium text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <ChevronRight
              size={12}
              strokeWidth={2.2}
              aria-hidden
              className="transition-micro group-open:rotate-90"
            />
            Technical detail
          </summary>
          <p className="mt-1.5 border-l-2 border-line pl-2.5 text-[11px] leading-[16px] whitespace-pre-line text-muted">
            {technical}
          </p>
        </details>
      ) : null}

      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
        <span
          title={`Assigned to ${card.assignee}`}
          className="grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-s2 px-1 font-mono text-[10px] font-semibold"
        >
          {ASSIGNEE_INITIAL[card.assignee] ?? card.assignee.slice(0, 1).toUpperCase()}
        </span>
        {/* No age rather than a made-up one — see columnEnteredAt. */}
        {age ? <span className="tabular-nums">{age} in column</span> : null}
        {card.commitSha ? (
          <span className="ml-auto inline-flex items-center gap-1 font-mono tabular-nums">
            <GitCommitHorizontal size={13} strokeWidth={1.8} aria-hidden />
            {card.commitSha.slice(0, 7)}
          </span>
        ) : null}
      </div>

      {canWrite ? <CardControls card={card} /> : null}
    </article>
  )
}
