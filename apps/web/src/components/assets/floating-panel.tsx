'use client'

import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { MenuAnchor } from '@/components/assets/use-context-menu-trigger'
import { cn } from '@/lib/utils'

/**
 * B1's FIX, GENERALISED: a portal to `document.body`, positioned from the
 * TRIGGER's own rect rather than laid out in the DOM where it was written.
 *
 * ── THE DEFECT THIS REPLACES ──────────────────────────────────────────────
 * `library-sidebar-row.tsx` used to wrap a folder's menu in
 * `-translate-y-1/2` for vertical centring. A CSS transform creates a new
 * stacking context, which trapped the menu's `absolute z-20` panel inside
 * it — no z-index inside that context can paint above a LATER sibling row,
 * because paint order for the whole context is decided one level up. The
 * panel had no visible frame and its text collided with the rows below it.
 * Raising the z-index cannot fix this; it is the exact trap `apps/web/CLAUDE.md`
 * documents for `backdrop-filter` and `position:fixed`, one containing-block
 * problem wearing two different CSS properties. A portal is the only fix,
 * same as `command-palette.tsx`.
 *
 * Every dropdown in `components/assets` renders through this: the folder
 * menu, the smart-folder menu, the file and folder context menus, the sort
 * menu and the filter chips' value menus. One place to get the portal,
 * the position, the focus and the dismissal right, rather than six.
 */
export function FloatingPanel({
  anchor,
  onClose,
  align = 'end',
  gap = 4,
  role = 'menu',
  ariaLabel,
  ignoreEl = null,
  className,
  children,
}: {
  anchor: MenuAnchor
  onClose: () => void
  /** Which edge of the anchor the panel's own edge lines up with. */
  align?: 'start' | 'end'
  gap?: number
  role?: 'menu' | 'dialog'
  ariaLabel?: string
  /** The trigger element itself — excluded from "outside click", so the
   *  trigger's own `onClick` stays the one thing that decides whether
   *  clicking it again closes the panel, rather than this and the trigger
   *  racing to both decide and reopening on the same click. */
  ignoreEl?: HTMLElement | null
  className?: string
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{ top: number; left: number } | null>(null)

  // Measured AFTER paint but before the browser shows anything, same as the
  // command palette's own anchoring — a panel positioned at (0,0) for one
  // frame and then jumped is a worse defect than a one-frame delay.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = align === 'end' ? anchor.right - rect.width : anchor.left
    let top = anchor.bottom + gap
    // Flips above the anchor rather than running off the bottom of the
    // viewport — a menu that opens off-screen is a menu that does not open.
    if (top + rect.height > vh - 8) {
      top = Math.max(8, anchor.top - gap - rect.height)
    }
    left = Math.min(Math.max(8, left), Math.max(8, vw - rect.width - 8))
    setStyle({ top, left })
  }, [anchor, align, gap])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (ignoreEl && ignoreEl.contains(target)) return
      onClose()
    }
    // Capture phase: `scroll` does not bubble, so this is the only way an
    // ancestor (or the window) sees a descendant's scroll at all. Which is
    // also why the panel's OWN scroll arrives here: "File into folder" has a
    // folder list that scrolls once there are more folders than fit, and the
    // panel closed the instant it was scrolled. The page moving under the
    // panel is the thing to dismiss on; the panel moving inside itself is not.
    function onScroll(event: Event) {
      // `instanceof Node`, not a cast: a scroll fired at the window itself has
      // the window as its target, and `contains(window)` throws.
      const target = event.target
      if (target instanceof Node && panelRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose, ignoreEl])

  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLElement>(
      '[data-autofocus="true"], button:not(:disabled), a[href], input:not(:disabled)',
    )
    first?.focus()
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={panelRef}
      role={role}
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        top: style?.top ?? -9999,
        left: style?.left ?? -9999,
        visibility: style ? 'visible' : 'hidden',
      }}
      className={cn(
        'surface-ring-firm z-50 w-[220px] rounded-md bg-surface p-1.5 shadow-pop',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}
