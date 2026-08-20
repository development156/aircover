'use client'

import { useEffect, useRef } from 'react'
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
  side = 'right',
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  side?: 'right' | 'bottom'
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

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
      aria-labelledby="drawer-title"
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
        'max-w-none border border-line bg-surface p-0 text-left text-ink shadow-lg backdrop:bg-black/40',
        side === 'right'
          ? 'mr-0 ml-auto h-dvh max-h-none w-[min(420px,calc(100vw-48px))] rounded-l-card'
          : 'mt-auto mb-0 max-h-[80dvh] w-full rounded-t-card',
        className,
      )}
    >
      <div onClick={(e) => e.stopPropagation()} className="flex h-full flex-col">
        <div className="flex flex-none items-center gap-3 border-b border-line-soft p-4">
          <h2 id="drawer-title" className="type-h3 min-w-0 flex-1">
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
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </dialog>
  )
}
