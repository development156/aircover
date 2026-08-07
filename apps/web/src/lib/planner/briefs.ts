import type { Channel } from '@sahoda/shared'

/**
 * Clamp a brief's channels to what the user actually requested. The plan_week
 * prompt asks the model to spread across the given channels, but
 * `PlanWeekOutputSchema` cannot enforce membership — without this, a
 * hallucinated channel would create a draft targeting a surface the user never
 * picked. A brief that names none of the requested channels falls back to the
 * full requested set: the draft must land somewhere the user asked for.
 */
export function clampChannels(briefChannels: Channel[], requested: Channel[]): Channel[] {
  const allowed = new Set(requested)
  const kept = [...new Set(briefChannels)].filter((channel) => allowed.has(channel))
  return kept.length > 0 ? kept : [...requested]
}

/**
 * Bounds for model-written draft text. Neither `PlanWeekOutputSchema` nor
 * `PostInsertSchema` carries a `.max()` (upstream asks filed in REQUESTS.md),
 * and `plan_week` is the first path where five rows of MODEL-generated text —
 * not editor-bounded human typing — land per click. Until the shared schemas
 * bound it, this boundary does.
 */
export const BRIEF_TITLE_MAX_CHARS = 160
export const BRIEF_BODY_MAX_CHARS = 4000

/** Code-point-safe cap (a UTF-16 slice can cut an emoji in half — see excerptOf). */
export function clampBriefText(value: string, maxChars: number): string {
  const chars = Array.from(value)
  if (chars.length <= maxChars) return value
  return chars.slice(0, maxChars).join('').trimEnd()
}
