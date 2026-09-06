import Link from 'next/link'
import type { Route } from 'next'

import { absenceSentence, changeSentence } from '@/lib/analytics/headline'
import type { Kpi } from '@/lib/analytics/kpi'
import { cn } from '@/lib/utils'

/**
 * THE FIVE FIGURES THIS PRODUCT CAN PUT AT THE TOP. See `kpi.ts` for which
 * claim each one is making and why the unique-reach card is NOT one of them.
 *
 * ── IT FOLLOWS `HeadlineStrip`'S SHAPE ON PURPOSE ────────────────────────────
 * Same card, same absence treatment, same rule that direction never rests on
 * colour alone: `changeSentence` spells "Up" and "Down" in words and the hue is
 * a second signal for somebody scanning fast. Two strips one above the other
 * that looked like two different products would be worse than either.
 *
 * ── COVERAGE IS PRINTED, NOT SMOOTHED ────────────────────────────────────────
 * A sum over four of nine posts is a subtotal, and a card that hides that has
 * told the reader a smaller number than the truth without saying so. When the
 * denominator is short it is on the card.
 */
export function KpiStrip({ kpis, windowLabel }: { kpis: readonly Kpi[]; windowLabel: string }) {
  return (
    <div
      data-guide="analytics-kpis"
      className="grid grid-cols-5 gap-grid max-wide:grid-cols-3 max-narrow:grid-cols-2"
    >
      {kpis.map((kpi) => (
        <KpiCard key={kpi.id} kpi={kpi} windowLabel={windowLabel} />
      ))}
    </div>
  )
}

/** A fraction as a percentage, to one place. `tabular-nums` at the call site. */
function asPercent(value: number): string {
  return `${(value * 100).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`
}

function KpiCard({ kpi, windowLabel }: { kpi: Kpi; windowLabel: string }) {
  const footer =
    kpi.footer.kind === 'note' ? kpi.footer.text : changeSentence(kpi.footer.change, windowLabel)
  const direction =
    kpi.footer.kind === 'change'
      ? kpi.footer.change.kind === 'compared'
        ? kpi.footer.change.direction
        : kpi.footer.change.kind === 'from-none'
          ? ('up' as const)
          : null
      : null

  return (
    <div className="surface-ring rounded-card bg-surface p-5">
      <p className="type-eyebrow text-muted">{kpi.label}</p>

      <p className="mt-3 min-h-[44px] type-hero-num text-ink">
        {kpi.value !== null ? (
          <span className="tabular-nums">
            {kpi.format === 'percent' ? asPercent(kpi.value) : kpi.value.toLocaleString('en-IN')}
          </span>
        ) : (
          <span className="type-h3 text-muted">{absenceSentence(kpi.absence ?? 'waiting')}</span>
        )}
      </p>

      {/* The best post names itself. A number alone would be a quantity with no
          subject, on the one card whose whole job is to say WHICH post. */}
      {kpi.text ? <p className="mt-1 line-clamp-2 type-sm text-ink">{kpi.text}</p> : null}

      <p className="mt-1 type-meta text-muted">{kpi.caveat}</p>

      {kpi.coverage ? (
        <p className="mt-1 type-meta text-muted tabular-nums">
          From {kpi.coverage.measured} of {kpi.coverage.posts} posts measured.
        </p>
      ) : null}

      <p
        className={cn(
          'mt-1 type-meta',
          direction === 'down' ? 'text-danger' : direction === 'up' ? 'text-ok' : 'text-muted',
        )}
      >
        {footer}
      </p>

      {kpi.link ? (
        <Link
          href={kpi.link.href as Route}
          className="mt-2 inline-block type-meta font-[550] text-accent underline-offset-2 transition-micro hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {kpi.link.label}
        </Link>
      ) : null}
    </div>
  )
}
