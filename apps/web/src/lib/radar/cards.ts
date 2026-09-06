import type { CollectorState, Competitor, RadarDay } from './types'

/**
 * WHAT ONE WATCH-LIST CARD IS ALLOWED TO SAY.
 *
 * ── THE WHOLE MODULE EXISTS FOR ONE SENTENCE IT MUST NEVER WRITE ────────────
 * "No meaningful changes detected." The reference design puts that line on every
 * card, and on this product it would be false in two of the four cases below: a
 * business nobody has read yet has not been found quiet, and a screen whose
 * readings are not wired in cannot tell you either way. Both of those render as
 * an empty card in every competitor tool in this category, and a reader takes
 * the silence for calm.
 *
 * So the claim is DERIVED here, from the collector state and the competitor's
 * own last read, and the component renders whichever of the four sentences it
 * gets. There is no default arm, no `?? 'quiet'`, and no boolean: a fourth state
 * cannot be added without every reader of this type failing to compile.
 *
 * Pure: no I/O, no clock, no database.
 */
export type WatchClaim =
  /** Read, and something moved. `count` is changes we hold evidence for. */
  | { claim: 'changed'; count: number }
  /** Read, and nothing moved. The only case that may say "nothing changed". */
  | { claim: 'quiet' }
  /** On the list, never successfully read. Not the same as quiet. */
  | { claim: 'not-read' }
  /** The readings are not bound to this screen. We cannot say either way. */
  | { claim: 'unwired' }

export interface WatchCard {
  competitor: Competitor
  status: WatchClaim
}

/**
 * Build one card per watched business, in the order the store returned them.
 *
 * `collector` is taken rather than inferred from whether `days` is empty,
 * because an empty feed on a fully bound collector genuinely means nothing
 * changed, and an empty feed on an unbound one means nothing is known. Those are
 * the two states `CollectorState` exists to keep apart, and guessing between
 * them from the length of an array is how they get collapsed again.
 */
export function watchCards(input: {
  collector: CollectorState
  competitors: readonly Competitor[]
  days: readonly RadarDay[]
}): WatchCard[] {
  const counts = new Map<string, number>()
  for (const day of input.days) {
    for (const change of day.changes) {
      counts.set(change.competitorId, (counts.get(change.competitorId) ?? 0) + 1)
    }
  }

  return input.competitors.map((competitor) => ({
    competitor,
    status: claimFor(input.collector, competitor, counts.get(competitor.id) ?? 0),
  }))
}

function claimFor(collector: CollectorState, competitor: Competitor, count: number): WatchClaim {
  // Asked FIRST, and before the count, because a count read off an unbound
  // collector is a count of what happened to reach this screen rather than of
  // what happened to the business.
  if (collector !== 'reading') return { claim: 'unwired' }
  if (count > 0) return { claim: 'changed', count }
  if (competitor.lastObservedAt === null) return { claim: 'not-read' }
  return { claim: 'quiet' }
}

/** How many of the cards are reporting something that moved. */
export function changedCount(cards: readonly WatchCard[]): number {
  return cards.filter((card) => card.status.claim === 'changed').length
}
