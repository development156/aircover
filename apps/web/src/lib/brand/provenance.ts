import type { BrandFieldMetaMap, BrandMemoryPayload } from '@sahoda/shared'

import { BRAIN_FIELDS } from './fields'
import { leavesEqual, readLeaf } from './leaf'

/**
 * How a field got its value.
 *
 * `confirmed` — a person agreed to it. `guessed` — the model produced it and
 * nobody has said otherwise yet. There is no third state: a field either has a
 * human behind it or it does not.
 */
export type FieldState = 'confirmed' | 'guessed'

export type Provenance = ReadonlyMap<string, FieldState>

/**
 * Read per-field provenance off the stored `field_meta` map.
 *
 * This USED to be derived by diffing the append-only version history: for each
 * field, find the version where its value last changed and read that version's
 * `source`. That worked, and it needed no schema change, but it inferred
 * authorship from a record that never claimed to carry any — and it made the most
 * valuable interaction on the page impossible to express. A user who reads a
 * field, agrees with it, and wants to say so produces an IDENTICAL payload, and
 * an identical payload records no change, so the diff had nothing to attribute.
 * Confirming a guess was unrepresentable.
 *
 * `FieldMeta` (packages/shared, brand/audiences.ts) is the authority instead:
 * `confirmed` is true only where a human agreed to that exact value, and `source`
 * says where the value came from. It is written by the save path
 * (`lib/brand/field-meta.ts`), which is also where the two rules that used to
 * fall out of diffing are now stated explicitly.
 *
 * A field with no entry reads as a guess. Every brain written before `field_meta`
 * existed has none, and that is the correct answer for them rather than a
 * degraded one: nobody confirmed anything in a way we recorded.
 */
export function provenanceOf(meta: BrandFieldMetaMap | undefined): Provenance {
  const state = new Map<string, FieldState>()
  if (!meta) return state

  for (const field of BRAIN_FIELDS) {
    const entry = meta[field.path]
    state.set(field.path, entry?.confirmed === true ? 'confirmed' : 'guessed')
  }

  return state
}

/** Convenience for render paths: an unknown field reads as a guess, never as confirmed. */
export function stateOf(provenance: Provenance, path: string): FieldState {
  return provenance.get(path) ?? 'guessed'
}

/**
 * Whether any editable field differs between two brains.
 *
 * Compares only the registered fields, so a difference in `alignment` — which the
 * model recomputes and nobody edits — never counts as an edit.
 */
export function hasEdits(before: BrandMemoryPayload, after: BrandMemoryPayload): boolean {
  return BRAIN_FIELDS.some(
    (field) => !leavesEqual(readLeaf(before, field.path), readLeaf(after, field.path)),
  )
}
