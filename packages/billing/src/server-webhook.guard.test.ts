import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as serverWebhook from './server-webhook'
import * as mainBarrel from './index'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * The structural half of "a fixture-signed webhook must be impossible to accept".
 *
 * `verified.test.ts` proves the Cashfree verifier REJECTS a fixture signature. That is
 * necessary but not sufficient: it only holds while the endpoint calls the Cashfree
 * verifier. These tests prove the endpoint cannot reach any other one — the fixture is
 * absent from this entry point's import graph, so there is no verifier to call by
 * mistake, no flag to invert, and no conditional to short-circuit.
 */

/**
 * Strip comments before scanning for imports.
 *
 * Not optional: `server-webhook.ts` QUOTES the barrel's `export * from './providers/fixture'`
 * in its own header to explain what it is avoiding. A naive scan reads that prose as a real
 * edge and reports the fixture reachable — a false positive that would make this guard fail
 * forever and get deleted as noise. A guard that cries wolf is worse than no guard.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Follow relative imports from a file and return every module reachable from it. */
function importGraph(entry: string, seen = new Set<string>()): Set<string> {
  const abs = resolve(entry)
  if (seen.has(abs)) return seen
  seen.add(abs)
  let src: string
  try {
    src = stripComments(readFileSync(abs, 'utf8'))
  } catch {
    return seen
  }
  const specs = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1] as string)
  for (const spec of specs) {
    const base = resolve(dirname(abs), spec)
    for (const cand of [`${base}.ts`, join(base, 'index.ts'), base]) {
      try {
        if (statSync(cand).isFile()) {
          importGraph(cand, seen)
          break
        }
      } catch {
        /* try the next candidate */
      }
    }
  }
  return seen
}

describe('the webhook entry point cannot reach the fixture provider', () => {
  it('does not export the fixture provider', () => {
    expect(Object.keys(serverWebhook)).not.toContain('createFixtureProvider')
    // …while the main barrel does, which is exactly why the endpoint must not use it.
    expect(Object.keys(mainBarrel)).toContain('createFixtureProvider')
  })

  it('exports nothing whose name mentions the fixture', () => {
    const offenders = Object.keys(serverWebhook).filter((k) => /fixture/i.test(k))
    expect(offenders).toEqual([])
  })

  /** The load-bearing one: reachability, not just the export list. */
  it('never imports providers/fixture.ts, transitively', () => {
    const graph = importGraph(join(HERE, 'server-webhook.ts'))
    const reachable = [...graph].map((p) => p.replace(HERE, '')).sort()
    const fixtureReachable = reachable.filter((p) => /providers[\\/]fixture\.ts$/.test(p))
    expect(fixtureReachable, `reachable modules:\n${reachable.join('\n')}`).toEqual([])
  })

  it('the fixture secret literal appears in no CODE reachable from the entry point', () => {
    const graph = importGraph(join(HERE, 'server-webhook.ts'))
    // Comments are stripped for the same reason as above: these modules document the
    // hazard by name, and documenting it must not count as shipping it.
    const withSecret = [...graph].filter((p) => {
      try {
        return stripComments(readFileSync(p, 'utf8')).includes('fixture-webhook-secret')
      } catch {
        return false
      }
    })
    expect(withSecret).toEqual([])
  })

  it('the fixture IS reachable from the main barrel — proving the exclusion is real, not vacuous', () => {
    const graph = importGraph(join(HERE, 'index.ts'))
    const hit = [...graph].some((p) => /providers[\\/]fixture\.ts$/.test(p))
    expect(hit).toBe(true)
  })
})

describe('the webhook entry point is declared so a route can import it', () => {
  it('package.json exposes ./server-webhook as a subpath export', () => {
    const pkg = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')) as {
      exports: Record<string, string>
    }
    expect(pkg.exports['./server-webhook']).toBe('./src/server-webhook.ts')
  })

  /**
   * Asserts the BINDINGS, not the names.
   *
   * `Object.keys()` alone is not enough and this test caught it: a re-export of a name
   * that does not exist still appears in the module namespace as `undefined`, vitest
   * does not typecheck re-exports, and the assertion passed against three exports that
   * were not real. Only `tsc` found them. Checking the value is a function closes that.
   */
  it('still exposes the ledger path — every credit movement goes through apply_ledger_entry', () => {
    for (const name of [
      'createPgLedgerPort',
      'createProcessPaymentEvent',
      'createApplyPlanGrant',
      'createPgWebhookEventStore',
      'verifyCashfreeWebhook',
      'parseVerifiedCashfreeWebhook',
      // Without these the route cannot stamp an honest mode or find the signing secret,
      // and would fall back to the parser's 'sandbox' default on the live rail.
      'modeForEnv',
      'loadCashfreeWebhookEnv',
      'resolveCashfreeWebhookSecret',
    ] as const) {
      expect(
        serverWebhook[name],
        `${name} must be a real binding, not an undefined re-export`,
      ).toBeTypeOf('function')
    }
  })
})
