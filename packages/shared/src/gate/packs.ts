import type { Rule, RulePack } from './rules'

/**
 * The mandated rule packs — layer 1's raw material.
 *
 * ── WHAT THESE ARE, STATED PLAINLY SO NOBODY OVERSELLS THEM ──────────────────
 * Doc 18 §4 specifies packs as versioned MARKDOWN under `/packs`, loaded through
 * a three-tier loader with a JSON Schema per kind. That artifact does not exist,
 * and this is not it. Two reasons, and the second is the load-bearing one:
 *
 *  1. Those packs feed the GENERATION prefix (doc 18 §10 — "keep the regulatory
 *     pack in the cached prefix"). Prose is the right shape for that job.
 *  2. The gate's deterministic layer needs machine-readable phrases and
 *     disclosure triggers. Prose cannot supply them, so a markdown loader would
 *     not have removed the need for this file — it would have added a second
 *     place for the same rule to live and drift.
 *
 * So: versioned typed packs, same `id`/`version`/`applies_to` frontmatter fields
 * doc 18 names, shaped so a future loader can hydrate exactly this structure.
 * The markdown pack loader for generation context remains unbuilt.
 *
 * ── AUTHORSHIP, HONESTLY ─────────────────────────────────────────────────────
 * These were authored in-repo from well-established advertising norms (no cure
 * claims, no assured returns, no guaranteed placement). THEY HAVE NOT BEEN
 * REVIEWED BY COUNSEL IN ANY JURISDICTION. Doc 18's constraint on culture packs
 * — "a pack you cannot vouch for should not exist" — applies with equal force
 * here, and the honest position is that this set is a floor that catches the
 * obvious, not a compliance guarantee. Everything in the product that describes
 * these to a customer must say so.
 *
 * Locale is carried on every pack and every pack currently declares `'*'`.
 * That is not an oversight and it is not "locale does not matter": it is that
 * nobody has authored a jurisdiction-specific set, and inventing one would be
 * exactly the confident local nonsense doc 18 §4 warns about. When IN-specific
 * rules are authored they land as their own pack and BOTH apply — the resolver
 * unions, it does not replace.
 */

const PACK_VERSION = '2026.08'

/**
 * The floor under every business, whatever it sells (doc 18's `_asci-core`).
 *
 * Selected for EVERY regime including `consumer`, which is the honest default
 * regime — "landing here claims nothing extra" (onboarding/intake.ts), but it
 * does not mean landing here is unregulated.
 */
const FLOOR_RULES: readonly Rule[] = [
  {
    id: 'floor.superlative-unsubstantiated',
    tier: 'mandated',
    statement:
      'A rank or a superlative needs a stated measure and a source. "The best" with nothing behind it is a claim, not a description.',
    source: 'packs/regime/_floor.md',
    phrases: ['no.1', 'no 1', '#1', 'number one', "world's best", "india's best", 'the best in'],
    rewrite:
      'Name what you are best at and how it was measured: "rated 4.8 by 300 customers" says more than "No.1" and is yours to stand behind.',
  },
  {
    id: 'floor.guaranteed-outcome',
    tier: 'mandated',
    statement: 'An outcome you do not control may not be guaranteed.',
    source: 'packs/regime/_floor.md',
    phrases: ['guaranteed results', '100% guaranteed', 'guaranteed success', 'results guaranteed'],
    rewrite:
      'Say what you do and what customers have seen ("most clients see X within Y") rather than promising the outcome.',
  },
  {
    id: 'floor.typical-result',
    tier: 'mandated',
    statement:
      'A single customer result presented as what anyone can expect needs to say it is not typical.',
    source: 'packs/regime/_floor.md',
    rewrite: 'Attribute the result to the person it happened to, and say results vary.',
  },
]

const HEALTHCARE_RULES: readonly Rule[] = [
  {
    id: 'health.no-cure-claim',
    tier: 'mandated',
    statement: 'A treatment may not be advertised as a cure.',
    source: 'packs/regime/healthcare.md',
    phrases: ['cure', 'cures', 'cured', 'curing', 'miracle cure', 'permanent cure'],
    rewrite:
      'Describe what the treatment does and who it suits ("manages", "relieves", "supports recovery from") and leave the outcome to the clinician.',
  },
  {
    id: 'health.no-safety-guarantee',
    tier: 'mandated',
    statement: 'No procedure is guaranteed safe or free of side effects.',
    source: 'packs/regime/healthcare.md',
    phrases: ['100% safe', 'completely safe', 'no side effects', 'zero side effects', 'risk-free'],
    rewrite:
      'State the safety record you actually have and point to the consultation where risks are discussed.',
  },
  {
    id: 'health.no-comparative-superiority',
    tier: 'mandated',
    statement:
      'A clinic may not claim to be better than named or implied competitors on clinical grounds.',
    source: 'packs/regime/healthcare.md',
    rewrite: 'Describe your own care. Let the comparison be the reader’s to make.',
  },
  {
    id: 'health.no-diagnosis-solicitation',
    tier: 'mandated',
    statement:
      'A post may not offer diagnosis or treatment for a specific condition from a message or a comment.',
    source: 'packs/regime/healthcare.md',
    rewrite: 'Invite them to book a consultation instead of answering the clinical question.',
  },
]

