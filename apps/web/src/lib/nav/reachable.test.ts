import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { ALL_SECTIONS, NAV_FOOT, NAV_GROUPS, RAIL_GROUPS, ROADMAP_SECTIONS } from './sections'

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
  // ── HIDDEN BY FOUNDER'S RULING, 2026-08-25 ─────────────────────────────────
  // These three differ in kind from the entries below them, and the difference
  // is worth stating rather than blurring: every other exception here is a
  // screen reached some OTHER way. Two of these are reached NO way.
  //
  // They are built, they work, and they are deliberately out of the rail, the
  // command palette and the phone's More sheet. That is a product decision about
  // what a shop owner should be offered, not a claim about the code.
  //
  // Removing an entry from `NAV_GROUPS` is all it takes to hide a section, so
  // the thing that could go wrong here is silence: a route quietly orphaned and
  // nobody noticing for months. That is exactly what this list exists to stop,
  // which is why hiding one costs a sentence.
  playbooks:
    'Built and working — `readPlaybooksSnapshot` renders live rows — and hidden ' +
    'from all three navigation surfaces by founder ruling on 2026-08-25. ' +
    'Reachable only by typing /playbooks. Restore it by putting its NavSection ' +
    'back in the Automate group in lib/nav/sections.ts.',
  remix:
    'Built and working, and hidden from all three navigation surfaces by founder ' +
    'ruling on 2026-08-25. Reachable only by typing /remix. Restore it by putting ' +
    'its NavSection back in the Create group in lib/nav/sections.ts.',
  sites:
    'Hidden from all three navigation surfaces by founder ruling on 2026-08-25, ' +
    'but NOT unreachable: the Leads page links to it from the embed-code panel ' +
    '("Make one", app/(app)/leads/page.tsx), which is the door a person actually ' +
    'arrives through — they want a form to collect enquiries and the site is what ' +
    'carries it. Restore it to the Publish group in lib/nav/sections.ts.',
  billing:
    'Not a section and deliberately not in the rail: there is no /billing page, only ' +
    '/billing/checkout/{orderId}. It is where a payment lands — `CheckoutSession.url` ' +
    "from packages/billing/src/providers/cashfree names it, and the wallet's " +
    '"Start checkout" is what sends you there. A rail entry would offer a checkout ' +
    'with no order behind it, which is a door onto nothing.',
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

/**
 * A REDIRECT IS NOT A SCREEN, AND THE TWO CAMERAS MUST NOT PHOTOGRAPH ONE.
 *
 * ── THE DEFECT THIS EXISTS TO STOP, WHICH HAD ALREADY HAPPENED ───────────────
 * `/brain/competitors` moved into `/radar` and its route was kept as a redirect
 * so no bookmark 404s. Both audit harnesses kept listing it as a route to shoot,
 * so the sweep photographed the Radar screen twice and filed half the frames
 * under a path that renders nothing. A QA pass then read those frames back and
 * reported a defect — "/brain/competitors renders the Radar screen, the sidebar
 * highlights Radar, two URLs for one screen" — every clause of which is a
 * correct description of a working redirect.
 *
 * That is the cost: a camera pointed at a redirect manufactures findings about a
 * screen that does not exist, and a person spends a session disproving them.
 * `design-audit.spec.ts` already states the rule in its own comments — "auditing
 * them from code is honest; auditing them from a redirect is not" — and then
 * broke it eighteen lines above.
 *
 * ── WHY THE PROPERTY IS DERIVED, NOT A LIST OF NAMES ─────────────────────────
 * Asserting `not.toContain('/brain/competitors')` would guard one path and go
 * quiet the next time a screen becomes a redirect. So the redirect-only pages
 * are read off disk — today `/`, `/admin`, `/create/post` and
 * `/brain/competitors` — and neither list may name any of them.
 */

const WEB_APP_DIR = join(repoRoot(), 'apps/web/src/app')

function pageFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) pageFiles(full, found)
    else if (entry.name === 'page.tsx') found.push(full)
  }
  return found
}

/**
 * A page whose whole body is a redirect. It imports one from `next/navigation`
 * and never returns — anything that renders has to return what it renders, so
 * the absence of `return` is what separates a stub from a screen.
 */
