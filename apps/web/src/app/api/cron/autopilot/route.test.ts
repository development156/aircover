import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The route's own tests, and what they replace is a grep.
 *
 * Until now the only thing asserting that this endpoint is switched off was a
 * line in `tick-all.test.ts` reading the route's SOURCE and checking it
 * contains the substring `autopilotEnabled()`. That string survives dropping
 * the `!`, survives moving the check below `runAllAutopilotTicks`, and survives
 * the whole call becoming a variable nothing branches on. The one guard on the
 * one switch could not fail for any of the three ways it would actually break.
 *
 * These run the handler instead, and every case asserts that the tick was NOT
 * CALLED rather than only reading the response body. A refusal that returns the
 * right JSON after doing the work is the failure worth catching.
 */

const ticks = vi.hoisted(() => ({
  runAllAutopilotTicks: vi.fn(async (_now: Date) => ({ workspaces: 0, dispatched: 0 })),
}))
const report = vi.hoisted(() => ({ reportServerError: vi.fn() }))

vi.mock('@/lib/loop/autopilot/tick-all', () => ticks)
vi.mock('@/lib/observability/report', () => report)

const { GET } = await import('./route')

const SECRET = 'cron-secret-for-the-test'

function requestWith(header: string | null): Request {
  return new Request('http://localhost:3000/api/cron/autopilot', {
    headers: header === null ? {} : { authorization: header },
  })
}

/** An authorized request. Each test below breaks one thing, and not this. */
function authorized(): Request {
  return requestWith(`Bearer ${SECRET}`)
}

afterEach(() => {
  vi.unstubAllEnvs()
  ticks.runAllAutopilotTicks.mockClear()
  ticks.runAllAutopilotTicks.mockImplementation(async () => ({ workspaces: 0, dispatched: 0 }))
  report.reportServerError.mockClear()
})

describe('the autopilot cron route', () => {
  it('runs nothing when the flag is unset, which is every environment today', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)

    const response = await GET(authorized())

    expect(ticks.runAllAutopilotTicks).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      enabled: false,
      reason: 'SAHODA_AUTOPILOT_ENABLED',
    })
  })

  it('says the flag is off rather than reporting a tick that found no work', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)

    const body = (await (await GET(authorized())).json()) as Record<string, unknown>

    // `enabled: false` and `workspaces: 0` are different facts about the same
    // quiet response, and whoever reads this endpoint at 3am needs to know
    // which one they are looking at.
    expect(body.enabled).toBe(false)
    expect(body).not.toHaveProperty('workspaces')
  })

  it('runs nothing for a value that merely looks like yes', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SAHODA_AUTOPILOT_ENABLED', '1')

    await GET(authorized())

    expect(ticks.runAllAutopilotTicks).not.toHaveBeenCalled()
  })

  it('ticks once, for the current time, when the flag is exactly "true"', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SAHODA_AUTOPILOT_ENABLED', 'true')
    const before = Date.now()

    const response = await GET(authorized())

    expect(ticks.runAllAutopilotTicks).toHaveBeenCalledTimes(1)
    const now = ticks.runAllAutopilotTicks.mock.calls[0]?.[0]
    expect(now).toBeInstanceOf(Date)
    expect(now!.getTime()).toBeGreaterThanOrEqual(before)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      enabled: true,
      workspaces: 0,
      dispatched: 0,
    })
  })

  it('refuses an unauthorized caller even with the flag on, and runs nothing', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SAHODA_AUTOPILOT_ENABLED', 'true')

    for (const header of [null, 'Bearer wrong', 'wrong', `Bearer ${SECRET}x`, '']) {
      const response = await GET(requestWith(header))
      expect(response.status).toBe(401)
    }

    expect(ticks.runAllAutopilotTicks).not.toHaveBeenCalled()
  })

  it('refuses when CRON_SECRET is unset, so an unconfigured deploy is not an open door', async () => {
    vi.stubEnv('SAHODA_AUTOPILOT_ENABLED', 'true')

    const response = await GET(authorized())

    expect(response.status).toBe(401)
    expect(ticks.runAllAutopilotTicks).not.toHaveBeenCalled()
  })

  it('reports a failed tick and answers 500 rather than claiming ok', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SAHODA_AUTOPILOT_ENABLED', 'true')
    ticks.runAllAutopilotTicks.mockRejectedValueOnce(new Error('the database went away'))

    const response = await GET(authorized())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'AUTOPILOT_CRON_FAILED' })
    expect(report.reportServerError).toHaveBeenCalledTimes(1)
  })
})
