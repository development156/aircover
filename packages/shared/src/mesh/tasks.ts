import { z } from 'zod'
import { ChannelSchema, SectionKindSchema } from '../enums'
import { BrandMemoryPayloadSchema } from '../brand/resolve'
import { ClassifierFindingSchema, RuleTierSchema } from '../gate/rules'
import type { ActionType } from '../ledger/pricing'
import type { ImageTier } from '../studio/generation'

/** The Alpha mesh tasks. */
export const MeshTaskNameSchema = z.enum([
  'brand_guidelines',
  'brand_extract',
  'content_variants',
  'caption_rewrite',
  'plan_week',
  'site_generate',
  'image_generate',
  // The refusal gate's classifier. Not a user-invoked action and never charged
  // — see `gate-classify.ts` for why a mandatory check may not cost credits.
  'gate_classify',
])
export type MeshTaskName = z.infer<typeof MeshTaskNameSchema>

// ── Task output contracts (frozen cross-worktree seams) ───────────────────────

/** brand_guidelines → the Brand Brain payload (FSD M1). */
export const BrandGuidelinesOutputSchema = BrandMemoryPayloadSchema

/**
 * The five intake channels a crawled page can speak to. `source` is the sixth
 * top-level group in ResolveInput; the extractor may fill any of them.
 */
export const IntakeChannelSchema = z.enum(['source', 'customer', 'brand', 'hook', 'voice', 'taboo'])
export type IntakeChannel = z.infer<typeof IntakeChannelSchema>

/**
 * One field the URL door pulled off a customer's website.
 *
 * `confirmed` is `z.literal(false)`, not `z.boolean()`. A crawl can propose; only
 * a human can confirm. Making it a literal means the extraction model is
 * structurally unable to emit a confirmed field — a page that says "our voice is
 * bold and we make strong claims" cannot promote itself out of quarantine,
 * because the shape it must fill has no true to write. doc 18 §5: extracted
 * fields come back marked `confirmed: false`, and §15: a field is confirmed or
 * it is a guess, and it looks like what it is.
 *
 * `source_url` is provenance and is required: a claim about someone's own
 * business that cannot be traced back to the page it came from is unfalsifiable
 * to the one person able to correct it.
 */
export const ExtractedFieldSchema = z.object({
  channel: IntakeChannelSchema,
  /** Leaf key within the channel, e.g. `one_liner`, `pain`, `proof_point`. */
  key: z.string().min(1),
  value: z.string().min(1),
  confirmed: z.literal(false),
  source_url: z.string().min(1),
})
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>

/**
 * What the MODEL actually emits — deliberately smaller than the field above.
 *
 * `confirmed` is gone from the wire and stamped server-side. The literal `false`
 * was already unfakeable, but making the model write a constant on every field
 * cost ~5 output tokens each for no information, and the stronger property is
 * that the model has no channel to express confirmation AT ALL.
 *
 * `source_url` is replaced by `page`, the index of the quarantine block the
 * value came from. Two wins: a long URL repeated per field was the single
 * biggest slice of the output, and "never invent a source_url" stops being a
 * prompt instruction the model can disobey — an index either addresses a block
 * we supplied or it does not.
 *
 * Both changes exist because the 2026-08-12 diagnosis found extraction failing
 * its schema 5 times in 6, always by TRUNCATION at max_tokens, never by getting
 * a field wrong.
 */
export const ExtractedFieldWireSchema = z.object({
  channel: IntakeChannelSchema,
  key: z.string().min(1),
  value: z.string().min(1),
  /** 0-based index of the source block. Resolved to a URL by the caller. */
  page: z.number().int().min(0),
})
export type ExtractedFieldWire = z.infer<typeof ExtractedFieldWireSchema>

/**
 * Stamp provenance the model could not forge: `confirmed:false` always, and a
 * source resolved from OUR list rather than the model's memory. An index past
 * the end of the list is dropped — a citation to a block that does not exist is
 * exactly the invention the index was introduced to prevent.
 */
