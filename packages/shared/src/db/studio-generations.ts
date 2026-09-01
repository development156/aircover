import { z } from 'zod'

import {
  BrandSignalsSchema,
  GenerationModeSchema,
  GenerationStatusSchema,
  ImageTierSchema,
  isSettled,
} from '../studio/generation'

/**
 * ROW SCHEMAS FOR `studio_generations` AND `studio_generation_images`.
 *
 * ── PARSED PER ROW, ALWAYS ──────────────────────────────────────────────────
 * The queue screen parses ONE ROW AT A TIME. Parsing an array in a single call
 * means one malformed generation takes the whole screen down with it, and the
 * screen it takes down is the one showing a person what they have already paid
 * for. A bad row should cost its own card and nothing else.
 *
 * ── NULL IS A REAL ANSWER HERE, MORE THAN ANYWHERE ELSE IN THIS SCHEMA ──────
 * Almost every column below is nullable and each null MEANS something distinct:
 *
 *   prompt_sent   null while queued. Set the moment it goes to a model, so
 *                 "we have not asked yet" and "this is what we asked" never
 *                 collapse into one another.
 *   seed          null means the provider gave us none. NOT zero, which is a
 *                 seed. A reader that defaults it to 0 makes a regeneration
 *                 claim to be anchored when it is not.
 *   brand_signals null means conditioning never ran; an empty ARRAY means it
 *                 ran and used nothing, which is correct for Explore.
 *   provider_cost null means the provider has not told us what it cost. A
 *                 screen that renders that as ₹0 states a price nobody quoted.
 *
 * So nothing here carries a `.default()` that would paper over one of those.
 * `requested_count` is the single exception and it defaults to 1, because a row
 * written before that column existed asked for exactly one image.
 */

/**
 * A produced image. One per slide of a generation.
 *
 * `asset_id` is nullable because deleting the PICTURE must not delete the RECORD
 * of how it was made: the migration blanks it rather than cascading. A null here
 * therefore means "this was generated and its file has since been deleted",
 * which is a true and useful thing for a screen to be able to say.
 */
export const StudioGenerationImageSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  generation_id: z.uuid(),
  /** Zero-based, and the ORDER IS MEANING: slide one is the hook, the last is the offer. */
  idx: z.number().int().min(0),
  asset_id: z.uuid().nullable(),
  seed: z.coerce.number().int().nullable().default(null),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  sha256: z.string().length(64).nullable().default(null),
  created_at: z.iso.datetime({ offset: true }),
})
export type StudioGenerationImage = z.infer<typeof StudioGenerationImageSchema>

/**
 * A generation: one press, its provenance, and where it has got to.
 *
 * `seed` and `provider_cost_micro_usd` are `bigint` in Postgres and arrive as
 * STRINGS over the data API, which is why they are coerced. A plain
 * `z.number()` would reject every row that carries one, and it would do so only
 * for rows where a provider actually returned a seed, which is the subset a
 * quick test is least likely to include.
 */
export const StudioGenerationSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),

  status: GenerationStatusSchema,
  mode: GenerationModeSchema,

  prompt_given: z.string(),
  prompt_sent: z.string().nullable().default(null),

  provider: z.string().nullable().default(null),
  model_id: z.string().nullable().default(null),
  image_tier: ImageTierSchema.nullable().default(null),

  seed: z.coerce.number().int().nullable().default(null),

  format_id: z.string().nullable().default(null),
  channel: z.string().nullable().default(null),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),

  requested_count: z.number().int().min(1).default(1),

  reference_asset_ids: z.array(z.uuid()).default([]),

  /** Null and `[]` are different answers. See this file's header. */
  brand_signals: BrandSignalsSchema.nullable().default(null),

  cost_credits: z.number().int().min(0).nullable().default(null),
  ledger_entry_id: z.uuid().nullable().default(null),
  provider_cost_micro_usd: z.coerce.number().int().min(0).nullable().default(null),

  error_code: z.string().nullable().default(null),
  error_detail: z.string().nullable().default(null),

  started_at: z.iso.datetime({ offset: true }).nullable().default(null),
  finished_at: z.iso.datetime({ offset: true }).nullable().default(null),

  created_by: z.string().nullable().default(null),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
})
export type StudioGeneration = z.infer<typeof StudioGenerationSchema>

/**
 * The same row, with the schema's own agreement with the database asserted.
 *
 * The migration carries a CHECK that a settled row must have a finish time. This
 * repeats it on the read side, and that is not belt-and-braces for its own sake:
 * the two run in different places and only this one runs against a row that
 * arrived from somewhere unexpected, such as a restored backup or a hand-written
 * fix. A `ready` generation with no finish time is a shape every screen would
 * otherwise have to defend against forever, so it is refused once, here.
 */
export const StudioGenerationRowSchema = StudioGenerationSchema.refine(
  (row) => isSettled(row.status) === (row.finished_at !== null),
  { message: 'a settled generation must carry a finish time, and a pending one must not' },
)

/** A generation with the images it produced, in slide order. */
export type StudioGenerationWithImages = StudioGeneration & {
  images: StudioGenerationImage[]
}
