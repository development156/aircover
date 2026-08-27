'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * A rect-shaped anchor a floating panel can position itself against.
 *
 * Not a `DOMRect` — a `DOMRect` cannot be constructed by hand for a bare
 * point (a right-click has no element, only a cursor position), and this
 * needs to describe both. `getBoundingClientRect()` already satisfies this
 * shape, so an element anchor is free.
 */
export interface MenuAnchor {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface ContextMenuTrigger {
  open: boolean
  anchor: MenuAnchor | null
  /** The element that opened the menu, for outside-click exclusion and for
   *  returning focus to on close. `null` for a right-click, which has no
   *  element of its own — the caller passes one explicitly there instead. */
  triggerEl: HTMLElement | null
  /** Set when a direct shortcut (F2, Delete) opened the menu straight into
   *  one of its own modes, rather than at the top-level list — so pressing
   *  F2 on a focused row is not a slower way to reach the same list, it is
   *  the rename form itself. `null` for every other way of opening it. */
  intent: 'rename' | 'delete' | null
  /** Opens anchored to an element's own box — the "..." button, or a row
   *  focused via keyboard. */
  openAtElement: (el: HTMLElement, intent?: 'rename' | 'delete') => void
  /** Opens anchored to a bare point — a right-click. `returnFocusTo` is the
   *  row itself, since a cursor position is not a focusable thing to return
   *  focus to. */
  openAtPoint: (
    x: number,
    y: number,
    returnFocusTo?: HTMLElement | null,
    intent?: 'rename' | 'delete',
  ) => void
  close: () => void
}

/**
 * ONE TRIGGER, for whichever of the three ways a person opened the menu:
 * a click on a "..." button, Shift+F10 / the ContextMenu key while a row has
 * focus, or an actual right-click. All three end up here so there is exactly
 * one open/close state and one focus-return path, never three that could
 * disagree about which one is live.
 *
 * Positioning and portalling are `FloatingPanel`'s job, not this hook's —
 * this only tracks WHERE to anchor and WHOM to give focus back to.
 */
export function useContextMenuTrigger(): ContextMenuTrigger {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null)
  const [intent, setIntent] = useState<'rename' | 'delete' | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const triggerElRef = useRef<HTMLElement | null>(null)

  const openAtElement = useCallback((el: HTMLElement, nextIntent?: 'rename' | 'delete') => {
    returnFocusRef.current = el
    triggerElRef.current = el
    setIntent(nextIntent ?? null)
    setAnchor(el.getBoundingClientRect())
  }, [])

  const openAtPoint = useCallback(
    (
      x: number,
      y: number,
      returnFocusTo?: HTMLElement | null,
      nextIntent?: 'rename' | 'delete',
    ) => {
      returnFocusRef.current = returnFocusTo ?? null
      triggerElRef.current = returnFocusTo ?? null
      setIntent(nextIntent ?? null)
      setAnchor({ top: y, left: x, right: x, bottom: y, width: 0, height: 0 })
    },
    [],
  )

  const close = useCallback(() => {
    setAnchor(null)
    setIntent(null)
    const target = returnFocusRef.current
    // Deferred a frame: the trigger may only become focusable again once the
    // panel it was covering has actually unmounted, same reasoning as the
    // command palette's own `close`.
    if (target) requestAnimationFrame(() => target.focus())
  }, [])

  return {
    open: anchor !== null,
    anchor,
    triggerEl: triggerElRef.current,
    intent,
    openAtElement,
    openAtPoint,
    close,
  }
}

/** Shift+F10 and the dedicated ContextMenu key both mean "open the menu here", the keyboard equivalent of a right-click. */
export function isContextMenuKey(event: React.KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}
