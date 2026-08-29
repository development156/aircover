import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Page heading — the kit's `.sl-page-title` / `.sl-page-sub`.
 *
 * 20px at weight 650 with -0.02em, not 25px at 800. The half-step weight is the
 * point: the kit separates levels with 550/650 rather than jumping to bold, and
 * a page title that shouts makes every screen below it feel like a landing page.
 * That only renders correctly because Inter is loaded on its variable axis
 * (see layout.tsx) — pinned static weights round 650 to 600.
 *
 * ── `crumb`, AND WHY IT IS A STRING RATHER THAN A LINK ───────────────────────
 * /connections was redrawn against a reference that opens `Connections › Integrate`
 * instead of a plain title, and the second segment is where the eye lands. This
 * renders that trail and neither segment is an anchor, deliberately: a crumb is
 * only a control if it goes somewhere, and a screen whose trail has no other
 * route would be offering navigation that cannot happen — the impossible remedy
 * `no-impossible-remedy.spec.ts` forbids, wearing navigation chrome.
 *
 * So it states a LOCATION, and it is NOT wrapped in a `<nav>`. A landmark whose
 * every segment is inert announces a navigation region holding nothing to
 * navigate, which is the same objection this file already makes to wrapping a
 * lone heading. `aria-current="page"` says which segment the reader is on, and
 * the `h1` stays the one word that names the screen, so the document outline is
 * unchanged for anyone arriving by heading. The day a real parent route exists,
 * the title becomes a `<Link>` here, the landmark becomes correct, and it can be
 * added in the same commit as the anchor rather than ahead of it.
 *
 * ── `min-w-0` IS SCOPED TO THE TRAIL, AND THAT IS NOT FUSSINESS ──────────────
 * MEASURED 2026-08-29, ON THE TREE THAT SHIPS THIS: forty-five call sites
 * across thirty-one files — twenty-seven `page.tsx` and four section
 * `layout.tsx` — and exactly one passes a `crumb`.
 *
 * The first draft of this comment said thirty-five, which was the count BEFORE
 * the same commit converted five admin screens and added ten call sites. A
 * number moved in the commit that invalidated it is the defect this repository
 * names first, and it was caught here by an adversarial pass rather than by me.
 *
 * `min-w-0` lets a flex child shrink below its content width, so putting it on
 * the wrapper unconditionally would change how the title block competes with its
 * siblings on all forty-four of the others — a layout change nothing on those
 * screens asked for and no test here would see. The trail needs it, because it
 * adds a second and third item to a row that already sits in a `flex-wrap`
 * header; the bare title never did.
 *
 * The segment is `type-h3` in ink rather than the reference's brand colour, and
 * that is a measurement rather than a preference: `--acc` is `#ff6600`, which is
 * **2.94:1** on `--canvas`, and `type-h3` is 16px at weight 650 — not WCAG large
 * text, so its floor is 4.5:1. 20px against 16px with a chevron between them
 * carries parent-and-current on size alone.
 */
export function PageTitle({
  children,
  sub,
  crumb,
  actions,
}: {
  children: React.ReactNode
  sub?: string
  /** The view inside this page, shown after the title as `Title › crumb`. */
  crumb?: string
  /**
   * This screen's ONE primary action, placed on the title's own row.
   *
   * Three screens built this row by hand before it lived here, and they had
   * already drifted: /campaigns aligned it to `items-start` and /posts to
   * `items-center`, so the same button sat at a different height depending on
   * whether the title above it carried a description. Owning the row here is
   * what makes the placement a property of the system instead of a decision
   * each screen re-takes.
   *
   * It is deliberately singular in intent rather than in type: the slot takes a
   * node, so a screen CAN put two things in it, and `accent-budget.spec.ts`
   * remains the check that only one of them is a solid brand fill. A prop that
   * accepted exactly one element would not have made that guard unnecessary,
   * only harder to read.
   */
  actions?: React.ReactNode
}) {
  const title = <h1 className="text-[20px] leading-7 font-[650] tracking-[-0.02em]">{children}</h1>

  const block = (
    <div className={cn(crumb && 'min-w-0')}>
      {crumb ? (
        <div className="flex flex-wrap items-center gap-1">
          {title}
          <ChevronRight size={15} aria-hidden className="shrink-0 text-muted" />
          <span aria-current="page" className="type-h3 text-ink">
            {crumb}
          </span>
        </div>
      ) : (
        title
      )}
      {/* ── THE DESCRIPTION IS MEASURE-LIMITED, AND THAT IS NOT DECORATION ──
          The content band is 1320px wide. A two-sentence description set across
          all of it is one line the eye has to track back along, and the longest
          in the app is /admin/brain's three sentences. `70ch` is the ordinary
          typographic measure and it binds only on the descriptions long enough
          to need it, so the twenty-one short ones render unchanged.

          `type-sm` rather than `text-[13px]`: identical size, but it is the
          scale's own step (400 13px/18px) instead of a hand-written literal in
          the one primitive forty-two routes inherit their heading from. */}
      {sub ? <p className="type-sm mt-[2px] max-w-[70ch] text-muted">{sub}</p> : null}
    </div>
  )

  /* NO ACTIONS MEANS NO WRAPPER, AND THAT IS THE WHOLE CARE HERE.
     Forty-five call sites render this component and three pass an action.
     Wrapping every one of them in a flex row would change how the title block
     competes with its siblings on the other forty-two, which is a layout change none
     of them asked for and no test on them would see. Same reasoning, and the
     same guard, as `min-w-0` above. */
  if (!actions) return block

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      {block}
      {/* ── `max-narrow:w-full`, AND WHY THIS BOX MUST NOT BE `flex-none` ────
          /assets passes `<div className="max-narrow:w-full"><AssetUpload /></div>`,
          which was a DIRECT child of the row before this slot existed — so on a
          phone it filled the row. Nesting it inside a `flex-none` box silently
          neutralised that: `flex: 0 0 auto` sizes to content, so the child's
          `w-full` resolved to 100% of a content-width box and could no longer
          shrink. MEASURED on a 390px fixture: the row went from 390px to 461px
          of scroll width, an overflow of 71px, and the real component is wider
          than the fixture because it also prints filenames on error.

          So the box carries the narrow-width rule itself and stays shrinkable.
          `justify-end` keeps a wrapped action against the trailing edge rather
          than letting it drift left of where it sat. */}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 max-narrow:w-full">
        {actions}
      </div>
    </div>
  )
}
