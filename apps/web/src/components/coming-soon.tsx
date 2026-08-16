import { Badge } from '@/components/ui/badge'

/**
 * The screen a planned-but-unbuilt feature shows.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
 * A route for a feature that does not exist yet has three options: 404, an
 * empty page, or an honest one. The first two read as broken. This is the third.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
 * No dates. No "launching soon". No countdown, progress bar or percentage.
 * Every one of those is a claim about the future that nobody in this repo can
 * keep, and a progress bar on an unbuilt feature is a fake success state
 * wearing a different costume — the same dishonesty as a mocked API response,
 * just rendered larger.
 *
 * No email capture and no "notify me". That needs a table, a table needs a
 * migration, and migrations here apply to PRODUCTION. A form that silently
 * discards what you typed would be worse than no form at all.
 *
 * ── HOW IT SIGNALS "NOT REAL" IN UNDER A SECOND ──────────────────────────────
 * Three ways at once, none of them a colour:
 *   · a `calm` chip that says "Not built yet" in words
 *   · the feature list rendered `.is-proposed` — the Certainty System's DASHED
 *     signature, which already means "visibly provisional" everywhere else in
 *     the app. Reusing it means this screen speaks the same vocabulary as the
 *     rest of the product rather than inventing a private one.
 *   · the mascot, presented at rest rather than working
 *
 * The chip uses `hideGlyph`: rung 4's glyph is a CHECK, which would read as
 * "done" — the exact opposite claim.
 */
export function ComingSoon({
  feature,
  summary,
  includes,
}: {
  /** The feature's real name, as it will ship. */
  feature: string
  /** One short sentence on what it will do. Present tense, no promises. */
  summary: string
  /** Optional — what it will include. Rendered visibly provisional. */
  includes?: readonly string[]
}) {
  return (
    <section
      aria-labelledby="coming-soon-title"
      className="surface-ring mx-auto flex max-w-[560px] flex-col items-center rounded-card bg-surface px-5 py-8 text-center max-narrow:px-4 max-narrow:py-6"
    >
      {/*  The kit's `.mascot-hero`: the source is a 2.08:1 presentation render in
          which the character occupies roughly 15% of the frame, so it is zoomed
          and anchored rather than fitted — otherwise the strip is almost
          entirely empty canvas.

          The zoom is 155%, not the kit's 195%: this card is narrower than the
          kit's hero slot, and at 195% the crop cut the character off at the
          shins. Anchored on the character (it sits at ~51%/51% of the frame,
          not at the centre) rather than on the canvas.

          Decorative — the heading below says the same thing in words, so a
          screen reader gains nothing from it. */}
      <div
        aria-hidden
        className="surface-ring mb-5 h-[132px] w-full rounded-[8px] bg-s2 bg-[url('/mascot/0.png')] bg-[length:auto_155%] bg-[position:51%_48%] bg-no-repeat"
      />

      <Badge rung="calm" hideGlyph>
        Not built yet
      </Badge>

      <h1 id="coming-soon-title" className="mt-3 text-[20px] font-[650] tracking-[-0.02em]">
        {feature}
      </h1>
      <p className="mt-[6px] max-w-[42ch] text-[13px] text-muted">{summary}</p>

      {includes && includes.length > 0 ? (
        <>
          <p className="type-eyebrow mt-6 mb-2 text-muted">It will include</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {includes.map((item) => (
              // `.is-proposed` — dashed, transparent, muted. The same treatment
              // a suggested-not-approved post wears, for the same reason.
              <li
                key={item}
                className="is-proposed rounded-sm px-[7px] py-[3px] text-[11px] font-semibold"
              >
                {item}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/*  Says the quiet part out loud. Without it, a well-made placeholder can
          read as a feature that is merely empty today. */}
      <p className="mt-6 max-w-[46ch] text-[12px] text-muted">
        Nothing on this screen is connected yet. It is here so the route works and so you can see
        what is planned — not because the feature is running.
      </p>
    </section>
  )
}
