import type { BrandMemory, BrandMemoryPayload } from '@sahoda/shared'

import { BRAIN_FIELDS } from './fields'
import { leavesEqual, readLeaf } from './leaf'

/**
 * How a field got its value.
 *
 * `confirmed` — a person wrote it. `guessed` — the model did, and nobody has
 * said otherwise yet. There is no third state: a field either has a human
 * behind it or it does not.
 */
export type FieldState = 'confirmed' | 'guessed'

/** One row of `brand_memory`, reduced to what provenance needs. */
export interface BrainVersion {
  version: number
  source: BrandMemory['source']
  payload: BrandMemoryPayload
}

export type Provenance = ReadonlyMap<string, FieldState>

/**
 * Derive per-field provenance from the append-only version history.
 *
 * `brand_memory` stores values, not authorship — but it stores EVERY version,
 * each stamped with who wrote it. So authorship is recoverable: for each field,
 * find the version at which its value last CHANGED, and read that version's
 * source. A `manual` write means a person typed it; `resolved` and `system`
 * mean the model or a fallback produced it.
 *
 * Two consequences fall out of "last changed" rather than "last written", and
 * both are the behaviour we want:
 *
 *   · A regenerate that returns the SAME text for a field you confirmed does not
 *     change it, so your confirmation stands. The model agreeing with you is not
 *     grounds to demote your answer to a guess.
 *   · A regenerate that returns DIFFERENT text overwrites your answer, and the
 *     field honestly reverts to `guessed`. What is on screen is now the model's
 *     sentence, not yours, and the ring must stop claiming otherwise.
 *
 * A field absent from the map has no history to read — the caller has no brain.
 */
export function provenanceOf(versions: readonly BrainVersion[]): Provenance {
  const state = new Map<string, FieldState>()
  if (versions.length === 0) return state

  // Ascending, so "last change wins" is just the final assignment in the walk.
  // The caller's ordering is not trusted: this is the whole basis of the ring.
  const ordered = [...versions].sort((a, b) => a.version - b.version)

  for (const field of BRAIN_FIELDS) {
    let author: BrandMemory['source'] | null = null
    let previous = readLeaf(ordered[0]!.payload, field.path)
    author = ordered[0]!.source

    for (const version of ordered.slice(1)) {
      const value = readLeaf(version.payload, field.path)
      if (!leavesEqual(previous, value)) author = version.source
      previous = value
    }

    state.set(field.path, author === 'manual' ? 'confirmed' : 'guessed')
  }

  return state
}

/** Convenience for render paths: an unknown field reads as a guess, never as confirmed. */
export function stateOf(provenance: Provenance, path: string): FieldState {
  return provenance.get(path) ?? 'guessed'
}

/**
 * Whether a person changed any editable field between two brains.
 *
 * Compares only the registered fields, so a difference in `alignment` — which the
 * model recomputes and nobody edits — never counts as a human edit.
 */
export function hasEdits(before: BrandMemoryPayload, after: BrandMemoryPayload): boolean {
  return BRAIN_FIELDS.some(
    (field) => !leavesEqual(readLeaf(before, field.path), readLeaf(after, field.path)),
  )
}