/**
 * Stamp provenance when there is exactly ONE source — the upload door.
 *
 * `attachProvenance` resolves `page` as an index into a list of quarantined
 * blocks, and DROPS a field whose index is out of range. That is right for a
 * crawl: the blocks are labelled `index=0,1,2…` by `quarantinePage`, the prompt
 * tells the model to cite one of them, and an index nobody supplied is exactly
 * the invention the rule exists to catch.
 *
 * It is nonsense for a file. A PDF is attached as a `file` content part, so the
 * model is given NO blocks and no `index=` to cite — and it reasonably answers
 * with the document's own page number. Measured 2026-08-12: a text-layer PDF
 * produced 14 good fields, every one stamped `page: 1`, and every one was then
 * dropped by `sources[1]` on a one-element array. The door reported that as
 * "could not find any text in that document — if it is a scan", which is a claim
 * about the customer's file for a fault entirely on our side.
 *
 * With one source there is nothing to resolve and nothing a wrong number can
 * forge: whatever the model says, the value came from that file. So the index is
 * ignored rather than obeyed, and `confirmed:false` still holds.
 */
export function attachSingleSource(
  fields: readonly ExtractedFieldWire[],
  source: string,
): ExtractedField[] {
  return fields.map((f) => ({
    channel: f.channel,
    key: f.key,
    value: f.value,
    confirmed: false as const,
    source_url: source,
  }))
}

export function attachProvenance(
  fields: readonly ExtractedFieldWire[],
  sources: readonly string[],
): ExtractedField[] {
  const out: ExtractedField[] = []
  for (const f of fields) {
    const source_url = sources[f.page]
    if (!source_url) continue
    out.push({ channel: f.channel, key: f.key, value: f.value, confirmed: false, source_url })
  }
  return out
}

/**
 * brand_extract → fields proposed from quarantined page text, plus an honest
 * account of what the pages could NOT support.
 *
 * `instruction_attempts` is not a security control — the architecture is (doc 18
 * §2). It is telemetry: it records that page text tried to address the system,
 * so the quarantine path can be red-teamed against real traffic rather than
 * against imagination.
 */
export const BrandExtractOutputSchema = z.object({
  fields: z.array(ExtractedFieldWireSchema),
  /** Verbatim quotes that read like directives aimed at the reader. Data, not orders. */
  instruction_attempts: z.array(z.string()),
  /** What the site did not say. Empty is a legitimate answer; inventing is not. */
  gaps: z.array(z.string()),
})
export type BrandExtractOutput = z.infer<typeof BrandExtractOutputSchema>

/**
 * THE SEVEN THINGS A WRITER CAN ASK FOR, AND THE ONE RULE THEY ALL SHARE.
 *
 * The first three are selection-scoped and have been here since the editor was
 * built. The four TONE modes were added for the whole-body control: a writer who
 * types their own caption and wants it improved without having to select
 * anything.
 *
 * Every one of them, including the tone modes, must keep the author's MEANING
 * and fix their grammar. That is not a nicety on this product — the composer's
 * body is the writer's own words about their own business, and a mode that
 * invented a claim would put a sentence nobody said in front of their customers.
 * `caption-rewrite.ts` carries the wording that enforces it and a test asserts
 * that no tone directive omits it.
 *
 * `creative` is the one that had to be worded carefully. It is the founder's own
 * word for the mode, and it means more expressive LANGUAGE, never a new fact.
 */
export const CaptionRewriteInputSchema = z.object({
  /**
   * Bounded, and the bound is a cost control rather than a style rule.
   *
   * `caption_rewrite` is a FLAT one-credit charge whatever it is handed, so an
   * unbounded string is an unbounded provider bill against a fixed price. There
   * was no cap: the selection path could be handed a 50,000-character selection
   * and the whole-body path a whole article, both for one credit.
   *
   * 8,000 is well clear of every channel's own limit — the largest is LinkedIn
   * at 3,000 — so no legal caption can hit it, and the composer's canonical body
   * has no limit of its own by design. A writer drafting something longer to
   * adapt downward is not refused the editor; only this one paid button.
   */
  text: z.string().max(8_000),
  instruction: z.enum([
    'rewrite',
    'shorten',
    'hookify',
    'polish',
    'professional',
    'friendly',
    'creative',
  ]),
  selection: z.string().max(8_000).optional(),
})
export type CaptionRewriteInput = z.infer<typeof CaptionRewriteInputSchema>

