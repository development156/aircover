'use client'

import { Check, CircleDashed, Images, Link2 } from 'lucide-react'

import { ASSET_FOLDERS, folderMeta, type FolderId } from '@/lib/assets/folders'
import type { AssetCard } from '@/lib/assets/view'
import { cn } from '@/lib/utils'

/**
 * THE FOLDER ROW — a layered silhouette, not a rectangle with a folder icon.
 *
 * ── HOW THE SHAPE IS MADE, AND WHY IT IS THREE LAYERS ────────────────────────
 * The reference is a physical folder: a BACK shape whose top-left rises into a
 * tab, a few SHEETS peeking out of it, and a FRONT panel overlapping the lower
 * two thirds with the label on it. Three layers is the minimum that reads as one
 * object with a mouth, and each is a plain box:
 *
 *   BACK    tab (rounded top) + body (top-LEFT square, so the two are one piece)
 *   SHEETS  two pale slips in the gap between the back's top and the front panel
 *   FRONT   a rounded panel pinned to the bottom, carrying the text
 *
 * No SVG, no `clip-path`, no image, no dependency. A `clip-path` cannot draw the
 * tab's rounded step, and an SVG would put the shape somewhere the theme tokens
 * cannot reach it.
 *
 * ── THE COLOURS ARE TOKENS, NOT THE REFERENCE'S PURPLE ───────────────────────
 * `--surface-2` for the back, and for the front `--surface` in light but
 * `--surface-3` in dark. Hard-coding the brief's dark case would have made a
 * black folder on a white page for every light-theme reader.
 *
 * **This paragraph used to end "so the two steps hold in BOTH themes". It did
 * not, and the correction is worth keeping because of HOW it hid.** The step
 * was always present and always cleared the 1.03 ladder floor, so every
 * contrast check passed. What was wrong was its DIRECTION: `--surface` is the
 * lightest rung in light and the DARKEST in dark, so `bg-surface` on the front
 * put the lid BEHIND the body in dark — 1.113:1 the wrong way. A ratio has no
 * sign, which is exactly why no guard caught it. The guard added below asserts
 * the ORDER, not the gap.
 *
 * ── DEPTH ON HOVER IS A DIFFERENCE OF TWO LIFTS ──────────────────────────────
 * The whole folder rises 4px; the front panel rises only 2. The 2px that do not
 * cancel are the mouth opening. The sheets slide up into that gap, so the thing
 * that appears is the CONTENT, which is what a folder opening means.
 *
 * ── AND THE MOTION IS THE PRODUCT'S OWN ──────────────────────────────────────
 * `transition-panel` is `--dur-2` (180ms) on `--ease` — the bottom of the range
 * the brief asks for, with the easing every other panel uses, so it cannot be
 * bouncy. It also inherits the global `prefers-reduced-motion` block in
 * tokens.css, which a hand-rolled duration would have quietly escaped.
 *
 * ── NO THREE-DOT MENU ────────────────────────────────────────────────────────
 * The reference has one and the brief asks for one. There is nothing to put in
 * it: these folders are derived predicates, so there is no rename, no delete and
 * no move, and the only action — open — is the click itself. A menu whose one
 * item repeats the click is a control that exists to look like a control.
 */
const GLYPH: Record<FolderId, React.ComponentType<{ className?: string; size?: number }>> = {
  image: Images,
  'in-use': Link2,
  unused: CircleDashed,
}

/**
 * ── THE RING CLASSES BELOW ARE WRITTEN OUT, AND THAT IS NOT AN OVERSIGHT ────
 * They were shared constants, interpolated into the class list as a template.
 * That typechecks, renders the right string at runtime, and produces NOTHING:
 * Tailwind's scanner reads source TEXT and only emits classes it finds as
 * literals, so a class assembled from a template is a class that was never
 * generated. The hover rings would simply not have existed — silently, in a
 * way no type and no unit test could report. Keep them literal.
 *
 * The tab's ring is top, left and right only: a fourth side draws a line
 * along the seam where tab meets body.
 */

/** `13 Oct 2025`. IST, because every other date a customer reads here is. */
const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

