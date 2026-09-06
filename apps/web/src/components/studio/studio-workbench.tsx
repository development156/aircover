'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'

import type { BrandSignal } from '@sahoda/shared'

import { Composer } from '@/components/studio/composer'
import type { CanvasPicture } from '@/lib/studio/canvas'
import type { StudioFormat } from '@/lib/studio/formats'
import type { LibraryRead } from '@/lib/studio/read'
import type { StudioStarters } from '@/lib/studio/starter-ladder'

/**
 * THE WALL. THE PLACE A NEW PICTURE IS JUDGED AGAINST EVERY OTHER ONE.
 *
 * ── APPROVED REDESIGN, NOT A TIDY-UP ────────────────────────────────────────
 * `Wall.dc.html` is the spec. The old screen spent about 1,000px of vertical
 * space on ONE picture ("the canvas") while every other one this workspace
 * had made sat as small thumbnails at the very bottom. That section is gone
 * — deleted, not hidden — and a customer's own pictures now run the full
 * width of the page, which is what a grid of pictures wants and a single
 * inline result never gave it.
 *
 * ── THE COMPOSER IS EXTRACTED, NOT REBUILT ──────────────────────────────────
 * Every control this screen used to own directly — the prompt, the price,
 * the model/mode/format/count/logo pickers, the refiner, the reference
 * picker, "Will send," "Not built yet" — now lives in `composer.tsx`, built
 * so a second screen (the viewer, `/studio/<id>`, a later pass) can mount the
 * exact same bar prefilled from an existing picture. This file only decides
 * WHERE that bar sits (floating, sticky, over the wall) and what fills the
 * page beneath it.
 *
 * ── STICKY, WITH ITS OWN GROUND ──────────────────────────────────────────
 * `sticky top-topbar` pins the bar just under the app's own topbar as the
 * page scrolls, and `bg-canvas` gives it a real ground so the wall's tiles
 * pass BEHIND its edge rather than showing through it — the artboard's own
 * point: looking for something to compare a new picture against should never
 * scroll the controls away.
 *
 * ── THREE STEPS OF VERTICAL RHYTHM, NOWHERE ELSE ─────────────────────────
 * Every vertical gap and stack padding on this screen is one of three
 * token-backed steps: `gap-2`/`py-2` (8px, `--space-2`, a tight pairing —
 * a message beside its own status line), `gap-3`/`py-3` (12px, `--space-3`,
 * a component's own internal rows — the sticky bar's own stack, the wall
 * section's own rows), or `gap-grid`/`py-grid` (20px, `--spacing-grid`, one
 * major region to the next). That third step is deliberately the SAME
 * `--spacing-grid` this page's own `page.tsx` already uses for
 * `space-y-grid` between the title and this component — this root used to
 * run its own top-level stack at `gap-6` (24px) instead, a second "major
 * section" number a few pixels from the first, which is the exact defect
 * this rule exists to close. Icon-to-label micro gaps (`gap-1.5`,
 * `--spacing-icon-gap`) and the count stepper's own `gap-0.5` are a
 * different, smaller-scale typographic relationship (docs/26 §2) and are
 * not part of this ladder.
 *
 * ── A RIGHT GUTTER FOR WHATEVER FLOATS ────────────────────────────────────
 * This app has no fixed or floating control positioned over `/studio`
 * today — checked, not assumed, since the finding this note answers named
 * one clipping the chip row's trailing "N more" (`composer-chips.tsx`) and
 * no such control exists in this tree to reproduce it against. What does
 * carry a real margin: every element on this screen, including the
 * composer bar and the wall grid, stays inside `--content-pad` and never
 * runs to the viewport's own edge, so the row `composer-chips.tsx` ends
 * with (`grow` spacer, "N more", then `extraControls`) already has page
 * padding as its gutter rather than nothing. If a future floating control
 * is added back, it must reserve its own width rather than lean on this.
 */

/** Which shape of work the filter row is narrowed to. */
type WorkFilter = 'all' | 'square' | 'story' | 'wide' | 'logo'

const FILTERS: readonly { value: WorkFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'square', label: 'Square post' },
  { value: 'story', label: 'Story' },
  { value: 'wide', label: 'Wide' },
  { value: 'logo', label: 'With logo' },
]

/**
 * Which filter a picture belongs to, from its own shape and logo outcome,
 * never from the currently-chosen format — that is a fact about the NEXT
 * press, not about a picture already made.
 */
function categoryOf(picture: CanvasPicture): WorkFilter[] {
  const out: WorkFilter[] = []
  if (picture.stampOutcome === 'stamped') out.push('logo')
  if (picture.width === null || picture.height === null) return out
  const ratio = picture.width / picture.height
  if (ratio >= 0.94 && ratio <= 1.06) out.push('square')
  else if (ratio < 0.94) out.push('story')
  else out.push('wide')
  return out
}

