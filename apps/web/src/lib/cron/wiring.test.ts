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

/**
 * The shortest gap between two firings of a schedule, in seconds.
 *
 * Only the shapes vercel.json actually uses are understood, and an unknown shape
 * THROWS rather than returning a generous default: a schedule this cannot read is
 * a schedule the ceiling check below would otherwise wave through.
 */
function minIntervalSeconds(schedule: string): number {
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5) throw new Error(`not a five-field cron schedule: "${schedule}"`)
  const [minute, hour, dom, month, dow] = fields as [string, string, string, string, string]
  if (dom !== '*' || month !== '*') throw new Error(`unrecognised schedule shape: "${schedule}"`)

  const everyN = minute.match(/^\*\/(\d+)$/)
  if (everyN && hour === '*' && dow === '*') return Number(everyN[1]) * 60
  if (!/^\d+$/.test(minute)) throw new Error(`unrecognised minute field: "${schedule}"`)
  if (hour === '*' && dow === '*') return 60 * 60
  if (!/^\d+$/.test(hour)) throw new Error(`unrecognised hour field: "${schedule}"`)
  if (dow === '*') return 24 * 60 * 60
  if (/^\d$/.test(dow)) return 7 * 24 * 60 * 60
  throw new Error(`unrecognised day-of-week field: "${schedule}"`)
}

