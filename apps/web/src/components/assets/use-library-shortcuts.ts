'use client'

import { useEffect } from 'react'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/**
 * The library's own keyboard shortcuts — the subset of the blueprint's matrix
 * that applies to a web photo library. `/` and Cmd/Ctrl+F focus search;
 * Escape clears the search or exits select mode (the caller decides which,
 * since it also has to know whether Quick Look is open); Cmd/Ctrl+1/2 switch
 * between list and grid. There is no tab strip, no split pane and no OS trash
 * in this product, so none of those are here — faking them would be a lie.
 */
export function useLibraryShortcuts({
  onFocusSearch,
  onEscape,
  onListView,
  onGridView,
}: {
  onFocusSearch: () => void
  onEscape: () => void
  onListView: () => void
  onGridView: () => void
}) {
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey

      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        onFocusSearch()
        return
      }
      if (!mod && event.key === '/' && !isTypingTarget(event.target)) {
        event.preventDefault()
        onFocusSearch()
        return
      }
      if (event.key === 'Escape') {
        onEscape()
        return
      }
      if (mod && event.key === '1') {
        event.preventDefault()
        onListView()
        return
      }
      if (mod && event.key === '2') {
        event.preventDefault()
        onGridView()
      }
    }

    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onFocusSearch, onEscape, onListView, onGridView])
}