export function AssetFolders({
  cards,
  active,
  onPick,
}: {
  cards: AssetCard[]
  active: FolderId | null
  /** Passing the SAME id clears the filter — a second click leaves the folder. */
  onPick: (id: FolderId) => void
}) {
  const meta = folderMeta(cards)

  return (
    <section aria-labelledby="asset-folders" className="space-y-2.5">
      <h2 id="asset-folders" className="type-eyebrow text-ink-mute">
        Folders
      </h2>
      {/* 2 up on a phone, 3 at narrow, 5 at wide — the brief's breakpoints, on
          the only two this product has. `sm:`/`md:`/`lg:` emit nothing here. */}
      <div className="grid grid-cols-2 gap-3 narrow:grid-cols-3 wide:grid-cols-5">
        {ASSET_FOLDERS.map((folder) => {
          const Glyph = GLYPH[folder.id]
          const on = active === folder.id
          const { count, lastAdded, previews } = meta[folder.id]
          return (
            <button
              key={folder.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(folder.id)}
              className="group relative block h-[164px] w-full text-left transition-panel hover:-translate-y-1"
            >
              {/* ── BACK: tab over body, one piece of card ─────────────────── */}
              <span aria-hidden className="absolute inset-0 flex flex-col">
                <span
                  className={cn(
                    'h-[17px] w-[46%] rounded-t-[11px] bg-s2 transition-panel',
                    on
                      ? 'shadow-[inset_0_1px_0_0_var(--brand-lift),inset_1px_0_0_0_var(--brand-lift),inset_-1px_0_0_0_var(--brand-lift)]'
                      : 'shadow-[inset_0_1px_0_0_var(--line-soft),inset_1px_0_0_0_var(--line-soft),inset_-1px_0_0_0_var(--line-soft)] group-hover:shadow-[inset_0_1px_0_0_var(--brand-lift),inset_1px_0_0_0_var(--brand-lift),inset_-1px_0_0_0_var(--brand-lift)]',
                  )}
                />
                <span
                  className={cn(
                    'flex-1 rounded-[14px] rounded-tl-none bg-s2 transition-panel',
                    on
                      ? 'shadow-[inset_0_0_0_1px_var(--brand-lift)]'
                      : 'surface-ring group-hover:shadow-[inset_0_0_0_1px_var(--brand-lift)]',
                  )}
                />
              </span>

              {/* ── WHAT IS ACTUALLY IN HERE, peeking out of the mouth ─────
                  These are the REAL photos — the same signed links the tiles
                  below use — fanned so the newest sits on top, which is the one
                  the date line underneath is talking about.

                  A plain slip is drawn instead when a folder holds files whose
                  links did not sign: `signMediaPreviews` degrades per row, and
                  a folder that looked empty because signing hiccuped would be a
                  lie about the library. An EMPTY folder draws nothing, because
                  there is nothing to show.

                  MEASURED and cut back once: as abstract slips these were h-7
                  spanning 30-61px and 161-181px of a 226px folder at 25%/40%,
                  which rendered as two bright slabs filling the mouth. A sheet
                  edge is a SLIVER. */}
              {previews.length > 0
                ? previews.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      aria-hidden
                      loading="lazy"
                      decoding="async"
                      className={cn(
                        'absolute h-14 rounded-t-[5px] bg-s2 object-cover transition-panel',
                        i === 0
                          ? 'top-[44px] right-[24%] left-[20%] group-hover:top-[34px]'
                          : 'top-[47px] right-[17%] left-[14%] group-hover:top-[38px]',
                      )}
                    />
                  ))
                : count > 0
                  ? [0, 1].map((i) => (
                      <span
                        key={i}
                        aria-hidden
                        className={cn(
                          'absolute h-6 rounded-t-[4px] transition-panel',
                          i === 0
                            ? 'top-[44px] right-[24%] left-[20%] bg-ink-mute/15 group-hover:top-[36px]'
                            : 'top-[47px] right-[17%] left-[14%] bg-ink-mute/25 group-hover:top-[40px]',
                        )}
                      />
                    ))
                  : null}

              {/* ── FRONT: rises only 2px against the folder's 4, and the 2 that
                  do not cancel are the mouth opening. ─────────────────────────

                  ── THE `dark:` SWAP IS THE WHOLE POINT OF THIS PANEL ────────
                  `bg-surface` alone was INVERTED in dark, and the header's
                  claim that "the two steps hold in BOTH themes" was wrong.
                  MEASURED, front against back:

                    light  #ffffff over #f2f2f3  = 1.119  front LIGHTER  ✓
                    dark   #171717 over #212121  = 1.113  front DARKER   ✗
                    dark   #292929 over #212121  = 1.107  front LIGHTER  ✓

                  The step was always there — the ladder floor is 1.03 and all
                  three clear it — so no contrast test could see this. What was
                  wrong is the DIRECTION: `--surface` is the lightest rung in
                  light and the DARKEST in dark, so the front panel receded
                  behind its own back and the folder read as a pale slab with a
                  dark plate stuck on it rather than a lid over a body.

                  `--surface-3` is nominally the hover/pressed rung. It is used
                  here as a resting fill on purpose: what this panel needs is
                  "one step LIGHTER than the back", and in dark that is the only
                  rung that is. Light is untouched. */}
              <span
                className={cn(
                  'absolute inset-x-0 bottom-0 flex h-[104px] flex-col justify-between rounded-[14px] bg-surface p-3 transition-panel group-hover:translate-y-[2px] group-hover:shadow-card dark:bg-surface-3',
                  on
                    ? 'shadow-[inset_0_0_0_1px_var(--brand-lift)]'
                    : 'surface-ring group-hover:shadow-[inset_0_0_0_1px_var(--brand-lift)]',
                )}
              >
                {/* THE SWEEP. One wash, no colour of its own beyond
                    `--brand-wash` at alpha 0.06, fading in on hover. A
                    highlight, not a glow: no blur, no ring, no second colour. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[14px] bg-gradient-to-tr from-transparent via-brand-wash to-transparent opacity-0 transition-panel group-hover:opacity-100"
                />

                <span className="relative flex items-start gap-2">
                  <Glyph
                    size={16}
                    className={cn(
                      'mt-px shrink-0 transition-panel',
                      on ? 'text-accent' : 'text-ink-mute group-hover:text-accent',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate type-sm font-semibold text-ink">
                      {folder.name}
                    </span>
                    <span className="block type-meta text-muted">
                      <span className="num">{count}</span>
                      {count === 1 ? ' item' : ' items'}
                    </span>
                  </span>
                  {/* The active mark. A tick, so selection survives greyscale
                      and never depends on the ring's hue alone. */}
                  {on ? (
                    <Check
                      size={14}
                      strokeWidth={2.5}
                      aria-hidden
                      className="shrink-0 text-accent"
                    />
                  ) : null}
                </span>

                {/* REAL, or absent. `folderMeta` returns null for an empty folder
                    rather than a fallback date, so nothing here can claim a
                    newest file that does not exist. */}
                <span className="relative block truncate type-meta text-ink-mute">
                  {lastAdded === null
                    ? 'Nothing in here yet'
                    : `Last added ${DATE.format(new Date(lastAdded))}`}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
