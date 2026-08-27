const VIEW_KEY = 'sahoda.assets.view'

export type LibraryView = 'grid' | 'list'

/**
 * Grid or list, remembered across visits.
 *
 * Wrapped in try/catch on both sides, and the reason is not decorative:
 * `AssetLibrary` is a client component, and Next still renders it once on the
 * server for the first response, where `window` does not exist at all. Private
 * browsing and a full quota throw for the same reason on a real browser. None
 * of that should take the screen down over which way photos are laid out.
 */
export function readLibraryView(): LibraryView {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

export function writeLibraryView(view: LibraryView): void {
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    // The view still works for this visit. It just does not survive a reload.
  }
}
