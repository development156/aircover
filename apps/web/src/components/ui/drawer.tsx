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
        'max-h-none border border-line bg-surface p-0 text-ink shadow-lg backdrop:bg-[var(--scrim)]',
        side === 'right'
          ? 'mr-0 ml-auto h-dvh w-[min(420px,calc(100vw-48px))] rounded-l-card'
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
