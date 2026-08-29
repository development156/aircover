/**
 * Which channels the product OFFERS today, in a module with no dependencies.
 *
 * ── WHY THIS IS NOT IN `catalogue.ts` ────────────────────────────────────────
 * It was, and importing it from the composer's channel picker dragged the whole
 * 470-line catalogue — every entry, every blurb, every readiness rung — plus the
 * seven hand-drawn SVG marks into the client bundles of `/planner` and
 * `/posts/[id]`. MEASURED with `PERF_BUDGET_WRITE`: `/planner` went 802,503 →
 * 810,629 bytes, and `js-budget.mjs` allows 8 * 1024 of slack. That is 8,126 of
 * 8,192 spent — 99.2% — leaving **807 bytes**. The build still passed, which is
 * the dangerous part: the next person to add anything to `/planner` fails it,
 * and the diff that fails is not the diff that caused it.
 *
 * A predicate over a set of strings has no business carrying a catalogue with
 * it. `catalogue.ts` re-exports both names, so every existing import is
 * unchanged and there is still exactly one definition.
 */

/**
 * Channels the customer is NOT offered on `/connections` today.
 *
 * ── WHY THIS IS A FILTER AND NOT A DELETION ──────────────────────────────────
 * Three separate reasons, and each one on its own is enough:
 *
 * 1. `CONNECTABLE` must equal `ConnectionPlatformSchema.options` exactly, and
 *    `catalogue.test.ts` asserts it in BOTH directions. That guard exists because
 *    a tile outside the enum sends someone to a real consent screen for a row
 *    `upsert_zernio_connection` will then refuse — a grant given away for
 *    nothing. Deleting three entries would have broken the first direction, and
 *    "the guard went red so I edited the guard" is how that protection dies.
 *
 * 2. `ENTRY` is the lookup every tile uses for a name and a logo, including the
 *    tiles under "Your channels". A workspace that ALREADY linked one of these
 *    still holds the row, still holds the plan slot, and still publishes. Drop it
 *    from the catalogue and their live account renders as nothing at all while
 *    quietly consuming a slot — the exact defect the grouping comment above says
 *    was already shipped once with a second Instagram account.
 *
 * 3. The database, the start route and the plan gate all still accept these
 *    three. This is a decision about what to OFFER, which is a smaller and more
 *    reversible claim than what the product supports.
 *
 * So the hiding happens where the offer is made: `/connections` filters this set
 * out of "Add a channel" and "Not available yet", and leaves "Your channels"
 * alone. Take an id out of this set and its tile comes straight back.
 */
export const HIDDEN_FROM_OFFER: ReadonlySet<string> = new Set<string>([
  'telegram',
  'tiktok',
  'slack',
])

/**
 * Should `/connections` offer this channel to a customer who has not linked it?
 *
 * Governs the OFFER only. It must never gate a channel the workspace already
 * connected, because hiding a live account is not the same act as declining to
 * advertise a new one.
 */
export function isOfferedForConnect(id: string): boolean {
  return !HIDDEN_FROM_OFFER.has(id)
}
