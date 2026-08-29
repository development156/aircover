'use client'

import { useState } from 'react'
import { ImageOff } from 'lucide-react'

import { Modal } from '@/components/ui/modal'

/**
 * The photos on a post, as a thumbnail on the tile and a full look behind it.
 *
 * ── THE DEFECT THIS FIXES ────────────────────────────────────────────────────
 * The posts list never read `post_media`, so a post with a photo attached and a
 * post with none rendered as the same card. On the tile grid that is worse than
 * a gap: the tile is mostly the space the photo would occupy, and the reader is
 * looking straight at where it is not.
 *
 * ── THREE STATES, AND THEY ARE NOT THE SAME CLAIM ────────────────────────────
 * The `media` bucket is private, so a preview is a signed URL minted per request
 * and signing can fail on its own. That makes three cases, and collapsing any
 * two of them tells the reader something untrue:
 *
 *   no rows          the post has no photo          → render NOTHING
 *   rows, signed     here it is                     → the thumbnail
 *   rows, unsigned   there IS a photo; we could not show it → a marked slot
 *
 * The third is the one that matters. Rendering nothing there would say "this
 * post has no photo" about a post that has one — and the writer would go and
 * attach a second copy. `signMediaPreviews` already refuses to drop an unsigned
 * row for the same reason on the composer side; this is that rule on the list.
 *
 * ── WHY A DIALOG AND NOT A BIGGER THUMBNAIL ──────────────────────────────────
 * A ~325px tile has no room for a photo anyone could judge. `Modal` is a native
 * `<dialog>` in the browser's top layer, so it is not clipped by the tile, does
 * not care about the grid, and closes on Escape — the same reasoning as the
 * delete dialog beside it.
 */

export interface MediaPeekItem {
  id: string
  /** Short-lived signed URL, or null when one could not be minted. */
  url: string | null
  alt: string | null
}

export interface MediaPeekProps {
  items: readonly MediaPeekItem[]
  /** The post's own title, so the control and the dialog say WHICH post. */
  postTitle: string
}

/**
 * The text a screen reader gets for one photo.
 *
 * ── `alt=""` WOULD HAVE BEEN WRONG, AND SILENTLY ────────────────────────────
 * `post_media.alt` is nullable and usually null. The first version passed
 * `alt={item.alt ?? ''}`, and an empty alt is not "no description" in HTML — it
 * is a positive claim that the image is DECORATIVE, which drops it out of the
 * accessibility tree entirely. Caught by a test that asked for the images by
 * role and found none: the same disappearance a screen reader would get.
 *
 * These photos are content, so the fallback names what the product actually
 * knows — that this is a photo on this post. It does not describe the picture,
 * because nothing here has seen it and inventing a description is worse than
 * admitting there is none.
 */
function altFor(alt: string | null, postTitle: string): string {
  return alt ?? `Photo attached to ${postTitle}`
}

export function MediaPeek({ items, postTitle }: MediaPeekProps) {
  const [open, setOpen] = useState(false)

  // No rows is not a state to render. The card simply has no photo, and a
  // placeholder would be an answer to a question nobody asked.
  if (items.length === 0) return null

  const first = items[0]
  if (!first) return null
  const extra = items.length - 1
  const label =
    items.length === 1
      ? `Preview the photo on ${postTitle}`
      : `Preview ${items.length} photos on ${postTitle}`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        // `relative z-10` for the same reason the chips carry it: the card's
        // title is a stretched link with an `::after` over the whole card, and
        // anything clickable must sit above that pseudo-element or the click
        // opens the editor instead.
        // ── 36px ON A POINTER, 44px ON TOUCH ──────────────────────────────
        // MEASURED in Chromium: a flat 44px control in the meta row pushed the
        // channel chips onto a line of their own at the 300px and 330px tile
        // widths, taking the row from 57px to 109px and growing the square.
        // 36px fits beside them. The touch floor is not negotiable, so it is
        // applied where touch actually is — the same `max-narrow` pattern the
        // delete trigger beside it uses (docs/26 §9).
        className="surface-ring relative z-10 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-input bg-s2 transition-micro hover:opacity-90 max-narrow:size-11"
      >
        {first.url !== null ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={first.url}
            alt={altFor(first.alt, postTitle)}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          // The photo exists and could not be fetched. Marked, never blank.
          <ImageOff size={15} strokeWidth={1.7} className="text-muted" aria-hidden />
        )}

        {extra > 0 ? (
          <span
            // `dark:bg-white dark:text-[var(--canvas)]` is not optional: `--ink`
            // INVERTS to #ffffff in dark, so `bg-ink text-white` alone is white
            // on white at 1.00:1 — unreadable, and only on posts with two or
            // more photos, which is why a screenshot sweep would not catch it.
            // Every other `bg-ink text-white` in this app carries the pair, and
            // design-lint has no dark-pair rule to catch one that does not.
            className="type-chip absolute right-0 bottom-0 rounded-tl-input bg-ink px-1 tabular-nums text-white dark:bg-white dark:text-[var(--canvas)]"
          >
            +{extra}
          </span>
        ) : null}
      </button>

      {open ? (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={postTitle}
          description={items.length === 1 ? '1 photo attached' : `${items.length} photos attached`}
        >
          <div className="space-y-3">
            {items.map((item) => (
              <figure key={item.id}>
                {item.url !== null ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={altFor(item.alt, postTitle)}
                    className="max-h-[60dvh] w-full rounded-input object-contain"
                  />
                ) : (
                  // Says which of the two nothings this is. "No photo" would be
                  // false — the file is attached; the link to it could not be
                  // made, and it is still there on the post's own page.
                  <div className="surface-ring flex items-center gap-2 rounded-input bg-s2 px-3 py-6 text-muted">
                    <ImageOff size={16} strokeWidth={1.7} aria-hidden />
                    <span className="type-meta">
                      This photo is attached but could not be loaded just now. Nothing has been
                      lost. Open the post to try again.
                    </span>
                  </div>
                )}
                {item.alt ? (
                  <figcaption className="type-meta mt-1.5 text-muted">{item.alt}</figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
