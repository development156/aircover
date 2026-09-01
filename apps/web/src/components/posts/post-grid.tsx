'use client'

import { useId, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The posts list as a grid of square tiles, with the tail behind one control.
 *
 * ── WHY EIGHT ────────────────────────────────────────────────────────────────
 * This app has TWO breakpoints, `narrow` (700px) and `wide` (1180px) — Tailwind's
 * default `sm/md/lg/xl` are cleared to `initial` in globals.css, so writing one
 * is a class that never matches and a grid that silently stays one column. The
 * grid is therefore 1 / 2 / 4 columns, and eight is a whole number of rows at
 * every one of the three: eight rows, four rows, two rows. The fold always lands
 * on a ROW BOUNDARY, never halfway through one — a partial row reads as "the page
 * failed to load the rest", which is a different claim from "there is more, and
 * here is the button".
 *
 * ── THE COUNT ON THE BUTTON IS ABOUT THIS PAGE, AND SAYS SO ──────────────────
 * `listPosts` is capped and there is no pagination, so the number of posts
 * LOADED is not necessarily the number of posts a workspace HAS. The button
 * therefore counts what it can actually reveal — "Show 15 more" is a promise
 * about the next click and nothing else — and the cap notice under the grid
 * keeps saying that older posts may not be on the page. "Show all 23 posts"
 * would have been the same sentence making a claim about the workspace, and
 * a count the product cannot stand behind is the one thing this codebase
 * never prints.
 *
 * ── EVERY TILE IS RENDERED, ALWAYS ───────────────────────────────────────────
 * The hidden ones are held back with `hidden`, not dropped from the tree. They
 * are server-rendered cards passed in as children: re-mounting them on expand
 * would remount the live status badges and the channel chips inside them, which
 * hold their own subscriptions. Collapsing and expanding must be free.
 *
 * The consequence to be honest about: the markup carries every loaded post
 * whether or not it is on screen. That is bounded by the same `LIST_LIMIT` the
 * page already loads, so this adds no unbounded cost — it spends DOM nodes to
 * buy a toggle that never drops a subscription.
 */

/** Tiles visible before the control is pressed. Two rows at the widest grid. */
export const POSTS_BEFORE_FOLD = 8

export interface PostGridProps {
  /** One rendered card per post, in the order the page decided. */
  children: ReactNode[]
  /**
   * How many tiles show before expanding. Injectable so the guard can drive the
   * boundary with three tiles instead of nine — a test that has to build nine
   * cards to check a fold tends not to get written.
   */
  visible?: number
  'data-guide'?: string
}

export function PostGrid({
  children,
  visible = POSTS_BEFORE_FOLD,
  'data-guide': dataGuide,
}: PostGridProps) {
  const [expanded, setExpanded] = useState(false)
  const gridId = useId()

  const hiddenCount = Math.max(0, children.length - visible)

  return (
    <div className="space-y-grid">
      <ul
        id={gridId}
        data-guide={dataGuide}
        className="grid gap-grid grid-cols-1 narrow:grid-cols-2 wide:grid-cols-4"
      >
        {children.map((card, i) => (
          <li
            // `hidden` rather than an unmount, and `aria-hidden` with it: a
            // tile that is off screen must be off the screen reader's tab order
            // too, or the control claims to reveal something already reachable.
            key={i}
            hidden={!expanded && i >= visible}
            aria-hidden={!expanded && i >= visible}
            className={cn(!expanded && i >= visible && 'hidden')}
          >
            {card}
          </li>
        ))}
      </ul>

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={gridId}
          // `max-narrow:min-h-[44px]`: this project's touch floor is 44px and
          // the button measured 40. The compact delete control on the same card
          // already carries this; a new control must not be the exception.
          className="type-meta surface-ring max-narrow:min-h-[44px] rounded-input px-3 py-2 text-muted transition-micro hover:bg-s2 hover:text-ink"
        >
          {expanded ? (
            'Show fewer'
          ) : (
            <>
              Show <span className="tabular-nums">{hiddenCount}</span> more
            </>
          )}
        </button>
      ) : null}
    </div>
  )
}
