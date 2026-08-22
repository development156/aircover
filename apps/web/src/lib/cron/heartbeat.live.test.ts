import { afterAll, describe, expect, it } from 'vitest'

import { claimAlertSlot } from './alert'
import { CRON_SCHEDULES, heartbeatVerdict, type CronJob } from './heartbeat'
import { readCronRun, recordCronRun } from './heartbeat-store'

/**
 * The heartbeat, against REAL Upstash.
 *
 *   set -a; source .env; set +a
 *   npx vitest run --config vitest.live.config.ts src/lib/cron/heartbeat.live.test.ts
 *
 * ── WHY THIS FILE HAD TO EXIST ───────────────────────────────────────────────
 * `heartbeat.test.ts` is a good suite and it could not have caught the defect
 * this one found on its first run. It tests the VERDICT function, which is pure.
 * The store and the alert claim are `fetch` against a URL we build ourselves,
 * and a unit test that mocks fetch asserts our own idea of that URL back to us.
 *
 * MEASURED 2026-08-22: `?NX=true&EX=n` — the form `claimAlertSlot` had always
 * sent — answers **HTTP 400 `ERR syntax error`**, because `NX` is a Redis FLAG
 * and not a parameter with a value. The claim therefore failed on every call,
 * every alarming job was recorded as `suppressed`, and no alert had ever been
 * sent or ever could be. A watchdog that cannot bark is worse than no watchdog,
 * because the dashboard shows one.
 *
 * So: the watchdog itself needs a check that touches the real thing. That is
 * this file, and it is the reason it uses a THROWAWAY job namespace rather than
 * the production keys — a test must not stamp a heartbeat that would make a
 * genuinely stopped job look alive.
 */

const LIVE = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

// Not a real CronJob. Cast at the boundary so the store writes
// `sahoda:cron:lastrun:__probe_…` and never a key production reads.
const stamp = `${Date.now().toString(36)}`
const PROBE = `__probe_${stamp}` as CronJob

async function forget(key: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, '')
  await fetch(`${url}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    cache: 'no-store',
  })
}

afterAll(async () => {
  if (!LIVE) return
  await forget(`sahoda:cron:lastrun:${PROBE}`)
  await forget(`sahoda:cron:alerted:${PROBE}`)
})

describe.skipIf(!LIVE)('the store, against real Upstash', () => {
  it('reads null for a key that was never written — not 0, which would be 1970', () => {
    // Guarded because Number(null) is 0 and 0 is a VALID timestamp: it would read
    // as an ancient beat, i.e. "stopped", instead of "we know nothing".
    return expect(readCronRun(PROBE)).resolves.toBeNull()
  })

  it('round-trips a stamp through the real service', async () => {
    const at = 1_755_870_000_000
    await recordCronRun(PROBE, at)
    await expect(readCronRun(PROBE)).resolves.toBe(at)
  })

  it('survives the colon-separated key surviving encodeURIComponent', async () => {
    // `sahoda:cron:lastrun:x` is percent-encoded into the path. Upstash decodes
    // it — VERIFIED by KEYS, which lists the key with its colons intact — so the
    // key a human greps for in the console is the key we think we wrote.
    const url = process.env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, '')
    const res = await fetch(`${url}/keys/${encodeURIComponent(`sahoda:cron:lastrun:${PROBE}`)}`, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      cache: 'no-store',
    })
    const body = (await res.json()) as { result: string[] }
    expect(body.result).toEqual([`sahoda:cron:lastrun:${PROBE}`])
  })
})

describe.skipIf(!LIVE)('the alert claim, against real Upstash', () => {
  it('claims once and DECLINES the second time inside the window', async () => {
    // The exact behaviour the suppression window depends on, and the exact call
    // that answered 400 for as long as it existed.
    await expect(claimAlertSlot(PROBE, Date.now())).resolves.toBe('claimed')
    await expect(claimAlertSlot(PROBE, Date.now())).resolves.toBe('declined')
  })

  it('reports `unavailable` — never `declined` — when it cannot reach the store', async () => {
    // A broken rail must not be reported as healthy restraint. Driven by pointing
    // the client at a host that cannot answer.
    const url = process.env.UPSTASH_REDIS_REST_URL
    process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:1'
    try {
      await expect(claimAlertSlot(PROBE, Date.now())).resolves.toBe('unavailable')
    } finally {
      process.env.UPSTASH_REDIS_REST_URL = url
    }
  })
})

/**
 * THE POINT OF THE WHOLE MODULE: a job that did not run.
 *
 * Nothing throws here. Nothing returns an error. The only input is a timestamp
 * that is older than the schedule allows — which is exactly what a cron that
 * stopped being CALLED leaves behind, and exactly what every error-shaped alarm
 * in this codebase is blind to.
 */
describe.skipIf(!LIVE)('a MISSED run, end to end through the real store', () => {
  it.each(Object.keys(CRON_SCHEDULES) as CronJob[])(
    'writes a stale stamp for %s and the verdict says it has stopped',
    async (job) => {
      const schedule = CRON_SCHEDULES[job]
      const now = Date.now()
      // One millisecond past the allowance — the boundary, not a comfortable margin.
      const lastRun = now - schedule.periodMs * schedule.missesBeforeStopped - 1

      await recordCronRun(PROBE, lastRun)
      const readBack = await readCronRun(PROBE)
      expect(readBack, 'the store must return what it was given').toBe(lastRun)

      const verdict = heartbeatVerdict(job, readBack, now)
      expect(verdict.state).toBe('stopped')
      expect(verdict.alarming).toBe(true)
      expect(verdict.label).toMatch(/has stopped/)
    },
  )

  it('a run that happened one tick ago is NOT alarming — the guard can go green too', async () => {
    const now = Date.now()
    await recordCronRun(PROBE, now - 1000)
    const verdict = heartbeatVerdict('sweeps', await readCronRun(PROBE), now)
    expect(verdict.state).toBe('beating')
    expect(verdict.alarming).toBe(false)
  })
})
