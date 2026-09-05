import { z } from 'zod'
import { BrandSignalSchema } from '@sahoda/shared'
import type { MeshContext, MeshTaskDef } from '@sahoda/shared'
import type { ChatMessage } from '../providers/types'
import type { MeshTaskSpec } from '../engine'
import { PROSE_RULES } from '../prose-rules'

/**
 * REFINING WHAT A PERSON TYPED, WITHOUT RESTATING A SETTING OR INVENTING A FACT.
 *
 * ── THE WHOLE DESIGN IS WHAT THIS MUST NOT DO ───────────────────────────────
 * A person types a few words for a picture. This task hands back a clearer,
 * more concrete version of the SAME idea, grounded in whatever the Brand Brain
 * actually holds. Three things it may never do:
 *
 *   1. Restate a setting the screen already carries. Aspect ratio, size, count,
 *      model and the logo are controls, sent separately, and a refined prompt
 *      that names one can CONTRADICT it. `NO_SETTINGS_RULE` asks the model not
 *      to; `stripSettingsLanguage` removes any sentence that tries anyway,
 *      inside `PromptRefineOutputSchema` itself, so the guarantee does not
 *      depend on the model obeying an instruction.
 *   2. Invent a fact about the business. `NO_INVENTION_RULE` is explicit, and
 *      the only brand material the model ever sees is `input.signals` — facts
 *      the caller already resolved from the Brand Brain, each carrying the
 *      certainty ('confirmed' | 'guessed') the brain itself supports. Nothing
 *      is added beyond what is typed and what is given.
 *   3. Pretend it read something it did not. This task takes NO position on
 *      why `signals` is empty — an empty Brand Brain and an unreadable one
 *      both arrive here as `signals: []`, and that is correct: from the
 *      model's side, "nothing to work from" is one situation. Telling those
 *      two apart is a CALLER concern (`apps/web/src/lib/studio/prompt-refine.ts`
 *      keeps them apart from the moment the brain is read), because it is the
 *      caller that owns the sentence a person reads, not this task.
 *
 * ── WHY THIS DOES NOT USE `cachePrefix: 'brand_context'` ────────────────────
 * Every other grounded task (`caption_rewrite`, `content_variants`) declares
 * `cachePrefix: 'brand_context'` and lets the engine fetch the brain itself via
 * `BrandContextProvider`. That provider is deliberately best-effort: a fetch
 * failure and "no brain exists" both collapse to `undefined` (`engine.ts`'s
 * `try { … } catch { return undefined }`), which is exactly right for a task
 * that only needs SOME grounding or none. It is wrong here: this task's own
 * contract requires telling "empty" and "unreadable" apart, in the COPY a
 * person reads before they accept a refined prompt, and a provider that erases
 * that distinction cannot supply it. So the caller resolves the brain itself
 * (through `readBrain()`, which already has the four-way honest status this
 * needs) and hands the RESULT in as `signals`, the same shape
 * `conditionPrompt` in `apps/web/src/lib/studio/prompt.ts` already uses for
 * image conditioning.
 *
 * The cache-controlled prefix still exists: `buildMessages` marks the brand
 * block `cache: true` when there are any signals, exactly like the engine's
 * own mechanism does. It is content-addressed rather than version-keyed by a
 * separate lookup — the block's text IS the brain's current content, so a
 * Brain version bump changes the text and therefore the cache key implicitly,
 * with no second cache to keep in step with the first.
 *
 * ── PRICING ──────────────────────────────────────────────────────────────────
 * `pricing.config.json` has no entry for this task. None is invented here —
 * see the server action for where that is flagged.
 */

/** Small: a refined prompt is a few sentences, not an essay. JSON + a 1200-char cap comfortably fits. */
const MAX_TOKENS = 400

export const PromptRefineInputSchema = z.object({
  /** What the person typed. Never rewritten in place — the caller keeps this and the refinement side by side. */
  wanted: z.string().trim().min(3).max(1000),
  /**
   * Brand facts already resolved to text, each with the certainty the source
   * can support. Empty for BOTH "nothing in the brain" and "could not read the
   * brain" — see the file header for why that collapse is correct here.
   */
  signals: z.array(BrandSignalSchema).max(16),
})
export type PromptRefineInput = z.infer<typeof PromptRefineInputSchema>

/**
 * SENTENCES THAT TALK ABOUT A SETTING, NOT ABOUT THE PICTURE.
 *
 * Sentence-scoped rather than word-scoped: a sentence that names an aspect
 * ratio is a sentence about the control, not about the scene, and keeping the
 * other half of it (after deleting only the ratio) tends to leave a dangling
 * fragment. Dropping the whole sentence is the safer failure.
 *
 * Deliberately over-inclusive within its five categories (ratio/format, pixel
 * size, image count, named model, logo) rather than trying to be clever about
 * intent — a false positive here costs one sentence of a multi-sentence
 * refinement; a false negative lets a contradiction through to the model that
 * actually draws the picture.
 */
