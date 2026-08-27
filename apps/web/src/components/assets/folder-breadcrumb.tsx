'use client'

import { ChevronRight, Folder } from 'lucide-react'
import type { AssetFolder } from '@sahoda/shared'

/**
 * THE PATH, from the library root to the folder being viewed.
 *
 * ── LEGIBLE AT 360PX ──────────────────────────────────────────────────────────
 * The CURRENT folder is always shown in full (truncated by CSS, never
 * dropped). When the path is longer than fits, the MIDDLE collapses to one
 * "…" crumb rather than the end — the end is where you are, and eliding it is
 * the one thing a breadcrumb must never do.
 *
 * ── THE `deep` TOGGLE ──────────────────────────────────────────────────────────
 * "Include sub-folders" lives here, next to the path it changes the meaning
 * of, rather than beside the file count below.
 */
const MAX_CRUMBS = 3

export function FolderBreadcrumb({
  path,
  deep,
  onNavigate,
  onToggleDeep,
}: {
  /** Root to leaf, from `folderPath()`. Empty means the root itself. */
  path: AssetFolder[]
  deep: boolean
  /** `null` means "go to the library root". */
  onNavigate: (id: string | null) => void
  onToggleDeep: (deep: boolean) => void
}) {
  const crumbs: Array<{ id: string | null; name: string }> = [
    { id: null, name: 'All files' },
    ...path.map((folder) => ({ id: folder.id, name: folder.name })),
  ]

  // Collapse the middle only. The first (root) and the last two (parent,
  // current) always survive — the last one is where you are, and it never
  // goes.
  const shown: Array<{ id: string | null; name: string } | 'ellipsis'> =
    crumbs.length <= MAX_CRUMBS
      ? crumbs
      : [crumbs[0] as (typeof crumbs)[number], 'ellipsis', ...crumbs.slice(-2)]

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav
        aria-label="Folder path"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
      >
        {shown.map((crumb, index) => {
          if (crumb === 'ellipsis') {
            return (
              <span key="ellipsis" aria-hidden className="shrink-0 px-1 type-sm text-muted">
                …
              </span>
            )
          }
          const isLast = index === shown.length - 1
          return (
            <span key={crumb.id ?? 'root'} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight size={13} aria-hidden className="shrink-0 text-muted" />
              ) : null}
              {/* The current crumb is where you already are, not an unbuilt
                  control — a plain span, not a `<button disabled>`, so a
                  screen reader never announces an action that does nothing. */}
              {isLast ? (
                <span
                  aria-current="location"
                  className="min-w-0 truncate px-1 type-sm font-semibold text-ink"
                >
                  {crumb.name}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate(crumb.id)}
                  className="min-w-0 truncate rounded-sm px-1 type-sm text-muted transition-micro hover:bg-s2 hover:text-ink"
                >
                  {index === 0 ? (
                    <span className="flex items-center gap-1">
                      <Folder size={13} aria-hidden className="shrink-0" />
                      {crumb.name}
                    </span>
                  ) : (
                    crumb.name
                  )}
                </button>
              )}
            </span>
          )
        })}
      </nav>

      <label className="flex shrink-0 items-center gap-1.5 type-sm text-muted">
        <input
          type="checkbox"
          checked={deep}
          onChange={(event) => onToggleDeep(event.target.checked)}
          className="size-3.5 accent-[var(--acc)]"
        />
        Include sub-folders
      </label>
    </div>
  )
}
