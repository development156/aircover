import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { scanRoutes, waterfallOf } from './read-waterfall'

/**
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * `scanRoutes` walks `src/app` and reads `page.tsx` FILES ONLY, and `waterfallOf`
 * judges each one as text.
 *
 *  · [FIXED 2026-08-23.] It read `page.tsx` FILES ONLY — no layouts, no
 *    components — which meant it could not have found the defect its own lane
 *    fixed: `showsAdminItem()` then `approvalCount()` in
 *    `components/shell/rail.tsx`, reached from `(app)/layout.tsx`.
 *
 *    `scanRoutes` now walks the RENDER TREE: every layout above a page, plus the
 *    server components any of them import, transitively. The first thing it found
 *    is that EVERY authenticated route pays five sequential reads before a page
 *    renders at all — `activeWorkspaceRead, getOpsAdmin, read, soft, read` — which
 *    were invisible to a per-page scan and are the most expensive place in the app
 *    to have them, because every navigation pays them.
 *
 *    Scoped to components ON PURPOSE, not to the whole import graph. MEASURED
 *    while building it: following `lib` and `app/actions` too produced 59-122
 *    "sequential reads" per route — an await CENSUS of a subgraph, counting
 *    `deleteAsset` and `Sentry.flush` and every branch of every server action.
 *    A ratchet on that number is red on every change and teaches everyone to
 *    regenerate without reading.
 *  · NOT route handlers (`route.ts`), and still NOT the inside of a reader: two
 *    sequential awaits within `lib/campaigns/read.ts` are one `await` here and
 *    two round trips in production.
 *  · NOT a client component — a file whose first statement is `'use client'` is
 *    skipped, because it does not await on the server.
 *  · `Promise.race` — `Promise.all` and `Promise.allSettled` are recognised as
 *    parallel and `race` is not, so a legitimate `race` reads as sequential.
 *  · TIME. It counts round-trip OPPORTUNITIES, not milliseconds: a `cache()`-wrapped
 *    read that costs nothing on its second call counts the same as a cold one,
 *    and two fast awaits count the same as two slow ones.
 *  · awaits reached conditionally or in a loop, which have no fixed count to record.
 */

const APP = resolve(import.meta.dirname, '../../app')
const BASELINE = resolve(import.meta.dirname, 'read-waterfall.baseline.json')

describe('the analyser itself', () => {
  it('counts an await that is not inside a Promise.all', () => {
    expect(waterfallOf(`export default async function P() { const a = await readA() }`)).toEqual([
      'readA',
    ])
  })

  it('does NOT count awaits inside a Promise.all, however nested the argument list', () => {
    const source = `export default async function P() {
      const [a, b] = await Promise.all([readA({ x: [1, 2] }), readB(() => ({ y: 1 }))])
    }`
    // A lazy regex stops at the first ']' — which here is inside readA's argument
    // — and would then count readB as sequential. Bracket matching is the fix and
    // this is the case that proves it.
    expect(waterfallOf(source)).toEqual([])
  })

  it('does not count Next request APIs, which cost no round trip', () => {
    expect(
      waterfallOf(`async function P() { const { id } = await params; await cookies() }`),
    ).toEqual([])
  })

  it('does not count prose — this codebase discusses awaits in comments constantly', () => {
    const source = `
      /** We used to \`await readOld()\` here and it was a mistake. */
      export default async function P() {
        // await readAlsoNot()
        const a = await readReal()
      }`
    expect(waterfallOf(source)).toEqual(['readReal'])
  })
})

/**
 * ── THE RATCHET ─────────────────────────────────────────────────────────────
 * A route may not gain a sequential read. It may lose one freely — that is the
 * direction this exists to allow — and the baseline is rewritten with
 * `PERF_WATERFALL_WRITE=1` when a change is deliberate.
 *
 * Growth is failed by NAME, not by count: swapping one sequential read for
 * another leaves the count identical while changing what the page waits for, and
 * a count-only ratchet would call that a pass.
 */
describe('no page gains a sequential read', () => {
  it('every route is within its recorded baseline', () => {
    const measured = scanRoutes(APP)

    if (process.env.PERF_WATERFALL_WRITE === '1') {
      writeFileSync(BASELINE, JSON.stringify(measured, null, 2) + '\n')
    }

    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as typeof measured
    const byRoute = new Map(baseline.map((r) => [r.route, r.awaits]))

    const grew: string[] = []
    for (const { route, awaits } of measured) {
      const before = byRoute.get(route)
      if (before === undefined) {
        // A NEW page is a failure, not a pass: a baseline that silently stops
        // covering new routes is the failure mode this whole file exists against.
        grew.push(`${route}: new page (${awaits.length} sequential reads) — record it deliberately`)
        continue
      }
      const added = awaits.filter((name) => !before.includes(name))
      if (awaits.length > before.length || added.length > 0) {
        grew.push(
          `${route}: ${before.length} → ${awaits.length} sequential reads` +
            (added.length > 0 ? ` (new: ${added.join(', ')})` : ''),
        )
      }
    }

    expect(grew, `sequential server reads grew:\n  ${grew.join('\n  ')}`).toEqual([])
  })

  /**
   * THE CAPABILITY, PINNED — otherwise it can silently narrow back to pages.
   *
   * The guard's whole failure was reading one kind of file. If a refactor ever
   * returns it to that, these go red rather than the coverage quietly halving.
   */
  it('reads layouts, not only pages', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'read-waterfall.ts'), 'utf8')
    expect(source).toContain("'layout.tsx'")
  })

  it('every authenticated route carries the shell’s reads, not just its own', () => {
    // The five the per-page scan could not see. Asserted as a PROPERTY — every
    // route under (app) carries them — rather than as a count, which would go red
    // on any legitimate change to a single page.
    const routes = scanRoutes(APP).filter((r) => r.route.startsWith('/(app)/'))
    expect(routes.length).toBeGreaterThan(20)
    for (const route of routes) {
      expect(
        route.awaits,
        `${route.route} carries none of the shell's reads — the walk has stopped ` +
          'following layouts, and this guard is back to reading pages only.',
      ).toContain('activeWorkspaceRead')
    }
  })
})
