/**
 * F5's SOURCE OF TRUTH: every shortcut this screen actually implements,
 * named once. `ShortcutSheet` renders this array unchanged, and every
 * literal below is imported everywhere the matching handler lives — the
 * menu items that print it (`folder-menu.tsx`, `file-menu-body.tsx`) and the
 * `onKeyDown` that checks for it (`asset-tile.tsx`, `asset-row.tsx`,
 * `library-sidebar.tsx`). A key label can drift from the check that fires it
 * when the two are two different strings in two different files; here they
 * are the same constant.
 */

export const FOCUS_SEARCH_KEYS = '/ or Ctrl/Cmd+F'
export const CLEAR_OR_EXIT_KEYS = 'Esc'
export const LIST_VIEW_KEYS = 'Ctrl/Cmd+1'
export const GRID_VIEW_KEYS = 'Ctrl/Cmd+2'
export const SHOW_SHORTCUTS_KEYS = '?'

/** Printed on the "Open" item and checked nowhere — it is a native
 *  `<button>`'s own Enter behaviour, not a listener this app installs. */
export const OPEN_ITEM_KEY = 'Enter'
export const RENAME_ITEM_KEY = 'F2'
export const DELETE_ITEM_KEY = 'Delete'
export const CONTEXT_MENU_KEYS = 'Shift+F10'

export interface ShortcutEntry {
  id: string
  keys: string
  description: string
}

/** Rendered by `ShortcutSheet` in exactly this order. */
export const LIBRARY_SHORTCUTS: readonly ShortcutEntry[] = [
  { id: 'focus-search', keys: FOCUS_SEARCH_KEYS, description: 'Search the library' },
  {
    id: 'clear-or-exit',
    keys: CLEAR_OR_EXIT_KEYS,
    description: 'Clear the search, or exit Select',
  },
  { id: 'list-view', keys: LIST_VIEW_KEYS, description: 'Switch to list view' },
  { id: 'grid-view', keys: GRID_VIEW_KEYS, description: 'Switch to grid view' },
  { id: 'open-item', keys: OPEN_ITEM_KEY, description: 'Open the focused file or folder' },
  { id: 'rename-item', keys: RENAME_ITEM_KEY, description: 'Rename the focused file or folder' },
  { id: 'delete-item', keys: DELETE_ITEM_KEY, description: 'Delete the focused file or folder' },
  {
    id: 'context-menu',
    keys: CONTEXT_MENU_KEYS,
    description: 'Open its menu (right-click works too)',
  },
  { id: 'show-shortcuts', keys: SHOW_SHORTCUTS_KEYS, description: 'Show this list' },
]