const FINANCE_RULES: readonly Rule[] = [
  {
    id: 'finance.no-assured-returns',
    tier: 'mandated',
    statement: 'A return that depends on a market may not be described as assured or guaranteed.',
    source: 'packs/regime/finance.md',
    phrases: [
      'assured returns',
      'guaranteed returns',
      'guaranteed return',
      'risk-free returns',
      'double your money',
      'fixed returns',
      'no risk',
    ],
    rewrite:
      'Give the historical range and the period it covers, and say plainly that past performance is not a promise.',
  },
  {
    id: 'finance.market-risk-disclosure',
    tier: 'mandated',
    statement:
      'A post promoting a market-linked product carries the market-risk line and the direction to the offer documents.',
    source: 'packs/regime/finance.md',
    whenAnyOf: ['mutual fund', 'sip', 'invest', 'investment', 'portfolio', 'equity', 'nav'],
    requiresOneOf: ['subject to market risk', 'market risks', 'read all scheme related documents'],
    rewrite:
      'Add the line you already use in print: "Investments are subject to market risks. Read all scheme related documents carefully."',
  },
]

const FOOD_RULES: readonly Rule[] = [
  {
    id: 'food.no-medicinal-claim',
    tier: 'mandated',
    statement: 'Food may not be advertised as treating, preventing or curing a condition.',
    source: 'packs/regime/food.md',
    phrases: ['cures', 'prevents disease', 'medicinal', 'treats diabetes', 'lowers cholesterol'],
    rewrite:
      'Describe the ingredient and what it is ("made with millet, high in fibre") without attaching it to a condition.',
  },
  {
    id: 'food.no-unverified-provenance',
    tier: 'mandated',
    statement:
      'Organic, farm-fresh, pure and homemade are claims about a supply chain, and need one behind them.',
    source: 'packs/regime/food.md',
    rewrite:
      'Name the farm, the certification or the kitchen. An unnamed claim is worth less anyway.',
  },
]

const BEAUTY_RULES: readonly Rule[] = [
  {
    id: 'beauty.no-permanent-result',
    tier: 'mandated',
    statement: 'A cosmetic result that fades may not be advertised as permanent.',
    source: 'packs/regime/beauty.md',
    phrases: ['permanent results', 'permanently removes', 'forever gone', 'permanent solution'],
    rewrite: 'Say how long it typically lasts and what maintenance it needs.',
  },
  {
    id: 'beauty.no-medical-claim',
    tier: 'mandated',
    statement: 'A cosmetic service may not make a clinical claim about a skin or body condition.',
    source: 'packs/regime/beauty.md',
    phrases: ['cures acne', 'treats eczema', 'dermatologically guaranteed', 'medically proven'],
    rewrite:
      'Describe the treatment and what people notice, and refer anything clinical to a doctor.',
  },
]

const EDUCATION_RULES: readonly Rule[] = [
  {
    id: 'education.no-guaranteed-placement',
    tier: 'mandated',
    statement: 'A job, a placement, an admission or a score may not be guaranteed.',
    source: 'packs/regime/education.md',
    phrases: [
      'guaranteed placement',
      '100% placement',
      'guaranteed job',
      'assured admission',
      'guaranteed selection',
      'guaranteed rank',
    ],
    rewrite:
      'Publish the real number and the cohort it came from ("62 of 80 placed in 2025"), which is more persuasive than a guarantee nobody believes.',
  },
  {
    id: 'education.no-unverified-rank',
    tier: 'mandated',
    statement: 'A ranking needs the body that awarded it and the year.',
    source: 'packs/regime/education.md',
    rewrite: 'Cite the ranking body and the year, or leave the ranking out.',
  },
]

const pack = (regime: string, rules: readonly Rule[]): RulePack => ({
  id: `regime-${regime}`,
  version: PACK_VERSION,
  regime,
  locales: ['*'],
  rules,
})

/** The floor pack, selected for every regime — including `consumer`. */
export const FLOOR_PACK: RulePack = {
  id: 'regime-_floor',
  version: PACK_VERSION,
  regime: '*',
  locales: ['*'],
  rules: FLOOR_RULES,
}

/**
 * Regime → its pack. `consumer` is deliberately ABSENT rather than empty: it is
 * the floor and nothing more, and an empty pack in this map would read as
 * "authored, found nothing to say" instead of "the floor is the whole answer".
 */
export const REGIME_PACKS: Readonly<Record<string, RulePack>> = Object.freeze({
  healthcare: pack('healthcare', HEALTHCARE_RULES),
  finance: pack('finance', FINANCE_RULES),
  food: pack('food', FOOD_RULES),
  beauty: pack('beauty', BEAUTY_RULES),
  education: pack('education', EDUCATION_RULES),
})
