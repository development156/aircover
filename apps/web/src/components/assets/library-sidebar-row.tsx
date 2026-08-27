'use client'

import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * ONE ROW, for every kind of place the library has.
 *
 * All files, a derived folder, a real folder (at some depth), a saved search,
 * Unfiled — one shape. The alternative this replaces was a card per folder,
 * three per row at best on a laptop; this is a list, and a list is what a
 * folder tree actually is.
 *
 * ── B1: THE `menu` SLOT NO LONGER HOLDS A PANEL, ONLY A TRIGGER ─────────────
 * This row's own `-translate-y-1/2` (for vertical centring) still wraps
 * `menu`, and that used to trap `FolderMenu`'s dropdown PANEL inside a new
 * stacking context — nothing inside it could paint above a later sibling
 * row, and raising the z-index could not fix that. `FolderMenu` (and
 * `SmartFolderMenu`) now portal their panel to `document.body` via
 * `FloatingPanel`, so the only thing this wrapper still holds is the small
 * "..." button, which has no such problem. See `floating-panel.tsx`.
 */
export function SidebarRow({
  icon: Icon,
  label,
  count,
  depth = 0,
  active,
  collapsed = false,
  onClick,
  onContextMenu,
  onKeyDown,
  menu,
}: {
  icon: LucideIcon
  label: string
  /** Left off a menu-less "loading" row; every real row states one. */
  count?: number
  /** How deep a real folder sits. 0 is the root. */
  depth?: number
  active: boolean
  collapsed?: boolean
  onClick: () => void
  /** F1: right-click anywhere on the row opens the same menu the "..."
   *  button does. Only passed for rows a menu actually exists for. */
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void
  /** F1: Shift+F10 / the ContextMenu key, the keyboard equivalent, while the
   *  row has focus. */
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void
  menu?: React.ReactNode
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        aria-pressed={active}
        title={collapsed ? label : undefined}
        style={collapsed ? undefined : { paddingLeft: 10 + depth * 14 }}
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-sm pr-7 text-left type-sm transition-micro max-narrow:min-h-[44px]',
          collapsed ? 'justify-center px-0' : '',
          active
            ? 'bg-brand-wash font-semibold text-accent'
            : 'text-muted hover:bg-s2 hover:text-ink',
        )}
      >
        <Icon size={14} strokeWidth={1.8} aria-hidden className="shrink-0" />
        {collapsed ? (
          <span className="sr-only">{label}</span>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count !== undefined ? (
              <span className="num shrink-0 type-meta text-muted">{count}</span>
            ) : null}
          </>
        )}
      </button>
      {menu && !collapsed ? (
        <div
          className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-micro group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={(event) => event.stopPropagation()}
        >
          {menu}
        </div>
      ) : null}
    </div>
  )
}
