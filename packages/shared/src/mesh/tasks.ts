import { z } from 'zod'
import { ChannelSchema, SectionKindSchema } from '../enums'
import { BrandMemoryPayloadSchema } from '../brand/resolve'
import type { ActionType } from '../ledger/pricing'

/** The Alpha mesh tasks. */
export const MeshTaskNameSchema = z.enum([
  'brand_guidelines',
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
