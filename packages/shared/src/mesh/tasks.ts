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
}
