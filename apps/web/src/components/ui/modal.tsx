'use client'

import { useEffect, useId, useRef } from 'react'
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
  /**
   * ── THE TITLE ID IS PER-INSTANCE, AND IT WAS NOT ─────────────────────────
   * This was the literal string `modal-title`, which is correct exactly while
   * one Modal exists in the document. The dialog renders whether or not it is
   * open, so a screen with EIGHT of them — /posts, where every tile now carries
   * its own delete dialog — put eight `id="modal-title"` nodes in one document.
   * `aria-labelledby` resolves to the first match, so every one of those dialogs
   * would announce the first card's title: press delete on the eighth post and
   * a screen reader names the first. Silent, and wrong in the one place being
   * wrong is expensive.
   */
  const titleId = useId()

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
      aria-labelledby={titleId}
      // A click that lands on the DIALOG itself is a click on the backdrop:
      // the panel below stops propagation, so this cannot fire from inside.
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
        'surface-ring m-auto w-[min(560px,calc(100vw-32px))] rounded-xl bg-surface p-0 text-left text-ink shadow-lg',
        // ── A FOOTER THAT FALLS OFF THE SCREEN IS A DIALOG THAT CANNOT BE
        //    ANSWERED ────────────────────────────────────────────────────────
        // MEASURED in Chromium at 1440x1100 with the crop offer inside: the
        // panel grew past the UA's own `max-height` for `<dialog>`, the overflow
        // was CLIPPED rather than scrolled, and both footer buttons were
        // off-screen. Escape still worked, so the only reachable answer was the
        // one that does nothing — on a dialog whose whole purpose is a decision.
        //
        // The cap is stated here rather than left to the UA so the body below can
        // be the thing that scrolls: `100dvh`, not `100vh`, because a phone's
        // address bar is the difference between fitting and not.
        //
        // The underscores are not decoration. `calc()` requires whitespace around
        // a `-`, so `calc(100dvh-2rem)` is INVALID CSS and the browser drops the
        // whole declaration — silently, with the class still present in the
        // markup and in the compiled stylesheet. Written without them, this cap
        // did nothing at all and the footer went on falling off the screen at 390
        // and 768 while looking, in the diff, exactly like a fix.
        'max-h-[calc(100dvh_-_2rem)] overflow-hidden',
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
      {/* The column that makes the cap above useful: header and footer hold
          their size, and the BODY is what runs out of room and scrolls. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100dvh_-_2rem)] flex-col"
      >
        <div className="flex flex-none items-start gap-3 border-b border-line-soft p-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="type-h3">
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
