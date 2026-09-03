import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The Playbooks daily tick's own tests. The claim they exist for: a tick that
 * throws is a 5xx, so Vercel's cron log and every 5xx filter can see it. The
 * catch block answered 200 with `ok: false` until 2026-09-02; see the loop
 * route's test for the full account.
 */

const playbooks = vi.hoisted(() => ({
  runScheduledPlaybooks: vi.fn(async () => ({ opened: 0, skipped: 0 })),
}))
const heartbeat = vi.hoisted(() => ({ recordCronRun: vi.fn(async () => undefined) }))
const report = vi.hoisted(() => ({ reportServerError: vi.fn() }))

vi.mock('@/lib/cron/run-playbooks', () => playbooks)
vi.mock('@/lib/cron/heartbeat-store', () => heartbeat)
vi.mock('@/lib/observability/report', () => report)

const { GET } = await import('./route')

const SECRET = 'cron-secret-for-the-test'

function requestWith(header: string | null): Request {
  return new Request('http://localhost:3000/api/cron/playbooks', {
    headers: header === null ? {} : { authorization: header },
  })
}

function authorized(): Request {
  return requestWith(`Bearer ${SECRET}`)
}

afterEach(() => {
  vi.unstubAllEnvs()
  playbooks.runScheduledPlaybooks.mockClear()
  playbooks.runScheduledPlaybooks.mockImplementation(async () => ({ opened: 0, skipped: 0 }))
  heartbeat.recordCronRun.mockClear()
  report.reportServerError.mockClear()
})

describe('the playbooks cron route', () => {
  it('answers 500 with the same body shape as its siblings when the tick throws', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SAHODA_PLAYBOOKS_CRON_MODE', 'on')
    playbooks.runScheduledPlaybooks.mockRejectedValueOnce(new Error('the pool went away'))

    const response = await GET(authorized())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'PLAYBOOKS_CRON_FAILED' })
    expect(report.reportServerError).toHaveBeenCalledTimes(1)
  })

  it('answers 200 with the tick result when it runs', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SAHODA_PLAYBOOKS_CRON_MODE', 'on')

    const response = await GET(authorized())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, opened: 0, skipped: 0 })
  })

  it('stamps the heartbeat before the work, so a failing tick still reads as scheduled', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SAHODA_PLAYBOOKS_CRON_MODE', 'on')
    playbooks.runScheduledPlaybooks.mockRejectedValueOnce(new Error('boom'))

    await GET(authorized())

    expect(heartbeat.recordCronRun).toHaveBeenCalledWith('playbooks')
  })

  it('runs nothing and says why when the mode flag is not "on"', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)

    const response = await GET(authorized())

    expect(playbooks.runScheduledPlaybooks).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true })
  })

  it('refuses an unauthorized caller and runs nothing', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SAHODA_PLAYBOOKS_CRON_MODE', 'on')

    for (const header of [null, 'Bearer wrong', '']) {
      expect((await GET(requestWith(header))).status).toBe(401)
    }
    expect(playbooks.runScheduledPlaybooks).not.toHaveBeenCalled()
  })
})
