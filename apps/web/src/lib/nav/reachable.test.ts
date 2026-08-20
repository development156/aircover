import { readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { ALL_SECTIONS, NAV_FOOT, NAV_GROUPS } from './sections'

/**
 * EVERY SECTION OF THE APP IS REACHABLE FROM THE MENU.
 *
 * ── THE DEFECT THIS EXISTS TO STOP, WHICH HAD ALREADY HAPPENED ───────────────
 * On 2026-08-20 this app had eleven top-level routes under `(app)` and NINE nav
 * items. `/approvals`, `/campaigns` and `/assets` were finished, tested,
 * deployed screens that no link in the product pointed at — reachable only by
 * typing the path. `/sites` was hidden on purpose and the reason had expired.
 *
 * Nothing caught it because nothing could: a route with no link is not a type
 * error, not a lint error, and not a failing test. It is a screen that exists
 * and cannot be found, which is indistinguishable from a screen that does not
 * exist — to a customer, and to the next session deciding whether to build it.
 *
 * ── THE PROPERTY, AND WHY IT IS TOP-LEVEL SEGMENTS ONLY ──────────────────────
 * A section is a top-level directory under `app/(app)`. Its inner routes are
 * that section's own business: `/posts/[id]` is reached from `/posts`,
 * `/ads/budget` from the Ads tab row, `/brain/voice` from the Brain tabs. Those
 * are navigable BY the section, so requiring them in the rail would be wrong —
 * it is the twenty-one-flat-items problem this whole pass exists to fix.
 *
 * So: every top-level segment is either in the nav map or declared below with a
 * reason. A new folder appears in the failure message with nothing else needed.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

function repoRoot(): string {
  let dir = HERE
  for (let up = 0; up < 12; up += 1) {
    try {
      if (statSync(join(dir, 'packages')).isDirectory()) return dir
    } catch {
      // keep walking
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  throw new Error('could not locate the repo root from the test file')
}

const APP_DIR = join(repoRoot(), 'apps/web/src/app/(app)')

/**
 * Top-level segments that are deliberately NOT nav destinations.
 *
 * Each needs a reason, because "it is not in the menu" is a product decision
 * every time. An entry here is a claim that the screen is reachable some OTHER
 * way, and that claim is the thing a reviewer should check.
 */
const NOT_A_NAV_SECTION: Readonly<Record<string, string>> = {
  create:
    'The composer entry. Reached from the topbar + button, the phone FAB, the C shortcut and the command palette — four doors already, and a fifth in the rail would make "Create" compete with "Posts" for the same job.',
}

function topLevelSegments(): string[] {
  return (
    readdirSync(APP_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      // Route groups and dynamic segments are not sections.
      .filter((entry) => !entry.name.startsWith('(') && !entry.name.startsWith('['))
      .map((entry) => entry.name)
  )
}

describe('the navigation covers the app', () => {
  const inNav = new Set(ALL_SECTIONS.map((s) => s.href.split('/')[1]))

  test('every top-level section is in the nav map or declared as an exception', () => {
    const orphans = topLevelSegments().filter(
      (segment) => !inNav.has(segment) && !(segment in NOT_A_NAV_SECTION),
    )

    expect(
      orphans,
      'These routes exist and nothing in the product links to them, so they can only be ' +
        'reached by typing the URL. Add each to lib/nav/sections.ts, or declare it in ' +
        'NOT_A_NAV_SECTION with the other way it is reached.',
    ).toEqual([])
  })

  test('every declared exception is still a real route', () => {
    // An exception that outlives its folder is a stale claim, and the next
    // orphan hides behind the list looking maintained.
    const segments = new Set(topLevelSegments())
    const stale = Object.keys(NOT_A_NAV_SECTION).filter((name) => !segments.has(name))
    expect(stale, 'These are excused from the nav but no longer exist.').toEqual([])
  })

  test('every nav href points at a section that exists on disk', () => {
    const segments = new Set(topLevelSegments())
    const dangling = ALL_SECTIONS.map((s) => s.href).filter(
      (href) => !segments.has(href.split('/')[1] ?? ''),
    )
    expect(dangling, 'These nav items point at no route.').toEqual([])
  })
})

describe('the map itself holds together', () => {
  test('no section appears twice', () => {
    const hrefs = ALL_SECTIONS.map((s) => s.href)
    expect(hrefs.length).toBe(new Set(hrefs).size)
  })

  test('what works comes before what does not, inside every group', () => {
    // The ordering rule stated in sections.ts. Written as a test because it is
    // the kind of rule that survives exactly as long as the next person reads
    // the comment above the array they are editing.
    for (const group of NAV_GROUPS) {
      const states = group.items.map((item) => item.state)
      const firstSoon = states.indexOf('soon')
      if (firstSoon === -1) continue
      expect(
        states.slice(firstSoon).every((state) => state === 'soon'),
        `group "${group.title ?? 'top'}" puts a built section after an unbuilt one`,
      ).toBe(true)
    }
  })

  test('the plumbing is all built — a "soon" item does not belong in the foot', () => {
    // Connections, Wallet and Settings are where you go when something is wrong
    // or has to be paid for. An unbuilt one there is a dead end at the worst
    // possible moment, and it belongs in a group with its peers instead.
    expect(NAV_FOOT.every((item) => item.state === 'live')).toBe(true)
  })

  test('every section has a hint, because the palette and the phone sheet show it', () => {
    const missing = ALL_SECTIONS.filter((s) => s.hint.trim() === '').map((s) => s.href)
    expect(missing).toEqual([])
  })
})
