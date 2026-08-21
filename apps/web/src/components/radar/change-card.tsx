import type { Channel } from '@sahoda/shared'

import { CHANGE_KIND_LABELS, type RadarChange } from '@/lib/radar/types'
import { DraftFromChange } from './draft-from-change'
import { Observed, ReadMark, SeenMark } from './marks'

/**
 * ONE MOVE A COMPETITOR MADE.
 *
 * ── THE CARD IS ORGANISED BY HOW SURE WE ARE, NOT BY TOPIC ──────────────────
 * Top half: what was SEEN, solid, with every figure carrying the date it was
 * read on. Bottom half: what Sahoda MAKES OF IT, hatched, carrying no figure at
 * all. The boundary between them is the most important line on the screen, so it
 * is a rule with a word on it rather than a change in spacing.
 *
 * ── THE READING SPEAKS FROM THE READER'S SIDE ────────────────────────────────
 * P4: never tell a customer what a competitor is thinking. So `brandBasis` is
 * rendered as the ground of the SUGGESTION — "your brain says X" — and the
 * reading is phrased as what their own positioning answers with. A card that
 * said "Sunrise is worried about weekend footfall" would be a claim about a
 * stranger's state of mind derived from a scraped page, and there is no evidence
 * that could ever support it.
 *
 * A reading with no `brandBasis` renders WITHOUT the grounding line rather than
 * with a generic one. "Consider responding" grounded in nothing is the filler
 * every competitor tool prints, and it is worse than silence because it looks
 * like advice.
 */
export function ChangeCard({
  change,
  channels,
}: {
  change: RadarChange
  channels: readonly Channel[]
}) {
  const figures = change.observation.figures

  return (
    <article
      data-radar-change={change.id}
      className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="type-h3 text-ink">{change.competitorName}</h3>
        <span className="type-eyebrow text-muted">{CHANGE_KIND_LABELS[change.kind]}</span>
      </div>

      {/* ── WHAT WE SAW ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <SeenMark className="mt-0.5" />
          <p className="type-body min-w-0 flex-1 text-ink">{change.observation.summary}</p>
        </div>

        {figures.length > 0 ? (
          <div className="grid gap-2 narrow:grid-cols-2">
            {figures.map((figure) => (
              <Observed key={figure.label} figure={figure} evidence={change.evidence} />
            ))}
          </div>
        ) : null}
      </div>

      {/* ── WHAT WE MAKE OF IT ────────────────────────────────────────────── */}
      {change.reading ? (
        <div
          data-radar-reading={change.id}
          // The hatch at panel scale, echoing the chip. tokens.css requires the
          // word, and `ReadMark` carries it — the class never appears here
          // without that chip beside it.
          className="is-simulated flex flex-col gap-2 rounded-card p-3"
        >
          <div className="flex items-start gap-2">
            <ReadMark className="mt-0.5" />
            <p className="type-body min-w-0 flex-1 text-ink">{change.reading.text}</p>
          </div>
          {change.reading.brandBasis ? (
            <p className="type-sm text-muted">
              Grounded in your Brand Brain &mdash; {change.reading.brandBasis.field}:{' '}
              <span className="text-ink">&ldquo;{change.reading.brandBasis.value}&rdquo;</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <DraftFromChange
        changeId={change.id}
        competitorName={change.competitorName}
        channels={channels}
      />
    </article>
  )
}
