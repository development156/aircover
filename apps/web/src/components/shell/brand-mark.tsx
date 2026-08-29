'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

/**
 * The customer's logo in the topbar, and the button that opens their brand.
 *
 * ── WHY IT IS A BUTTON AND NOT A PICTURE ────────────────────────────────────
 * Founder's ruling, 2026-08-29. Brand Skin chose a workspace's primary colour on
 * its own, taking the most frequent colour in the logo — which for a logo that
 * is mostly grey and white is grey, so the product went washed out while the
 * blue that anybody would have picked sat second in the list. "Making this
 * automatic can also cause problem in UI" is exactly right, and the answer is
 * not a cleverer guess. It is letting the person who owns the brand say which
 * colour it is.
 *
 * ── THIS FILE STAYS SMALL ON PURPOSE ────────────────────────────────────────
 * It renders on EVERY route, so every byte it imports is downloaded on every
 * route. The first version carried the panel and the colour extractor inline
 * and put `/(app)/layout` 9.8 kB over the js-budget, which failed the
 * production build. That guard was right: most visits never open this.
 *
 * The panel is a separate chunk fetched on the first press. `ssr: false`
 * because a menu has nothing to render until somebody asks for it.
 */
const BrandPanel = dynamic(() => import('./brand-panel').then((m) => m.BrandPanel), { ssr: false })

export function BrandMark({
  logoUrl,
  primary,
}: {
  /** A signed link to the workspace's logo, or null when there is none. */
  logoUrl: string | null
  /** The colour in use now, for the chip when there is no logo to show. */
  primary: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    /**
     * `data-brand-skin` IS THE BOUNDARY. `(app)/layout.tsx` emits the workspace's
     * seven themeable tokens scoped to this attribute, so the brand colour lives
     * here and stops here. Founder's ruling, 2026-08-29: the day/night toggle
     * gives Sahoda's designed theme, and only the brand mark carries the
     * customer's. Removing this attribute does not break the page — it makes the
     * emitted rule match nothing, which is why `skin-css.test.ts` guards the
     * selector rather than trusting this line.
     */
    <div data-brand-skin="" className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Your brand"
        data-guide="topbar.brand"
        onClick={() => setOpen((was) => !was)}
        className="surface-ring grid h-8 min-w-8 place-items-center overflow-hidden rounded-control bg-s2 px-1.5"
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-5 w-auto max-w-[88px] object-contain" />
        ) : (
          <span
            aria-hidden
            className="size-4 rounded-full"
            style={{ background: primary ?? 'var(--p)' }}
          />
        )}
      </button>

      {open ? <BrandPanel logoUrl={logoUrl} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}
