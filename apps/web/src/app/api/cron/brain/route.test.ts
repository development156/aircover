import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The Marketing Brain route's own tests. The claim they exist for: a pass that
 * throws is a 5xx, so Vercel's cron log and every 5xx filter can see it. The
 * catch block answered 200 with `ok: false` until 2026-09-02; see the loop
 * route's test for the full account.
 */

const brain = vi.hoisted(() => ({
  runMarketingBrainPass: vi.fn(async (_now: Date) => ({ workspaces: 0, observations: 0 })),
}))
const heartbeat = vi.hoisted(() => ({ recordCronRun: vi.fn(async () => undefined) }))
const report = vi.hoisted(() => ({ reportServerError: vi.fn() }))

vi.mock('@/lib/brain/run', () => brain)
vi.mock('@/lib/cron/heartbeat-store', () => heartbeat)
vi.mock('@/lib/observability/report', () => report)

const { GET } = await import('./route')

const SECRET = 'cron-secret-for-the-test'

function requestWith(header: string | null): Request {
  return new Request('http://localhost:3000/api/cron/brain', {
    headers: header === null ? {} : { authorization: header },
  })
}

function authorized(): Request {
  return requestWith(`Bearer ${SECRET}`)
}

afterEach(() => {
  vi.unstubAllEnvs()
  brain.runMarketingBrainPass.mockClear()
  brain.runMarketingBrainPass.mockImplementation(async () => ({ workspaces: 0, observations: 0 }))
  heartbeat.recordCronRun.mockClear()
  report.reportServerError.mockClear()
})

describe('the brain cron route', () => {
  it('answers 500 with the same body shape as its siblings when the pass throws', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    brain.runMarketingBrainPass.mockRejectedValueOnce(new Error('schema drift'))

    const response = await GET(authorized())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'BRAIN_CRON_FAILED' })
    expect(report.reportServerError).toHaveBeenCalledTimes(1)
  })

  it('answers 200 with the pass result when it runs', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)

    const response = await GET(authorized())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, workspaces: 0, observations: 0 })
    expect(brain.runMarketingBrainPass.mock.calls[0]?.[0]).toBeInstanceOf(Date)
  })

  it('stamps the heartbeat before the work, so a failing pass still reads as scheduled', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    brain.runMarketingBrainPass.mockRejectedValueOnce(new Error('boom'))

    await GET(authorized())

    expect(heartbeat.recordCronRun).toHaveBeenCalledWith('brain')
  })

  it('refuses an unauthorized caller and runs nothing', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)

    for (const header of [null, 'Bearer wrong', '']) {
      expect((await GET(requestWith(header))).status).toBe(401)
    }
    expect(brain.runMarketingBrainPass).not.toHaveBeenCalled()
  })
})
