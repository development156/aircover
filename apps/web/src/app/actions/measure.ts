'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { metricCaptureDeps, runMetricCapture } from '@sahoda/jobs/publish'

import { cooldownRemainingMs, cooldownSentence } from '@/lib/analytics/measure-copy'
import {
  MEASURE_BATCH,
  MEASURE_COOLDOWN_MS,
  readMeasureRun,
  recordMeasureRun,
} from '@/lib/analytics/measure-run'
import type { MeasureNowState } from '@/lib/analytics/measure-state'
import { metricCaptureEnabled } from '@/lib/cron/metrics-enabled'
import { reportServerError } from '@/lib/observability/report'
import { fixedWindowAllow } from '@/lib/ops/rate-limit'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * MEASURE NOW — the nightly pass, for one workspace, because somebody asked.
 *
 * ── WHY A BUTTON EXISTS FOR A JOB THAT ALREADY RUNS ──────────────────────────
 * The cron collects at 01:20 UTC and only then. So a shop owner who published
 * this morning opens /analytics to nothing, and there is no honest sentence that
 * makes that feel like anything other than a product that does not know. This
 * runs the same pass, now, for their workspace alone.
 *
 * ── IT IS THE SAME PASS, NOT A SECOND ONE ────────────────────────────────────
 * `runMetricCapture` with `metricCaptureDeps`, exactly as `api/cron/metrics`
 * calls them. Two implementations of "read the numbers and store them" would
 * disagree about what counts as measured, and the customer would meet both.
 *
 * ── IT COSTS NOTHING, AND THAT IS A PROPERTY OF THE PASS ─────────────────────
 * No ledger call anywhere below, because there is nothing to charge for: the
 * pass calls no model, publishes nothing and appends rows to a table that
 * refuses updates. The button says "free" for the same reason the code has no
 * `withCredits` around it.
 *
 * ── THE WORKSPACE IS RESOLVED HERE, NEVER PASSED IN ──────────────────────────
 * This action takes NO arguments. The id it hands the service-role pool comes
 * from `workspaceForWrite()`, i.e. from the signed-in session — an id arriving
 * from a caller would be a cross-tenant read through the one pool that has no
 * RLS in front of it.
 */
export async function measureNow(): Promise<MeasureNowState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to measure your posts.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    // BEFORE the rate limit is spent. A switched-off environment should not
    // consume somebody's ten minutes to tell them nothing happened.
    if (!metricCaptureEnabled()) {
      return {
        ok: false,
        message: 'Measuring is switched off in this environment, so Sahoda did not look.',
      }
    }

    // The stamp is read anyway, to say when the last pass ran. Using it as the
    // first gate costs no extra round trip and gives a refusal that can name the
    // wait, which "try again later" cannot.
    const last = await readMeasureRun(workspaceId)
    const remaining = cooldownRemainingMs(last, Date.now(), MEASURE_COOLDOWN_MS)
    if (remaining > 0) return { ok: false, message: cooldownSentence(remaining) }

    /**
     * The atomic half. The stamp above is read-then-write and two clicks a
     * moment apart both pass it; `INCR` cannot be raced. It fails OPEN when
     * Upstash is unreachable, which is the documented trade in
     * `lib/ops/rate-limit.ts` and the right one for a free, read-only pass.
     */
    const verdict = await fixedWindowAllow(
      `measure:${workspaceId}`,
      1,
      Math.floor(MEASURE_COOLDOWN_MS / 1000),
    )
    if (!verdict.allowed) return { ok: false, message: cooldownSentence(MEASURE_COOLDOWN_MS) }

    const report = await runMetricCapture({
      ...metricCaptureDeps({ limit: MEASURE_BATCH, workspaceId }),
      onFailure: (event) => reportServerError(event.error, { action: 'measure.now.read' }),
    })

    // Stamped after the pass, not before: the line beside the button answers
    // "when did Sahoda last look", and a pass that threw looked at nothing.
    await recordMeasureRun(workspaceId)
    revalidatePath('/analytics')
    revalidatePath('/report')

    if (report.outcome === 'failed' && report.targets > 0) {
      return {
        ok: false,
        message: 'Sahoda could not reach your accounts, so nothing new was recorded.',
      }
    }

    if (report.targets === 0) {
      return {
        ok: true,
        measured: 0,
        written: 0,
        message: 'Nothing of yours has gone out live yet, so there was nothing to measure.',
      }
    }

    return {
      ok: true,
      measured: report.measured,
      written: report.written,
      message:
        report.written > 0
          ? `Sahoda read ${report.measured} of your posts and recorded ${report.written} new readings.`
          : `Sahoda read ${report.measured} of your posts. The platforms had nothing newer than what is already stored.`,
    }
  } catch (error) {
    reportServerError(error, { action: 'measure.now', workspaceId })
    return { ok: false, message: 'Sahoda could not measure just now. Try again in a moment.' }
  }
}
