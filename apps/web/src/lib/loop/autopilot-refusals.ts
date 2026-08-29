/**
 * WHAT AUTOPILOT MAY NEVER DO — the list, as names a row can carry.
 *
 * ── WHY THIS IS A NAMED LIST AND NOT A SENTENCE PER SITE ─────────────────────
 * The build document asks for the never-list to be enforced "in the code and in
 * the docs". A prose list in a document is not enforcement; a set of names each
 * guardrail writes into `loop_autopilot_log.refusal_reason` is, because it makes
 * "which guardrail refused" a queryable fact rather than a string somebody has
 * to read.
 *
 * MEASURED against production 2026-08-28: `ops_audit_log` holds 17,556 rows and
 * 96.3% of them name nothing they acted on. A log whose reason column is free
 * text drifts to that state one hurried commit at a time.
 *
 * `packages/db/tests/loop_autopilot_log.pglite.test.ts` adjudicates this list
 * against the migration's comment, so the two cannot drift.
 */
export const AUTOPILOT_REFUSALS = {
  /** The channel is not set to L3. Never publish to a channel nobody armed. */
  NOT_AUTOPILOT_CHANNEL: 'NOT_AUTOPILOT_CHANNEL',
  /** The refusal gate flagged the words. */
  REFUSAL_GATE: 'REFUSAL_GATE',
  /** The Constraint Engine rejected the media or the shape. */
  CONSTRAINT_ENGINE: 'CONSTRAINT_ENGINE',
  /** The week's credit budget is spent. */
  WEEKLY_BUDGET: 'WEEKLY_BUDGET',
  /** Today's publish cap is reached. */
  DAILY_CAP: 'DAILY_CAP',
  /** The Brand Brain is below the autopilot floor. */
  BRAIN_BELOW_FLOOR: 'BRAIN_BELOW_FLOOR',
  /** The cancel window has not closed yet. */
  INSIDE_CANCEL_WINDOW: 'INSIDE_CANCEL_WINDOW',
  /** A person stopped it, or the kill switch did. */
  CANCELLED: 'CANCELLED',
} as const

export type AutopilotRefusal = (typeof AUTOPILOT_REFUSALS)[keyof typeof AUTOPILOT_REFUSALS]

/**
 * The never-list, in the words a person reads.
 *
 * Each is a claim about what DID NOT happen, phrased so it cannot be mistaken
 * for a claim about what did: "Sahoda did not publish" and "Sahoda published
 * and it failed" are different facts and this product keeps such pairs apart.
 */
export const AUTOPILOT_REFUSAL_COPY: Record<AutopilotRefusal, string> = {
  NOT_AUTOPILOT_CHANNEL: 'Autopilot is not switched on for this channel, so nothing went out.',
  REFUSAL_GATE: 'Sahoda stopped this post before it went out, because it crosses a line you set.',
  CONSTRAINT_ENGINE: 'This post does not fit what the channel accepts, so nothing went out.',
  WEEKLY_BUDGET: 'This week’s budget is spent, so nothing went out.',
  DAILY_CAP: 'Sahoda has already published as much as you allow in a day, so nothing went out.',
  BRAIN_BELOW_FLOOR:
    'Sahoda does not know enough about your business to publish unattended, so nothing went out.',
  INSIDE_CANCEL_WINDOW: 'This post is still inside the window where you can stop it.',
  CANCELLED: 'You stopped this post, so nothing went out.',
}