describe('cron wiring', () => {
  it('schedules exactly the seven jobs, on their own cadences', () => {
    // Pinned as a SET of exact entries rather than a count, so a job cannot
    // arrive quietly and so a schedule cannot be edited without a decision. It
    // did its job when the third arrived, and again when the fourth did — the
    // sibling assertion below caught that `/api/cron/playbooks` had been given a
    // schedule and NOT a Clerk exemption, which is the shape where the heartbeat
    // reports green while every tick is a 307 to /sign-in.
    //
    // The three cadences are not interchangeable. The metric pass is a separate
    // job because `post_metric_snapshots` is keyed by DAY, so riding the
    // five-minute tick would spend one Zernio request per published channel,
    // 288 times a day, to write nothing on 287 of them. 01:20 UTC is 06:50 IST
    // — past midnight in India, before the working day.
    //
    // The Loop is weekly and lands on Sunday, which is FSD M2's trigger:
    // "Sunday 21:00 workspace-local". 21:00 UTC is the compromise a single
    // global cron forces — per-workspace local time needs a row-driven
    // scheduler, and `loop_settings.plan_at_minute` exists for the day it does.
    //
    // The Playbook check is DAILY, and that follows from what a playbook's
    // window is: a seven-day lead time checked once a week would miss a festival
    // outright whenever the check landed on the wrong side of it. 06:00 UTC is
    // 11:30 IST — inside the working day, so a preview waiting for approval is
    // seen the day it appears rather than the morning after.
    //
    // The Radar scan is WEEKLY because that is the cadence the product PROMISES:
    // /radar tells the reader "one scan per business per week" and prices it per
    // scan, so a nightly pass would charge seven times what the screen says. It
    // is the only cron here whose wrong cadence is a BILLING error rather than a
    // freshness one. Monday 03:40 UTC is 09:10 IST — the readings are waiting at
    // the start of the week rather than arriving mid-week.
    // The Marketing Brain pass is weekly and lands half an hour after the Loop.
    // Weekly because it describes a HABIT: it compares two runs of published
    // posts, and a daily re-run would recompute the same two arms and write the
    // same sentence. Half an hour after rather than at the same minute so the
    // two weekly jobs are not competing for function concurrency on the one
    // evening they both fire. It spends nothing, which is why it has no
    // enable-flag of its own and the Loop next door does.
    expect(vercelConfig.crons).toEqual([
      { path: '/api/cron/sweeps', schedule: '*/5 * * * *' },
      { path: '/api/cron/metrics', schedule: '20 1 * * *' },
      { path: '/api/cron/loop', schedule: '0 21 * * 0' },
      { path: '/api/cron/playbooks', schedule: '0 6 * * *' },
      { path: '/api/cron/radar', schedule: '40 3 * * 1' },
      { path: '/api/cron/brain', schedule: '30 21 * * 0' },
      // Added 2026-08-30 with the autopilot tick. Deliberate, and this guard
      // failing is what made it deliberate. The cadence is set by the CANCEL
      // WINDOW rather than by how often there is work: a customer is promised
      // minutes to change their mind, and an hourly tick would let a post sit
      // past a five-minute window for fifty-five minutes and then send it.
      { path: '/api/cron/autopilot', schedule: '*/10 * * * *' },
    ])
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
    // ── THE COMMENT STRIP IS LOAD-BEARING, AND ITS ABSENCE HID TWO ENTRIES ──
    // This used to split the captured block on commas and keep whatever started
    // with `/api`. An entry preceded by an explanatory comment lands in the same
    // comma-separated segment as that comment, so after `trim()` the segment starts
    // with `//` and was filtered straight out.
    //
    // MEASURED 2026-08-19: `/api/webhooks/cashfree` — a PUBLIC endpoint that takes
    // payment webhooks — has a comment above it and was therefore invisible to this
    // guard for as long as it has existed, while the note below claimed adding a
    // public /api route "still fails here first". It did not. The strip is what
    // makes that sentence true.
    const publicList = middleware.match(/createRouteMatcher\(\[([^\]]*)\]\)/)?.[1] ?? ''
    const apiEntries = publicList
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
      .split(',')
      .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
      .filter((entry) => entry.startsWith('/api'))

    // Pinned as a SET, not a count. Widened on 2026-07-28 when the wt-admin merge brought
    // three more public /api routes, each authenticating itself in-route (Turnstile on the
    // beta form, a constant-time x-ops-token compare on ingest, the Clerk webhook
    // signature). Adding a public /api route fails here first, so it stays a deliberate
    // act rather than a quiet one — which, as the note above records, was the intent
    // from the start and only became true of a COMMENTED entry on 2026-08-19.
    expect(new Set(apiEntries)).toEqual(
      new Set([
        '/api/cron/sweeps',
        '/api/cron/metrics',
        // Added 2026-08-20 with the weekly Loop cycle. Deliberate: this guard
        // failing is what made it deliberate. It authenticates itself in-route
        // with isAuthorizedCronRequest, which fails closed on an unset secret.
        '/api/cron/loop',
        // Added 2026-08-22 with the daily Playbook check, for the same reason
        // and by the same route: this guard's sibling failed first, because the
        // schedule had been declared in vercel.json and the exemption had not.
        // The route authenticates itself in-route and spends nothing — it
        // proposes and halts at the cost preview.
        '/api/cron/playbooks',
        '/api/cron/radar',
        '/api/cron/brain',
        // Added 2026-08-30 with the autopilot tick, and this guard's sibling is
        // what caught it: the schedule had been declared in vercel.json and the
        // exemption had not, which is the exact shape where the heartbeat
        // reports green while every tick is a 307 to /sign-in. It authenticates
        // itself in-route and does no work at all unless
        // SAHODA_AUTOPILOT_ENABLED is set.
        '/api/cron/autopilot',
        '/api/public/beta-apply',
        // Door one into `leads`, added 2026-08-21. Deliberate for the same reason
        // /api/cron/loop was: this guard failing is what made it deliberate. It
        // authenticates itself in-route in three steps before the database is
        // reached — a per-IP rate limit, a zod schema carrying the honeypot, and
        // Turnstile — and the service-role RPC underneath takes a site SLUG and
        // no workspace id, so the elevated write cannot be aimed at a tenant a
        // caller names.
        '/api/public/site-lead',
        '/api/admin/devops/ingest',
        '/api/webhooks/clerk',
        // Present in middleware.ts since the 2026-07-28 merge and absent from this
        // set until 2026-08-19 — not because anyone decided it, but because the
        // parse above could not see it. Listed now, which is the point.
        '/api/webhooks/cashfree',
        // Added 2026-08-21 with the Zernio webhook receiver. Deliberate, and this
        // guard failing is what made it deliberate — it caught the entry even
        // though a ten-line comment sits directly above it in middleware.ts, which
        // is the case the 2026-08-19 comment strip was added for. The note above
        // is now demonstrated rather than asserted.
        '/api/webhooks/zernio',
      ]),
    )
    for (const entry of apiEntries) expect(entry).not.toContain('(.*)')
  })

  /**
   * ── THE THIRD PLACE, WHICH THIS FILE COULD NOT SEE ─────────────────────────
   * The header above names three places a cron path is written down. There are
   * FOUR. `config.matcher` at the bottom of middleware.ts decides whether Clerk
   * RUNS at all, and `isPublicRoute` only decides what it DOES once it has run.
   * middleware.ts says so itself, at length: a bearer token of `aaa.bbb.ccc`
   * throws inside Clerk's decode BEFORE our callback executes, and production
   * answered 500 MIDDLEWARE_INVOCATION_FAILED on every matched path. The only
   * bypass that works is exclusion from the matcher.
   *
   * So a cron path listed in `isPublicRoute` but absent from `config.matcher`
   * still ticks correctly — and is crashable by one header from anyone on the
   * internet. Every assertion in this file passed in that state.
   *
   * Both patterns need it: the second matcher catches everything under /api on
   * its own, so excluding a path from the first alone does nothing.
   */
  it('excludes every cron path from BOTH middleware matchers, not just the public list', () => {
    // COMMENTS STRIPPED FIRST, for the same reason the test above strips them —
    // and this one earned it on its first run. The config block's own comment
    // quotes two example patterns, so a naive scan found THREE matchers and
    // would have been asserting against prose.
    const matchers = middleware
      .slice(middleware.indexOf('export const config'))
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
    const patterns = [...matchers.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]!)
    expect(patterns.length, `expected 2 matcher patterns, found ${patterns.length}`).toBe(2)

    for (const cron of vercelConfig.crons ?? []) {
      const anchored = `${cron.path.slice(1)}$`
      for (const [i, pattern] of patterns.entries()) {
        expect(pattern, `${cron.path} is not excluded from matcher ${i}`).toContain(anchored)
      }
    }
  })

  /**
   * ── THE SCHEDULE AND THE ROUTE'S OWN CEILING ARE TWO FILES, AND THEY DISAGREED ─
   * `/api/cron/sweeps` declared `maxDuration = 300` beside a comment saying the
   * tick was "still inside the five-minute cron interval so a tick cannot
   * straddle the next one". Five minutes IS 300 seconds. A tick that ran to its
   * ceiling would still be publishing when the next one was dispatched — the
   * exact overlap the post_variants claim exists to survive, promised away by a
   * comment that nothing read. This reads both files.
   *
   * Strictly below, never equal: equality is the case that was wrong.
   */
  it('gives every cron route a maxDuration strictly below its own interval', () => {
    for (const cron of vercelConfig.crons ?? []) {
      const route = readFileSync(resolve(WEB, 'src/app', `.${cron.path}`, 'route.ts'), 'utf8')
      const declared = route.match(/^export const maxDuration = (\d+)$/m)?.[1]
      expect(declared, `${cron.path} declares no maxDuration`).toBeDefined()

      const interval = minIntervalSeconds(cron.schedule)
      expect(
        Number(declared),
        `${cron.path}: maxDuration ${declared}s is not below its ${interval}s interval`,
      ).toBeLessThan(interval)
    }
  })

  it('reads the schedule shapes vercel.json uses, and refuses one it does not', () => {
    // Pinned so the check above cannot pass by misreading a schedule as longer
    // than it is. The five-minute case is the one that was wrong.
    expect(minIntervalSeconds('*/5 * * * *')).toBe(300)
    expect(minIntervalSeconds('*/10 * * * *')).toBe(600)
    expect(minIntervalSeconds('20 1 * * *')).toBe(86_400)
    expect(minIntervalSeconds('0 21 * * 0')).toBe(604_800)
    // A shape this cannot read must not be waved through as "long enough".
    expect(() => minIntervalSeconds('0 0 1 * *')).toThrow(/unrecognised/)
    expect(() => minIntervalSeconds('0 9 * * 1-5')).toThrow(/unrecognised/)
  })

  it('every cron route checks the shared secret before anything else', () => {
    // Placement is the property: a header read or a query above this line would be
    // reachable by anyone on the internet. Driven off the schedule rather than
    // naming one file, so a new job cannot be added without inheriting the check.
    for (const cron of vercelConfig.crons ?? []) {
      const route = readFileSync(resolve(WEB, 'src/app', `.${cron.path}`, 'route.ts'), 'utf8')
      const body = route.slice(route.indexOf('export async function GET'))
      const firstStatement = body.indexOf('if (')
      const firstAwait = body.indexOf('await')

      expect(firstStatement, `${cron.path} has no guard at all`).toBeGreaterThan(-1)
      expect(body.slice(firstStatement, firstStatement + 200)).toContain('isAuthorizedCronRequest')
      expect(firstAwait, `${cron.path} awaits before it authorises`).toBeGreaterThan(firstStatement)
    }
  })
})
