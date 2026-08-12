import { z } from 'zod'

/**
 * The refusal gate's vocabulary (doc 18 §8), in @sahoda/shared so the publisher,
 * the classifier and the UI cannot disagree about what a refusal means.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
 * The Refine screen tells people "Red lines — the Loop will refuse these," and
 * until this shipped it did not: `taboo.red_lines` went into a prompt prefix
 * (`packages/mesh/src/brand-context.ts`) and nothing between the composer and
 * the platform ever read them again. A prompt is a request, not a gate — the
 * same model that was asked politely is the one being checked.
 *
 * Doc 18 §8 states the consequence plainly: showing constraints you do not
 * enforce is worse than having none, because you have told a regulated business
 * they are protected.
 */

/**
 * WHO IS ENTITLED TO CHANGE THE RULE — and therefore what a refusal must say.
 *
 * This mirrors `FieldKind` in brand/audiences.ts, deliberately narrowed to the
 * two tiers that can refuse a post. It is not decoration: requirement 3 of the
 * gate is that a refusal says whether the line is INHERITED or THEIRS, because
 * the two carry completely different next moves. "You wrote this rule, change
 * it or change the post" is advice. "Your regulator wrote this rule" is not,
 * and offering to relax it would be the product overstepping.
 */
export const RuleTierSchema = z.enum(['mandated', 'owner'])
export type RuleTier = z.infer<typeof RuleTierSchema>

/**
 * One rule the gate can refuse against.
 *
 * ── TWO HALVES, AND ONLY ONE OF THEM IS DETERMINISTIC ────────────────────────
 * `patterns` is what layer 2 can check by itself: literal phrases and anchored
 * expressions. `statement` is the rule as a person would say it, and it is what
 * layer 3 hands the classifier.
 *
 * A rule may have either, and most mandated rules have both. An owner red line
 * ("never fake urgency") has ONLY a statement — nobody writes a regex for that,
 * and pretending otherwise is how a gate ends up green on the thing it exists
 * to catch. That asymmetry is the whole reason layer 3 is in the design rather
 * than being an optimisation.
 */
export interface Rule {
  /** Stable across pack versions — the audit trail refers to rules by this. */
  id: string
  tier: RuleTier
  /** The rule in one sentence, as it will be quoted back in a refusal. */
  statement: string
  /**
   * Where it came from: a pack path for mandated, `owner` for theirs. Same
   * vocabulary as `FieldMeta.source` so provenance reads identically everywhere.
   */
  source: string
  /**
   * Literal phrases that trip this rule. Matched case-insensitively on word
   * boundaries — never as a bare substring, which is how "cure" flags "secure"
   * and "manicure". `deterministic.ts` owns that matching.
   */
  phrases?: readonly string[]
  /**
   * A disclosure this rule REQUIRES to be present. The check inverts: a finding
   * is raised when none of these appear, not when one does.
   */
  requiresOneOf?: readonly string[]
  /**
   * The trigger for `requiresOneOf` — the disclosure is only required once one
   * of these appears in the post.
   *
   * WITHOUT THIS THE DISCLOSURE RULES ARE USELESS, and worse than useless. An
   * unconditional "every finance post must carry the market-risk line" refuses
   * a post that says the branch is shut on Sunday. A gate that fires on
   * everything gets switched off within a week, and then it protects nobody —
   * so the scope of a disclosure is part of the rule, not a tuning knob.
   */
  whenAnyOf?: readonly string[]
  /**
   * What to say instead, in the same breath as the refusal. A block that only
   * says no teaches people to route around the product, so every rule that can
   * be satisfied by rewording carries the rewording.
   */
  rewrite?: string
}

/** A pack of mandated rules, selected by CODE from regime × locale — never by a model. */
export interface RulePack {
  id: string
  /**
   * Calendar-versioned, exactly as doc 18 §4's frontmatter specifies. This
   * string is written into the audit row, so a rule can be re-checked against
   * the pack that was actually in force rather than today's.
   */
  version: string
  regime: string
  /** `'*'` means every locale — the floor that applies before jurisdiction. */
  locales: readonly string[]
  rules: readonly Rule[]
}

/**
 * The rules in force for one post, and the proof of how they were chosen.
 *
 * `ruleSetVersion` is a composite of every pack version plus the brain version,
 * because "which rule set was in force" is not answerable by naming one pack
 * when three contributed.
 */
export interface RuleSet {
  ruleSetVersion: string
  packs: readonly { id: string; version: string }[]
  rules: readonly Rule[]
  /**
   * How the regime was arrived at, and it must never be flattened.
   *
   *   declared — the workspace stored one. The only basis a mandated rule
   *              deserves to be described as inherited-from-your-regulator.
   *   derived  — inferred from stored brand text. Honest, and weaker.
   *   default  — nobody said, so `consumer` (the floor) applies.
   *
   * A default recorded as a declaration is the audit trail lying about what it
   * knew, which is the one thing an audit trail cannot do and remain useful.
   */
  regime: { value: string; locale: string; basis: 'declared' | 'derived' | 'default' }
}

