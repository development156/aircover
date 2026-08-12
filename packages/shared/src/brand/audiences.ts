import { z } from 'zod'
import { SignalLockSchema } from '../enums'

/**
 * Brand Brain v2 (doc 18 §3). Two structural problems with v1, and one missing
 * distinction that this session measured the cost of.
 *
 * V1 had `customer_persona` as a SINGLE object and `hook.core_promise` as a
 * SINGULAR string. That holds for a café. It breaks for a school (parents and
 * students), an incubator (founders and funders), a marketplace (buyers and
 * sellers) and any B2B sale decided by a committee — it writes for an average
 * person who does not exist. FBS, the brand every arm of the 2026-08-12
 * measurement ran against, is exactly this case.
 *
 * The missing distinction is `kind`. A crawled sentence and a sentence a founder
 * typed looked identical once they were inside the payload, so a Brain resolved
 * off a website read `moderate` with nobody having agreed to anything.
 */

/**
 * The four kinds, and what each one licenses. Doc 18 §3 is the authority; the
 * point of encoding it is that "may we ask this?" stops being a judgement call.
 *
 *   MANDATED   — set by regime or locale. VISIBLE, NOT EDITABLE by the owner.
 *                "This clinic may not promise a cure" is not a preference and
 *                the owner is not the party entitled to waive it.
 *   ASKED      — only they know it. NEVER guessed. red_lines (owner tier),
 *                banned_phrases, audiences, what they sell, proof points.
 *   NEGOTIATED — they have the instinct, we have the craft. Never asked as a
 *                parameter; always shown as two outputs with "which sounds like
 *                you?". voice tone, formality, signature phrases, palette.
 *   DERIVED    — asking makes the data WORSE. Every owner thinks their shop is
 *                The Rebel and every owner's values are "quality, honesty,
 *                customer focus". Never asked, never counted in the ring, and
 *                always shown with its evidence attached.
 */
export const FieldKindSchema = z.enum(['mandated', 'asked', 'negotiated', 'derived'])
export type FieldKind = z.infer<typeof FieldKindSchema>

/**
 * Provenance carried by every field that could have come from somewhere other
 * than a human. This is the fix for the fake-confirmation state: extracted text
 * stays distinguishable from founder-typed prose all the way in.
 */
export const FieldMetaSchema = z.object({
  kind: FieldKindSchema,
  /**
   * TRUE only when a human agreed to this exact value. A crawl, a PDF and a
   * model inference all produce `false` — and a `derived` field can never be
   * confirmed at all, because confirming a diagnosis is not a thing the owner
   * is being asked to do.
   */
  confirmed: z.boolean(),
  /** Where it came from: a URL, a filename, 'owner', or a pack path. */
  source: z.string().min(1),
  /** MANDATED only: which rule set, so a rule can be re-checked when it changes. */
  ruleset_version: z.string().optional(),
})
export type FieldMeta = z.infer<typeof FieldMetaSchema>

/**
 * One audience. The array is the fix for the single-persona problem, and
 * `core_promise` lives HERE rather than on `hook` because the promise varies by
 * audience: a school promises parents a safe, rigorous place and promises
 * students somewhere they are known.
 */
export const AudienceSchema = z.object({
  id: z.string().min(1),
  primary: z.boolean(),
  one_liner: z.string(),
  pains: z.array(z.string()),
  fear: z.string().default(''),
  desired_identity: z.string().default(''),
  core_promise: z.string(),
  meta: FieldMetaSchema,
})
export type Audience = z.infer<typeof AudienceSchema>

/** EXACTLY ONE primary. Zero leaves every consumer picking arbitrarily; two is the same bug twice. */
export const AudiencesSchema = z
  .array(AudienceSchema)
  .min(1)
  .refine((a) => a.filter((x) => x.primary).length === 1, {
    message: 'exactly one audience must be primary',
  })

/**
 * Red lines, split by who is entitled to change them.
 *
 * The 2026-08-12 measurement is why this split is structural rather than a
 * convention: neither the URL door nor the upload door could fill `taboo` at
 * all — no business publishes what it must never say — so the model invented
 * category norms that any competitor could adopt unchanged. `mandated` comes
 * from a regime pack selected by code; `owner` is ASKED and never guessed.
 */
export const RedLinesSchema = z.object({
  mandated: z.array(
    z.object({
      rule: z.string().min(1),
      source: z.string().min(1),
      ruleset_version: z.string().min(1),
    }),
  ),
  owner: z.array(z.string()),
})

/**
 * The sibling confirmation map: confirming one field settles its siblings.
 *
 * Onboarding cannot ask eighteen questions. When an owner confirms the value on
 * the left, the values on the right stop being open questions too — they were
 * derived from the same answer, so a second confirmation would be asking the
 * same thing twice in different words. Anything NOT listed here needs its own
 * confirmation.
 */
export const SIBLING_CONFIRMATION: Readonly<Record<string, readonly string[]>> = {
  // Approving the primary audience settles what was inferred from it.
  'audiences[primary].one_liner': ['audiences[primary].pains', 'audiences[primary].fear'],
  // Approving the promise settles the hooks written to deliver it.
  'audiences[primary].core_promise': ['hook.primary_emotion', 'hook.sample_hooks'],
  // Approving the voice descriptor settles its phrasing.
  'voice.descriptor': ['voice.formality_label', 'voice.signature_phrases'],
  // Approving the owner red lines settles the phrases they rule out.
  'red_lines.owner': ['voice.banned_phrases'],
} as const

export const BrandMemoryPayloadV2Schema = z.object({
  version: z.literal(2),
  audiences: AudiencesSchema,
  voice: z.object({
    descriptor: z.string(),
    formality_label: z.string(),
    signature_phrases: z.array(z.string()),
    banned_phrases: z.array(z.string()),
    meta: FieldMetaSchema,
  }),
  brand_persona: z.object({
    archetype: z.string(),
    one_liner: z.string(),
    core_values: z.array(z.string()),
    meta: FieldMetaSchema,
  }),
  hook: z.object({
    primary_emotion: z.string(),
    sample_hooks: z.array(z.string()),
    meta: FieldMetaSchema,
  }),
  red_lines: RedLinesSchema,
  alignment: z.object({
    signal_lock: SignalLockSchema,
    note: z.string(),
    /**
     * DERIVED, always. signal_lock is a diagnosis, and doc 18 §6's ring warning
     * applies: a "fields filled" reading hits 100% the moment onboarding ends.
     */
    meta: FieldMetaSchema,
  }),
})
export type BrandMemoryPayloadV2 = z.infer<typeof BrandMemoryPayloadV2Schema>
