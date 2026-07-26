import { GitCommitHorizontal } from 'lucide-react'

import { shortAge, type BoardCard as Card, type QaDot } from '@/lib/ops/board'
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

export function BoardCardTile({ card }: { card: Card }) {
  const age = shortAge(card.ageMs)

  return (
    // The anchor the roadmap card's "To reach Done" list links to.
    <article
      id={`task-${card.code}`}
      className={cn(
        'scroll-mt-24 rounded-input border bg-bg p-3 shadow-card transition-micro',
        card.blocked ? 'border-danger' : 'border-line',
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
    </article>
  )
}
