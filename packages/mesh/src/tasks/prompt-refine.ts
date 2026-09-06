import { z } from 'zod'
import { BrandSignalSchema, PromptRefineSettingsSchema } from '@sahoda/shared'
import type { MeshContext, MeshTaskDef, PromptRefineSettings, StampAnchor } from '@sahoda/shared'
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
 *
 * ── COMPOSING FOR THE SETTINGS, WITHOUT NAMING ONE ──────────────────────────
 * Founder's ruling, 2026-09-06: refine the words AND the screen's own
 * settings, as one structured image prompt. `input.settings`
 * (`PromptRefineSettingsSchema`) carries the canvas shape, the stamp and its
 * corner, the mode and whether a reference is attached, the exclusion text,
 * and how closely to follow a reference, never the ratio, the pixel size or
 * "logo" (still the strip's job below). `settingsGuidance` turns each one
 * into a composition instruction the model can act on without being told
 * the setting's name, and rides as its own uncached system message AFTER
 * the brand block, so a settings change (every press) never invalidates the
 * Brand Brain cache prefix.
 */

/** A little more room than before: the prompt now covers subject, setting, light, composition and mood, still one string under the 1200-char schema cap. */
const MAX_TOKENS = 450

export const PromptRefineInputSchema = z.object({
  /** What the person typed. Never rewritten in place — the caller keeps this and the refinement side by side. */
  wanted: z.string().trim().min(3).max(1000),
  /**
   * Brand facts already resolved to text, each with the certainty the source
   * can support. Empty for BOTH "nothing in the brain" and "could not read the
   * brain" — see the file header for why that collapse is correct here.
   */
  signals: z.array(BrandSignalSchema).max(16),
  /** The screen's own settings, to compose FOR without ever naming one. See the file header. */
  settings: PromptRefineSettingsSchema,
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
 * Deliberately over-inclusive within its six categories (ratio/format, pixel
 * size, image count, named model, logo, and the exclusion clause below)
 * rather than trying to be clever about intent — a false positive here costs
 * one sentence of a multi-sentence refinement; a false negative lets a
 * contradiction, or a duplicate, through to the model that actually draws
 * the picture.
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
  // The exclusion clause. `excludeText` (via `settings.excludeText`) is
  // appended separately, downstream, by `apps/web`'s `conditionPrompt`. A
  // refinement that also states it as a bolted "Avoid including: X." clause
  // would put the same instruction in the prompt actually sent twice.
  /\bavoid\s+including\b/i,
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

/**
 * SUBJECT, SETTING, LIGHT, COMPOSITION, MOOD: the usual shape a diffusion
 * model reads well, front-loading the thing the picture is OF and narrowing
 * to atmosphere, the order a photographer would brief a shoot in. Asked for
 * as guidance over ONE flowing description, not a labelled list: the box
 * this returns to holds a single string a person can read and edit, and
 * five labelled fields would not read back as their own words.
 */
const SYSTEM =
  'You refine an image-generation prompt a Sahoda customer already typed, so a picture-generation ' +
  'model has more to work with. Output ONLY a JSON object {"refined": string} — no markdown, no ' +
  'commentary. Keep the same subject and intent the person described. Write two to five sentences ' +
  'of concrete, visual description that cover the subject, the setting around it, the light, how ' +
  'the picture is composed, and the mood, roughly in that order, as one flowing description rather ' +
  `than a labelled list. ${NO_INVENTION_RULE} ${NO_SETTINGS_RULE} ${PROSE_RULES}`

/** The four `StampAnchorSchema` values, in plain English: the model is told where to leave room, never the word "anchor". */
const CORNER_PHRASE: Record<StampAnchor, string> = {
  'bottom-right': 'bottom-right',
  'bottom-left': 'bottom-left',
  'top-right': 'top-right',
  'top-left': 'top-left',
}

const SHAPE_DIRECTION: Record<PromptRefineSettings['shape'], string> = {
  square:
    'This picture will be seen in a square crop: center the subject with balanced space on every side.',
  tall: 'This picture will be seen in a tall crop: give the subject headroom and let the scene run vertically.',
  wide: 'This picture will be seen in a wide crop: leave open space beside the subject rather than filling the frame edge to edge.',
}

/**
 * The screen's settings, turned into composition instructions, never into
 * names. Exported so each instruction is testable on its own, the same
 * discipline `stripSettingsLanguage` gets. The shape line is always
 * present; the rest apply only when their setting does.
 */
export function settingsGuidance(settings: PromptRefineSettings): string {
  const lines: string[] = [SHAPE_DIRECTION[settings.shape]]

  if (settings.stampEnabled) {
    lines.push(
      `Leave calm, uncluttered space in the ${CORNER_PHRASE[settings.stampAnchor]} corner of ` +
        'the frame, since something else will be placed there.',
    )
  }

  if (settings.mode === 'explore') {
    lines.push('Favor a loose, varied interpretation over one fixed, precise composition.')
  } else if (settings.hasReference) {
    lines.push(
      'Write this as a variation on the picture already attached rather than a brand new scene, ' +
        'without describing what that picture shows.',
    )
    if (settings.referenceFollow === 'close') {
      lines.push('Ask for the composition to stay close to the attached picture.')
    } else if (settings.referenceFollow === 'loose') {
      lines.push('Ask for freedom to vary the composition loosely from the attached picture.')
    }
  }

  if (settings.excludeText !== undefined) {
    lines.push(
      `Write the description so it naturally never includes ${settings.excludeText}, folded ` +
        'into the sentence rather than added as a separate note at the end.',
    )
  }

  return lines.join(' ')
}

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
  // After the (possibly cached) brand block, never before it: settings
  // change on every press, so putting this ahead of the brand block would
  // make it part of the cached prefix and invalidate the cache on every
  // press regardless of whether the Brand Brain changed.
  messages.push({ role: 'system', content: settingsGuidance(input.settings) })
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

// No demo-fallback: only brand_guidelines has one. A double JSON failure (or
// output that is nothing but settings language, twice) returns a typed
// PROVIDER_ERROR, never a plausible-looking string.
export const promptRefineTask: MeshTaskSpec<PromptRefineInput, PromptRefineOutput> = {
  def,
  buildMessages,
}
