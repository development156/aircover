import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The Sunday Loop route's own tests, and the one claim they exist for: a pass
 * that throws is a 5xx.
 *
 * Until 2026-09-02 the catch block answered 200 with `ok: false`, justified by
 * "Vercel retries a failing cron". Vercel's cron documentation describes no
 * retry, and the same comment said a retry would be idempotent anyway. What the
 * 200 actually did was hide a broken weekly plan from every 5xx filter, from
 * Vercel's own cron log and from every alert built on either, while the
 * heartbeat (stamped BEFORE the work) read "alive". The metrics, radar and
 * autopilot siblings already answered 500 for the same condition.
 */

const loop = vi.hoisted(() => ({
  runScheduledLoopCycles: vi.fn(async () => ({ planned: 0, deferred: 0 })),
}))
const heartbeat = vi.hoisted(() => ({ recordCronRun: vi.fn(async () => undefined) }))
const report = vi.hoisted(() => ({ reportServerError: vi.fn() }))

vi.mock('@/lib/cron/run-loop', () => loop)
vi.mock('@/lib/cron/heartbeat-store', () => heartbeat)
vi.mock('@/lib/observability/report', () => report)

const { GET } = await import('./route')

const SECRET = 'cron-secret-for-the-test'

function requestWith(header: string | null): Request {
  return new Request('http://localhost:3000/api/cron/loop', {
    headers: header === null ? {} : { authorization: header },
  })
}

function authorized(): Request {
  return requestWith(`Bearer ${SECRET}`)
}

afterEach(() => {
  vi.unstubAllEnvs()
  loop.runScheduledLoopCycles.mockClear()
  loop.runScheduledLoopCycles.mockImplementation(async () => ({ planned: 0, deferred: 0 }))
  heartbeat.recordCronRun.mockClear()
  report.reportServerError.mockClear()
})

describe('the loop cron route', () => {
  it('answers 500 with the same body shape as its siblings when the pass throws', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SAHODA_LOOP_CRON_MODE', 'on')
    loop.runScheduledLoopCycles.mockRejectedValueOnce(new Error('the pool went away'))

    const response = await GET(authorized())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'LOOP_CRON_FAILED' })
    expect(report.reportServerError).toHaveBeenCalledTimes(1)
  })

  it('answers 200 with the pass result when it runs', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SAHODA_LOOP_CRON_MODE', 'on')

    const response = await GET(authorized())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, planned: 0, deferred: 0 })
    expect(report.reportServerError).not.toHaveBeenCalled()
  })

  it('stamps the heartbeat before the work, so a failing pass still reads as scheduled', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SAHODA_LOOP_CRON_MODE', 'on')
    loop.runScheduledLoopCycles.mockRejectedValueOnce(new Error('boom'))

    await GET(authorized())

    expect(heartbeat.recordCronRun).toHaveBeenCalledWith('loop')
  })

  it('runs nothing and says why when the mode flag is not "on"', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)

    const response = await GET(authorized())

    expect(loop.runScheduledLoopCycles).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true })
  })

  it('refuses an unauthorized caller and runs nothing', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SAHODA_LOOP_CRON_MODE', 'on')

    for (const header of [null, 'Bearer wrong', '']) {
      expect((await GET(requestWith(header))).status).toBe(401)
    }
    expect(loop.runScheduledLoopCycles).not.toHaveBeenCalled()
  })
})