const SETTINGS_SENTENCE_PATTERNS: readonly RegExp[] = [
  // Aspect ratio / format.
  /\baspect\s*ratio\b/i,
  /\b\d{1,2}\s*:\s*\d{1,2}\b/,
  /\b(square|portrait|landscape|widescreen)\s+(format|orientation|canvas|crop|aspect)\b/i,
  // Pixel size / resolution.
  /\b\d+\s*[x×]\s*\d+(\s*(px|pixels))?\b/i,
  /\b\d+\s*(px|pixels)\b/i,
  // How many images.
  /\b(generate|make|create|produce|render|give me|show me)\s+\d+\s+(images?|pictures?|photos?|variations?|options?|versions?)\b/i,
  /\b\d+\s+(images?|pictures?|photos?|variations?|options?|versions?|shots?)\b/i,
  // Which model draws it.
  /\b(dall-?e|midjourney|stable\s*diffusion|gemini|seedream|imagen|firefly|gpt-image)\b/i,
  /\busing\s+(the\s+)?model\b/i,
  /\bwhich\s+model\b/i,
  // The logo. Placement is set by a separate control.
  /\blogo\b/i,
]

function mentionsSetting(sentence: string): boolean {
  return SETTINGS_SENTENCE_PATTERNS.some((re) => re.test(sentence))
}

/**
 * Drop every sentence that talks about a setting the screen already controls.
 *
 * Exported so the guarantee is testable directly, not only through the
 * schema's transform.
 */
export function stripSettingsLanguage(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return sentences
    .filter((s) => !mentionsSetting(s))
    .join(' ')
    .trim()
}

export const NO_INVENTION_RULE =
  'Use only what the person typed and the brand facts given below, if any. Never invent a ' +
  'product, price, offer, location or any other fact about the business that is not stated ' +
  'in one of those two places.'

export const NO_SETTINGS_RULE =
  'Never mention aspect ratio, image size or pixel dimensions, how many images to make, which ' +
  'model draws it, or the logo. The screen sets all of those separately, and repeating one here ' +
  'can contradict what was actually chosen.'

const SYSTEM =
  'You refine an image-generation prompt a Sahoda customer already typed, so a picture-generation ' +
  'model has more to work with. Output ONLY a JSON object {"refined": string} — no markdown, no ' +
  'commentary. Keep the same subject and intent the person described; write two to four sentences ' +
  `of concrete, visual description. ${NO_INVENTION_RULE} ${NO_SETTINGS_RULE} ${PROSE_RULES}`

const RawPromptRefineOutputSchema = z.object({ refined: z.string().trim().min(1).max(1200) })

/**
 * THE STRIP LIVES IN THE SCHEMA, NOT AFTER IT.
 *
 * `engine.ts` zod-parses the model's answer and that is the ONLY place every
 * call site is guaranteed to pass through — a strip applied by a caller after
 * `runTask` returns would be one more thing every future caller has to
 * remember. Folding it into the transform means "the settings-language
 * guarantee held" is the same fact as "the output parsed".
 *
 * A refinement that is NOTHING BUT settings language strips to an empty
 * string. That is treated as a schema failure (`ctx.addIssue` + `z.NEVER`),
 * which spends the runner's one repair retry and then surfaces as
 * `PROVIDER_ERROR` rather than silently handing back an empty "refinement" —
 * the same "no plausible string on a failure" guarantee every other task here
 * gets from `safeParseOutput`.
 */
export const PromptRefineOutputSchema = RawPromptRefineOutputSchema.transform((val, ctx) => {
  const refined = stripSettingsLanguage(val.refined)
  if (refined.length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'refined prompt said nothing once settings language was removed',
    })
    return z.NEVER
  }
  return { refined }
})
export type PromptRefineOutput = z.infer<typeof PromptRefineOutputSchema>

function buildMessages(input: PromptRefineInput, _ctx: MeshContext): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM }]
  if (input.signals.length > 0) {
    messages.push({
      role: 'system',
      content: [
        'Brand facts you may use, and nothing else about the brand:',
        ...input.signals.map((s) => `- ${s.field} (${s.certainty}): ${s.value}`),
      ].join('\n'),
      // Content-addressed: this text is a deterministic rendering of the
      // caller-resolved brain, so it only changes when the brain does.
      cache: true,
    })
  }
  messages.push({ role: 'user', content: input.wanted })
  return messages
}

const def: MeshTaskDef<PromptRefineInput, PromptRefineOutput> = {
  name: 'studio_prompt_refine',
  tier: 'economy',
  inputSchema: PromptRefineInputSchema,
  outputSchema: PromptRefineOutputSchema,
  maxTokens: MAX_TOKENS,
}

// No demo-fallback: only brand_guidelines has one. A double JSON failure (or an
// output that is nothing but settings language, twice) returns a typed
// PROVIDER_ERROR, never a plausible-looking string.
export const promptRefineTask: MeshTaskSpec<PromptRefineInput, PromptRefineOutput> = {
  def,
  buildMessages,
}
