import { OctagonAlert } from 'lucide-react'
import type { OpsRoadmapItem } from '@sahoda/shared'

import {
  ALPHA_GATE,
  GATE_STALE_AFTER_DAYS,
  ageLabel,
  gateAgeDays,
  type AlphaGateRecord,
} from '@/lib/ops/alpha-gate'

/**
 * The Alpha readiness verdict, DEMOTED but not removed (SL-062 §1).
 *
 * It used to be a full crimson panel at the top of the card, and it dominated
 * the page — which meant progress, blockers and what shipped were all below
 * something a reader had already learned to scroll past. It is now a compact
 * chip that expands on click.
 *
 * WHAT DID NOT CHANGE, and must not: it is still crimson, still on the hero
 * card, still names every failing item, and still carries its date and the fact
 * that it has not been re-run. Demoting a warning is a layout decision;
 * softening it would be a different and much worse one. It never renders
 * collapsed-and-silent — the count and the age are on the chip face, so the
 * expansion adds detail rather than revealing the problem.
 */
export function AlphaChip({
  items,
  today,
  record = ALPHA_GATE,
}: {
  items: readonly OpsRoadmapItem[]
  today: Date
  record?: AlphaGateRecord
}) {
  const alphaItems = items.filter((item) => item.stage === 'alpha')
  const failing = record.failingCodes
    .map((code) => alphaItems.find((item) => item.code === code))
    .filter((item): item is OpsRoadmapItem => item !== undefined)

  // Codes recorded as failing that no longer exist on the roadmap. Silence here
  // would quietly shrink the count.
  const unmatched = record.failingCodes.length - failing.length
  const age = gateAgeDays(record, today)
  const stale = age > GATE_STALE_AFTER_DAYS

  if (record.verdict === 'ship' && failing.length === 0) {
    return (
      <p className="text-[12px] text-ok">
        Alpha items all passed when last checked, {ageLabel(age)}.
      </p>
    )
  }

  return (
    <details className="group rounded-input border border-danger/30 bg-danger-bg">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-input px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <OctagonAlert size={14} strokeWidth={2.2} aria-hidden className="shrink-0 text-danger" />
        <span className="text-[12px] font-bold text-danger">
          Alpha gate:{' '}
          <span className="tabular-nums">
            {record.failingCodes.length} of {alphaItems.length}
          </span>{' '}
          failing, audited {formatShort(record.recordedOn)}, not re-run since
        </span>
        <span className="ml-auto shrink-0 text-[11px] font-medium text-danger/80 group-open:hidden">
          Show
        </span>
        <span className="ml-auto hidden shrink-0 text-[11px] font-medium text-danger/80 group-open:inline">
          Hide
        </span>
      </summary>

      <div className="border-t border-danger/20 px-3 pt-2.5 pb-3">
        <p className="text-[12px] font-semibold text-danger">
          Alpha is not shippable. These items were assessed as not working:
        </p>
        <ul className="mt-1.5 space-y-1">
          {failing.map((item) => (
            <li key={item.code} className="text-[12px] text-ink">
              <span className="font-mono text-[10px] text-muted tabular-nums">{item.code}</span>{' '}
              {item.title}
            </li>
          ))}
        </ul>

        {unmatched > 0 ? (
          <p className="mt-1.5 text-[11px] text-warn tabular-nums">
            {unmatched} recorded failure{unmatched === 1 ? '' : 's'} no longer match a roadmap item
            — the record and the roadmap disagree.
          </p>
        ) : null}

        {/* Counting six failures invites the reader to assume the rest passed.
            The eleven behavioural checks are a DIFFERENT list nobody has run,
            so their state is unknown — neither a pass nor a failure. */}
        <p className="mt-2 text-[12px] text-ink">
          Separately, the <span className="font-semibold tabular-nums">11 behavioural checks</span>{' '}
          of the Alpha Gate are <span className="font-semibold">unverified, not failed</span> — that
          gate has never been run.
        </p>

        <p className="mt-2 text-[11px] text-muted">
          Recorded {ageLabel(age)} · {record.source} · not re-run since.
          {stale ? ' This verdict may be out of date.' : ''}
        </p>
      </div>
    </details>
  )
}

/** `2026-07-25` → `25 Jul`. Short because it sits inside a one-line chip. */
function formatShort(iso: string): string {
  const at = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(at)) return iso
  return new Date(at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
