'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A drawer — a modal that enters from an edge.
 *
 * Same native `<dialog>` machinery as `modal.tsx` (focus trap, Escape, top
 * layer); the difference is entirely presentational, which is the point: a
 * drawer and a modal that behave differently under the keyboard are two bugs
 * waiting to be found separately.
 *
 * WHEN TO USE WHICH: a modal interrupts and demands an answer before anything
 * else continues. A drawer is a side surface you consult while the page behind
 * it stays the subject — filters, a detail pane, a log. If the user must answer
 * it, it is a modal.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  side = 'right',
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Actions, pinned under the scrolling body — the same slot `Modal` has. */
  footer?: React.ReactNode
  side?: 'right' | 'bottom'
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  // `useId`, not a literal. `modal.tsx` documents why: two drawers in one tree
  // (assets renders a folders sheet and a detail pane side by side) both wrote
  // `id="drawer-title"`, so `aria-labelledby` resolved to whichever came first
  // and the detail drawer announced itself as "Folders".
  const titleId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handle = () => onClose()
    el.addEventListener('close', handle)
    return () => el.removeEventListener('close', handle)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        // `text-left` is LOAD-BEARING, not a default restated. A `<dialog>` is
        // promoted to the browser's top layer but stays where it was MOUNTED in the
        // DOM, so it inherits typography from whatever contains it. `EmptyState` is
        // `text-center`, so a Modal opened from an empty state's action rendered
        // every field label, hint and helper centred over a left-aligned input —
        // measured on /campaigns, `getComputedStyle(panel).textAlign === 'center'`
        // with no `text-center` anywhere in this file. An overlay's alignment must
        // come from the overlay, never from its mount point.
        // ── TWO UA DEFAULTS THAT HAD TO BE BEATEN, BOTH MEASURED ─────────────
        // The user-agent stylesheet gives `dialog` BOTH
        //   max-width:  calc((100% - 6px) - 2em)
        //   max-height: calc((100% - 6px) - 2em)
        // and neither is obvious from this file, because `w-full` and
        // `max-h-[80dvh]` both LOOK like they win. They do not.
        //
        // WIDTH: shot at 390px on 2026-08-20, a `side="bottom"` drawer rendered
        // ~352px wide with the page showing down its right edge — `w-full` set
        // 100% and the UA cap took 38px straight back off. `max-w-none` is what
        // makes a bottom sheet a bottom sheet. The right-hand drawer never
        // noticed because its own width is already under the cap.
        //
        // HEIGHT: `max-h-none` used to sit in this BASE string beside
        // `max-h-[80dvh]` in the side string. Two utilities for one property at
        // equal specificity, so the winner is Tailwind's emitted order and not
        // the order written here — and `max-h-none` won. The sheet grew to its
        // content, `mt-auto` pinned its BOTTOM to the viewport, and its header
        // and first two groups were off the top of the screen. It is now
        // per-side: the right drawer is a full-height panel, the bottom one is
        // capped and scrolls inside itself.
        // An inset ring rather than a border, and `--r-xl`: docs/37 §5 puts
        // modals, drawers and the rail on the 28px rung, one above cards.
        'surface-ring max-w-none bg-surface p-0 text-left text-ink shadow-lg backdrop:bg-[var(--scrim)]',
        side === 'right'
          ? 'mr-0 ml-auto h-dvh max-h-none w-[min(420px,calc(100vw-48px))] rounded-l-xl'
          : 'mt-auto mb-0 max-h-[80dvh] w-full rounded-t-xl',
        className,
      )}
    >
      <div onClick={(e) => e.stopPropagation()} className="flex h-full flex-col">
        <div className="flex flex-none items-center gap-3 border-b border-line-soft p-5">
          <h2 id={titleId} className="type-h3 min-w-0 flex-1">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 flex-none place-items-center rounded-sm text-muted transition-micro hover:bg-s2 hover:text-ink max-narrow:size-11"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <div className="flex flex-none justify-end gap-2 border-t border-line-soft p-5">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  )
}
