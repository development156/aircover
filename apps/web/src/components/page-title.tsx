import { ChevronRight } from 'lucide-react'

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
 * So it states a LOCATION. `aria-current="page"` says which segment the reader is
 * on, and the `h1` stays the one word that names the screen, so the document
 * outline is unchanged for anyone arriving by heading. The day a real parent
 * route exists, the title becomes a `<Link>` here and no page changes.
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
    <div className="min-w-0">
      {/* No `<nav>` when there is no trail: a landmark wrapping one heading
          announces a navigation region that holds nothing to navigate. */}
      {crumb ? (
        <nav aria-label="Location" className="flex flex-wrap items-center gap-1">
          {title}
          <ChevronRight size={15} aria-hidden className="shrink-0 text-muted" />
          <span aria-current="page" className="type-h3 text-ink">
            {crumb}
          </span>
        </nav>
      ) : (
        title
      )}
      {sub ? <p className="mt-[2px] text-[13px] text-muted">{sub}</p> : null}
    </div>
  )
}
