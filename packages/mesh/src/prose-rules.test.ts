import { describe, expect, test } from 'vitest'

import { PROSE_RULES, VOICE_INTEGRITY, findBannedDashes, obeysProseRules } from './prose-rules'
import { contentVariantsTask } from './tasks/content-variants'
import { captionRewriteTask } from './tasks/caption-rewrite'
import { siteGenerateTask } from './tasks/site-generate'
import { planWeekTask } from './tasks/plan-week'
import { brandGuidelinesTask } from './tasks/brand-guidelines'

/**
 * THE DASH RULE REACHES THE MODEL, AND KEEPS ITS HANDS OFF THE HYPHEN.
 *
 * Two halves, and the second is the one that matters. A rule banning every `-`
 * would forbid `same-day`, `family-run` and `20-minute` in a caption a bakery
 * publishes, which is worse than the tell it removes. So every case below that
 * proves a dash is caught has a partner proving a hyphen is not.
 */

describe('what counts as a dash used as punctuation', () => {
  test('catches the em dash, the en dash and the double hyphen', () => {
    expect(findBannedDashes('Fresh bread — every morning').map((h) => h.found)).toEqual(['—'])
    expect(findBannedDashes('Open 9–5 today').map((h) => h.found)).toEqual(['–'])
    // The fallback a model reaches for once the glyph is refused.
    expect(findBannedDashes('Fresh bread -- every morning').map((h) => h.found)).toEqual(['--'])
  })

  test('NEVER touches an ordinary hyphen, because that would break English', () => {
    // CLAUDE.md: "Removing hyphens breaks English and makes copy ambiguous."
    // This is the counterweight. Without it the rule is a regression.
    expect(findBannedDashes('same-day delivery from a family-run bakery')).toEqual([])
    expect(findBannedDashes('20-minute pre-order for our sign-in customers')).toEqual([])
    expect(obeysProseRules('Order our best-selling, hand-rolled croissants')).toBe(true)
  })

  test('reports every hit, not just the first', () => {
    // A caption can carry several. A detector that stops at one reports a draft
    // clean after half a fix.
    expect(findBannedDashes('One — two – three').map((h) => h.found)).toEqual(['—', '–'])
  })

  test('says where, so a caller can point at it', () => {
    const [hit] = findBannedDashes('Fresh bread — daily')
    expect(hit?.index).toBe(12)
  })
})

describe('the instruction itself', () => {
  test('names the replacements rather than only forbidding the glyph', () => {
    // A model told only "do not use X" deletes the dash and puts nothing in its
    // place, which reads worse than the dash did.
    expect(PROSE_RULES).toMatch(/full stop|comma|colon/)
  })

  test('states out loud that hyphens are kept', () => {
    expect(PROSE_RULES).toMatch(/hyphens? inside words are correct|must be kept/)
  })

  test('obeys its own rule, which is not a joke', () => {
    // The sentence instructing a model to avoid em dashes must not contain one
    // outside the quoted glyphs it is naming. It quotes `—`, `–` and `--` on
    // purpose; strip those and nothing may remain.
    const withoutQuotedGlyphs = PROSE_RULES.replace(/\(—\)|\(–\)|\(--\)/g, '')
    expect(obeysProseRules(withoutQuotedGlyphs)).toBe(true)
  })
})

/**
 * THE PROMPTS. This is the half that would rot silently.
 *
 * A rule that exists in a module nobody imports is not a rule. These assert the
 * sentence actually reaches the provider for every task that writes copy a
 * customer publishes under their own name.
 */
describe('every task that writes a published caption carries the rule', () => {
  const ctx = { workspaceId: 'w', brand: null, knowledge: null } as never

  test('content_variants — the per-channel bodies', () => {
    const messages = contentVariantsTask.buildMessages(
      { body: 'Fresh bread daily.', channels: ['x'] },
      ctx,
    )
    const system = messages.find((m) => m.role === 'system')
    expect(system?.content).toContain(PROSE_RULES)
  })

  test("site_generate — marketing copy published under the customer's own name", () => {
    // AN AUDIT CAUGHT THIS ONE MISSING. The first version of this rule reached
    // only the two caption tasks, while site_generate writes the words on a
    // customer's actual website. "Every task that writes a published caption"
    // was the claim; three tasks were outside it.
    const system = siteGenerateTask
      .buildMessages({ brief: 'A bakery in Pune.', sections: ['hero'] } as never, ctx)
      .find((m) => m.role === 'system')
    expect(system?.content).toContain(PROSE_RULES)
  })

  test('plan_week — the briefs the customer reads', () => {
    const system = planWeekTask
      .buildMessages({ goal: 'More walk-ins', channels: ['x'], count: 3 } as never, ctx)
      .find((m) => m.role === 'system')
    expect(system?.content).toContain(PROSE_RULES)
  })

  test('brand_guidelines — sample hooks land in the Brand Brain', () => {
    const system = brandGuidelinesTask
      .buildMessages({ business: 'A bakery in Pune.' } as never, ctx)
      .find((m) => m.role === 'system')
    expect(system?.content).toContain(PROSE_RULES)
  })

  test('caption_rewrite — every instruction, not just the first', () => {
    // Looping the enum rather than spot-checking `rewrite`: the directive is
    // interpolated per instruction, and a rule appended in one branch only would
    // pass a single-case test.
    for (const instruction of ['rewrite', 'shorten', 'hookify'] as const) {
      const messages = captionRewriteTask.buildMessages({ text: 'Fresh bread.', instruction }, ctx)
      const system = messages.find((m) => m.role === 'system')
      expect(system?.content, instruction).toContain(PROSE_RULES)
    }
  })
})

describe('the model must not reveal itself in a published caption', () => {
  const ctx = { workspaceId: 'w', brand: null, knowledge: null } as never

  test('the rule names the actual tells: self-reference and refusal', () => {
    // Not the wording, the failures it must forbid. A rewrite that keeps the
    // sentence but drops the AI/refusal clauses is a defect, not a tidy-up.
    expect(VOICE_INTEGRITY).toMatch(/\bAI\b|assistant|model/)
    expect(VOICE_INTEGRITY).toMatch(/never refuse/i)
    expect(VOICE_INTEGRITY).toMatch(/no preamble/i)
  })

  test('obeys PROSE_RULES itself, so the anti-tell rule is not a tell', () => {
    expect(obeysProseRules(VOICE_INTEGRITY)).toBe(true)
  })

  test('content_variants carries it', () => {
    const system = contentVariantsTask
      .buildMessages({ body: 'Fresh bread daily.', channels: ['x'] }, ctx)
      .find((m) => m.role === 'system')
    expect(system?.content).toContain(VOICE_INTEGRITY)
  })

  test('caption_rewrite carries it, on every instruction', () => {
    for (const instruction of ['rewrite', 'shorten', 'hookify'] as const) {
      const system = captionRewriteTask
        .buildMessages({ text: 'Fresh bread.', instruction }, ctx)
        .find((m) => m.role === 'system')
      expect(system?.content, instruction).toContain(VOICE_INTEGRITY)
    }
  })
})
