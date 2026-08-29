import { CaptionRewriteInputSchema, CaptionRewriteOutputSchema } from '@sahoda/shared'
import type {
  CaptionRewriteInput,
  CaptionRewriteOutput,
  MeshContext,
  MeshTaskDef,
} from '@sahoda/shared'
import type { ChatMessage } from '../providers/types'
import type { MeshTaskSpec } from '../engine'
import { PROSE_RULES } from '../prose-rules'

/**
 * A WHOLE-BODY BUDGET, NOT A FRAGMENT ONE.
 *
 * 512 was right while the only caller was the selection toolbar, which sends a
 * phrase. The tone modes send the WHOLE caption, and the longest legal one is
 * LinkedIn's 3,000 characters — roughly 750 to 1,000 tokens of English before
 * JSON escaping, and more for a script that does not tokenise as cheaply as
 * Latin. A 512-token ceiling would have truncated those mid-sentence and
 * returned the fragment as a finished rewrite, which is a silent corruption of
 * the writer's post rather than a visible failure.
 *
 * It costs nothing on the short calls. `maxTokens` is a ceiling, not a target:
 * the model stops when the caption is finished, and a three-word shorten still
 * bills three words. The schema's own 8,000-character cap is what bounds the
 * INPUT side of the same flat charge.
 */
const MAX_TOKENS = 1_600

/**
 * The one sentence every tone mode carries.
 *
 * Separate from each directive rather than repeated inside them, because the
 * repetition is the thing that drifts: four near-identical clauses is four
 * chances for one of them to be softened by a later edit, and a mode that lost
 * it would start inventing claims about a real business. `MEANING_RULE` is
 * asserted directly by the tests, so removing it from the prompt is visible.
 */
const MEANING_RULE =
  'Keep every fact, claim, number, name and offer exactly as written. Invent nothing and remove nothing. Fix spelling, grammar and punctuation. The result must say what the author said.'

const DIRECTIVES: Record<CaptionRewriteInput['instruction'], string> = {
  rewrite: 'Rewrite it to read clearer and more on-brand, at roughly the same length and meaning.',
  shorten: 'Make it noticeably shorter and tighter without losing the core message.',
  hookify: 'Rework the opening into a strong, scroll-stopping hook; keep the rest intact.',
  // ── THE FOUR TONE MODES ────────────────────────────────────────────────────
  // Each one changes HOW the caption reads and nothing about WHAT it says. The
  // meaning rule is appended to all four below.
  polish: `Fix the writing without changing the voice: grammar, spelling, punctuation and word order only. Keep the author's own phrasing wherever it is already correct, and keep the length close to what it was. ${MEANING_RULE}`,
  professional: `Rewrite it in a measured, professional register: precise wording, complete sentences, no slang and no filler. Do not make it stiff or corporate. ${MEANING_RULE}`,
  friendly: `Rewrite it in a warm, conversational register, the way the owner would say it to a regular customer. Plain words, contractions welcome. ${MEANING_RULE}`,
  // The founder's own word for this mode. It means more expressive LANGUAGE and
  // never a new fact, which is why the rule below is stated twice over: once
  // here in the mode's own terms, and once in MEANING_RULE.
  creative: `Rewrite it with more vivid, concrete language and a livelier rhythm. Be expressive about the things the author already mentioned; do NOT add details, examples, benefits or claims they did not write. ${MEANING_RULE}`,
}

const SYSTEM_BASE =
  'You edit social captions. Output ONLY a JSON object {"text": string} — no markdown, no commentary. Preserve @mentions, #hashtags, and links exactly.'

/** Exported for the tests, which assert the rule reaches every tone mode. */
export const TONE_MODES = ['polish', 'professional', 'friendly', 'creative'] as const
export { MEANING_RULE }

const def: MeshTaskDef<CaptionRewriteInput, CaptionRewriteOutput> = {
  name: 'caption_rewrite',
  tier: 'economy',
  inputSchema: CaptionRewriteInputSchema,
  outputSchema: CaptionRewriteOutputSchema,
  maxTokens: MAX_TOKENS,
  // "more on-brand" was the directive's promise while the task had no brand to be
  // on. content_variants and plan_week ground; the one task the user invokes
  // directly on their own words did not. `cachePrefix` alone only makes the engine
  // FETCH the brain — buildMessages below is what actually spends it.
  cachePrefix: 'brand_context',
}

/** Rewrite the selection when the editor sends one; otherwise the whole caption. */
function target(input: CaptionRewriteInput): string {
  return input.selection ?? input.text
}

function buildMessages(
  input: CaptionRewriteInput,
  _ctx: MeshContext,
  brand?: ChatMessage,
  knowledge?: ChatMessage,
  market?: ChatMessage,
): ChatMessage[] {
  return [
    { role: 'system', content: `${SYSTEM_BASE} ${DIRECTIVES[input.instruction]} ${PROSE_RULES}` },
    // Brand ABOVE market, always. docs/51 RULING 1: when the two hemispheres
    // disagree the Brand Brain wins, and reading order is the cheapest way to
    // say so to a model. Anyone reordering these two lines is changing a
    // founder ruling rather than tidying an array; a test pins it.
    ...(brand ? [brand] : []),
    ...(knowledge ? [knowledge] : []),
    ...(market ? [market] : []),
    { role: 'user', content: target(input) },
  ]
}

// No demo-fallback: only brand_guidelines has one (CLAUDE.md). A double JSON
// failure here returns a typed PROVIDER_ERROR — no mock-success.
export const captionRewriteTask: MeshTaskSpec<CaptionRewriteInput, CaptionRewriteOutput> = {
  def,
  buildMessages,
  // Retrieved against the same text the model is asked to rewrite, so a caption
  // about the tasting menu draws the passage about the tasting menu.
  knowledgeQuery: target,
  /**
   * The second task to read the Marketing Brain, and the first that WRITES.
   *
   * `plan_week` was deliberately the only reader while the wire was unproven,
   * so any change in quality was attributable to one place. That has held, and
   * planning is the wrong end of the pipe to stop at: the plan decides what
   * gets made, and this decides how it reads. An observation saying shorter
   * posts earn more attention should reach the function that shortens them.
   *
   * It cannot leak: `market-context.ts` forbids quoting an observation back to
   * the reader, and every claim it carries is arithmetic over the customer's
   * own posts rather than anything a model produced.
   */
  wantsMarketContext: true,
}