function redirectOnlyRoutes(): string[] {
  return pageFiles(WEB_APP_DIR)
    .filter((file) => {
      const source = readFileSync(file, 'utf8')
      if (!source.includes("from 'next/navigation'")) return false
      if (!/\b(permanentRedirect|redirect)\(/.test(source)) return false
      return !/\breturn\b/.test(source)
    })
    .map((file) => {
      const segments = file
        .slice(WEB_APP_DIR.length)
        .replace(/\/page\.tsx$/, '')
        .split('/')
        // Route groups are organisation, not address.
        .filter((segment) => segment !== '' && !segment.startsWith('('))
      return `/${segments.join('/')}`
    })
}

/**
 * The route rows of a harness's `ROUTES` array, read as text.
 *
 * Text and not an import on purpose: `.qa/sweep.mjs` runs `loadEnv()` at module
 * scope and hardcodes another worktree's path, and `design-audit.spec.ts` pulls
 * in Playwright. Matching whole rows rather than any quoted path also keeps
 * comment prose — including the comment this fix adds — out of the result.
 */
function routeRows(file: string, rowPattern: RegExp): string[] {
  const source = readFileSync(join(repoRoot(), file), 'utf8')
  const start = source.indexOf('const ROUTES')
  if (start === -1) throw new Error(`${file} no longer declares a ROUTES array`)
  const end = source.indexOf('\n]', start)
  if (end === -1) throw new Error(`${file}'s ROUTES array does not close as expected`)
  return [...source.slice(start, end).matchAll(rowPattern)].map((match) => match[1] ?? '')
}

const AUDIT_LISTS: ReadonlyArray<{ name: string; paths: () => string[] }> = [
  { name: '.qa/sweep.mjs', paths: () => routeRows('.qa/sweep.mjs', /^\s*'(\/[^']*)',?\s*$/gm) },
  {
    name: 'apps/web/e2e/design-audit.spec.ts',
    paths: () => routeRows('apps/web/e2e/design-audit.spec.ts', /path:\s*'(\/[^']*)'/g),
  },
]

describe('the audit cameras point at screens', () => {
  // Read before anything is asserted about what is ABSENT. A parser that has
  // quietly stopped matching returns [] and every not-to-contain below passes
  // while guarding nothing, which is the failure mode this codebase has already
  // shipped once.
  test('each route list still parses, so an empty result cannot pass for a clean one', () => {
    for (const list of AUDIT_LISTS) {
      const paths = list.paths()
      expect(paths.length, `${list.name}: parsed no routes at all`).toBeGreaterThan(20)
      // Two screens that are real, built and in both lists.
      expect(paths, `${list.name}: parsed rows but lost a known screen`).toContain('/home')
      expect(paths, `${list.name}: parsed rows but lost a known screen`).toContain('/radar')
    }
  })

  test('the redirect-only pages are still found on disk', () => {
    expect(
      redirectOnlyRoutes(),
      'Nothing was detected as a redirect-only page, so the check below proves nothing.',
    ).toContain('/brain/competitors')
  })

  test('no audit list photographs a page that only redirects', () => {
    const stubs = new Set(redirectOnlyRoutes())
    // Gathered across BOTH lists before asserting, so one run names every
    // offending row rather than the first one and then stopping.
    const shooting: Record<string, string[]> = {}
    for (const list of AUDIT_LISTS) {
      const offenders = list.paths().filter((path) => stubs.has(path))
      if (offenders.length > 0) shooting[list.name] = offenders
    }

    expect(
      shooting,
      'These lists name routes whose page only redirects. The camera files the ' +
        'DESTINATION screen as evidence for the listed path, which reads back as two ' +
        'URLs for one screen. Drop the row and note the reason beside the other ' +
        'exclusions the list already declares.',
    ).toEqual({})
  })
})

/**
 * THE RAIL SHOWS WHAT YOU CAN USE, AND THE ROADMAP IS STILL REACHABLE.
 *
 * ── WRITTEN BECAUSE A MUTATION SURVIVED ──────────────────────────────────────
 * `RAIL_GROUPS` filters `NAV_GROUPS` to `live`, and that is the whole of how the
 * two founder rulings are held apart — the roadmap stays visible, in one place,
 * and that place is not the rail. Replacing the filter with `group.items` was
 * applied and every test in this file stayed GREEN, because they all read
 * `ALL_SECTIONS`, which is deliberately unchanged. The projection had no guard
 * at all.
 *
 * Both halves are asserted, and the second is the one that matters: a rule that
 * only said "no soon items in the rail" would be satisfied by deleting them
 * from the product.
 */
