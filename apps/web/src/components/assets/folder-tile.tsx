'use client'

import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

/** A glyph component, loose enough to accept both `lucide-react`'s own
 *  `LucideIcon` type and the narrower `React.ComponentType` the derived
 *  folders' glyph map has always used. */
type Glyph = React.ComponentType<{ className?: string; size?: number }>

/**
 * THE FOLDER TILE — one reusable shape, for every kind of folder.
 *
 * Extracted out of `asset-folders.tsx`, which carries the long explanation of
 * WHY the shape is three layers, why the colours are tokens, and why the ring
 * classes below are written out literally rather than assembled from a shared
 * constant (Tailwind scans source TEXT; a templated class is never generated).
 * Read that file's header comment before touching this one — the reasoning is
 * not repeated here so it cannot drift into two different explanations of the
 * same shape.
 *
 * This file adds exactly one thing the derived folders never needed: an
 * optional `menu` slot for a real or smart folder's own actions. It renders as
 * a SIBLING of the "open" button, not a child of it — a menu trigger nested
 * inside another interactive element is invalid HTML and unreachable by a
 * screen reader's rotor. `menu`'s own control must stop its click from
 * bubbling to the tile if it does not want to also open the folder.
 */
export function FolderTile({
  name,
  count,
  secondLine,
  previews,
  glyph: Glyph,
  active,
  onOpen,
  menu,
}: {
  name: string
  /**
   * Renders as "N items" right under the name, and decides whether to draw
   * placeholder sheets when there is no signed preview.
   */
  count: number
  /**
   * The BOTTOM line, pinned to the foot of the panel — a date, both counts, or
   * an unknown count, whichever the caller's kind of folder needs. Composed by
   * the caller and never empty: a header that renders nothing reads as stuck.
   */
  secondLine: string
  /** Signed preview URLs, newest first, at most 2. */
  previews: string[]
  glyph: Glyph
  active: boolean
  onOpen: () => void
  menu?: React.ReactNode
}) {
  return (
    <div className="group relative h-[164px] w-full">
      <button
        type="button"
        aria-pressed={active}
        onClick={onOpen}
        className="absolute inset-0 block h-full w-full text-left transition-panel hover:-translate-y-1"
      >
        {/* ── BACK: tab over body, one piece of card ─────────────────── */}
        <span aria-hidden className="absolute inset-0 flex flex-col">
          <span
            className={cn(
              'h-[17px] w-[46%] rounded-t-[11px] bg-s2 transition-panel',
              active
                ? 'shadow-[inset_0_1px_0_0_var(--brand-lift),inset_1px_0_0_0_var(--brand-lift),inset_-1px_0_0_0_var(--brand-lift)]'
                : 'shadow-[inset_0_1px_0_0_var(--line-soft),inset_1px_0_0_0_var(--line-soft),inset_-1px_0_0_0_var(--line-soft)] group-hover:shadow-[inset_0_1px_0_0_var(--brand-lift),inset_1px_0_0_0_var(--brand-lift),inset_-1px_0_0_0_var(--brand-lift)]',
            )}
          />
          <span
            className={cn(
              'flex-1 rounded-[14px] rounded-tl-none bg-s2 transition-panel',
              active
                ? 'shadow-[inset_0_0_0_1px_var(--brand-lift)]'
                : 'surface-ring group-hover:shadow-[inset_0_0_0_1px_var(--brand-lift)]',
            )}
          />
        </span>

        {/* ── WHAT IS ACTUALLY IN HERE, peeking out of the mouth ───────
            Real photos when they signed, a plain slip when they exist but
            did not, nothing when the folder holds none. */}
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
            do not cancel are the mouth opening. ───────────────────────── */}
        <span
          className={cn(
            'absolute inset-x-0 bottom-0 flex h-[104px] flex-col justify-between rounded-[14px] bg-surface p-3 transition-panel group-hover:translate-y-[2px] group-hover:shadow-card',
            active
              ? 'shadow-[inset_0_0_0_1px_var(--brand-lift)]'
              : 'surface-ring group-hover:shadow-[inset_0_0_0_1px_var(--brand-lift)]',
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[14px] bg-gradient-to-tr from-transparent via-brand-wash to-transparent opacity-0 transition-panel group-hover:opacity-100"
          />

          <span className="relative flex items-start gap-2">
            <Glyph
              size={16}
              className={cn(
                'mt-px shrink-0 transition-panel',
                active ? 'text-accent' : 'text-ink-mute group-hover:text-accent',
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate type-sm font-semibold text-ink">{name}</span>
              <span className="block type-meta text-muted">
                <span className="num">{count}</span>
                {count === 1 ? ' item' : ' items'}
              </span>
            </span>
            {active ? (
              <Check size={14} strokeWidth={2.5} aria-hidden className="shrink-0 text-accent" />
            ) : null}
          </span>

          {/* REAL, or absent. Never a fallback figure. */}
          <span className="relative block truncate type-meta text-ink-mute">{secondLine}</span>
        </span>
      </button>

      {/* The menu sits ABOVE the button in paint order (a later sibling in the
          same stacking context), not inside it, so the two never nest. */}
      {menu ? (
        <div className="absolute top-2 right-2 z-10" onClick={(event) => event.stopPropagation()}>
          {menu}
        </div>
      ) : null}
    </div>
  )
}