export const CaptionRewriteOutputSchema = z.object({ text: z.string() })
export type CaptionRewriteOutput = z.infer<typeof CaptionRewriteOutputSchema>

// ── gate_classify — layer 3 of the refusal gate (doc 18 §8) ──────────────────

/**
 * BOUNDED, and both bounds are the point rather than tuning.
 *
 * This call sits inside a publish, on a path with a hard wall: the publish-now
 * route caps at 120s and the cron tick publishes up to four variants inside 300s
 * — arithmetic computed before any model call lived here. An unbounded rule list
 * or an unbounded body turns a gate into the reason publishing times out, and a
 * gate that makes publishing unreliable gets switched off.
 *
 * Exceeding either bound is NOT a silent truncation. The caller reports what it
 * dropped, because a rule that was never put to the classifier must not be
 * counted as one that came back clear.
 */
export const GATE_CLASSIFY_MAX_RULES = 24
export const GATE_CLASSIFY_MAX_CHARS = 4000

export const GateClassifyInputSchema = z.object({
  channel: ChannelSchema,
  text: z.string().min(1).max(GATE_CLASSIFY_MAX_CHARS),
  rules: z
    .array(
      z.object({
        id: z.string().min(1),
        tier: RuleTierSchema,
        statement: z.string().min(1),
      }),
    )
    .min(1)
    .max(GATE_CLASSIFY_MAX_RULES),
})
export type GateClassifyInput = z.infer<typeof GateClassifyInputSchema>

/**
 * One entry per rule it was given, and the engine's zod re-parse is what makes
 * that enforceable. A model that answers about three of eight rules leaves five
 * unjudged — and `decideGate` only ever sees rules it has an answer for, so a
 * short answer would read as five clean rules rather than five unanswered ones.
 */
export const GateClassifyOutputSchema = z.object({
  findings: z.array(ClassifierFindingSchema),
})
export type GateClassifyOutput = z.infer<typeof GateClassifyOutputSchema>

/** content_variants → one entry per channel; maps 1:1 onto post_variants rows. */
export const ContentVariantsOutputSchema = z.object({
  variants: z.array(
    z.object({
      channel: ChannelSchema,
      body: z.string(),
      extras: z
        .object({
          hashtags: z.array(z.string()).optional(),
          gbpCta: z.string().optional(),
        })
        .optional(),
    }),
  ),
})
export type ContentVariantsOutput = z.infer<typeof ContentVariantsOutputSchema>

/** plan_week → exactly 5 briefs (Roadmap item 11); maps 1:1 onto posts inserts. */
export const PlanWeekOutputSchema = z.object({
  briefs: z
    .array(
      z.object({
        title: z.string(),
        body: z.string(),
        channels: z.array(ChannelSchema),
        suggestedSlot: z.string(), // ISO-8601
        rationale: z.string().optional(),
      }),
    )
    .length(5),
})
export type PlanWeekOutput = z.infer<typeof PlanWeekOutputSchema>

/** site_generate → page/section tree; maps 1:1 onto site_pages + site_sections. */
export const SiteGenerateOutputSchema = z.object({
  pages: z.array(
    z.object({
      path: z.string(),
      title: z.string(),
      seo: z.object({ description: z.string() }).optional(),
      sections: z.array(
        z.object({
          kind: SectionKindSchema,
          content: z.record(z.string(), z.unknown()),
        }),
      ),
    }),
  ),
})
export type SiteGenerateOutput = z.infer<typeof SiteGenerateOutputSchema>

/**
 * MeshTaskName → ActionType (pricing key). wt-mesh and wt-billing agree on this
 * before the H2 freeze so every AI action can be charged (Alpha Gate). Values are
 * type-checked against the pricing.config.json key union.
 */
