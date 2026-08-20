'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A modal, built on the NATIVE `<dialog>`.
 *
 * ── WHY NATIVE ───────────────────────────────────────────────────────────────
 * `showModal()` gives four things that are each individually easy to get wrong
 * and collectively almost never got right in hand-rolled dialogs: a real focus
 * TRAP, Escape-to-close, inertness of the rest of the document for assistive
 * technology, and the browser's top layer — so it cannot be clipped by an
 * ancestor's `overflow: hidden` or lose a z-index race. The same reasoning as
 * `select.tsx`: the platform is better at this than we would be.
 *
 * ── WHAT WE STILL HAVE TO DO ─────────────────────────────────────────────────
 * `<dialog>` closes on Escape but NOT on a backdrop click, and it does not
 * restore scroll. Both are handled here, once, so no call site reimplements
 * them differently.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean
  onClose: () => void
  /** Always present. A dialog with no title is unnavigable by screen reader. */
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  // `close` fires for Escape as well as for `close()`, so the parent's state
  // cannot drift out of step with the element's.
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
      aria-labelledby="modal-title"
      // A click that lands on the DIALOG itself is a click on the backdrop:
      // the panel below stops propagation, so this cannot fire from inside.
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        'm-auto w-[min(560px,calc(100vw-32px))] rounded-card border border-line bg-surface p-0 text-ink shadow-lg',
        // `bg-[var(--scrim)]`, not `bg-black/40`. globals.css opens @theme with
        // `--color-*: initial`, which wipes the stock palette, and only
        // `--color-white` is redefined — so `bg-black` was a class Tailwind
        // never generated and this dialog opened over an UNDIMMED page. PROVEN
        // in the compiled CSS: no `backdrop:bg-black/40` rule exists, and the
        // only two `::backdrop` rules are preflight.
        'backdrop:bg-[var(--scrim)]',
        className,
      )}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-line-soft p-4">
          <div className="min-w-0 flex-1">
            <h2 id="modal-title" className="type-h3">
              {title}
            </h2>
            {description ? <p className="type-sm mt-0.5 text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 flex-none place-items-center rounded-sm text-muted transition-micro hover:bg-s2 hover:text-ink max-narrow:size-11"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-line-soft p-4">{footer}</div>
        ) : null}
      </div>
    </dialog>
  )
}
