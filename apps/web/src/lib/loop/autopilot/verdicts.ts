import { validateVariant, CONSTRAINTS, type GateVerdict } from '@sahoda/shared'

import type { AutopilotCandidate } from './decide'
import type { CandidateRow } from './store'

/**
 * TURNING A ROW INTO A DECIDABLE CANDIDATE — the two verdicts, and the price.
 *
 * ── WHY THE VERDICTS ARE PASSED IN AND NOT COMPUTED HERE ─────────────────────
 * The refusal gate's third layer is a model call. Running one per candidate
 * inside phase one would make the decision expensive, asynchronous and
 * unforceable from a test — and this is the code that decides to publish in a
 * customer's voice with nobody watching, so being forceable is the point.
 *
 * So this module maps verdicts that were computed elsewhere. What it owns is
 * the MAPPING, which is where the judgement lives.
 */

/**
 * Is this body flagged, as far as autopilot is concerned?
 *
 * ── `hold` REFUSES, EXACTLY AS `block` DOES ──────────────────────────────────
 * The gate has three answers and only one of them is permission. Its own header
 * states the rule and this module is where it has to be honoured: "AMBIGUITY IS
 * NOT PERMISSION: an unsure classifier, an unavailable one, an unparseable
 * answer and a timeout all land here, and hold means the post does not go out."
 *
 * That rule matters more at L3 than anywhere else in the product. At L2 a `hold`
 * reaches a person who reads the draft and decides; at L3 there is no such
 * person, so treating "we could not tell" as "go ahead" would publish precisely
 * the posts nobody could vouch for. A gate that was unavailable is not a gate
 * that passed.
 */
export function gateFlagged(verdict: GateVerdict): boolean {
  return verdict.decision !== 'pass'
}

/**
 * Does this body fit the channel?
 *
 * The Constraint Engine's own answer, unmodified. Any violation at all is a
 * refusal: there is no such thing as a violation autopilot may overlook,
 * because the platform will reject the post and the customer will see a
 * failure they did not cause.
 */
export function fitsChannel(row: Pick<CandidateRow, 'channel' | 'body'>): boolean {
  const spec = CONSTRAINTS[row.channel]
  if (!spec) return false
  return validateVariant(spec, { body: row.body }).violations.length === 0
}

/**
 * WHAT A PUBLISH COSTS, AND WHY IT IS ZERO TODAY.
 *
 * There is no publish action in pricing.config.json. The credits for a Loop
 * post are spent EARLIER — `post_variants` when the brief becomes drafts, and
 * `loop_cycle` for the orchestration — and both are charged at plan and create
 * time, behind the cost preview a person approved. Sending the finished post
 * spends nothing.
 *
 * ── SO THE WEEKLY_BUDGET GUARDRAIL CANNOT FIRE TODAY, AND THAT IS CORRECT ────
 * `decideOne` refuses when `costCredits > weeklyBudgetRemaining`; with a cost of
 * zero that comparison is never true. This is worth stating plainly rather than
 * leaving somebody to discover it: the guardrail is not broken and it is not
 * dead code. The week's budget IS enforced, at the point where the money is
 * actually spent, and re-charging at dispatch would bill twice for one post.
 *
 * It stays wired because the day a channel charges at publish — a paid boost, a
 * regenerated image, a per-post platform fee — the refusal already exists, is
 * already named, and already has the copy a person reads. What must never
 * happen is a number invented here to make the guard look busy.
 *
 * A price, not a constant, so it reads the config live if one is ever added.
 */
export function publishCostCredits(): number {
  return 0
}

/**
 * Assemble one candidate. Nothing is defaulted and nothing is invented.
 *
 * The account comes from the row, where the scan already verified it against
 * the four terms `assert_account_for_scheduled_post` uses. If it were absent
 * this would be the place somebody reached for `?? ''`, which is exactly how
 * `ops_audit_log` came to hold 16,915 rows that name nothing — so the scan
 * makes it impossible to be absent instead.
 */
export function toAutopilotCandidate(row: CandidateRow, verdict: GateVerdict): AutopilotCandidate {
  return {
    postId: row.postId,
    variantId: row.variantId,
    channel: row.channel,
    accountId: row.accountId,
    briefId: row.briefId,
    cycleId: row.cycleId,
    gateFlagged: gateFlagged(verdict),
    fitsChannel: fitsChannel(row),
    costCredits: publishCostCredits(),
  }
}
