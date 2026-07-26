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
 * Alpha readiness, at the top of the roadmap card (doc 13 §7).
 *
 * It leads the card because the number it carries is the most important one in
 * the system and was previously reachable only by reading a seed comment. A
 * verdict nobody can find is a verdict that is not doing its job.
 *
 * It renders in crimson and names the failing items. It does NOT render a
 * percentage or a progress bar: this is a judgement someone made on a date, not
 * a measurement that moves, and dressing it as a metric would imply a freshness
 * it does not have.
 */
export function AlphaReadiness({
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
  // would quietly shrink the count — "4 of 14" while the record says six — so
  // the mismatch is shown rather than absorbed.
  const unmatched = record.failingCodes.length - failing.length
  const age = gateAgeDays(record, today)
  const stale = age > GATE_STALE_AFTER_DAYS

  if (record.verdict === 'ship' && failing.length === 0) {
    return (
      <p className="text-[13px] text-ok">
        Alpha items all passed when last checked, {ageLabel(age)}.
      </p>
    )
  }

  return (
    <section
      aria-labelledby="alpha-readiness"
      className="rounded-input border border-danger/30 bg-danger-bg p-4"
    >
      <div className="flex items-start gap-2.5">
        <OctagonAlert
          size={17}
          strokeWidth={2}
          aria-hidden
          className="mt-[2px] shrink-0 text-danger"
        />
        <div className="min-w-0">
          <h3 id="alpha-readiness" className="text-[13px] font-bold text-danger">
            Alpha is not shippable —{' '}
            <span className="tabular-nums">
              {record.failingCodes.length} of {alphaItems.length}
            </span>{' '}
            Alpha items are failing
          </h3>

          <ul className="mt-2 space-y-1">
            {failing.map((item) => (
              <li key={item.code} className="text-[13px] text-ink">
                <span className="font-mono text-[11px] text-muted tabular-nums">{item.code}</span>{' '}
                {item.title}
              </li>
            ))}
          </ul>

          {unmatched > 0 ? (
            <p className="mt-1.5 text-[12px] text-warn tabular-nums">
              {unmatched} recorded failure{unmatched === 1 ? '' : 's'} no longer match a roadmap
              item — the record and the roadmap disagree.
            </p>
          ) : null}

          {/* Provenance, always. This is a transcription of somebody's judgement
              on a date, not a live check, and it must never read as one. */}
          <p className="mt-2 text-[12px] text-muted">
            Recorded {ageLabel(age)} · {record.source} · not re-run since.
            {stale ? ' This verdict may be out of date.' : ''}
          </p>
        </div>
      </div>
    </section>
  )
}
