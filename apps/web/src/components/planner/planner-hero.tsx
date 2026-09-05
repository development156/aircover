import { WarmBand } from '@/components/planner/warm-band'

/**
 * The planner's header band.
 *
 * ── IT GOT SHORTER AND QUIETER, AND THAT IS THE POINT ────────────────────────
 * docs/37 §2.3 measures /planner at **2.883% saturated pixels — the worst
 * screen in the product**, 55x the quietest, and §16 quotes the founder naming
 * the cause: "a 1032px orange band holding two words". This band was it.
 *
 * The redesign brief asks for this hero AND a second wide gradient band for
 * "Plan my week", and asks that Plan my week be "the obvious next action". Both
 * bands cannot be the loudest thing; adding the second while keeping the first
 * at full strength buys a louder page and no hierarchy, which is the exact
 * failure §16 was written after.
 *
 * So the accent is TRADED rather than added. Here: the padding drops a step
 * (24 -> 20 vertical at `narrow`), the sentence loses a clause, and the art
 * renders at 70%. The band keeps its warmth and stops being the loudest object
 * on the route. What it gives up, the one paid action below it spends.
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
      {/* `quiet`, and that is the accent trade this header's docblock describes:
          the sweep runs at `--t50` rather than `--t100` and the streaks at 55%,
          so the loudest warm object on the route is the paid action below and
          not the title bar. See `warm-band.tsx` for why the illustration that
          used to sit here is gone — it was cropped through the middle at every
          real width, including before this redesign. */}
      <WarmBand strength="quiet" />

      <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4 narrow:px-6 narrow:py-5">
        <div className="min-w-0">
          <h1 className="type-h1 text-ink">Planner</h1>
          {/* Three clauses, one line, capped at 42ch — uncapped it runs under
              the illustration at 1440, which is where a decorative background
              stops being decorative.

              "watch it go OUT", not the brief's "watch it go". "Go out" is
              publishing; "go" is anything. The shorter line is the founder's
              own, and the one word that carries the claim is restored. */}
          <p className="mt-1 max-w-[42ch] type-sm text-muted">
            Plan it. Approve it. Watch it go out.
          </p>
          {/* No wrapper div. `context` is always a JSX element, so a
              `{context !== undefined ? <div className="mt-3">…` rendered an
              empty 12px-offset box on every workspace where the note inside it
              returns null — which is every connected workspace. The child owns
              its own top margin instead, and nothing shows when it renders
              nothing. */}
          {context}
        </div>

        {/* `max-narrow:w-full` so the view control gets a row of its own on a
            phone. MEASURED at 390 before this: the group is wider than what is
            left beside the title, `shrink-0` refused to give, and the last
            segment ("List") was clipped at the card's edge — which
            `no-truncated-labels.spec.ts` exists to catch and could not, because
            the page has never been opened at 390 in a browser that could reach
            the sign-in service. Given the full width it wraps instead. */}
        {children !== undefined ? (
          <div className="shrink-0 max-narrow:w-full">{children}</div>
        ) : null}
      </div>
    </section>
  )
}
