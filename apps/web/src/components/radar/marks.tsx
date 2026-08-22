import { Check } from 'lucide-react'

import { resolveFigure } from '@/lib/radar/evidence'
import type { ObservedFigure, Snapshot } from '@/lib/radar/types'
import { cn } from '@/lib/utils'

/**
 * THE TWO THINGS RADAR IS ALLOWED TO SAY, AND HOW THEY ARE DRAWN.
 *
 * ── SOLID = SEEN. HATCHED = OUR READ. ────────────────────────────────────────
 * `.is-real` is a solid fill; `.is-proposed` is the unratified rung — see the
 * ruling below for why an inference may not wear the fixture hatch. Neither
 * rung depends on hue, which this palette could not carry anyway.
 *
 * Each mark appears at TWO SCALES, matching `brain/certainty-mark.tsx`: a chip
 * that names the state in words, and the claim's own container carrying the same
 * class. A reader scanning a feed gets the signal without reading a chip; a
 * reader who stops gets the word.
 *
 * ── THE FOURTH RUNG WAS A DIVERGENCE. THE RULING CLOSED IT. ─────────────────
 * This file used `.is-simulated` for a Radar reading and recorded the open
 * question at length: does the fourth rung mean NOT REAL, or NOT OBSERVED?
 *
 * docs/26 §3.1b answered it on 2026-08-22. The fourth rung is for a FIXTURE —
 * output that never touched a platform. A figure Sahoda worked out FROM readings
 * it actually took is a weak claim, not a false one, and it wears `.is-proposed`.
 * If inference and fixture share the hatch, nothing on any screen tells a
 * customer that a number never left the building, which is the single most
 * valuable thing the hatch says. Three files already refused the hatch on that
 * reasoning — `brain/certainty-mark.tsx`, `audience/inferred.tsx`,
 * `connections/catalogue.ts` — and Radar joins them.
 *
 * The objection this file raised is answered directly by the ruling: "approving
 * turns the dash solid" is the COMMON case, not the definition. The dash means
 * UNRATIFIED. Nothing can ratify a claim about a competitor's business, so
 * Radar's dash is permanent, and that is honest rather than a broken promise.
 *
 * ONE RULING, TWO SITES. The chip below and the panel it sits in
 * (`change-card.tsx`) both carry the class, and `marks.rung.test.tsx` asserts
 * both — the panel echo had no test at all, which is how one of a pair gets
 * changed and the other does not.
 */

/** A claim Radar SAW. Solid fill, and the word "Seen". */
export function SeenMark({ className }: { className?: string }) {
  return (
    <span
      data-radar-certainty="seen"
      title="Radar read this on a public page, on the date shown."
      className={cn(
        'type-chip is-real inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5',
        className,
      )}
    >
      {/* Decorative: the word beside it says the same thing, so a screen reader
          hearing both would hear the state twice. */}
      <Check className="size-[11px] shrink-0" aria-hidden />
      Seen
    </span>
  )
}

/**
 * A claim Radar INFERRED. Hatched, and never without its word.
 *
 * tokens.css: "Never render this without the label; the hatch alone is not a
 * claim." The word is therefore inside this component rather than left to each
 * call site, where the fifth caller is the one that forgets.
 */
export function ReadMark({ className }: { className?: string }) {
  return (
    <span
      data-radar-certainty="read"
      title="Sahoda's interpretation. Nobody observed this."
      className={cn(
        'type-chip is-proposed inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5',
        className,
      )}
    >
      Our read
    </span>
  )
}

/**
 * ONE FIGURE, OR NOTHING.
 *
 * Returns null when the figure's snapshot is not in the change's evidence. No
 * number, and no absence mark either — see `lib/radar/evidence.ts` for why a
 * malformed record must not borrow the mark that means "their page did not
 * load". The slot simply does not exist, which is tokens.css's own ruling for a
 * quantity this product does not know.
 */
export function Observed({
  figure,
  evidence,
}: {
  figure: ObservedFigure
  evidence: readonly Snapshot[]
}) {
  const resolved = resolveFigure(figure, evidence)
  if (!resolved) return null

  const observedOn = resolved.observedAt.slice(0, 10)
  return (
    <div
      // The provenance rides on the element itself, so the guard can assert on
      // the DOM rather than on the props it was handed. A test that reads props
      // proves the component was CALLED correctly, not that the page is honest.
      data-observed={figure.snapshotId}
      data-observed-at={observedOn}
      className="flex flex-col gap-0.5 rounded-input border border-solid border-line-firm bg-surface px-3 py-2"
    >
      <span className="type-eyebrow text-muted">{figure.label}</span>
      <span className="type-h3 num text-ink">
        {figure.unit === '₹' ? '₹' : null}
        {figure.value}
        {figure.unit && figure.unit !== '₹' ? (
          <span className="type-sm ml-1 font-normal text-muted">{figure.unit}</span>
        ) : null}
      </span>
      <span className="type-eyebrow text-muted">
        Read on <span className="num">{observedOn}</span>
      </span>
    </div>
  )
}

/**
 * WE COULD NOT CHECK — a gap, drawn as a gap.
 *
 * `.is-unreadable` is the BROKEN rule from tokens.css's absence vocabulary:
 * "we asked and the answer did not come back". Its sibling `.is-unmeasured` (a
 * whole rule) means "nothing has arrived yet", and rendering both the same way
 * is the defect the vocabulary was written to fix — a failed scan reading as a
 * quiet Tuesday.
 *
 * tokens.css REQUIRES an accessible name on both marks. It is `sr-only` text and
 * not a `title`, because a title is not reliably announced, and not a
 * `max-wide:hidden` label, because hiding by breakpoint removes the accessible
 * name at exactly the width where the layout is tightest.
 */
export function NotChecked({ what, note }: { what: string; note?: string | null }) {
  return (
    // `flex-wrap` with a baseline alignment, so a long business name and its
    // note fall onto the next line instead of holding the row open. At 390 the
    // centred non-wrapping version split into two ragged columns.
    <span className="type-sm flex flex-wrap items-baseline gap-x-2 text-muted">
      <span aria-hidden className="is-unreadable" />
      {/* The reason is in BOTH, or the screen-reader name is a worse version of
          the sentence beside it. tokens.css requires this mark to carry an
          accessible name; a name that drops "the page did not respond" tells a
          reader something failed and withholds what. */}
      <span className="sr-only">
        Could not check {what}.{note ? ` ${note}` : ''}
      </span>
      <span aria-hidden>
        Could not check {what}
        {note ? ` — ${note}` : ''}
      </span>
    </span>
  )
}

/** WE CHECKED AND NOTHING MOVED. The whole rule: a reading arrived, and it was flat. */
export function NothingChanged({ what }: { what: string }) {
  return (
    <span className="type-sm flex flex-wrap items-baseline gap-x-2 text-muted">
      <span aria-hidden className="is-unmeasured" />
      <span className="sr-only">Checked {what}. Nothing changed.</span>
      <span aria-hidden>Checked {what} &mdash; nothing changed</span>
    </span>
  )
}
