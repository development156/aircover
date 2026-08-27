'use client'

import { cn } from '@/lib/utils'

/**
 * ONE ROW, shared by every menu in this folder: the folder menu, the file
 * menu, the sort menu. A hotkey printed on the right is F1's whole point —
 * "hotkeys give speed, context menus give discoverability, and good
 * products give both, with the shortcut printed inside the menu item" — so
 * this is the one place that layout exists, rather than reinvented per menu
 * with a slightly different gap each time.
 */
export function MenuItemRow({
  onClick,
  children,
  shortcut,
  disabled = false,
  destructive = false,
  autoFocus = false,
}: {
  onClick: () => void
  children: React.ReactNode
  /** Printed right-aligned, e.g. "Enter", "F2", "Delete". Absent for items
   *  with no working keyboard equivalent — never invented for symmetry. */
  shortcut?: string
  disabled?: boolean
  destructive?: boolean
  /** The item `FloatingPanel` focuses on open. Exactly one per panel. */
  autoFocus?: boolean
}) {
  return (
    // Plain `<button>`, no explicit `role="menuitem"` — an explicit role
    // REPLACES the implicit one rather than adding to it, so a real
    // `<button role="menuitem">` stops being reachable by `getByRole('button')`
    // everywhere it is queried, including in every existing test for this
    // menu. The panel it lives in already carries `role="menu"`.
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-autofocus={autoFocus ? 'true' : undefined}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left type-sm transition-micro hover:bg-s2 disabled:pointer-events-none disabled:opacity-50',
        destructive ? 'text-danger' : 'text-ink',
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      {shortcut ? (
        <kbd className="shrink-0 type-meta text-muted" aria-hidden>
          {shortcut}
        </kbd>
      ) : null}
    </button>
  )
}
