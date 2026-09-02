import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The sweeps route wires two hooks that nothing at runtime can miss if they are absent.
 *
 * `ReconcileSweepDeps.onFailure` is described in apps/jobs/src/reconcile/failures.ts as
 * "the only place the real error survives" — and this route built the deps without it,
 * so it was never reached: every per-row cause was classified to a code and dropped. The
 * dispatch sweep's `onFailure` is the same hook for the same reason. Neither has a
 * runtime symptom: the tick answers 200, the counters say `failed: 25`, and Sentry has
 * nothing. So the wiring is asserted from the source.
 *
 * The route cannot be imported here: it pulls the runtime pool, the Zernio client and
 * `server-only`, none of which a unit test may open.
 *
 * WHAT IT CANNOT SEE: this reads the route's text, not its behaviour. It cannot see a
 * hook that is wired but never called, a `reportServerError` whose sink is disabled in
 * the deployment, or a rename of either helper that keeps the substring; the sweep
 * tests in apps/jobs prove the hooks are CALLED, this file only proves they are PASSED.
 */
const source = readFileSync(resolve(import.meta.dirname, 'route.ts'), 'utf8')

/** The text of one call, from its opening name to the matching close. */
function callBlock(name: string): string {
  const start = source.indexOf(`${name}(`)
  expect(start, `${name}( not found in route.ts`).toBeGreaterThan(-1)
  let depth = 0
  for (let i = start + name.length; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1
    if (source[i] === ')') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`unbalanced call: ${name}`)
}

describe('the sweeps route hands every per-row failure to Sentry', () => {
  it('wires onFailure into the reconcile deps', () => {
    const block = callBlock('reconcileSweepDeps')
    expect(block).toMatch(/onFailure:\s*\(e\)\s*=>\s*reportServerError\(e\.error/)
    expect(block).toContain('action: `cron:reconcile:')
  })

  it('wires onFailure into the dispatch sweep', () => {
    const block = callBlock('runDispatchSweep')
    expect(block).toMatch(/onFailure:\s*\(e\)\s*=>\s*reportServerError\(e\.error/)
    expect(block).toContain('action: `cron:dispatch:')
  })

  it('passes the claim lease to the dispatch sweep, from the constant the claim uses', () => {
    // A dead publisher's variant is re-dispatched only if the classifier and
    // `claimVariant` read the same number.
    const block = callBlock('runDispatchSweep')
    expect(block).toContain('leaseSeconds: PUBLISH_LEASE_SECONDS')
    expect(source).toMatch(/PUBLISH_LEASE_SECONDS,[\s\S]*?\} from '@sahoda\/jobs\/publish'/)
  })
})
