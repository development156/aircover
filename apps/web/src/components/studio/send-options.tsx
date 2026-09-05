import { Lock } from 'lucide-react'

import type { BrandSignal } from '@sahoda/shared'

/**
 * WHAT SAHODA ADDS TO THIS PRESS, AND WHAT IT CANNOT ADD YET.
 *
 * Two lists, deliberately not one. "Will send" is the same array the server
 * action stores on the row, so the screen and the record cannot disagree.
 * "Coming soon" is controls that do not exist. Merging them would put four
 * things that do nothing into a list a person reads as what is being sent.
 *
 * ── THREE ANSWERS FOR THE SIGNALS, NEVER TWO ────────────────────────────────
 * A read that FAILED is not a workspace with nothing to add, and Explore
 * deliberately sends nothing at all. `BrandSignalsSchema`'s own header forbids
 * collapsing the first two, which is why null arrives here as null.
 *
 * ── SPANS, NOT DISABLED BUTTONS ─────────────────────────────────────────────
 * `design-lint.mjs` rule 3 refuses a disabled `<button>` beside a coming-soon
 * label, and it is right: a screen reader still announces a disabled button as
 * an action the reader could take.
 */
const COMING_SOON = [
  { title: 'Leave out' },
  { title: 'Same again' },
  { title: 'Follow how closely' },
  // "Tidy my words" was a fourth entry here and is gone from this list rather
  // than from the product: it is prompt rewriting, and the composer now names
  // exactly that, unbuilt, in the place it will live. Two names for one absent
  // feature reads as two features nobody has built.
] as const

export function SendOptions({ signals }: { signals: BrandSignal[] | null }) {
  return (
    <div className="grid gap-6 wide:grid-cols-2" data-guide="studio-send-options">
      <section className="flex flex-col gap-2" data-guide="studio-signals">
        <span className="type-eyebrow text-muted">Will send</span>
        {signals === null ? (
          <p className="type-sm text-muted">
            Sahoda could not read your Brand Brain just now, so it cannot show what it would add.
            The picture can still be drawn.
          </p>
        ) : signals.length === 0 ? (
          <p className="type-sm text-muted">
            Nothing from your Brand Brain. Fill it in and pictures start looking like your business
            rather than generic.
          </p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {signals.map((signal) => (
                <li
                  key={signal.field}
                  className="surface-ring flex items-center gap-2 rounded-pill bg-surface px-3 py-1 type-sm text-ink"
                >
                  <span
                    aria-hidden
                    className={`size-[6px] shrink-0 rounded-full ${
                      signal.certainty === 'confirmed' ? 'bg-primary' : 'surface-ring-firm'
                    }`}
                  />
                  {signal.value}
                  <span className="sr-only">
                    {signal.certainty === 'confirmed'
                      ? ', which you confirmed'
                      : ', which Sahoda guessed'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="type-meta text-muted">
              A hollow dot is one Sahoda worked out for you. Confirm it in the Brand Brain and the
              picture stops drifting between one attempt and the next.
            </p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2" data-guide="studio-coming-soon">
        <span className="type-eyebrow text-muted">Coming soon</span>
        <ul className="flex flex-wrap gap-2">
          {COMING_SOON.map((one) => (
            <li
              key={one.title}
              className="surface-ring flex items-center gap-2 rounded-pill px-3 py-1 opacity-70"
            >
              <Lock className="size-[12px] text-muted" strokeWidth={1.75} aria-hidden />
              <span className="type-sm text-muted">{one.title}</span>
            </li>
          ))}
        </ul>
        <p className="type-meta text-muted">
          Designed and not built yet. Nothing here changes what a press does today.
        </p>
      </section>
    </div>
  )
}
