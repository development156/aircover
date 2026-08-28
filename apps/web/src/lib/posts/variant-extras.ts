import { CONSTRAINTS } from '@sahoda/shared'
import { z } from 'zod'

const PollSchema = z.object({
  question: z.string().optional(),
  options: z.array(z.string()),
  durationMinutes: z.number().optional(),
  durationCode: z.string().optional(),
})

const GbpEventSchema = z.object({
  title: z.string(),
  startDate: z.string(),
  endDate: z.string().optional(),
})

const GbpOfferSchema = z.object({
  couponCode: z.string().optional(),
  redeemUrl: z.string().optional(),
  terms: z.string().optional(),
})

/**
 * Shape of `post_variants.extras`, which is untyped jsonb in the database.
 *
 * `formatForPlatform` in the frozen Constraint Engine drops the GBP CTA, the
 * offer text and media ids, so apps/web parks them here. The declared fields
 * stay compatible with the mesh output shape `{ hashtags?, gbpCta? }`.
 *
 * It is also where every per-channel CONTROL lives — the poll, Google's topic,
 * the first comment, the collaborators, the AI label. None of those is a FORMAT:
 * a poll is a text post with a poll on it, and Google's topic is a variation on a
 * standard post. Putting them in `post_variants.format` would have meant a
 * migration widening a CHECK constraint for something that is not a format.
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
    /**
     * Whether the published keyword tail wears its brackets (REQUESTS §34/§35).
     *
     * ABSENT MEANS TRUE. Brackets are what shipped and what every row written
     * since publishes; making absence mean `false` would silently change what
     * those posts put out. Unticking the box writes `false` explicitly.
     */
    keywordBrackets: z.boolean().optional(),
    gbpCta: z.string().optional(),
    ctaUrl: z.string().optional(),
    offer: z.string().optional(),
    // ── THE PER-CHANNEL CONTROLS ────────────────────────────────────────────
    // Shape-checked only. The VALUE rules — a poll's 2-4 answers, X's 25-character
    // answers, Google's date — live in `@sahoda/publishing`'s `refusePoll` and
    // `refuseGbpTopic`, which are the same functions the publish path runs. A
    // second copy of a bound here is how the editor and the publisher come to
    // disagree, which is the thing this whole column has already done once.
    poll: PollSchema.optional(),
    firstComment: z.string().optional(),
    collaborators: z.array(z.string()).optional(),
    aiGenerated: z.boolean().optional(),
    gbpTopic: z.enum(['EVENT', 'OFFER']).optional(),
    gbpEvent: GbpEventSchema.optional(),
    gbpOffer: GbpOfferSchema.optional(),
  })
  .loose()

export type VariantExtras = z.infer<typeof VariantExtrasSchema>

/** Per-field schemas, used to salvage a partially invalid object. */
const FIELD_SCHEMAS = {
  hashtags: z.array(z.string()),
  gbpCta: z.string(),
  ctaUrl: z.string(),
  offer: z.string(),
  poll: PollSchema,
  firstComment: z.string(),
  collaborators: z.array(z.string()),
  aiGenerated: z.boolean(),
  // MISSED ON THE FIRST PASS, and its own test caught it: declaring a field in
  // `VariantExtrasSchema` alone is not enough. The salvage path below reads THIS
  // map, so a field absent here is passed through unchecked — a stored
  // `"false"` string would have survived and read as `!== false`, turning the
  // brackets back ON for a writer who had switched them off.
  keywordBrackets: z.boolean(),
  gbpTopic: z.enum(['EVENT', 'OFFER']),
  gbpEvent: GbpEventSchema,
  gbpOffer: GbpOfferSchema,
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

/**
 * Does this variant publish its keywords in brackets?
 *
 * ── ONE LINE, AND IT IS THE MOST DANGEROUS ONE IN THE FEATURE ────────────────
 * `keywordBrackets` is absent on every row written before the tick box existed,
 * and all of those publish WITH brackets (REQUESTS §34). So absence must read as
 * true. Reading it as `=== true` instead would silently strip the brackets from
 * every existing post, with nothing on any screen to show it had happened —
 * exactly the class of change this codebase refuses.
 *
 * It lives here rather than inline in `version-card.tsx` because a mutation
 * proved the inline version untestable: flipping it to `=== true` left every
 * suite green. A named function has somewhere to put a test.
 */
export function keywordBracketsOn(extras: VariantExtras): boolean {
  return extras.keywordBrackets !== false
}
