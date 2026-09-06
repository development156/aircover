import type { MeshTaskName } from '@sahoda/shared'

/**
 * HOW LONG ONE PROVIDER CALL MAY TAKE BEFORE IT IS ABANDONED.
 *
 * ── WHY A CEILING EXISTS AT ALL ─────────────────────────────────────────────
 * Until 2026-09-02 no fetch in this package carried a signal. A socket that
 * stalled ran until the platform killed the function, and a killed function
 * never reaches the code that releases the credit hold: `withCredits` releases
 * on a returned failure, not on a process that vanished. The hold then sat in
 * `held` until the expired-hold sweep found it, and that sweep is off unless
 * `SAHODA_HOLD_SWEEP_MODE` says otherwise. "Users never pay for failures" was
 * true only if an env var nobody in this repository can see was set.
 *
 * With a ceiling, a stalled call becomes a `ProviderCallError` inside the wall,
 * the runner returns a typed PROVIDER_ERROR, and the caller releases the hold
 * on the same request. The customer sees a failure and keeps the credits.
 *
 * ── HOW THE NUMBERS WERE CHOSEN ─────────────────────────────────────────────
 * Each ceiling sits under the wall of the route that calls it, with room for
 * the runner's one repair retry and one fallback provider, and above the slow
 * end of what the task's `maxTokens` takes to emit:
 *
 *   · gate_classify: 12s, the same figure as apps/jobs' GATE_CLASSIFY_TIMEOUT_MS,
 *     so the call the classifier stops waiting for is also stopped.
 *   · caption_rewrite / content_variants: economy tier, at most ~2k tokens.
 *   · brand_guidelines / brand_extract / plan_week: standard tier, 3k to 4k
 *     tokens, and brand_extract may be parsing a PDF. The onboarding door route
 *     has a 120s wall.
 *   · site_generate: premium tier, 8k tokens; the longest emission this
 *     product makes.
 *
 * A number here is a ceiling on ONE call. The runner may make up to three
 * (primary, repair, fallback), so a route's wall has to hold the sum.
 */
export const CHAT_TIMEOUT_MS: Record<MeshTaskName, number> = {
  brand_guidelines: 90_000,
  brand_extract: 90_000,
  content_variants: 60_000,
  caption_rewrite: 60_000,
  plan_week: 90_000,
  site_generate: 180_000,
  gate_classify: 12_000,
  // Images do not go through the chat path; see IMAGE_TIMEOUT_MS. Recorded
  // because the map is total over MeshTaskName.
  image_generate: 120_000,
}

/** For a task name the table does not know (tests, a future task): a safe middle. */
export const DEFAULT_CHAT_TIMEOUT_MS = 90_000

/** One image generation. Diffusion models routinely take 20 to 60s at 1080x1350. */
export const IMAGE_TIMEOUT_MS = 120_000

/**
 * The three grounding reads (brand, knowledge, market) are best-effort and a
 * user is waiting on the sum of them. A PostgREST read that has not answered in
 * ten seconds is not going to, and the runner proceeds without that block.
 */
export const CONTEXT_FETCH_TIMEOUT_MS = 10_000

export function chatTimeoutMsFor(task: string): number {
  return (CHAT_TIMEOUT_MS as Record<string, number | undefined>)[task] ?? DEFAULT_CHAT_TIMEOUT_MS
}
