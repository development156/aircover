import { z } from 'zod'

import { FieldMetaSchema } from './audiences'
import { BrandIntakeSchema } from './intake'
import { BrandMemoryPayloadSchema } from './resolve'

/**
 * Per-field provenance for a stored v1 Brand Brain.
 *
 * `FieldMetaSchema` (brand/audiences.ts) is the authority on what provenance IS —
 * `confirmed` is true only when a human agreed to this exact value, and `source`
 * records where the value came from. That contract was written for the v2 payload,
 * where each SECTION carries one `meta`. Nothing stores v2 yet: every
 * `brand_memory` row is v1, and v1 is what /brain renders.
 *
 * So the contract is adopted at the granularity v1 actually has — one entry per
 * dotted LEAF path (`voice.descriptor`, `hook.core_promise`), keyed exactly as
 * `apps/web`'s field registry keys them. When v2 lands, this map is what a
 * migration reads to fill each section's `meta` honestly instead of stamping
 * `confirmed: false` across the board the way `migrateBrandMemoryV1ToV2` must.
 */
export const BrandFieldMetaMapSchema = z.record(z.string(), FieldMetaSchema)
export type BrandFieldMetaMap = z.infer<typeof BrandFieldMetaMapSchema>

/**
 * What a `brand_memory.payload` column actually holds: the frozen model contract
 * plus provenance we stamp server-side.
 *
 * SEPARATE FROM `BrandMemoryPayloadSchema` ON PURPOSE, and the separation is
 * load-bearing in three places:
 *
 *   · `brand_guidelines` declares `BrandMemoryPayloadSchema` as its output. Adding
 *     a key there would ask the MODEL to emit provenance — the one thing a model
 *     must never be able to write. Compare `ExtractedFieldSchema`, which pins
 *     `confirmed: z.literal(false)` for the same reason.
 *   · `packages/mesh/src/brand-context.ts` re-parses the stored row with
 *     `BrandMemoryPayloadSchema` before prepending it to every model call. zod
 *     strips unknown keys, so `field_meta` is dropped there without anyone having
 *     to remember to drop it — the brand prefix does not pay tokens for it.
 *   · `public.resolve_brand_memory` validates the six sections and the array
 *     lengths and ignores anything else, so this needs no migration. The 32 KB
 *     payload ceiling still applies; fifteen entries cost ~1.4 KB against a ~2 KB
 *     brain.
 *
 * `field_meta` is OPTIONAL because every row written before this existed has none.
 * Absent is not a degraded read — it means nobody confirmed anything in a way we
 * recorded, which is exactly what an unconfirmed field is.
 */
export const StoredBrandMemorySchema = BrandMemoryPayloadSchema.extend({
  field_meta: BrandFieldMetaMapSchema.optional(),
  /**
   * The onboarding picks, on the same seam and for the same three reasons — the
   * model must not be able to write them, `brand-context.ts` strips them before
   * paying tokens for them, and the RPC ignores what it does not validate.
   *
   * OPTIONAL, and it must stay optional: every row written before this has none,
   * and a workspace whose regime was only ever ASSUMED deliberately writes none.
   */
  intake: BrandIntakeSchema.optional(),
})
export type StoredBrandMemory = z.infer<typeof StoredBrandMemorySchema>

/** `FieldMeta.source` when a person typed or agreed to the value. */
export const SOURCE_OWNER = 'owner'

/** `FieldMeta.source` when `brand_guidelines` produced the value. */
export const SOURCE_MODEL = 'model:brand_guidelines'