/**
 * `gate_classify` is EXCLUDED FROM THE KEY, not mapped to a placeholder.
 *
 * It is the only mesh task that is a condition of publishing rather than
 * something a person chose and saw a price for. Giving it any pricing key here
 * would leave a real, lookup-able number that some future `withCredits` wrapper
 * could act on in good faith — and the result would be charging people for
 * being refused, against "users never pay for failures".
 *
 * Excluding it from the KEY TYPE, rather than mapping it to null, means
 * `MESH_TASK_ACTION.gate_classify` does not typecheck at all. There is no price
 * to find, by construction.
 */
export const MESH_TASK_ACTION: Record<Exclude<MeshTaskName, 'gate_classify'>, ActionType> = {
  brand_guidelines: 'brand_research',
  // The URL door is PART of brand research, not a second purchase. This map is a
  // pricing-key lookup, not an instruction to charge: one `withCredits` call
  // wraps crawl → extract → resolve for a signup, so the founder pays 50 once.
  // Charging per mesh call here would bill 100 for one button.
  brand_extract: 'brand_research',
  caption_rewrite: 'caption_rewrite',
  content_variants: 'post_variants',
  plan_week: 'loop_cycle',
  site_generate: 'site_generate',
  // pricing.config.json carries BOTH `image_standard` (6) and `image_premium`
  // (12), and this map is one-to-one, so the task name has to pick. It picks the
  // cheaper: a caller that names no tier (`posts-image.ts` offers no model
  // choice) asked for "an image", and charging it 12 credits for a tier nobody
  // chose would be an overcharge. The premium price is reached through
  // `IMAGE_TIER_ACTION` below, from a tier the person picked and saw the price
  // of, and never from a branch inside this map.
  image_generate: 'image_standard',
}

/**
 * THE SECOND IMAGE PRICE, NOW THAT A UI EXISTS TO CHOOSE IT.
 *
 * The Studio lets a person pick which model draws, and two of the three are
 * billed by the provider per image drawn at many times the flat everyday rate
 * (`apps/web/src/lib/studio/models.ts` carries the measured figures). Charging
 * every model at `image_standard` sold those two below cost on every press.
 *
 * ── KEYED BY THE PRODUCT TIER, NOT BY THE MODEL ID ──────────────────────────
 * `ImageTier` is the choice a shop owner makes: `draft` while they are still
 * finding the idea, `finish` for the one that has to be right. Each model in the
 * catalogue declares which it is, so a model can be swapped for a newer one
 * without a price moving, and the row records the tier rather than deriving it
 * from a routing table that changes monthly.
 *
 * ── AND IT IS NOT A SECOND MeshTaskName ─────────────────────────────────────
 * The mesh task is still `image_generate`: routing, timeouts and token budgets
 * are keyed on the task and do not change with the price. What changes is the
 * pricing key handed to `withCredits` BEFORE the hold, so the ledger entry
 * reads "Premium image" for a premium draw. The price is visible before the
 * click because the picker and the total both read this same map.
 *
 * `draft` is `MESH_TASK_ACTION.image_generate` by reference rather than a
 * second literal, so a draft-tier press and a plain `image_generate` can never
 * drift to different prices.
 */
export const IMAGE_TIER_ACTION: Record<ImageTier, ActionType> = {
  draft: MESH_TASK_ACTION.image_generate,
  finish: 'image_premium',
}

// ── image_generate ────────────────────────────────────────────────────────────

/**
 * Feed images default to 1:1.
 *
 * Instagram's accepted aspect range is 0.75–1.91 (MEASURED against Zernio's own
 * validator, 2026-08-20 — see the note on `CONSTRAINTS.instagram.imageDims`) and
 * a square sits comfortably
 * inside it, so a default that is square is a default that passes everywhere. The
 * generator is asked for a size, not merely a ratio, because an image below
 * 320×320 fails `imageDims` no matter how correct its shape is.
 */
export const IMAGE_SIZES = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1280 },
  landscape: { width: 1280, height: 1024 },
} as const
export type ImageSizeName = keyof typeof IMAGE_SIZES

