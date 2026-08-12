import { z } from 'zod'
import { ChannelSchema, SectionKindSchema } from '../enums'
import { BrandMemoryPayloadSchema } from '../brand/resolve'
import type { ActionType } from '../ledger/pricing'

/** The Alpha mesh tasks. */
export const MeshTaskNameSchema = z.enum([
  'brand_guidelines',
  'brand_extract',
  'content_variants',
  'caption_rewrite',
  'plan_week',
  'site_generate',
  'image_generate',
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

export const CaptionRewriteInputSchema = z.object({
  text: z.string(),
  instruction: z.enum(['rewrite', 'shorten', 'hookify']),
  selection: z.string().optional(),
})
export type CaptionRewriteInput = z.infer<typeof CaptionRewriteInputSchema>

export const CaptionRewriteOutputSchema = z.object({ text: z.string() })
export type CaptionRewriteOutput = z.infer<typeof CaptionRewriteOutputSchema>

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
export const MESH_TASK_ACTION: Record<MeshTaskName, ActionType> = {
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
  // cheaper: a customer who asked for "an image" and is charged 12 credits for a
  // tier they never chose has been overcharged, and the reverse never happens.
  // A premium task is a SECOND MeshTaskName when a UI exists to choose it —
  // not a runtime branch inside this one, which would make the price depend on
  // something the caller cannot see before spending.
  image_generate: 'image_standard',
}

// ── image_generate ────────────────────────────────────────────────────────────

/**
 * Feed images default to 1:1.
 *
 * Instagram's accepted aspect range is 0.8–1.91 and a square sits comfortably
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

export const ImageGenerateInputSchema = z.object({
  prompt: z.string().min(3).max(1000),
  /** Square by default — see IMAGE_SIZES. */
  size: z.enum(['square', 'portrait', 'landscape']).default('square'),
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
})
export type ImageGenerateOutput = z.infer<typeof ImageGenerateOutputSchema>
