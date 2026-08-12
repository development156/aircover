import { FLOOR_PACK, REGIME_PACKS } from './packs'
import type { Rule, RulePack, RuleSet } from './rules'

/**
 * LAYER 1 — resolve the rule set, in code, and record the version used.
 *
 * ── CODE SELECTS PACKS, NEVER THE MODEL (doc 18 §4) ──────────────────────────
 * Selection is a pure function of regime × locale. If the model chose its own
 * packs, a regulated business could be talked out of its regulatory pack by the
 * same post the pack exists to refuse — the classifier would be marking its own
 * homework. Nothing in this file reads anything a model wrote.
 *
 * ── WHY `regime` IS A STRING AND NOT THE Regime ENUM ─────────────────────────
 * That enum lives in `apps/web/src/lib/onboarding/intake.ts` and is explicitly
 * LOCAL to that lane (its own header says so, and files an ask in
 * `apps/web/REQUESTS.md` for wt-shared to lift it). `@sahoda/shared` may not
 * import from an app, and redefining it here would be the exact duplication
 * CLAUDE.md forbids. So this takes a string, and an unrecognised one resolves
 * to the floor — which is what an unknown regime honestly means.
 */

/** The default when nobody has said — the floor every business sits under. */
export const DEFAULT_REGIME = 'consumer'
export const DEFAULT_LOCALE = 'IN'

export interface ResolveRuleSetInput {
  /** From the workspace's stored intake, or derived, or absent. */
  regime: string | null
  locale: string | null
  /** How `regime` was arrived at — carried through untouched onto the RuleSet. */
  basis: 'declared' | 'derived' | 'default'
  /**
   * `taboo.red_lines` from the stored Brand Brain. Prose, and prose only: nobody
   * writes "never fake urgency" as a regex, so these carry a statement and no
   * phrases and reach the gate through the classifier alone. That is not a
   * weakness in the owner tier, it is what the tier IS.
   */
  ownerRedLines?: readonly string[]
  /**
   * `voice.banned_phrases`. These ARE literal, which makes them the only part of
   * the owner tier the deterministic layer can act on — and the reason the two
   * are read as separate fields rather than concatenated into one list.
   */
  ownerBannedPhrases?: readonly string[]
}

/**
 * Which packs apply. The floor ALWAYS applies; a regime pack is added on top.
 *
 * Union, never replacement. A future `IN`-specific healthcare pack must not
 * displace the general one — a jurisdiction adds obligations, it does not lift
 * the ones underneath.
 */
export function packsFor(regime: string | null, locale: string | null): readonly RulePack[] {
  const packs: RulePack[] = [FLOOR_PACK]
  const regimePack = regime === null ? undefined : REGIME_PACKS[regime]
  if (regimePack && appliesToLocale(regimePack, locale)) packs.push(regimePack)
  return packs
}

function appliesToLocale(pack: RulePack, locale: string | null): boolean {
  if (pack.locales.includes('*')) return true
  return locale !== null && pack.locales.includes(locale)
}

/** Owner red lines as rules. Statement-only — see `ownerRedLines` above. */
function ownerRules(input: ResolveRuleSetInput): readonly Rule[] {
  const lines = (input.ownerRedLines ?? [])
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const phrases = (input.ownerBannedPhrases ?? [])
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0)

  const rules: Rule[] = lines.map((statement, index) => ({
    // Indexed rather than hashed: the audit row records the statement verbatim
    // alongside the id, so the id only has to be stable within one verdict.
    id: `owner.red-line.${index + 1}`,
    tier: 'owner',
    statement,
    source: 'owner',
    // Deliberately no `rewrite`. We do not know what this owner would rather
    // say, and inventing one would be the product putting words in their mouth
    // about their own rule. The classifier proposes the rewrite instead, from
    // the post it just read.
  }))

  if (phrases.length > 0) {
    rules.push({
      id: 'owner.banned-phrases',
      tier: 'owner',
      statement: `Words this brand does not use: ${phrases.join(', ')}.`,
      source: 'owner',
      phrases,
      rewrite: 'Say it in your own words — this is a phrase you ruled out, not a rule about us.',
    })
  }

  return rules
}

/**
 * The rules in force for one post, with the proof of how they were chosen.
 *
 * `ruleSetVersion` composes every contributing pack id and version. It is the
 * string the audit row stores, and the property that matters is that reading it
 * back later tells you exactly which rules were applied — not merely that some
 * were. Owner rules carry the brain version instead, which the caller supplies
 * to the verdict; they are versioned by `brand_memory` and always have been.
 */
export function resolveRuleSet(input: ResolveRuleSetInput): RuleSet {
  const regime = input.regime ?? DEFAULT_REGIME
  const locale = input.locale ?? DEFAULT_LOCALE
  const packs = packsFor(regime, locale)

  return {
    ruleSetVersion: packs.map((p) => `${p.id}@${p.version}`).join('+'),
    packs: packs.map((p) => ({ id: p.id, version: p.version })),
    rules: [...packs.flatMap((p) => p.rules), ...ownerRules(input)],
    regime: { value: regime, locale, basis: input.basis },
  }
}
