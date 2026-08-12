import type { MeshTaskName } from '@sahoda/shared'

/**
 * MEASURED output need per task, and the headroom every ceiling must clear.
 *
 * `MAX_TOKENS` used to be a number somebody picked. That cost 45% of every
 * extraction: `brand_extract` sat at 2048 against a ~3,400-token answer, so 83%
 * of calls were cut off mid-JSON and paid for a repair that resent the whole
 * corpus. The number is now checked against evidence by `token-budget.test.ts`.
 *
 * READ THIS BEFORE ADDING A ROW. Seed floors from SINGLE-PASS observations only.
 * `ai_provider_logs.tokens_out` is `sumUsage` output — a repaired call reports
 * BOTH attempts added together, which is precisely why `brand_guidelines`
 * showed 2,904 against a 2,048 ceiling and `site_generate` 4,980 against 4,096.
 * Those sums are proof of truncation, not measurements of need; a floor table
 * calibrated on them would set every ceiling too high and read as rigour.
 */
export interface TokenBudgetEvidence {
  /** Largest output believed to be a SINGLE pass, in tokens. */
  observedMax: number
  /** Where the number came from, so the next person can re-derive it. */
  source: string
}

/**
 * Ceilings must clear the observed maximum by this much. A task that lands
 * exactly on its measured need truncates the first time a customer is wordier
 * than the sample.
 */
export const REQUIRED_HEADROOM = 1.4

export const TOKEN_EVIDENCE: Record<
  Exclude<MeshTaskName, 'image_generate'>,
  TokenBudgetEvidence
> = {
  brand_extract: {
    observedMax: 2846,
    source: '2026-08-12, 6 single-pass runs on the fbs.edu.in corpus (repair rate 0%)',
  },
  brand_guidelines: {
    // 2,904 appears in telemetry but is a repaired SUM. The largest output from
    // a run known to be single-pass is arm D of the three-door measurement.
    observedMax: 2750,
    source: '2026-08-12 three-door run, arm D (single pass)',
  },
  plan_week: {
    observedMax: 1855,
    source:
      'ai_provider_logs max over 5 rows, 2026-08-12 — under the old 2048 ceiling, so single-pass',
  },
  content_variants: {
    observedMax: 925,
    source: 'ai_provider_logs max over 19 rows — under the old 1024 ceiling, so single-pass',
  },
  caption_rewrite: {
    observedMax: 210,
    source: 'ai_provider_logs max over 3 rows',
  },
  site_generate: {
    // 4,980 is a repaired sum against a 4,096 ceiling. The true single-pass need
    // is UNKNOWN — the sum hides it — so this is the ceiling itself, treated as
    // a lower bound. site_generate is `premium` tier, the most expensive model
    // we route to, which is exactly why it must not silently truncate.
    observedMax: 4096,
    source: 'UNKNOWN — telemetry max (4980) is a repaired sum; ceiling used as a lower bound',
  },
}
