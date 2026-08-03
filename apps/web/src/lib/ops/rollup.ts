import type { BoardCard } from '@/lib/ops/board'

/**
 * Rolling 62 cards up into 6–10 stage summaries (SL-062 §3). Pure — no clock,
 * no I/O, no React.
 *
 * The default view of the board is these summaries; the full board is one
 * toggle away. NO CARD IS DELETED OR MERGED by this function — every card
 * appears in exactly one group and `cards` carries it, so "show all" is a
 * re-render rather than a second fetch of different data.
 *
 * ── THE RULE THAT OUTRANKS THE REST (SL-062 §5) ─────────────────────────────
 * Nothing red may be hidden by a summary. A group containing a blocked card or
 * a failing QA run says so ON ITS FACE — `hasRed` and `redSummary` are DERIVED
 * from the cards every time, never assigned, so the only way to make a group
 * look clean is to remove a card from it, and the count would show that.
 *
 * `rollupRedIsDerived()` is exported for the test to assert the equivalence
 * against; it is the definition of "red" and there is exactly one of it, for
 * the same reason the gates strip and the roadmap checklist share `redSuitesFrom`
 * — two places deciding independently what counts as red is how a screen ends
 * up disagreeing with itself.
 */

/** A card is red when it is blocked, or when its latest QA run failed. */
export function isRed(card: BoardCard): boolean {
  return card.blocked || card.qa === 'fail'
}

export interface StageRollup {
  /** `AO1` · `admin-ops` · `unplanned` — stable, used as a React key. */
  key: string
  /** Plain English, from the roadmap item's own title where there is one. */
  label: string
  total: number
  done: number
  inProgress: number
  /** 0–100, floored: 99% must never render while a card is still open. */
  percent: number
  /** The blocked cards themselves, so the summary can NAME them. */
  blocked: BoardCard[]
  /** Cards whose latest QA run failed. */
  failing: BoardCard[]
  /** Derived, never assigned — see the header. */
  hasRed: boolean
  /** One sentence for the face of the summary, or null when the group is clean. */
  redSummary: string | null
  /** Every card in the group, in board order. Nothing is dropped. */
  cards: BoardCard[]
}

/** Cards with no roadmap code — debt and defects found while building. */
export const UNPLANNED_KEY = 'unplanned'
export const UNPLANNED_LABEL = 'Found along the way'

/**
 * One sentence naming what is red, for the collapsed face of a group.
 *
 * Names codes rather than counting them up to three, because "SL-040 is
 * blocked" is actionable and "1 card is blocked" sends the reader hunting.
 * Past three it counts, since a sentence listing nine codes is not read.
 */
function describeRed(blocked: readonly BoardCard[], failing: readonly BoardCard[]): string | null {
  if (blocked.length === 0 && failing.length === 0) return null

  const parts: string[] = []
  if (blocked.length > 0) {
    parts.push(
      blocked.length <= 3
        ? `${blocked.map((card) => card.code).join(', ')} blocked`
        : `${blocked.length} cards blocked`,
    )
  }
  if (failing.length > 0) {
    parts.push(
      failing.length <= 3
        ? `${failing.map((card) => card.code).join(', ')} failing tests`
        : `${failing.length} cards failing tests`,
    )
  }
  return parts.join(' · ')
}

/**
 * @param cards  every live board card
 * @param labels roadmap item code → its title, so a group reads as words rather
 *               than as `AO3`. A code with no label keeps its code; a missing
 *               map is not an error, it is just a less friendly heading.
 */
export function rollup(
  cards: readonly BoardCard[],
  labels: Readonly<Record<string, string>> = {},
): StageRollup[] {
  const groups = new Map<string, BoardCard[]>()

  // Insertion order IS board order, because `cards` arrives sorted by `sort`.
  // That puts the roadmap stages in roadmap order without a second sort key.
  for (const card of cards) {
    const key = card.roadmapCode ?? UNPLANNED_KEY
    const existing = groups.get(key)
    if (existing) existing.push(card)
    else groups.set(key, [card])
  }

  // Unplanned last, whatever order it was discovered in: it is not a stage of
  // the plan and putting it among them implies it was planned.
  const keys = [...groups.keys()]
    .filter((key) => key !== UNPLANNED_KEY)
    .concat(groups.has(UNPLANNED_KEY) ? [UNPLANNED_KEY] : [])

  return keys.map((key) => {
    const group = groups.get(key) ?? []
    const blocked = group.filter((card) => card.blocked)
    const failing = group.filter((card) => card.qa === 'fail')
    const done = group.filter((card) => card.column === 'done').length

    return {
      key,
      label: key === UNPLANNED_KEY ? UNPLANNED_LABEL : (labels[key] ?? key),
      total: group.length,
      done,
      inProgress: group.filter((card) => card.column === 'in_progress').length,
      percent: group.length === 0 ? 0 : Math.floor((done / group.length) * 100),
      blocked,
      failing,
      // Derived from the same predicate the full board uses. Not a parameter,
      // not a stored column, not something a caller can pass in as false.
      hasRed: group.some(isRed),
      redSummary: describeRed(blocked, failing),
      cards: group,
    }
  })
}

/**
 * The invariant, written once so the test can assert against the definition
 * rather than against a second copy of it.
 *
 * Every stage's `hasRed` must equal "this stage contains a red card", and every
 * red stage must carry a sentence saying so. A rollup that satisfies this
 * cannot hide a blocked card behind a summary.
 */
export function rollupRedIsDerived(stages: readonly StageRollup[]): boolean {
  return stages.every(
    (stage) =>
      stage.hasRed === stage.cards.some(isRed) &&
      (stage.hasRed ? stage.redSummary !== null : stage.redSummary === null),
  )
}
