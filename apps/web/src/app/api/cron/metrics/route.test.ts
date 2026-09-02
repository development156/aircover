import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MetricCaptureDeps, MetricCaptureReport } from '@sahoda/jobs/publish'

/**
 * The nightly metric route's own tests, and the night they exist for.
 *
 * `runMetricCapture` catches every per-target read failure and counts it as
 * `unreadable`, so a rotated Zernio key produced `targets: 120, measured: 0,
 * unreadable: 120` every night with a 200 `ok: true`, no Sentry event and a
 * healthy heartbeat. The route's 500 branch was reachable only when the pass
 * itself threw, which per-target failures never do. Two things are asserted
 * here: a pass whose every read failed is a 5xx, and the causes reach Sentry
 * through the same `onFailure` hook the sweeps route already uses.
 */

const jobs = vi.hoisted(() => {
  const deps: MetricCaptureDeps = {
    listTargets: async () => [],
    readPostAnalytics: async () => {
      throw new Error('not wired in this test')
    },
    writeSnapshots: async () => ({ inserted: 0, storage: 'ready' }),
  }
  return {
    metricCaptureDeps: vi.fn(() => deps),
    runMetricCapture: vi.fn(async (_deps: MetricCaptureDeps) => clean()),
  }
})
const heartbeat = vi.hoisted(() => ({ recordCronRun: vi.fn(async () => undefined) }))
const report = vi.hoisted(() => ({ reportServerError: vi.fn() }))

function clean(over: Partial<MetricCaptureReport> = {}): MetricCaptureReport {
  return {
    outcome: 'clean',
    targets: 3,
    measured: 3,
    pending: 0,
    unreadable: 0,
    unresolved: 0,
    collected: 9,
    written: 9,
    newestMeasuredAt: '2026-09-02T01:30:00Z',
    daysInBatch: 1,
    storage: 'ready',
    ...over,
  }
}

vi.mock('@sahoda/jobs/publish', () => jobs)
vi.mock('@/lib/cron/heartbeat-store', () => heartbeat)
vi.mock('@/lib/observability/report', () => report)

const { GET } = await import('./route')

const SECRET = 'cron-secret-for-the-test'

function authorized(): Request {
  return new Request('http://localhost:3000/api/cron/metrics', {
    headers: { authorization: `Bearer ${SECRET}` },
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  jobs.runMetricCapture.mockClear()
  jobs.runMetricCapture.mockImplementation(async () => clean())
  report.reportServerError.mockClear()
})

describe('the metrics cron route', () => {
  it('answers 200 for a clean pass', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)

    const response = await GET(authorized())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, outcome: 'clean' })
  })

  it('answers 500 with ok:false when every read failed, and still carries the counts', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    jobs.runMetricCapture.mockResolvedValueOnce(
      clean({
        outcome: 'failed',
        targets: 120,
        measured: 0,
        unreadable: 120,
        collected: 0,
        written: 0,
        newestMeasuredAt: null,
        daysInBatch: 0,
      }),
    )

    const response = await GET(authorized())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'METRIC_CAPTURE_FAILED',
      outcome: 'failed',
      targets: 120,
      unreadable: 120,
    })
  })

  it('answers 200 for a degraded pass, because most of the night still landed', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    jobs.runMetricCapture.mockResolvedValueOnce(
      clean({ outcome: 'degraded', targets: 3, measured: 2, unreadable: 1 }),
    )

    const response = await GET(authorized())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, outcome: 'degraded' })
  })

  it('hands the pass an onFailure that forwards the cause to Sentry', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)

    await GET(authorized())

    const deps = jobs.runMetricCapture.mock.calls[0]?.[0]
    expect(deps?.onFailure, 'the route must wire onFailure or read causes are lost').toBeTypeOf(
      'function',
    )
    const cause = new Error('No Zernio API key in this environment')
    deps!.onFailure!({ error: cause, channel: 'instagram' })
    expect(report.reportServerError).toHaveBeenCalledTimes(1)
    expect(report.reportServerError.mock.calls[0]?.[0]).toBe(cause)
    expect(report.reportServerError.mock.calls[0]?.[1]).toMatchObject({
      action: 'cron.metrics.read',
    })
  })

  it('still answers 500 when the pass itself throws', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    jobs.runMetricCapture.mockRejectedValueOnce(new Error('listTargets went away'))

    const response = await GET(authorized())

    expect(response.status).toBe(500)
    expect(report.reportServerError).toHaveBeenCalledTimes(1)
  })
})
