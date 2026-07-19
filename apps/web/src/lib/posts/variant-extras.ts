import { CONSTRAINTS } from '@sahoda/shared'
import { z } from 'zod'

/**
 * Shape of `post_variants.extras`, which is untyped jsonb in the database.
 *
 * `formatForPlatform` in the frozen Constraint Engine drops the GBP CTA, the
 * offer text and media ids, so apps/web parks them here. The declared fields
 * stay compatible with the mesh output shape `{ hashtags?, gbpCta? }`.
 *
 * LOOSE, not strict, and this is deliberate. `extras` is a single shared jsonb
 * column that more than one lane writes to. Any read-modify-write through this
 * module is a round-trip, so stripping unknown keys would silently delete the
 * publishing lane's data on every save. Unknown keys therefore pass through
 * untouched; only the fields we actually declare are type-checked.
 */
export const VariantExtrasSchema = z
  .object({
    hashtags: z.array(z.string()).optional(),
    gbpCta: z.string().optional(),
    ctaUrl: z.string().optional(),
    offer: z.string().optional(),
  })
  .loose()

export type VariantExtras = z.infer<typeof VariantExtrasSchema>

/** Per-field schemas, used to salvage a partially invalid object. */
const FIELD_SCHEMAS = {
  hashtags: z.array(z.string()),
  gbpCta: z.string(),
  ctaUrl: z.string(),
  offer: z.string(),
} as const

const isPlainObject = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw)

/**
 * Parse stored `extras` jsonb. Never throws.
 *
 * Non-object input yields `{}`. For object input, each declared field is kept
 * only if it type-checks; an invalid field is dropped rather than failing the
 * whole object, so one bad key written by any lane cannot wipe the others.
 * Unknown keys are always preserved. Value-level rules are NOT applied here:
 * a `gbpCta` of "TELEPORT" parses fine, so callers must run `isValidGbpCta`
 * before publishing.
 */
export function parseExtras(raw: unknown): VariantExtras {
  if (!isPlainObject(raw)) return {}

  const parsed = VariantExtrasSchema.safeParse(raw)
  if (parsed.success) return parsed.data

  // Salvage: drop only the declared fields that failed, keep everything else.
  const salvaged: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    // Stored jsonb can hold any key. `__proto__` would reassign the accumulator's
    // prototype instead of becoming an own key, so drop it — which is also what
    // the clean zod path above does with it.
    if (key === '__proto__') continue
    // hasOwn, never `in`: `in` walks the prototype chain, so a stored key named
    // `toString` or `constructor` would resolve to an Object.prototype member
    // and throw on `.safeParse`.
    const fieldSchema = Object.hasOwn(FIELD_SCHEMAS, key)
      ? FIELD_SCHEMAS[key as keyof typeof FIELD_SCHEMAS]
      : undefined
    if (fieldSchema === undefined) {
      salvaged[key] = value
      continue
    }
    const field = fieldSchema.safeParse(value)
    if (field.success) salvaged[key] = field.data
  }

  return salvaged as VariantExtras
}

/**
 * The GBP call-to-action codes the frozen engine accepts.
 *
 * `GBP_CTA_TYPES` is module-private in @sahoda/shared, so the spec is the only
 * exported path to it. Returns a copy: the underlying array is the engine's own
 * constant and must not be mutable through this seam.
 */
export function gbpCtaTypes(): string[] {
  return [...(CONSTRAINTS.gbp.gbp?.ctaTypes ?? [])]
}

/**
 * Whether `cta` is a GBP call-to-action code the engine accepts.
 *
 * Exact match, no trimming and no case folding: the GBP API expects the literal
 * uppercase code, so anything else should surface as a validation failure
 * rather than be silently repaired.
 */
export function isValidGbpCta(cta: string): boolean {
  return gbpCtaTypes().includes(cta)
}