/** What tripped, on which layer, with the words to say about it. */
export interface GateFinding {
  ruleId: string
  tier: RuleTier
  /** The rule as written — quoted back so the refusal names the line it trips. */
  statement: string
  source: string
  /** Which layer raised it. `hard` is a fact; `classifier` is a judgement. */
  layer: 'hard' | 'classifier'
  /**
   * The span of the post that tripped it, when there is one. Comes from OUR
   * pattern match on the hard layer; on the classifier layer it is the model's
   * quote and is verified to be a literal substring of the post before it is
   * kept — a model that paraphrases must not put words in a user's mouth.
   */
  quote?: string
  rewrite?: string
}

export const GATE_DECISIONS = ['pass', 'block', 'hold'] as const
export type GateDecision = (typeof GATE_DECISIONS)[number]

/**
 * What became of layer 3, recorded rather than inferred.
 *
 * The failure states are spelled out separately because they mean different
 * things to whoever reads the audit row a month later: `unavailable` is an
 * outage, `unparseable` is a model or prompt problem, `timeout` is a capacity
 * problem, `over-bounds` is a workspace that outgrew one call, and the two
 * `skipped-` states are the gate correctly declining to spend a model call.
 * Collapsing them to a boolean would make the trail unable to answer the only
 * question anyone ever asks of it.
 *
 * EVERY state except the two `skipped-` ones HOLDS. See `decideGate`.
 */
export const CLASSIFIER_STATES = [
  'ran',
  'skipped-already-blocked',
  'skipped-no-rules',
  'unavailable',
  'unparseable',
  'timeout',
  // More rules, or a longer post, than one bounded call may carry. HOLDS rather
  // than checking what fits: a call that silently carried the first 24 rules
  // would leave the rest with no finding at all, and a rule with no finding is
  // indistinguishable from one that came back clear. Truncating the input to a
  // checker converts an unchecked rule into a passed one.
  'over-bounds',
] as const
export type ClassifierState = (typeof CLASSIFIER_STATES)[number]

/**
 * One rule, as the classifier judged it.
 *
 * `unsure` is a FIRST-CLASS ANSWER, not a failure — and it is the field the
 * whole of requirement 4 rests on. A two-valued verdict forces a model that
 * genuinely cannot tell to pick, and the direction it picks under pressure to
 * be useful is `clear`. Giving it somewhere honest to land is what makes
 * "ambiguity is not permission" implementable rather than aspirational.
 *
 * A zod schema rather than an interface because the mesh re-parses every model
 * output: `packages/shared/src/mesh/tasks.ts` builds the task contract from it.
 */
export const ClassifierFindingSchema = z.object({
  ruleId: z.string().min(1),
  verdict: z.enum(['clear', 'trips', 'unsure']),
  /** Must be a literal span of the post. Verified in `decideGate`, never trusted. */
  quote: z.string().optional(),
  why: z.string().optional(),
  rewrite: z.string().optional(),
})
export type ClassifierFinding = z.infer<typeof ClassifierFindingSchema>

/** What layer 3 came back with, or why it did not. */
export type ClassifierOutcome =
  | { ran: true; model: string; findings: readonly ClassifierFinding[] }
  | { ran: false; state: Exclude<ClassifierState, 'ran'> }

/**
 * The whole outcome of one gate run — the audit record and the refusal in one
 * object, because they must never be able to disagree.
 *
 *   pass  — every layer ran and nothing tripped.
 *   block — a rule tripped with certainty. Deterministic, or a classifier
 *           finding it was sure about.
 *   hold  — the gate does not know. AMBIGUITY IS NOT PERMISSION: an unsure
 *           classifier, an unavailable one, an unparseable answer and a timeout
 *           all land here, and hold means the post does not go out.
 */
export interface GateVerdict {
  decision: GateDecision
  findings: readonly GateFinding[]
  ruleSet: RuleSet
  /** `brand_memory.version` the owner rules were read from; null when there is no brain. */
  brandVersion: number | null
  /** Which layers actually ran, so a pass proves what it checked rather than asserting it. */
  checks: {
    hard: 'ran'
    classifier: ClassifierState
  }
  /** Model + prompt version behind a classifier verdict (doc 18 §8's audit trail). */
  classifierModel?: string
  /** Why it holds, when it holds — one line, ours, never the model's prose. */
  holdReason?: string
}

export const GATE_BLOCKED_CODE = 'GATE_BLOCKED' as const
export const GATE_HELD_CODE = 'GATE_HELD' as const

/** The publish-failure code a verdict maps to. `pass` has none — it does not fail. */
export function gateFailureCode(decision: GateDecision): string | null {
  if (decision === 'block') return GATE_BLOCKED_CODE
  if (decision === 'hold') return GATE_HELD_CODE
  return null
}
