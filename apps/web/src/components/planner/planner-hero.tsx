import { PlannerHeroArt } from '@/components/planner/planner-hero-art'

/**
 * The planner's header band.
 *
 * ── THE HEADING IS STILL EXACTLY "Planner" ───────────────────────────────────
 * `every-section-loads.spec.ts:54` asserts `/^Planner$/` against this page's
 * `h1`, and its own header explains why: "Reading the h1 is what separates
 * 'this screen exists' from 'this URL resolves'." A more evocative title would
 * turn a guard that proves the page rendered into a guard that proves nothing.
 * Everything expressive here happens beside the heading, never inside it.
 *
 * ── THE ART IS BEHIND THE HEADER, NOT BEHIND THE PAGE ────────────────────────
 * The founder's requirement was explicit and this is how each half is met:
 *
 *  · behind the hero region only — the `<svg>` is absolutely positioned inside
 *    THIS section, which is `relative`. It cannot reach the plan below it.
 *  · not stretched, calendar not cropped — `preserveAspectRatio="xMaxYMid
 *    slice"` on the art anchors the glyph to the right edge and crops the empty
 *    left instead.
 *  · readable text — the art is masked out under the copy by a gradient that
 *    runs to full `--surface` on the left, so the heading and its sentence sit
 *    on flat ground at every width. The mask is a `linear-gradient` in the
 *    `mask-image` position. It uses the `black` keyword rather than a hex:
 *    a mask reads the ALPHA channel and discards the colour, so the two are
 *    identical here, and design-lint's hex exemption only recognises the CSS
 *    `mask-image:` spelling — not React's `maskImage` — so a hex would fail a
 *    rule that is enforced at zero.
 *  · reduced on small screens — `max-narrow:hidden` on the art. The founder
 *    asked for "reposition or reduce rather than cover content"; at 390 there is
 *    no room to reposition into, and `no-truncated-labels.spec.ts` asserts zero
 *    horizontal scroll at that width. Removing the decoration is the reduction.
 */
export function PlannerHero({
  children,
  context,
}: {
  /** The view control. Passed in so this file owns no routing. */
  children?: React.ReactNode
  /**
   * One short line of live status — never a second heading. It owns its own
   * top margin: this component must not wrap it, or a child that renders null
   * still leaves a spaced empty box behind.
   */
  context?: React.ReactNode
}) {
  return (
    <section className="surface-ring relative isolate overflow-hidden rounded-card bg-surface">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 max-narrow:hidden"
        style={{
          maskImage:
            'linear-gradient(to right, transparent 0%, transparent 34%, black 72%, black 100%)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0%, transparent 34%, black 72%, black 100%)',
        }}
      >
        <PlannerHeroArt />
      </div>

      <div className="relative flex flex-wrap items-end justify-between gap-4 p-5 narrow:p-6">
        <div className="min-w-0">
          <h1 className="type-h1 text-ink">Planner</h1>
          {/* Capped at 42ch. Uncapped it runs under the illustration at 1440,
              which is where a decorative background stops being decorative. */}
          <p className="mt-1 max-w-[42ch] type-sm text-muted">
            Everything for your content week, in one place. Plan it, approve it, and watch it go
            out.
          </p>
          {/* No wrapper div. `context` is always a JSX element, so a
              `{context !== undefined ? <div className="mt-3">…` rendered an
              empty 12px-offset box on every workspace where the note inside it
              returns null — which is every connected workspace. The child owns
              its own top margin instead, and nothing shows when it renders
              nothing. */}
          {context}
        </div>

        {children !== undefined ? <div className="shrink-0">{children}</div> : null}
      </div>
    </section>
  )
}
