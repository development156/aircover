import { AUTONOMY_LEVELS, type AutonomyLevel, type Channel } from '@sahoda/shared'

/**
 * The level governing a brief: the LOWEST of its channels' levels.
 *
 * ── WHY THE MINIMUM AND NOT THE MAXIMUM, OR THE FIRST ────────────────────────
 * A brief going to Instagram at L2 and LinkedIn at L0 must not publish to
 * Instagram. One brief is ONE post with ONE body and ONE schedule, so there is
 * no way to act at L2 for one of its channels and L0 for another — scheduling it
 * would act at L2 on a post that also carries a channel the customer asked to
 * have only suggested. Taking the minimum means the most cautious setting on any
 * channel governs the whole brief, which is the only reading that cannot
 * surprise someone.
 *
 * ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────
 * It lived in `actions/loop-create.ts` so its test could import it, and that
 * broke the production build while passing typecheck and 3,366 unit tests: a
 * `'use server'` module may export ONLY async functions, and this one is
 * synchronous. Nothing but `next build` says so.
 *
 * It belongs here anyway. It is a pure decision about two data structures with
 * no I/O, no auth and no database, and a rule this important should be readable
 * without a server action around it.
 *
 * ── THE SEED IS THE HIGHEST STORABLE RUNG, READ OFF THE LADDER ──────────────
 * The reduce walks DOWN from its seed, so the seed is the highest answer this
 * function can give. It was a literal `2`, written when L3 could not be stored,
 * and it stayed `2` after `AutonomyLevelSchema` admitted 3: a dial at
 * {instagram: 3} came back as 2, the create stage took the L2 branch, and an
 * autopilot post was written approved-with-a-slot for the ordinary sweep to send
 * at the slot with no cancel window. Deriving the seed from `AUTONOMY_LEVELS`
 * means the ladder cannot grow a rung this function cannot return.
 */
const MAX_STORABLE_LEVEL = AUTONOMY_LEVELS.filter((l) => l.storable).reduce<AutonomyLevel>(
  (max, l) => (l.level > max ? l.level : max),
  0,
)

export function governingLevel(
  channels: readonly Channel[],
  dial: Map<Channel, AutonomyLevel>,
  fallback: AutonomyLevel = 1,
): AutonomyLevel {
  if (channels.length === 0) return fallback
  return channels.reduce<AutonomyLevel>((lowest, channel) => {
    const level = dial.get(channel) ?? fallback
    return level < lowest ? level : lowest
  }, MAX_STORABLE_LEVEL)
}
