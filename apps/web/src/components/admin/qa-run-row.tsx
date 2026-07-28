import type { OpsQaRun, OpsQaStatus } from '@sahoda/shared'

import { formatDuration } from '@/lib/ops/qa-console'
import { formatIst } from '@/lib/ops/session-pulse'
import { cn } from '@/lib/utils'

/** docs/08 §6 semantic set — blocked and failed are crimson, never orange. */
const STATUS_STYLE: Record<OpsQaStatus, string> = {
  pass: 'bg-ok-bg text-ok',
  fail: 'bg-danger-bg text-danger',
  blocked: 'bg-danger-bg text-danger',
  running: 'bg-s2 text-muted',
}

export function QaRunRow({ run, pinned = false }: { run: OpsQaRun; pinned?: boolean }) {
  const duration = formatDuration(run.duration_ms)

  return (
    <article
      className={cn('rounded-input border bg-bg p-3', pinned ? 'border-danger' : 'border-line')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-pill px-2 py-[2px] text-[11px] font-semibold uppercase',
            STATUS_STYLE[run.status],
          )}
        >
          {run.status}
        </span>
        <span className="text-[12px] font-semibold">{run.suite}</span>

        {run.task_code ? (
          <a
            href={`#task-${run.task_code}`}
            className="rounded-pill bg-s2 px-1.5 py-[1px] font-mono text-[10px] text-muted tabular-nums transition-micro hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {run.task_code}
          </a>
        ) : (
          // Not silence: a run attached to nothing is a real state, and saying
          // so is what stops it being read as "attached to whatever is above".
          <span className="text-[11px] text-faint">no card</span>
        )}

        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted tabular-nums">
          <span className="rounded-pill bg-s2 px-1.5 py-[1px] font-mono text-[10px]">
            {run.kind}
          </span>
          <span>{run.actor}</span>
          {duration ? <span>{duration}</span> : null}
          <span>{formatIst(run.started_at)}</span>
        </span>
      </div>

      {run.summary_plain ? (
        <p className="mt-1.5 text-[13px] leading-[19px] text-ink">{run.summary_plain}</p>
      ) : null}

      {run.details ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[12px] text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Output
          </summary>
          {/* Tail only, as stored. Wrapped and scrollable so one noisy run
              cannot push the rest of the console off screen. */}
          <pre className="mt-1 max-h-64 overflow-auto rounded-input bg-s1 p-2 font-mono text-[11px] leading-[16px] whitespace-pre-wrap text-muted">
            {run.details}
          </pre>
        </details>
      ) : null}
    </article>
  )
}
