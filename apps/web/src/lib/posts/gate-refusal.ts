import type { RuleTier } from '@sahoda/shared'

/**
 * The refusal gate's verdict, read back off `post_variants.last_error`.
 *
 * ── WHY THIS IS NOT COVERED BY `describePublishError` ────────────────────────
 * That function is an allowlist keyed on the CODE, and it is right to be: an
 * adapter's `message` can carry text straight from Zernio or Meta, so an unknown
 * code degrades to a safe sentence rather than echoing an unreviewed string.
 *
 * But a gate refusal that degrades to "something went wrong sending this one" is
 * the gate failing at the last inch. Doc 18 §8's rule is that a refusal names the
 * line it trips, says whether it is inherited or theirs, and offers a compliant
 * rewrite in the same breath — "a block that only says no teaches people to route
 * around the product". None of that survives being flattened to a code.
 *
 * So the verdict travels as STRUCTURE, and this reads it. What is rendered:
 *
 *   · `statement` — a pack rule we authored, or the customer's OWN red line
 *     typed in onboarding. Both are safe to show them.
 *   · `quote` — verified by `decideGate` to be a literal span of this post. A
 *     model that paraphrased has already had its quote dropped upstream.
 *   · `rewrite` — the rule's authored one where it has it. For an owner red line
 *     it is the model's suggestion, which is why the UI labels it as a
 *     suggestion rather than as the fix.
 *
 * `last_error` is untyped jsonb written by the publisher, so every field is read
 * defensively and a shape we do not recognise yields `null` — the caller then
 * falls back to the code-based copy, which is a worse refusal but never a broken
 * screen.
 */

/** Bounds so one long rule cannot become a wall of text in a status list. */
const MAX_STATEMENT = 240
const MAX_QUOTE = 160
const MAX_REWRITE = 280

export interface GateRefusalFinding {
  ruleId: string
  /** `mandated` renders as inherited; `owner` renders as theirs. */
  tier: RuleTier
  statement: string
  quote: string | null
  rewrite: string | null
}

export interface GateRefusal {
  decision: 'block' | 'hold'
  findings: GateRefusalFinding[]
  /** Present on a hold: one line, ours, saying why nobody could decide. */
  holdReason: string | null
  /**
   * How the regime was arrived at.
   *
   * Carried to the UI rather than dropped because it changes what may honestly
   * be said. A `mandated` finding under basis `declared` may be described as
   * coming from the trade the customer told us they are in; the same finding
   * under `default` came from the floor that applies to everyone, and calling
   * that "your industry's rule" would be the product inventing a regulator.
   */
  regimeBasis: 'declared' | 'derived' | 'default'
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed.slice(0, max)
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toFinding(raw: unknown): GateRefusalFinding | null {
  const f = record(raw)
  if (!f) return null
  const ruleId = str(f.ruleId, 80)
  const statement = str(f.statement, MAX_STATEMENT)
  // A finding with no rule and no words is not a finding — rendering an empty
  // bullet would tell someone their post was refused and show them nothing.
  if (!ruleId || !statement) return null
  return {
    ruleId,
    tier: f.tier === 'mandated' ? 'mandated' : 'owner',
    statement,
    quote: str(f.quote, MAX_QUOTE),
    rewrite: str(f.rewrite, MAX_REWRITE),
  }
}

/** The refusal on a `last_error`, or null when this failure was not the gate's. */
export function readGateRefusal(lastError: unknown): GateRefusal | null {
  const error = record(lastError)
  const gate = record(error?.gate)
  if (!gate) return null

  const decision = gate.decision === 'block' ? 'block' : gate.decision === 'hold' ? 'hold' : null
  if (!decision) return null

  const regime = record(gate.regime)
  const basis = regime?.basis
  return {
    decision,
    findings: Array.isArray(gate.findings)
      ? gate.findings.map(toFinding).filter((f): f is GateRefusalFinding => f !== null)
      : [],
    holdReason: str(gate.holdReason, MAX_STATEMENT),
    // Anything unrecognised reads as `default`, which is the weakest claim
    // available. An unreadable basis must never upgrade into "your regulator
    // said so".
    regimeBasis: basis === 'declared' ? 'declared' : basis === 'derived' ? 'derived' : 'default',
  }
}

/**
 * Where the line came from, in words, and the honesty rule that shapes them.
 *
 * `mandated` under a `declared` regime is the only case that may name the
 * customer's trade. Under `derived` or `default` nobody told us what they do, so
 * the rule is the floor that applies to every business — saying otherwise would
 * attribute the refusal to a regulator who was never consulted.
 */
export function describeRuleSource(finding: GateRefusalFinding, basis: GateRefusal['regimeBasis']) {
  if (finding.tier === 'owner') {
    return { label: 'Your rule', detail: 'You set this one. Change it in your Brand Brain.' }
  }
  return basis === 'declared'
    ? { label: 'Required', detail: 'This comes with the trade you told us you are in.' }
    : { label: 'Required', detail: 'This applies to every business advertising anything.' }
}
