'use client'

import type { OpsChangelogEntry, OpsChangelogKind } from '@sahoda/shared'

import { CopyButton } from '@/components/admin/copy-button'
import { dayToPlainText, groupByDay, toMarkdown, toPlainText } from '@/lib/ops/changelog'
import { formatIst } from '@/lib/ops/session-pulse'
import { cn } from '@/lib/utils'

/**
 * D2 · Changelog rail (doc 13 §8) — plain-English first, clipboard-first.
 *
 * Client-side because every affordance here is a clipboard write and a
 * disclosure toggle. The entries arrive as data from the server component.
 */

/** docs/08 §6 semantic set. `security` is crimson: it is not a neutral change. */
const KIND_STYLE: Record<OpsChangelogKind, string> = {
  added: 'bg-ok-bg text-ok',
  changed: 'bg-s2 text-muted',
  fixed: 'bg-s2 text-info',
  removed: 'bg-warn-bg text-warn',
  security: 'bg-danger-bg text-danger',
  docs: 'bg-s2 text-muted',
}

function Entry({ entry }: { entry: OpsChangelogEntry }) {
  return (
    <article className="border-b border-line pb-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded-pill px-1.5 py-[1px] text-[10px] font-semibold uppercase',
            KIND_STYLE[entry.kind],
          )}
        >
          {entry.kind}
        </span>
        <span className="font-mono text-[10px] text-faint tabular-nums">#{entry.seq}</span>
        <span className="ml-auto text-[11px] text-muted tabular-nums">
          {formatIst(entry.happened_at)}
        </span>
      </div>

      <h4 className="mt-1.5 text-[13px] font-semibold text-ink">{entry.title}</h4>
      {/* The mandatory field. Written for a non-technical owner, so it is the
          only body text shown without asking. */}
      <p className="mt-1 text-[13px] leading-[19px] text-ink">{entry.summary_plain}</p>

      {entry.details_tech ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[12px] text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Technical details
          </summary>
          <p className="mt-1 font-mono text-[12px] leading-[18px] whitespace-pre-wrap text-muted">
            {entry.details_tech}
          </p>
        </details>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-pill bg-s2 px-1.5 py-[1px] font-mono text-[10px] font-semibold text-muted">
          {entry.author}
        </span>
        {entry.task_codes.map((code) => (
          <a
            key={code}
            href={`#task-${code}`}
            className="rounded-pill bg-s2 px-1.5 py-[1px] font-mono text-[10px] text-muted tabular-nums transition-micro hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {code}
          </a>
        ))}
        <span className="ml-auto flex items-center gap-0.5">
          <CopyButton label="Copy" text={() => toPlainText(entry)} />
          <CopyButton label="MD" text={() => toMarkdown(entry)} />
        </span>
      </div>
    </article>
  )
}

export function ChangelogRail({ entries }: { entries: readonly OpsChangelogEntry[] }) {
  const days = groupByDay(entries)

  return (
    /**
     * No card chrome and no heading of its own: the collapsible region around
     * this on `/admin/dev` supplies both, and two nested headings reading
     * "Changelog" is how a page starts to look like it was assembled rather
     * than designed.
     *
     * SCROLLS IN ITS OWN HEIGHT (SL-062 §4). The rail is bounded and scrolls
     * internally, so a hundred entries cannot stretch the page and push the
     * board off the bottom of it. `overscroll-contain` keeps a scroll that
     * reaches the end of the rail from carrying on down the page.
     */
    <section aria-label="Changelog entries">
      {days.length === 0 ? (
        <p className="text-[13px] text-muted">
          No entries yet. One gets written at every ship and any user-visible change.
        </p>
      ) : (
        <div className="max-h-[32rem] space-y-5 overflow-y-auto overscroll-contain pr-2">
          {days.map((day) => (
            <div key={day.key}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">
                  {day.label}
                </h3>
                <CopyButton label="Copy day" text={() => dayToPlainText(day)} className="ml-auto" />
              </div>
              <div className="space-y-3">
                {day.entries.map((entry) => (
                  <Entry key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
