import type { BrandFieldMetaMap, BrandMemoryPayload, BrandSignal } from '@sahoda/shared'

import { provenanceOf, stateOf } from './provenance'

/**
 * THE BRAND FACTS `brand_starters_task` IS ALLOWED TO SEE.
 *
 * ── PURE, AND FED FROM THE PAYLOAD ABOUT TO BE WRITTEN ──────────────────────
 * `brand-signals.ts` and `prompt-refine.ts`'s own signal readers both go
 * through `readBrain()`, because they run on a request that arrives AFTER a
 * brain is already active. This one runs from the WRITE path
 * (`write-starters.ts`), the moment a version is produced, so it reads the
 * exact `BrandMemoryPayload` and `field_meta` that write is about to persist
 * rather than a second, possibly-stale read of `brand_memory`.
 *
 * ── WIDER THAN THE FOUR VISUAL LEAVES, BECAUSE THE JOB IS WIDER ─────────────
 * Image conditioning only reads what changes how a picture LOOKS. A picture
 * IDEA also needs what the business promises and who it is for, so this adds
 * `customer_persona.one_liner` and `hook.core_promise` on top of the four
 * `brand-signals.ts` already reads. Same six-section brain, same "empty
 * means absent, never guessed" rule.
 */
const STARTER_LEAVES: readonly {
  path: string
  field: string
  read: (p: BrandMemoryPayload) => string
}[] = [
  { path: 'voice.descriptor', field: 'voice', read: (p) => p.voice.descriptor },
  { path: 'brand_persona.archetype', field: 'character', read: (p) => p.brand_persona.archetype },
  {
    path: 'brand_persona.one_liner',
    field: 'what the business is',
    read: (p) => p.brand_persona.one_liner,
  },
  {
    path: 'customer_persona.one_liner',
    field: 'audience',
    read: (p) => p.customer_persona.one_liner,
  },
  { path: 'hook.core_promise', field: 'promise', read: (p) => p.hook.core_promise },
  { path: 'hook.primary_emotion', field: 'feeling', read: (p) => p.hook.primary_emotion },
]

/**
 * Turn a just-resolved (or just hand-edited) payload into the signals
 * `brandStartersTask` reads. Never throws: every leaf is a plain string read
 * off a schema-validated payload, so there is nothing here that can fail.
 */
export function signalsForStarters(
  payload: BrandMemoryPayload,
  fieldMeta: BrandFieldMetaMap | undefined,
): BrandSignal[] {
  const provenance = provenanceOf(fieldMeta)
  const signals: BrandSignal[] = []
  for (const leaf of STARTER_LEAVES) {
    const value = leaf.read(payload)
    if (typeof value !== 'string' || value.trim() === '') continue
    signals.push({
      field: leaf.field,
      certainty: stateOf(provenance, leaf.path) === 'confirmed' ? 'confirmed' : 'guessed',
      value: value.trim(),
    })
  }
  return signals
}