export function StudioWorkbench({
  formats,
  library,
  pictures,
  signals,
  starters,
}: {
  formats: StudioFormat[]
  library: LibraryRead
  /** What this workspace has already made, newest first, for the wall. */
  pictures: CanvasPicture[]
  signals: BrandSignal[] | null
  /** The starter ladder's already-resolved answer. See `composer.tsx`'s own prop. */
  starters?: StudioStarters
}) {
  const [filter, setFilter] = useState<WorkFilter>('all')
  /**
   * Mirrored from the composer, which is the only thing that knows a press is
   * in flight. Used only for the first-run message below: once a picture
   * exists, the wall itself is the "something is happening" surface and this
   * screen no longer needs to say so a second way.
   */
  const [busy, setBusy] = useState(false)

  const shownPictures =
    filter === 'all' ? pictures : pictures.filter((one) => categoryOf(one).includes(filter))

  return (
    <div className="flex w-full flex-col gap-grid" data-guide="studio-workbench">
      <section
        aria-labelledby="studio-make"
        className="sticky top-topbar z-[2] -mx-page flex flex-col gap-3 bg-canvas px-page pt-3 pb-grid max-narrow:-mx-page-mobile max-narrow:px-page-mobile"
      >
        <h2 id="studio-make" className="sr-only">
          Make a picture
        </h2>
        <Composer
          formats={formats}
          library={library}
          signals={signals}
          starters={starters}
          onBusyChange={setBusy}
        />
      </section>

      {pictures.length === 0 ? (
        /*
         * ── LEFT-RANGED, LIKE EVERYTHING ELSE ON THIS SCREEN ────────────────
         * This used to be `items-center`, the one block on the wall not
         * aligned to the screen's own left edge. Nothing about "nothing made
         * yet" needs centring — it reads as a left-aligned line exactly like
         * the sentence that replaces it once a picture exists
         * ("Every picture is saved to your library…").
         */
        <div className="flex flex-col items-start gap-2 py-grid" data-guide="studio-empty">
          {busy ? (
            <p role="status" className="type-sm text-muted" data-guide="studio-empty-busy">
              Sahoda is generating your first image now. It usually takes a few seconds, and you can
              leave this screen without losing it.
            </p>
          ) : (
            <p className="type-sm text-muted">
              Nothing made yet. Use an idea from the box above, or write your own, then press
              Generate Image.
            </p>
          )}
        </div>
      ) : (
        <section aria-labelledby="studio-wall-heading" className="flex flex-col gap-3">
          <h2 id="studio-wall-heading" className="sr-only">
            Your pictures
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="type-eyebrow text-muted">What you have made</span>
              <span className="type-sm text-muted">Open one to see how it was made</span>
            </div>
            <div className="flex flex-wrap gap-2" data-guide="studio-filter">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  aria-pressed={filter === option.value}
                  className={`rounded-pill px-3.5 py-1.5 type-sm font-[550] transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    filter === option.value
                      ? 'bg-ink text-canvas'
                      : 'surface-ring text-muted hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {shownPictures.length === 0 ? (
            <p className="type-sm text-muted">Nothing matches this filter yet.</p>
          ) : (
            <ul
              className="grid grid-cols-3 gap-3 narrow:grid-cols-4 wide:grid-cols-6"
              data-guide="studio-strip"
            >
              {shownPictures.map((picture) => {
                const meta = [picture.formatId, picture.madeAgo].filter(Boolean).join(' · ')
                return (
                  <li key={picture.imageId} className="flex flex-col gap-2">
                    {/*
                     * ── A LINK, NOT A CLICK HANDLER ──────────────────────────
                     * `/studio/<id>` does not exist yet: a later pass builds
                     * the viewer there. A real `<Link>` to a route that 404s
                     * for one commit is a known, honest gap; a click handler
                     * here would be a second thing that pass would have to
                     * unpick rather than simply route past.
                     */}
                    <Link
                      href={`/studio/${picture.imageId}` as Route}
                      aria-label={picture.prompt}
                      className="surface-ring relative block aspect-square w-full overflow-hidden rounded-card transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- a
                          short-lived signed URL from a private bucket cannot be
                          optimised by next/image without proxying the credential. */}
                      <img
                        src={picture.stampedUrl ?? picture.url}
                        alt=""
                        className="size-full object-cover object-top"
                      />
                    </Link>
                    {meta === '' ? null : <span className="num type-sm text-muted">{meta}</span>}
                  </li>
                )
              })}
            </ul>
          )}

          <p className="type-sm text-muted">
            Every picture is saved to your library the moment it is made, so nothing is lost if you
            leave.
          </p>
        </section>
      )}
    </div>
  )
}
