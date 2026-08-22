import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { accessPatternsSeen, findScanners } from './scanner-registry.mjs'

/**
 * The guard on the guards.
 *
 * This repository has shipped the same defect four times: a scanner that
 * understands ONE access pattern, finds the call sites written in that pattern,
 * and certifies the ones written in another. The connections.status scanner
 * cleared the cron because the cron uses raw SQL. `wiring.test.ts` cleared a
 * public payment webhook because the entry had a comment above it.
 *
 * No test can decide whether a regex is right. What it can do is refuse to let a
 * NEW scanner arrive without saying, in its own text, what it cannot see —
 * because every one of those four would have been caught by a sentence.
 *
 * The existing 50 are grandfathered in `ops/lint-baselines/scanners.json`, which
 * can shrink and can never grow. Same ratchet the design lint uses, and for the
 * same reason: a rule that fails on day one is a rule someone deletes.
 *
 * ── WHAT THIS CANNOT SEE, since it is subject to its own rule ────────────────
 *  · whether a declared limit is TRUE, or complete, or still current;
 *  · a scanner that reaches source some way `READS_SOURCE` does not name —
 *    `fs/promises`, a bundler plugin, a shell helper it imports;
 *  · a scanner living outside *.test.ts / *.test.mjs / *.test.tsx, which is why
 *    `scripts/lint.mjs` and `scripts/design/design-lint.mjs` are audited by hand
 *    in docs/35 rather than here;
 *  · anything in a file git ignores.
 */

const REPO = resolve(import.meta.dirname, '../..')
const BASELINE = resolve(REPO, 'ops/lint-baselines/scanners.json')

const scanners = findScanners(REPO)
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))

describe('every scanner declares what it is blind to', () => {
  it('finds the scanners by git grep, not by a list — a new one cannot hide', () => {
    // If this ever drops to a handful, the enumeration broke and every
    // assertion below became vacuously true.
    expect(scanners.length).toBeGreaterThan(40)
  })

  it('no NEW scanner arrives without declaring its blind spot', () => {
    const undeclared = scanners.filter((s) => !s.declaresLimit).map((s) => s.file)
    const added = undeclared.filter((f) => !baseline.undeclared.includes(f))

    expect(
      added,
      `These read source but never say what they cannot see. Add a sentence — ` +
        `"WHAT IT CANNOT SEE: …" — naming the access pattern the scan would miss ` +
        `(raw SQL, an RPC, a dynamic import, a commented entry, a template literal).`,
    ).toEqual([])
  })

  it('the baseline can only shrink', () => {
    const undeclared = scanners.filter((s) => !s.declaresLimit).map((s) => s.file)
    expect(
      undeclared.length,
      `${baseline.undeclared.length - undeclared.length} scanner(s) gained a declaration — ` +
        `run \`node scripts/lib/scanner-registry.test.mjs --update-baseline\` to lock the gain in.`,
    ).toBeLessThanOrEqual(baseline.undeclared.length)
  })

  it('a stale baseline entry cannot sit there forever', () => {
    // A file listed in the baseline that no longer exists, or that now declares
    // its limit, is a lie the ratchet would carry indefinitely.
    const current = new Set(scanners.map((s) => s.file))
    const gone = baseline.undeclared.filter((f) => !current.has(f))
    expect(gone, 'baseline names files that are no longer scanners — remove them').toEqual([])
  })
})

describe('the pattern detector itself', () => {
  it('separates a PostgREST reader from a raw-SQL one', () => {
    // The exact distinction the connections.status scanner could not make.
    expect(
      accessPatternsSeen(`await db.from('connections').select('status')`).postgrestBuilder,
    ).toBe(true)
    const raw = accessPatternsSeen(`await client.query('select status from connections')`)
    expect(raw.rawSql).toBe(true)
    expect(raw.postgrestBuilder).toBe(false)
  })

  it('sees an RPC call, which neither of the above resembles', () => {
    expect(accessPatternsSeen(`await db.rpc('apply_ledger_entry', {})`).rpc).toBe(true)
  })

  it('sees a dynamic import, which no static table scan follows', () => {
    expect(accessPatternsSeen('const m = await import("./x")').dynamicImport).toBe(true)
  })

  it('reports nothing for source that reaches for none of them', () => {
    const p = accessPatternsSeen('export const A = 1')
    expect(Object.values(p).every((v) => v === false)).toBe(true)
  })
})

if (process.argv.includes('--update-baseline')) {
  const undeclared = scanners.filter((s) => !s.declaresLimit).map((s) => s.file)
  if (undeclared.length > baseline.undeclared.length) {
    console.error('refusing to RAISE the baseline')
    process.exit(1)
  }
  writeFileSync(BASELINE, `${JSON.stringify({ undeclared }, null, 2)}\n`)
  console.log(`baseline: ${baseline.undeclared.length} → ${undeclared.length}`)
}
