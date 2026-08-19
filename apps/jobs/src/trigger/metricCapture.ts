import { schedules } from '@trigger.dev/sdk'

import { runMetricCapture, type MetricCaptureReport } from '../metrics/capture'
import { metricCaptureDeps } from '../metrics/deps'

export const METRIC_CAPTURE_TASK_ID = 'metric-capture'

/**
 * One measurement a day, a little after midnight UTC.
 *
 * ── WHY DAILY AND NOT HOURLY ─────────────────────────────────────────────────
 * The table keeps one row per day per number, so a second run in the same day
 * finds the row already there and stores nothing. Running hourly would spend
 * twenty-four times the requests to collect the same history — and Zernio's
 * numbers do not move fast enough to be worth it. Instagram's own insights land
 * roughly two days behind.
 *
 * Running LATE is safe and running twice is safe; running not at all is the only
 * failure mode that costs anything, because a day missed cannot be collected
 * later. That is why the cadence is generous rather than tight.
 *
 * A thin wrapper: all behaviour is in `runMetricCapture`, which is free of any
 * scheduler SDK so it can be tested, and so moving to Vercel cron plus QStash
 * stays a wrapper swap.
 */
export const metricCaptureTask = schedules.task({
  id: METRIC_CAPTURE_TASK_ID,
  cron: '20 1 * * *',
  run: async (): Promise<MetricCaptureReport> => runMetricCapture(metricCaptureDeps()),
})
