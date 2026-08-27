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
 * Thirty-two screens render this component and exactly one passes a `crumb`.
 * `min-w-0` lets a flex child shrink below its content width, so putting it on
 * the wrapper unconditionally would change how the title block competes with its
 * siblings on all thirty-one of the others — a layout change nothing on those
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
}: {
  children: React.ReactNode
  sub?: string
  /** The view inside this page, shown after the title as `Title › crumb`. */
  crumb?: string
}) {
  const title = <h1 className="text-[20px] leading-7 font-[650] tracking-[-0.02em]">{children}</h1>

  return (
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
      {sub ? <p className="mt-[2px] text-[13px] text-muted">{sub}</p> : null}
    </div>
  )
}
