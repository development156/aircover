import type {
  ClassifierFinding,
  ClassifierOutcome,
  GateFinding,
  GateVerdict,
  Rule,
  RuleSet,
} from './rules'

/**
 * Where the four layers become one answer — and where "ambiguity is not
 * permission" is either enforced or quietly lost.
 *
 * ── THIS FILE FAILS CLOSED, AGAINST THE HABIT OF EVERY FILE AROUND IT ────────
 * The publish path is built to fail OPEN, on purpose and correctly:
 * `hostMedia` absent means `[]`, `markConnection` is optional, and
 * `readHashtags` says outright that "a shape we do not recognise is a reason to
 * ignore the field, not to fail the publish". Those are right, because the cost
 * of a wrong guess there is a slightly worse post.
 *
 * Here the cost of a wrong guess is a clinic promising a cure. So every unknown
 * resolves the other way: a model that is unsure, a model that is unreachable,
 * an answer that will not parse, a rule id nobody recognises, a quote that
 * turns out not to be in the post — all of it HOLDS.
 *
 * If you are reading this while making the gate "less noisy", that is the
 * change you are making. Doc 18 §8: a borderline post held an hour costs
 * nothing.
 */

export interface DecideGateInput {
  /** The post as it will be sent. Classifier quotes are verified against THIS. */
  text: string
  ruleSet: RuleSet
  /** Layer 2's output. Non-empty means the decision is already `block`. */
  hardFindings: readonly GateFinding[]
  /** The rules layer 2 could form no opinion about — the only ones layer 3 may rule on. */
  unjudged: readonly Rule[]
  classifier: ClassifierOutcome
  brandVersion: number | null
}

/**
 * A classifier finding is only usable when it points at a rule that was
 * actually put to it. A model naming `health.no-cure-claim` when that rule was
 * never in the set is not a finding about that rule — it is a model repeating
 * something from its training, and adopting it would attribute a refusal to a
 * regulator who never wrote it.
 *
 * Unknown ids are NOT dropped. Dropping is the fail-open move: it turns a model
 * that answered incoherently into a clean pass. They hold instead.
 */
function partitionFindings(
  findings: readonly ClassifierFinding[],
  unjudged: readonly Rule[],
): { known: { finding: ClassifierFinding; rule: Rule }[]; unknownIds: string[] } {
  const byId = new Map(unjudged.map((rule) => [rule.id, rule]))
  const known: { finding: ClassifierFinding; rule: Rule }[] = []
  const unknownIds: string[] = []

  for (const finding of findings) {
    const rule = byId.get(finding.ruleId)
    if (rule) known.push({ finding, rule })
    else unknownIds.push(finding.ruleId)
  }

  return { known, unknownIds }
}

/**
 * The model's quote, kept only when it is literally in the post.
 *
 * A paraphrased quote in a refusal is the product telling someone they wrote
 * words they did not write — and it is the first thing anyone disputes. Case is
 * ignored so a model that title-cased a sentence still lands; anything else is
 * dropped, and the finding survives without a quote rather than with a false one.
 */
function verifiedQuote(text: string, quote: string | undefined): string | undefined {
  if (typeof quote !== 'string') return undefined
  const trimmed = quote.trim()
  if (trimmed.length === 0) return undefined
  const at = text.toLowerCase().indexOf(trimmed.toLowerCase())
  return at === -1 ? undefined : text.slice(at, at + trimmed.length)
}

function toGateFinding(text: string, finding: ClassifierFinding, rule: Rule): GateFinding {
  const quote = verifiedQuote(text, finding.quote)
  // The rule's own rewrite wins over the model's. It was authored with the rule
  // and reviewed with it; the model's is a suggestion about this one post, and
  // is kept only where the rule has nothing to offer (every owner red line).
  const rewrite = rule.rewrite ?? finding.rewrite?.trim()
  return {
    ruleId: rule.id,
    tier: rule.tier,
    statement: rule.statement,
    source: rule.source,
    layer: 'classifier',
    ...(quote ? { quote } : {}),
    ...(rewrite ? { rewrite } : {}),
  }
}

/**
 * The gate's answer for one post.
 *
 * Order is load-bearing: a certainty outranks a judgement, and a judgement
 * outranks silence.
 *
 *  1. Layer 2 found something → BLOCK. A quoted phrase is a fact; no model gets
 *     to overturn it, which is also why the caller does not pay for a
 *     classifier call once this is true.
 *  2. Layer 3 could not run → HOLD. Every reason except the two deliberate
 *     skips, including the two that look most like nothing happened — a timeout
 *     and a rule list too long to carry.
 *  3. Layer 3 says `trips` → BLOCK.
 *  4. Layer 3 says `unsure`, or named a rule that was never asked → HOLD.
 *  5. Otherwise → PASS, and the verdict records what it checked to earn it.
 */
export function decideGate(input: DecideGateInput): GateVerdict {
  const { text, ruleSet, hardFindings, unjudged, classifier, brandVersion } = input

  const base = { ruleSet, brandVersion }

  if (hardFindings.length > 0) {
    return {
      ...base,
      decision: 'block',
      findings: hardFindings,
      checks: { hard: 'ran', classifier: 'skipped-already-blocked' },
    }
  }

  if (!classifier.ran) {
    // The two skips are the gate declining to spend a call it has no use for.
    // Everything else is the gate not knowing, and not knowing means not going.
    if (classifier.state === 'skipped-no-rules') {
      return {
        ...base,
        decision: 'pass',
        findings: [],
        checks: { hard: 'ran', classifier: classifier.state },
      }
    }
    return {
      ...base,
      decision: 'hold',
      findings: [],
      checks: { hard: 'ran', classifier: classifier.state },
      holdReason: HOLD_REASONS[classifier.state],
    }
  }

  const { known, unknownIds } = partitionFindings(classifier.findings, unjudged)

  const trips = known
    .filter(({ finding }) => finding.verdict === 'trips')
    .map(({ finding, rule }) => toGateFinding(text, finding, rule))

  if (trips.length > 0) {
    return {
      ...base,
      decision: 'block',
      findings: trips,
      checks: { hard: 'ran', classifier: 'ran' },
      classifierModel: classifier.model,
    }
  }

  const unsure = known
    .filter(({ finding }) => finding.verdict === 'unsure')
    .map(({ finding, rule }) => toGateFinding(text, finding, rule))

  if (unsure.length > 0 || unknownIds.length > 0) {
    return {
      ...base,
      decision: 'hold',
      findings: unsure,
      checks: { hard: 'ran', classifier: 'ran' },
      classifierModel: classifier.model,
      holdReason:
        unsure.length > 0
          ? 'The check was not certain about this one, so a person should look before it goes out.'
          : 'The check answered about a rule that was not asked, so its answer cannot be trusted for this post.',
    }
  }

  return {
    ...base,
    decision: 'pass',
    findings: [],
    checks: { hard: 'ran', classifier: 'ran' },
    classifierModel: classifier.model,
  }
}

/** One line each, ours — never a model's prose, and never a stack trace. */
const HOLD_REASONS: Record<string, string> = {
  'skipped-already-blocked': 'A rule was already tripped outright.',
  unavailable: 'The wording check could not run, so nothing was cleared to go out.',
  'over-bounds':
    'There are more rules on this workspace than one check can carry, so none of them was skipped quietly.',
  unparseable: 'The wording check answered in a form we could not read.',
  timeout: 'The wording check did not finish in time.',
}
