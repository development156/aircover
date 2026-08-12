import type { GateFinding, Rule } from './rules'

/**
 * LAYER 2 — the hard checks. Facts, not judgements.
 *
 * Doc 18 §8: "brittle against paraphrase — necessary, not sufficient." Both
 * halves of that sentence are load-bearing. This layer cannot be talked out of
 * a verdict, cannot time out, costs nothing and runs on every post — and it will
 * miss "there is no chance this does not work", which trips no phrase in any
 * pack. Layer 3 exists for that half, and this layer exists so that layer 3
 * being unavailable is not the same as a post being clean.
 */

/**
 * Word-boundary matching that survives punctuation and does not fire inside
 * other words.
 *
 * ── WHY NOT `text.includes(phrase)` ──────────────────────────────────────────
 * The healthcare pack bans "cure". A substring test flags "secure checkout",
 * "manicure" and "procedure" — three false refusals on a beauty salon's first
 * post, which is how a gate gets switched off in week one. `\b` does not solve
 * it either: it is defined against ASCII word characters, so it silently fails
 * on the Devanagari and Tamil this product publishes in.
 *
 * So the boundary is asserted explicitly as "not a letter and not a number" with
 * Unicode property escapes. That gets `#1` and `no.1` matching too, which `\b`
 * cannot — `\b` before `#` requires a word character to its left.
 *
 * Internal whitespace is relaxed to `\s+` so "guaranteed  results" and a
 * newline between the two words are the same phrase. A writer's line break is
 * not a way through the gate.
 */
function phrasePattern(phrase: string): RegExp {
  const escaped = phrase
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu')
}

/** The first literal span of `text` matching `phrase`, or null. */
export function findPhrase(text: string, phrase: string): string | null {
  if (phrase.trim().length === 0) return null
  const match = phrasePattern(phrase).exec(text)
  return match ? match[0] : null
}

/** Whether any of `phrases` appears. Used for both disclosure triggers and their satisfaction. */
export function containsAny(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => findPhrase(text, phrase) !== null)
}

/**
 * One rule against one post. Returns the finding, or null when the rule is
 * satisfied OR has nothing deterministic to say.
 *
 * THE SECOND CASE IS NOT A PASS, and calling it one is the mistake this comment
 * exists to prevent. A rule with only a `statement` (every owner red line, and
 * the pack rules about comparison and provenance) returns null here because
 * this layer has no opinion, not because the post is clean. `runHardChecks`
 * reports which rules it could not judge so the caller can hand exactly those
 * to layer 3 — and so a missing layer 3 is visibly a gap rather than silently a
 * pass.
 */
export function checkRule(text: string, rule: Rule): GateFinding | null {
  const base = {
    ruleId: rule.id,
    tier: rule.tier,
    statement: rule.statement,
    source: rule.source,
    layer: 'hard' as const,
    ...(rule.rewrite ? { rewrite: rule.rewrite } : {}),
  }

  if (rule.phrases) {
    for (const phrase of rule.phrases) {
      const quote = findPhrase(text, phrase)
      if (quote !== null) return { ...base, quote }
    }
  }

  if (rule.requiresOneOf) {
    // Scoped by `whenAnyOf`. An unscoped disclosure rule would refuse a post
    // announcing Sunday opening hours — see the field's own comment.
    const inScope = rule.whenAnyOf ? containsAny(text, rule.whenAnyOf) : true
    if (inScope && !containsAny(text, rule.requiresOneOf)) return base
  }

  return null
}

export interface HardCheckResult {
  findings: readonly GateFinding[]
  /**
   * Rules this layer could form no opinion about — every rule with no `phrases`
   * and no `requiresOneOf`, plus the phrase rules that did not fire but whose
   * statement a paraphrase could still breach.
   *
   * This is the INPUT to layer 3, and it is deliberately every rule rather than
   * only the untestable ones: "no guaranteed results" not matching the literal
   * phrase says nothing about "you will absolutely see results, we promise".
   */
  unjudged: readonly Rule[]
}

/** Every rule in the set, against the post. Pure: no clock, no I/O, no model. */
export function runHardChecks(text: string, rules: readonly Rule[]): HardCheckResult {
  const findings: GateFinding[] = []
  const unjudged: Rule[] = []

  for (const rule of rules) {
    const finding = checkRule(text, rule)
    if (finding) {
      findings.push(finding)
      // Already refused on a fact. Asking a model to re-judge a rule that has
      // literally been quoted back would let a judgement soften a certainty.
      continue
    }
    unjudged.push(rule)
  }

  return { findings, unjudged }
}
