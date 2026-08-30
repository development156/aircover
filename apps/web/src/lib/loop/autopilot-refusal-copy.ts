/**
 * THE DATABASE'S THREE AUTOPILOT REFUSALS, AS SENTENCES SOMEBODY WROTE.
 *
 * ── WHY THIS IS NOT IN THE SERVER ACTION THAT USES IT ────────────────────────
 * It was, for about ten minutes, and `use-server-exports.test.ts` was right to
 * fail: a `'use server'` module may export only async functions, because every
 * export becomes a callable endpoint. A synchronous helper exported from one is
 * a build error that `next build` is the only other thing to catch, and by then
 * it costs a deploy.
 *
 * ── WHY THE COPY LIVES APART FROM THE WRITE ──────────────────────────────────
 * `AutonomyLevelSchema` used to stop at 2, and its header argued why: a schema
 * that admitted a 3 would let the value reach a column that refused it and come
 * back as a raw constraint violation rather than as a refusal anyone authored.
 * Opening that union is exactly the change that would have caused it, so this
 * file is the other half of it. The trigger in
 * `20260828120000_loop_autopilot_l3.sql` raises three named exceptions and each
 * gets a sentence here that says what is missing and what to do about it.
 *
 * The preconditions are not re-derived in TypeScript. They are facts about rows
 * — a supervised cycle that reached 'reported', a Brand Brain with four fields
 * confirmed — and a second opinion computed here could disagree with the one
 * that actually governs the write, in the direction that matters: telling
 * somebody they may have autopilot when the database will refuse them.
 */

/**
 * Turn one of the trigger's named refusals into something a shop owner can act
 * on, or null when the error is not one of them.
 *
 * Matched on the NAME rather than the whole message: Postgres prefixes its own
 * text, and AUTOPILOT_BRAIN_UNCONFIRMED appends the missing field paths. Those
 * paths are deliberately never shown — they are internal keys like
 * `customer_persona.primary_pain_point`, and printing one at a customer is the
 * implementation jargon this project's copy rules exist to keep off a screen.
 */
export function autopilotRefusalMessage(raw: string): string | null {
  if (raw.includes('AUTOPILOT_NEEDS_SUPERVISED_CYCLE')) {
    return 'Run one week yourself first. Sahoda will offer autopilot once a cycle you approved has finished and reported.'
  }
  if (raw.includes('AUTOPILOT_NEEDS_BRAIN')) {
    return 'Resolve your Brand Brain first. Sahoda will not post unwatched for a business it has never been told about.'
  }
  if (raw.includes('AUTOPILOT_BRAIN_UNCONFIRMED')) {
    return 'Confirm your promise, your customer, your voice and your red lines in the Brand Brain. Sahoda checks all four before it will post without asking.'
  }
  return null
}
