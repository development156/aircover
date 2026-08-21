import type { Channel } from '@sahoda/shared'

import type { Competitor, RadarDay } from '@/lib/radar/types'
import { ChangeCard } from './change-card'
import { NotChecked, NothingChanged } from './marks'

/**
 * THE CHANGE FEED — what moved, newest first.
 *
 * ── A DAY IS THE UNIT BECAUSE A GAP NEEDS SOMEWHERE TO LIVE ─────────────────
 * A flat list of changes has no place to say "and on Tuesday we could not reach
 * The Mill House". The absence would simply not be rendered, and a reader would
 * take the silence for calm. Grouping by day gives every day a footer that
 * accounts for EVERY competitor being watched — the ones that moved, the ones
 * that were checked and had not, and the ones that could not be read at all.
 *
 * ── THREE OUTCOMES, THREE TREATMENTS, NEVER COLLAPSED ───────────────────────
 *   observed + changes      the cards above.
 *   observed + no change    `.is-unmeasured`, a whole rule. We looked. Nothing.
 *   unreachable             `.is-unreadable`, a BROKEN rule. We could not look.
 *
 * The third is the one every competitor tool in this category gets wrong, and it
 * is the one a customer most needs: a quiet week and a broken scraper produce
 * the same empty screen, and only one of them means their competitor is quiet.
 *
 * `not_attempted` renders as nothing at all. It is not a gap in our knowledge —
 * no scan was due — and drawing a mark for it would put a broken rule beside a
 * competitor added yesterday, which reads as a fault on the day they joined.
 */
export function ChangeFeed({
  days,
  competitors,
  channels,
}: {
  days: readonly RadarDay[]
  competitors: readonly Competitor[]
  channels: readonly Channel[]
}) {
  const nameOf = new Map(competitors.map((c) => [c.id, c.name]))

  return (
    <ol className="flex flex-col gap-5">
      {days.map((day) => {
        const unreachable = day.attempts.filter((a) => a.outcome === 'unreachable')
        const movedIds = new Set(day.changes.map((c) => c.competitorId))
        const quiet = day.attempts.filter(
          (a) => a.outcome === 'observed' && !movedIds.has(a.competitorId),
        )

        return (
          <li key={day.date} className="flex flex-col gap-3">
            {/* `data-scan-date` is PROVENANCE, not styling. This date is a fact
                about Sahoda's own scanning — the day we looked — not a claim
                about the competitor, so the figure guard admits it on a
                different ground from `[data-observed]` and says which. */}
            <h3 data-scan-date={day.date} className="type-eyebrow num text-muted">
              {day.date}
            </h3>

            {day.changes.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {day.changes.map((change) => (
                  <li key={change.id}>
                    <ChangeCard change={change} channels={channels} />
                  </li>
                ))}
              </ul>
            ) : null}

            {/* The day's account of everyone else. Never omitted, because an
                omission here is the silence this whole grouping exists to
                prevent. */}
            {unreachable.length > 0 || quiet.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {unreachable.map((attempt) => (
                  <li key={`gap-${attempt.competitorId}`}>
                    <NotChecked
                      what={nameOf.get(attempt.competitorId) ?? 'a business on your list'}
                      note={attempt.note}
                    />
                  </li>
                ))}
                {quiet.map((attempt) => (
                  <li key={`quiet-${attempt.competitorId}`}>
                    <NothingChanged
                      what={nameOf.get(attempt.competitorId) ?? 'a business on your list'}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
