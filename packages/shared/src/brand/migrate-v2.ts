import { BrandMemoryPayloadV2Schema, type BrandMemoryPayloadV2, type FieldMeta } from './audiences'
import type { BrandMemoryPayload } from './resolve'

/**
 * v1 → v2, and the honest part is what it REFUSES to invent.
 *
 * v1 has one customer persona; v2 has an audiences array. A migration cannot
 * discover the second audience — nobody wrote it down — so it produces exactly
 * one audience, marked primary, and every field it carries forward keeps the
 * confirmation status it deserves: `confirmed: false`, because no human ever
 * agreed to a v1 payload field-by-field.
 *
 * `core_promise` moves from `hook` onto the audience, which is the whole point
 * of the change: the promise varies by audience. With one audience the move is
 * lossless.
 *
 * `taboo.red_lines` becomes `red_lines.owner` — NOT `mandated`. Every v1 red
 * line was model-generated (the 2026-08-12 measurement showed neither door could
 * fill taboo, so the model invented category norms), and promoting an invention
 * to a MANDATED rule the owner may not edit would be the worst possible reading
 * of this schema.
 */
export function migrateBrandMemoryV1ToV2(v1: BrandMemoryPayload): BrandMemoryPayloadV2 {
  const inherited = (kind: FieldMeta['kind']): FieldMeta => ({
    kind,
    // NOTHING carried from v1 is confirmed. A v1 payload could be edited in the
    // Refine step, but which fields a human touched was never recorded, so
    // claiming confirmation here would be inventing consent.
    confirmed: false,
    source: 'migrated:v1',
  })

  return BrandMemoryPayloadV2Schema.parse({
    version: 2,
    audiences: [
      {
        id: 'primary',
        primary: true,
        one_liner: v1.customer_persona.one_liner,
        pains: [v1.customer_persona.primary_pain_point].filter(Boolean),
        fear: v1.customer_persona.primary_fear,
        desired_identity: v1.customer_persona.desired_identity,
        // Moves off `hook`, where it could only ever describe one audience.
        core_promise: v1.hook.core_promise,
        meta: inherited('asked'),
      },
    ],
    voice: { ...v1.voice, meta: inherited('negotiated') },
    brand_persona: { ...v1.brand_persona, meta: inherited('derived') },
    hook: {
      primary_emotion: v1.hook.primary_emotion,
      sample_hooks: v1.hook.sample_hooks,
      meta: inherited('derived'),
    },
    red_lines: { mandated: [], owner: v1.taboo.red_lines },
    alignment: { ...v1.alignment, meta: inherited('derived') },
  })
}
