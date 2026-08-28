import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY SCHEDULED ROUTE, CHECKED FOR THE TWO SHAPES THAT TAKE A DATABASE DOWN.
 *
 * ── THE TWO DEFECTS, BOTH FOUND ON /api/cron/loop ────────────────────────────
 * 1. NO `maxDuration`. Vercel's default is 10 seconds and one workspace's cycle
 *    is a paid model call measured at 14. Without the export the FIRST
 *    workspace could not finish: torn down mid-plan, after a cycle row was
 *    written and possibly after the ledger took a hold, leaving a cycle stuck
 *    in `planning` that no later tick reopens — the one-live-cycle-per-week
 *    index sees it and declines.
 * 2. A pg POOL PER ITERATION. `new Pool({ max: 10 })` inside the per-workspace
 *    loop, never closed: fifty-one pools and up to 510 connections opened by a
 *    single scheduled request and held until the function is torn down.
 *
 * Both were fixed on the loop route and both are shapes, not incidents — the
 * same mistake is one refactor away on any of the other five. This is the
 * cheapest check that covers all of them, and it covers routes that do not
 * exist yet, which is the half a per-route test cannot do.
 *
 * ── WHY THE SOURCE TEXT AND NOT AN IMPORT ────────────────────────────────────
 * `maxDuration` is a build-time export Next reads out of the module; importing
 * these routes would pull `server-only`, a Clerk middleware seam and a live
 * billing env into a unit test to learn one number that is written on line 60.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * It reads the route FILE and nothing the route calls. A pool built per
 * workspace inside `run-loop.ts`, or inside any other module a handler reaches,
 * is invisible here — which is where the real leak lived, and why
 * `run-loop-resources.test.ts` counts pools through a stubbed port rather than
 * by reading text. It also cannot see a `maxDuration` that is re-exported from
 * another module, a loop written as `.forEach` or `.map` rather than `for` or
 * `while`, an authorisation check reached through a wrapper by another name, or
 * a route whose handler is not `export async function GET`. Each of those would
 * pass this scan while breaking what it is scanning for.
 */

const CRON_DIR = resolve(import.meta.dirname, '../../app/api/cron')

/** Every scheduled route in the tree, discovered rather than listed. */
const ROUTES = readdirSync(CRON_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => ({ name: e.name, path: resolve(CRON_DIR, e.name, 'route.ts') }))

/** Comments stripped: the prose in these files discusses both defects at length. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('every scheduled route', () => {
  it('finds the routes at all, so an empty sweep cannot pass', () => {
    // A glob that stops matching is a suite that runs nothing and reports
    // green. This repo has been bitten by that five times in package configs.
    expect(ROUTES.length).toBeGreaterThanOrEqual(6)
  })

  it.each(ROUTES)('$name declares a maxDuration', ({ path }) => {
    expect(code(path)).toMatch(/export const maxDuration = \d+/)
  })

  it.each(ROUTES)('$name runs on the Node runtime, never at build time', ({ path }) => {
    const src = code(path)
    expect(src).toContain("export const runtime = 'nodejs'")
    expect(src).toContain("export const dynamic = 'force-dynamic'")
  })

  /**
   * A route that constructs its own Pool is not wrong; constructing one PER
   * ITERATION is. The narrow, honest check a source scan can make is that no
   * route builds a pool inside a loop body — anything more would be a guess
   * about control flow from text.
   */
  it.each(ROUTES)('$name opens no pool inside a loop', ({ path }) => {
    const src = code(path)
    const loopAt = src.search(/\b(for|while)\s*\(/)
    if (loopAt === -1) return
    expect(src.slice(loopAt)).not.toMatch(/new Pool\(|createPgLedgerPort\(/)
  })

  /**
   * Authorisation before work, on every one of them. These routes are excluded
   * from Clerk's middleware — they have to be, Vercel cron does not follow a
   * redirect to /sign-in — so this check is the only thing in front of a public
   * endpoint that writes to customer data.
   */
  it.each(ROUTES)('$name checks authorisation before it awaits anything', ({ path }) => {
    const src = code(path)
    const handlerAt = src.indexOf('export async function GET')
    expect(handlerAt).toBeGreaterThan(-1)
    // Measured from INSIDE the handler. The import at the top of the file also
    // names the function, and comparing against that only ever proved the
    // import statement comes first, which it always does.
    const body = src.slice(handlerAt)
    const authAt = body.indexOf('isAuthorizedCronRequest')
    expect(authAt).toBeGreaterThan(-1)
    const firstAwait = body.indexOf('await ')
    if (firstAwait !== -1) expect(authAt).toBeLessThan(firstAwait)
  })
})