describe('the rail projects the map, and hides nothing from the product', () => {
  test('every section in the rail is one you can use today', () => {
    const soon = RAIL_GROUPS.flatMap((group) => group.items).filter((item) => item.state === 'soon')
    expect(
      soon.map((item) => item.href),
      'a roadmap section reached the rail — see RAIL_GROUPS in sections.ts',
    ).toEqual([])
  })

  test('every roadmap section is still in the map the palette and phone sheet read', () => {
    // ALL_SECTIONS feeds the command palette; NAV_GROUPS feeds the More sheet.
    // A roadmap item missing from either has been deleted rather than moved,
    // which is the opposite of the ruling this projection exists to keep.
    const inMap = new Set(ALL_SECTIONS.map((s) => s.href))
    const inSheet = new Set(NAV_GROUPS.flatMap((g) => g.items).map((s) => s.href))
    const missing = ROADMAP_SECTIONS.filter((s) => !inMap.has(s.href) || !inSheet.has(s.href))
    expect(
      missing.map((s) => s.href),
      'these left the rail AND the product — the roadmap must stay visible somewhere',
    ).toEqual([])
  })

  test('there is a roadmap at all, so an empty projection cannot pass by accident', () => {
    // If every section became live this would be zero and both tests above
    // would be vacuously true. Fail loudly instead and let somebody delete them.
    expect(
      ROADMAP_SECTIONS.length,
      'no `soon` sections left — delete these three tests deliberately, do not let them idle',
    ).toBeGreaterThan(0)
  })
})

/**
 * THE THREE HIDDEN SECTIONS STAY HIDDEN, ON EVERY SURFACE.
 *
 * Founder's ruling, 2026-08-25: `/playbooks`, `/remix` and `/sites` are out of
 * the navigation. Hiding one costs a single deletion from `NAV_GROUPS`, which
 * makes the reverse just as cheap — and a section quietly reappearing is the
 * failure nobody would report, because a menu item showing up looks like a
 * feature rather than a regression.
 *
 * ASSERTED PER SURFACE, not once against `NAV_GROUPS`. The three projections
 * fall out of the same array today, so one assertion would pass for all three
 * and would keep passing if a future surface started reading its own list. That
 * is precisely how the palette and the rail drifted apart before this file
 * existed — the header of `sections.ts` opens with that story.
 *
 * The routes themselves are NOT asserted gone. They are built and they still
 * work; this is a decision about what is offered, not about what exists.
 */
describe('the hidden sections are hidden everywhere', () => {
  const HIDDEN = ['/playbooks', '/remix', '/sites'] as const

  test('none reaches the rail', () => {
    const shown = RAIL_GROUPS.flatMap((g) => g.items)
      .map((s) => s.href)
      .filter((href) => (HIDDEN as readonly string[]).includes(href))
    expect(shown, 'a hidden section came back to the sidebar').toEqual([])
  })

  test('none reaches the command palette', () => {
    const shown = ALL_SECTIONS.map((s) => s.href).filter((href) =>
      (HIDDEN as readonly string[]).includes(href),
    )
    expect(shown, 'a hidden section came back to the search bar').toEqual([])
  })

  test('none reaches the phone More sheet', () => {
    const shown = NAV_GROUPS.flatMap((g) => g.items)
      .map((s) => s.href)
      .filter((href) => (HIDDEN as readonly string[]).includes(href))
    expect(shown, 'a hidden section came back to the phone More sheet').toEqual([])
  })

  /**
   * Each hidden route must still be DECLARED, with how it is reached now. This
   * is what stops "hidden" from decaying into "orphaned and forgotten": the
   * coverage test above would already fail on an undeclared route, and this one
   * fails if somebody removes the reason to make that failure go away.
   */
  test('each one says, in NOT_A_NAV_SECTION, how it is reached now', () => {
    const undeclared = HIDDEN.map((href) => href.slice(1)).filter(
      (segment) => !(segment in NOT_A_NAV_SECTION),
    )
    expect(undeclared, 'hidden, but with no note saying how a person gets there').toEqual([])
  })
})
