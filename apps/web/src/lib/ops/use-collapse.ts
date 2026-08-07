'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Which regions of `/admin/dev` an admin has opened (SL-062 §4).
 *
 * ── WHY localStorage AND NOT THE DATABASE ───────────────────────────────────
 * `ops_admins` has no preferences column, and adding one means a migration —
 * which only the `wt-db` worktree may write. A layout preference is also not
 * worth a schema change: it is not data anyone else reads, it costs nothing if
 * lost, and it is wrong in no dangerous direction when it is missing.
 *
 * THE TRADEOFF, STATED RATHER THAN GLOSSED: this is per BROWSER, not per
 * person. The same admin on a laptop and on a desktop gets two different sets
 * of open regions; a private window starts collapsed every time; clearing site
 * data forgets it. `CollapseNote` renders that sentence on the page so nobody
 * discovers it by being surprised. If it ever needs to follow a person between
 * machines, that is a `ops_admins.preferences` column and a `wt-db` card — not
 * a workaround here.
 *
 * Keyed by admin id so two admins sharing a machine do not inherit each other's
 * layout. The id is a Clerk user id, which is not a secret and is already in the
 * page — but nothing else about the admin is written here, and nothing read from
 * here is ever trusted for anything but layout.
 *
 * SSR: the default wins on the first paint and the stored value is applied in an
 * effect. That is a deliberate flash rather than a hydration mismatch, and it
 * fails in the safe direction — the default is COLLAPSED, so a region never
 * flashes open with something in it.
 */

const KEY_PREFIX = 'sahoda.admin.collapse.'

function storageKey(adminId: string): string {
  return `${KEY_PREFIX}${adminId}`
}

/** Never throws: a disabled or full localStorage costs the preference, not the page. */
function readStored(adminId: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey(adminId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    // Only booleans survive. A value of another shape is somebody else's data
    // or a corrupted write, and coercing it would silently open regions.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
      ),
    )
  } catch {
    return {}
  }
}

function writeStored(adminId: string, value: Record<string, boolean>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(adminId), JSON.stringify(value))
  } catch {
    // A preference that cannot be saved is not an error worth showing anyone.
  }
}

export interface CollapseState {
  isOpen: (region: string) => boolean
  toggle: (region: string) => void
}

/**
 * @param adminId  the signed-in admin, so two people on one machine do not share
 * @param openByDefault regions that start open — the hero card, and nothing else
 */
export function useCollapse(adminId: string, openByDefault: readonly string[] = []): CollapseState {
  const defaults = new Set(openByDefault)
  const [stored, setStored] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setStored(readStored(adminId))
  }, [adminId])

  const isOpen = useCallback(
    (region: string) => stored[region] ?? defaults.has(region),
    // `defaults` is rebuilt each render from a prop that is a literal at every
    // call site; keying on the joined list avoids a new Set invalidating this
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stored, openByDefault.join('|')],
  )

  const toggle = useCallback(
    (region: string) => {
      setStored((current) => {
        const open = current[region] ?? defaults.has(region)
        const next = { ...current, [region]: !open }
        writeStored(adminId, next)
        return next
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adminId, openByDefault.join('|')],
  )

  return { isOpen, toggle }
}

/** Exported for the test — the shape on disk is part of the contract. */
export const COLLAPSE_STORAGE_KEY_PREFIX = KEY_PREFIX
