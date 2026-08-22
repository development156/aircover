import { describe, expect, test } from 'vitest'

import {
  adjudicable,
  adjudicate,
  findComparisons,
  readConstraints,
  repoRoot,
  resolveConstArrays,
} from './check-constraints'

const ROOT = repoRoot()
const CONSTRAINTS = readConstraints(ROOT)
const CONSTS = resolveConstArrays(ROOT)
const COMPARISONS = findComparisons(ROOT, CONSTS)
const ADJUDICATED = adjudicable(COMPARISONS, CONSTRAINTS)

/**
 * The floor, not the count.
 *
 * A guard derived from a scan can quietly examine nothing: rename `.eq(` in a
 * refactor, or move a source root, and every assertion below still passes
 * having inspected zero sites. Pinning a floor means that failure reports
 * itself. Measured 2026-08-22 — raise it, never lower it without saying why.
 */
const MIN_TABLES = 20
const MIN_ADJUDICATED = 40

describe('the extractor is not vacuous', () => {
  test('reads the connections.status CHECK exactly as the server states it', () => {
    // Verified against production the same day:
    //   CHECK ((status = ANY (ARRAY['active','expired','revoked','error'])))
    expect([...(CONSTRAINTS.get('connections')?.get('status') ?? [])].sort()).toEqual([
      'active',
      'error',
      'expired',
      'revoked',
    ])
  })

  test('a later migration replaces the constraint it drops', () => {
    // widen_connection_platform drops connections_platform_check and adds a
    // wider one. Reading files unordered would adjudicate against the set that
    // migration exists to replace.
    const platforms = CONSTRAINTS.get('connections')?.get('platform')
    expect(platforms?.has('instagram')).toBe(true)
    expect(platforms!.size).toBeGreaterThan(3)
  })

  test('resolves a spread allowlist constant to its members', () => {
    expect(CONSTS.get('APPROVABLE_FROM')).toEqual(['idea', 'draft', 'review'])
  })

  test('attributes each filter to its own table inside one Promise.all', () => {
    // readLoopSnapshot issues five `.from()` chains in one array. If the window
    // did not close at the next `.from()`, the connections filter and the
    // memory_events filter would be attributed to each other and both would be
    // adjudicated against the wrong set.
    const loop = COMPARISONS.filter((c) => c.file.endsWith('lib/loop/read.ts'))
    const tables = new Set(loop.map((c) => c.table))
    expect(tables.has('connections')).toBe(true)
    expect(tables.has('memory_events')).toBe(true)
    for (const c of loop) {
      if (c.values.includes('insight')) expect(c.table).toBe('memory_events')
    }
  })

  test('inspected enough of the repo to mean anything', () => {
    expect(CONSTRAINTS.size).toBeGreaterThanOrEqual(MIN_TABLES)
    expect(ADJUDICATED.length).toBeGreaterThanOrEqual(MIN_ADJUDICATED)
  })
})

describe('no column is compared against a value its CHECK forbids', () => {
  test('every comparison in the repo is a value that can exist', () => {
    const mismatches = adjudicate(COMPARISONS, CONSTRAINTS)
    const report = mismatches
      .map(
        (m) =>
          `${m.file}:${m.line}\n` +
          `      ${m.form}\n` +
          `      ${m.table}.${m.column} admits only: ${m.admits.sort().join(', ')}\n` +
          `      impossible: ${m.impossible.join(', ')} — this filter matches NOTHING, always.`,
      )
      .join('\n\n')
    expect(report, `\n\n${report}\n`).toBe('')
  })
})