/**
 * The provider's own ceiling on the assembled prompt (docs/43), named here so
 * a caller that builds the final sentence out of several pieces (the
 * customer's words, the mode's direction, brand context, an exclusion clause)
 * can check the SAME number the schema below enforces, before spending a hold
 * on a call the schema will refuse anyway.
 */
export const IMAGE_PROMPT_MAX_CHARS = 1000

export const ImageGenerateInputSchema = z.object({
  prompt: z.string().min(3).max(IMAGE_PROMPT_MAX_CHARS),
  /** Square by default — see IMAGE_SIZES. */
  size: z.enum(['square', 'portrait', 'landscape']).default('square'),
  /**
   * AN EXACT CANVAS, WHEN THE CALLER HAS ONE, AND WHY THIS EXISTS.
   *
   * The three named sizes cover three aspect ratios: 1.0, 0.8 and 1.25. The
   * Studio's own canvases (`studio/presets.ts`) need six, and three of those
   * six have no named size that matches: a story is 0.5625, a wide post is
   * 1.78, a link card is 1.91. Asking for `landscape` and calling the answer a
   * story returns a picture of the wrong shape with nothing saying so, which is
   * exactly the class of silent substitution this codebase refuses elsewhere.
   *
   * Optional and additive: every existing caller passes `size` and is
   * unaffected. When `dims` is present it WINS, and `size` is ignored.
   *
   * The bounds are the provider's, not a product rule. The floor is above
   * instagram's 320×320 `imageDims` minimum so a generated file cannot fail
   * publishing for being too small; the ceiling is what image endpoints
   * generally accept.
   */
  dims: z
    .object({
      width: z.number().int().min(512).max(2048),
      height: z.number().int().min(512).max(2048),
    })
    .optional(),
  /**
   * PICTURES TO CONDITION ON, as links or data URLs.
   *
   * OpenRouter's Images API takes these as `input_references` and states they
   * may be HTTP(S) URLs or base64 (docs/43 §2). This is what "make more like
   * this one" is built on.
   *
   * The ceiling is the MODEL's, not a product rule: the capability endpoint
   * reports 3 on `gemini-2.5-flash-image` and 14 on Seedream 4.5. Bounded at 14
   * here so a malformed request cannot send a hundred, and bounded lower by
   * `MAX_REFERENCES` where the product knows which model it routes to.
   */
  references: z.array(z.string().min(1)).max(16).optional(),
  /**
   * WHICH MODEL DRAWS IT, when the caller has let somebody choose.
   *
   * Optional: a caller that does not care gets the tier's default. The string is
   * NOT trusted here, and the mesh checks it against `ALLOWED_IMAGE_MODELS`
   * before it reaches a provider. Validating the shape in this schema and the
   * VALUE at the router is deliberate: a schema cannot know what this account is
   * willing to be billed for.
   */
  modelId: z.string().min(1).optional(),
})
export type ImageGenerateInput = z.infer<typeof ImageGenerateInputSchema>

/**
 * What the model gave back.
 *
 * `mime` is what the BYTES are, sniffed from their magic numbers rather than
 * taken from the model's word for it — a generator that says PNG and returns
 * WebP is exactly how an unusable file reaches Instagram.
 */
export const ImageGenerateOutputSchema = z.object({
  /** Raw base64, no data-URL prefix. */
  base64: z.string().min(1),
  mime: z.string(),
  /**
   * WHAT THE PROVIDER SAID THE GENERATION COST, in US dollars.
   *
   * Optional and additive. ABSENT when the provider reported nothing, and that
   * absence must never be rendered as zero: the mesh's own `estimateCostUsd`
   * applies CHAT token rates, which for a model billed per image produces a
   * figure nobody quoted (docs/43 §1). This field is kept apart from
   * `MeshUsage.costUsd` for exactly that reason, so a caller storing a price a
   * customer will read can tell a reported figure from an estimate.
   */
  providerCostUsd: z.number().nonnegative().optional(),
})
export type ImageGenerateOutput = z.infer<typeof ImageGenerateOutputSchema>
