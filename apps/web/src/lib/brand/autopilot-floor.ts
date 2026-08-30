import { BRAIN_FIELDS } from '@/lib/brand/fields'
import { countConfirmedFields } from '@/lib/brand/confirmed-count'

/**
 * THE FOUR BRAND BRAIN FIELDS AUTOPILOT WILL NOT PUBLISH WITHOUT.
 *
 * ── SETTLED 2026-08-29. DO NOT RE-LITIGATE THE SET. ──────────────────────────
 * This was carried as an open question for two sessions — "a product judgement
 * I made, it has not been ruled on". It is ruled on now: the set stays these
 * four, named, and it is not a count.
 *
 * The ruling is narrow and worth stating exactly, because the next person to
 * open this file will want to add a fifth. ADDING ONE IS A REAL CHANGE, not a
 * tightening: the database enforces the same four in
 * `20260828120000_loop_autopilot_l3.sql`, so a fifth added here alone would
 * make the screen refuse an L3 the trigger would have allowed, and the two
 * would disagree about what "ready" means. Move both, in one commit, or
 * neither.
 *
 * That is not a convention. MEASURED 2026-08-29, both directions mutated and
 * watched go red: emptying this array turns `loop_autopilot_l3.pglite.test.ts`
 * red at "the SQL floor and the TypeScript floor name the same four fields",
 * and so does adding a fifth. The same fifth also turns TWELVE of the
 * dispatcher's own tests red, because `decideOne` refuses `BRAIN_BELOW_FLOOR`
 * against this list. The set cannot drift in either direction in silence.
 *
 * ── WHY A NAMED SET AND NOT A FRACTION ───────────────────────────────────────
 * "Nine of fifteen confirmed" is a number that sounds like a standard and is
 * not one: it is satisfied by confirming the nine easiest fields and leaves the
 * question of what the product may never say unanswered. WHICH fields are
 * confirmed matters more than how many.
 *
 * These are the first four of `BRAIN_FIELDS`, which is written in priority
 * order, and each answers a question an unattended post cannot be written
 * without:
 *
 *   hook.core_promise                     what the business offers
 *   customer_persona.primary_pain_point   who it is for
 *   voice.descriptor                      how it sounds
 *   taboo.red_lines                       WHAT SAHODA MUST NEVER SAY
 *
 * The last is the reason this list exists. At L2 a person reads every draft, so
 * a missing red line costs an awkward sentence somebody deletes. At L3 nobody
 * reads it and the same gap is a post about a competitor, or a price, or a
 * medical claim, published in a customer's voice while they sleep.
 *
 * ── THE SAME FOUR ARE IN THE DATABASE ────────────────────────────────────────
 * `20260828120000_loop_autopilot_l3.sql` enforces them on the write, because a
 * check that only the application makes disappears the first time the row is
 * written from anywhere else. This constant is what the SCREEN reads, and
 * `loop_autopilot_l3.pglite.test.ts` adjudicates the migration's list against
 * this one so the two cannot drift apart in silence.
 */
export const AUTOPILOT_REQUIRED_FIELDS = [
  'hook.core_promise',
  'customer_persona.primary_pain_point',
  'voice.descriptor',
  'taboo.red_lines',
] as const

/**
 * Which of the four a person has not agreed to yet, in priority order.
 *
 * Returns the PATHS rather than a count, because the screen has to name them:
 * "your brain is not ready" sends somebody to a page with fifteen fields on it
 * and no idea which one is in the way.
 */
export function autopilotBrainGaps(payload: unknown): readonly string[] {
  const meta = (payload as { field_meta?: Record<string, unknown> } | null | undefined)?.field_meta
  return AUTOPILOT_REQUIRED_FIELDS.filter((path) => {
    const entry = (meta as Record<string, { confirmed?: unknown }> | undefined)?.[path]
    return entry?.confirmed !== true
  })
}

/** True when all four are confirmed. The one thing the dial needs to know. */
export function brainClearsAutopilotFloor(payload: unknown): boolean {
  return autopilotBrainGaps(payload).length === 0
}

/**
 * The label a person reads beside a locked L3.
 *
 * Names the fields rather than counting them, and says what each is for — the
 * reader is being asked to go and do something, and "4 fields" does not tell
 * them what.
 */
export function autopilotBrainGapLabel(payload: unknown): string | null {
  const gaps = autopilotBrainGaps(payload)
  if (gaps.length === 0) return null
  const names = gaps.map((path) => BRAIN_FIELDS.find((f) => f.path === path)?.label ?? path)
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Confirm ${list} in your Brand Brain first. Autopilot writes in your voice with nobody reading it.`
}

/** Total confirmed, for the ring the /loop screen already shows. */
export function confirmedCount(payload: unknown): number {
  return countConfirmedFields(payload)
}
