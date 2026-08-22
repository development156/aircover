import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { scanRoutes, waterfallOf } from './read-waterfall'

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
})
