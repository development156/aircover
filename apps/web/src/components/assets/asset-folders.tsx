'use client'

import { CircleDashed, Images, Link2 } from 'lucide-react'

import { ASSET_FOLDERS, folderCounts, type FolderId } from '@/lib/assets/folders'
import type { AssetCard } from '@/lib/assets/view'
import { cn } from '@/lib/utils'

/**
 * THE FOLDER ROW — a real silhouette, not a rectangle with a folder icon in it.
 *
 * ── HOW THE SHAPE IS MADE ────────────────────────────────────────────────────
 * Two boxes, not a `clip-path` and not an SVG: a short TAB whose top corners are
 * rounded, and a BODY whose top-LEFT corner is square so the two read as one
 * piece of card stock. Everything else on this screen is a rectangle, so the
 * notch is doing all the work of saying "container" — which is why the tab is
 * the same fill as the body and never a darker strip. A strip would read as a
 * header bar.
 *
 * It costs no image, no dependency and no new token.
 *
 * ── SELECTION IS A WASH AND A RING, NEVER A BORDER ───────────────────────────
 * The same rule the wallet cards are built on: `accent-area-budget.spec.ts`
 * charges a real `border` its WHOLE box while a `box-shadow` is not read at all,
 * and `--brand-wash` at alpha 0.06 is under the 0.08 the probe skips. /assets
 * carries no ceiling of its own today, and that is exactly why it should not
 * grow the habit that would break one.
 *
 * ── AND THE COUNT IS NEVER HIDDEN ────────────────────────────────────────────
 * Zero renders. A folder that vanishes when it empties makes its absence
 * something a person has to interpret, and "there is no Not used yet folder" and
 * "nothing is unused" are different sentences.
 */
const GLYPH: Record<FolderId, React.ComponentType<{ className?: string; size?: number }>> = {
  image: Images,
  'in-use': Link2,
  unused: CircleDashed,
}

export function AssetFolders({
  cards,
  active,
  onPick,
}: {
  cards: AssetCard[]
  /** The folder currently filtering the list, or null for everything. */
  active: FolderId | null
  /** Passing the SAME id clears the filter — a second click leaves the folder. */
  onPick: (id: FolderId) => void
}) {
  const counts = folderCounts(cards)

  return (
    <section aria-labelledby="asset-folders" className="space-y-2">
      <h2 id="asset-folders" className="type-eyebrow text-ink-mute">
        Folders
      </h2>
      {/* FIXED-WIDTH, WRAPPING, LEFT-ALIGNED — not a 3-column grid.
          MEASURED at 1280: three grid columns stretched each folder to ~600x100,
          which reads as a bar with a notch rather than a folder. A folder is a
          portrait-ish object and its proportions are most of what says so, so
          the width is pinned and the row wraps. It also means a fourth folder
          costs a wrap rather than resizing the other three. */}
      <div className="flex flex-wrap gap-3">
        {ASSET_FOLDERS.map((folder) => {
          const Glyph = GLYPH[folder.id]
          const on = active === folder.id
          const count = counts[folder.id]
          return (
            <button
              key={folder.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(folder.id)}
              className="group flex w-[212px] flex-col text-left transition-micro hover:-translate-y-px max-narrow:w-full max-narrow:min-h-[44px]"
            >
              {/* THE TAB. `rounded-t` only, and the body squares its top-left to
                  meet it. Width is a fraction so the notch scales with the card
                  rather than becoming a stub on a wide grid. */}
              <span
                aria-hidden
                /* THREE-SIDED RING — top, left, right, never the bottom.
                   Without it the tab is an unoutlined blob floating above a
                   ringed body; with a four-sided ring a line is drawn along the
                   seam where tab meets body, which is worse. Leaving the bottom
                   open is what makes the two boxes read as one piece of card. */
                className={cn(
                  'h-2.5 w-[38%] rounded-t-[10px] transition-micro',
                  on
                    ? 'bg-brand-wash shadow-[inset_0_1px_0_0_var(--brand-lift),inset_1px_0_0_0_var(--brand-lift),inset_-1px_0_0_0_var(--brand-lift)]'
                    : 'bg-surface shadow-[inset_0_1px_0_0_var(--line-soft),inset_1px_0_0_0_var(--line-soft),inset_-1px_0_0_0_var(--line-soft)]',
                )}
              />
              <span
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-card rounded-tl-none px-3.5 py-3 transition-micro',
                  on
                    ? 'bg-brand-wash shadow-[inset_0_0_0_1px_var(--brand-lift)]'
                    : 'surface-ring bg-surface group-hover:shadow-card',
                )}
              >
                <Glyph size={17} className={cn('shrink-0', on ? 'text-accent' : 'text-ink-mute')} />
                <span className="min-w-0 flex-1">
                  <span className="block type-sm font-semibold text-ink">{folder.name}</span>
                  <span className="block type-meta text-muted">
                    <span className="num">{count}</span>
                    {count === 1 ? ' asset' : ' assets'}
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
