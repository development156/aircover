import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * The value a Radar draft writes into `posts.origin`, pinned to the column.
 *
 * ── WHY check-constraints.ts IS NOT ENOUGH HERE, THOUGH IT LOOKS LIKE IT ─────
 * That guard exists for exactly this class and it CANNOT SEE THIS SITE. It scans
 * `.eq()`, `.in()` and raw SQL template literals; this value is an object
 * property on an `.insert({ ... })`, reached through a scalar const, and
 * `resolveConstArrays` resolves array consts only.
 *
 * MEASURED 2026-08-23: setting the constant to 'competitor' — a value the CHECK
 * does not admit — left all six of that suite's assertions green. A detector
 * inherits the blind spot of the code it audits, and the blind spot here is a
 * whole call shape, not a missed line.
 *
 * ── AND THE COMMENT ABOVE THE CONSTANT ARGUED FOR THE WRONG VALUE FOR DAYS ───
 * It cited `check (origin in ('manual', 'plan_week'))` and concluded a Radar
 * draft must be stored as 'manual'. Both later widenings — 'playbook', then
 * 'radar' — left the citation standing, so a reader who checked WHY found a
 * migration reference and stopped. This test is what makes the next such drift
 * fail rather than persuade.
 */
describe('the origin a Radar draft is stored under', () => {
  it('is a value posts.origin actually admits', () => {
    const dir = resolve(import.meta.dirname, '../../../../../packages/db/supabase/migrations')
    // Later migrations replace the constraint, so the LAST definition wins.
    let admits: Set<string> | null = null
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.sql')) continue
      const sql = readFileSync(join(dir, file), 'utf8').replace(/--[^\n]*/g, '')
      const m = [...sql.matchAll(/check\s*\(\s*origin\s+in\s*\(([^)]*)\)/gi)].pop()
      if (m) admits = new Set([...m[1]!.matchAll(/'([^']+)'/g)].map((q) => q[1]!))
    }
    expect(admits, 'no `check (origin in (...))` found in any migration').not.toBeNull()

    const source = readFileSync(resolve(import.meta.dirname, 'radar.ts'), 'utf8')
    const declared = /const RADAR_POST_ORIGIN = '([^']+)' as const/.exec(source)
    expect(declared, 'RADAR_POST_ORIGIN not found in radar.ts').not.toBeNull()

    expect([...admits!].sort()).toContain(declared![1])
    // And it is the value that NAMES Radar, not a stand-in. Storing a Radar
    // draft as 'manual' parses fine and makes every "written by a person" query
    // wrong — which is what this file spent its first days doing.
    expect(declared![1]).toBe('radar')
  })
})
