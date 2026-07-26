import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The cron path is written down in three places that cannot see each other: the schedule
 * in vercel.json, the route file's location on disk, and the public-route list in the
 * Clerk middleware. Every pairing of those has a silent failure mode.
 *
 * · Schedule without a route — Vercel invokes it anyway and logs a 404 (documented
 *   behaviour), so the cron job looks alive while nothing runs.
 * · Route without a middleware entry — `auth.protect()` answers a redirect to /sign-in,
 *   and cron does not follow redirects. Every tick reports success and sweeps nothing.
 * · Middleware entry without a route — a public hole waiting for whatever lands there.
 *
 * None of those fails a normal test, and the first two look green in the dashboard. So
 * this reads the three real files and requires them to agree.
 */
const WEB = resolve(import.meta.dirname, '../../..')

const vercelConfig = JSON.parse(readFileSync(resolve(WEB, 'vercel.json'), 'utf8')) as {
  crons?: { path: string; schedule: string }[]
}
const middleware = readFileSync(resolve(WEB, 'src/middleware.ts'), 'utf8')

describe('cron wiring', () => {
  it('schedules exactly one sweep job, every five minutes', () => {
    expect(vercelConfig.crons).toHaveLength(1)
    expect(vercelConfig.crons![0]).toEqual({
      path: '/api/cron/sweeps',
      schedule: '*/5 * * * *',
    })
  })

  it('points at a route handler that exists on disk', () => {
    for (const cron of vercelConfig.crons ?? []) {
      const route = resolve(WEB, 'src/app', `.${cron.path}`, 'route.ts')
      expect(existsSync(route), `no route handler for ${cron.path}`).toBe(true)
    }
  })

  it('exempts every cron path from Clerk, or the tick is a redirect that does nothing', () => {
    for (const cron of vercelConfig.crons ?? []) {
      expect(middleware, `${cron.path} is not public in middleware.ts`).toContain(`'${cron.path}'`)
    }
  })

  it('exempts them as exact paths, never as a prefix pattern', () => {
    // A `/api/cron(.*)` entry would make every future route under that prefix public the
    // moment it lands - the standing hole the middleware's own comment warns about.
    const publicList = middleware.match(/createRouteMatcher\(\[([^\]]*)\]\)/)?.[1] ?? ''
    const cronEntries = publicList
      .split(',')
      .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
      .filter((entry) => entry.startsWith('/api'))

    expect(cronEntries).toEqual(['/api/cron/sweeps'])
    for (const entry of cronEntries) expect(entry).not.toContain('(.*)')
  })

  it('the route checks the shared secret before anything else', () => {
    // Placement is the property: a header read or a query above this line would be
    // reachable by anyone on the internet.
    const route = readFileSync(resolve(WEB, 'src/app/api/cron/sweeps/route.ts'), 'utf8')
    const body = route.slice(route.indexOf('export async function GET'))
    const firstStatement = body.indexOf('if (')
    const firstAwait = body.indexOf('await')

    expect(firstStatement).toBeGreaterThan(-1)
    expect(body.slice(firstStatement, firstStatement + 200)).toContain('isAuthorizedCronRequest')
    expect(firstAwait).toBeGreaterThan(firstStatement)
  })
})
