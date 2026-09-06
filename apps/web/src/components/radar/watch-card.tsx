import Link from 'next/link'
import { ArrowRight, AtSign, Building2, MapPin, Timer } from 'lucide-react'

import { RemoveWatch } from '@/components/radar/remove-watch'
import type { WatchCard as Card } from '@/lib/radar/cards'
import { COMPETITOR_KIND_LABELS, type CompetitorKind } from '@/lib/radar/types'

/**
 * ONE BUSINESS ON THE WATCH LIST.
 *
 * A SERVER component, and that is a measurement rather than a preference: as a
 * client one it carried its markup, its three kind icons and its four claim
 * sentences into the browser bundle and put this route 12.6 kB over budget. The
 * only part that needs JavaScript is the Remove button, which is its own island.
 *
 * ── THE CLAIM IS ASKED FOR, NEVER DECIDED HERE ──────────────────────────────
 * `lib/radar/cards.ts` says which of four things this card may state, and the
 * one it must never state is the reference design's own line: "no meaningful
 * changes detected", on a business nobody has read.
 */

/**
 * One mark per kind of page. `AtSign` for Instagram rather than a brand glyph:
 * this lucide build ships no brand icons, and a handle is what the reader
 * actually typed in.
 */
const KIND_ICON: Record<CompetitorKind, typeof Building2> = {
  website: Building2,
  instagram: AtSign,
  google_business: MapPin,
}

export function WatchCard({
  card: { competitor, status },
  nextScan,
  scanArmed,
}: {
  card: Card
  /** The next weekly pass, `YYYY-MM-DD`, computed on the server in UTC. */
  nextScan: string
  /** Whether the weekly pass is switched on in this environment. */
  scanArmed: boolean
}) {
  const Icon = KIND_ICON[competitor.kind]
  const moved = status.claim === 'changed'

  return (
    // `min-w-0` IS LOAD-BEARING, not tidying. The `li` around this is a GRID
    // item, and a grid item's default `min-width: auto` refuses to shrink below
    // its content's min-content width — so the `truncate` on the name never gets
    // a chance to act and the row pushes the whole page wider than the viewport.
    // It is carried on both, because either one refusing to shrink is enough.
    <div className="surface-ring flex min-w-0 flex-col gap-3 rounded-card bg-surface p-4 transition-micro hover:bg-surface-2">
      <div className="flex min-w-0 items-start gap-3">
        <span className="surface-ring flex size-[36px] shrink-0 items-center justify-center rounded-card text-muted">
          <Icon size={16} strokeWidth={1.8} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="type-sm block truncate font-[550] text-ink">{competitor.name}</span>
          <span className="type-meta block truncate text-muted">
            {COMPETITOR_KIND_LABELS[competitor.kind]}
            {competitor.lastObservedAt ? (
              <>
                {' · last read '}
                {/* `data-scan-date` is PROVENANCE, not styling: this date is a
                    fact about Sahoda's own scanning, not a claim about the
                    business, and the figure guard admits it on that ground. */}
                <span data-scan-date={competitor.lastObservedAt.slice(0, 10)} className="num">
                  {competitor.lastObservedAt.slice(0, 10)}
                </span>
              </>
            ) : (
              // NOT a dash. "Never read" is a fact about our collector, and a
              // dash here would read as "nothing has happened at that
              // business" — the exact confusion this screen exists to prevent.
              ' · not read yet'
            )}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-pill px-2.5 py-1 type-chip ${
            moved ? 'bg-tint-100 text-accent dark:bg-s2' : 'surface-ring text-muted'
          }`}
        >
          {moved ? 'Changed' : 'Watching'}
        </span>
      </div>

      <p className="surface-ring rounded-card px-3 py-2 type-sm text-muted">
        {status.claim === 'changed' ? (
          <>
            <span className="num">{status.count}</span> {status.count === 1 ? 'change' : 'changes'}{' '}
            Radar can show you evidence for.
          </>
        ) : status.claim === 'quiet' ? (
          'Read, and nothing moved.'
        ) : status.claim === 'not-read' ? (
          'On the list. Nothing has been read yet, which is not the same as a quiet week.'
        ) : (
          'Stored and being read. The readings are not on this screen yet, so Radar cannot tell you either way.'
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-meta flex items-center gap-1.5 text-muted">
          <Timer size={13} strokeWidth={1.8} aria-hidden />
          {scanArmed ? (
            <>
              Next check{' '}
              <span data-scan-date={nextScan} className="num">
                {nextScan}
              </span>
            </>
          ) : (
            'The weekly pass is switched off, so no read is scheduled.'
          )}
        </span>
        <span className="flex items-center gap-1">
          <RemoveWatch id={competitor.id} name={competitor.name} />
          <Link
            href={`/radar/${competitor.id}`}
            className="card-link inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 type-sm font-[550] text-ink transition-micro hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            View details
            <ArrowRight size={14} aria-hidden />
          </Link>
        </span>
      </div>
    </div>
  )
}
