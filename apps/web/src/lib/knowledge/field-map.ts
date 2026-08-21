import type { ExtractedField } from '@sahoda/shared'

/**
 * `brand_extract`'s channel/key vocabulary → a Brand Brain field path.
 *
 * ── WHY A MAP AND NOT A GUESS ───────────────────────────────────────────────
 * The extraction task answers in an INTAKE vocabulary — `customer.pain`,
 * `brand.persona_line` — and the brain stores dotted leaf paths —
 * `customer_persona.primary_pain_point`, `brand_persona.one_liner`. They are two
 * different naming systems written at different times, and neither is derivable
 * from the other by any rule (`voice.voice_words` →
 * `voice.signature_phrases`; `hook.hook_sentence` → `hook.sample_hooks`).
 *
 * So it is written down. A pair absent from this map produces NOTHING: the
 * extracted field is dropped rather than routed to whichever brain field sounds
 * closest. `to-resolve-input.ts` sets that precedent explicitly — "fields the
 * contract does not have do not get smuggled into fields that sound close" — and
 * the cost of breaking it here is worse, because a value landing in the wrong
 * field arrives with a document citation attached and therefore looks checked.
 *
 * ── THE FOUR THAT ARE DELIBERATELY NOT MAPPED ───────────────────────────────
 * `source.category`, `source.mission`, `brand.proof_point` and
 * `hook.primary_lever` have no leaf in `BRAIN_FIELDS`. They are dropped, and
 * that is the honest outcome — the alternative is inventing a home for them.
 *
 * `taboo.legal_red_lines` is dropped on a stronger rule: `to-resolve-input.ts`
 * refuses it because nobody has checked whether the customer's rule has any
 * legal force, and asserting it does is a claim this product cannot support. A
 * document that says "never mention competitors" is an `avoid_topics` entry.
 */
const PATHS: Readonly<Record<string, string>> = {
  'source.one_liner': 'brand_persona.one_liner',
  'customer.description': 'customer_persona.one_liner',
  'customer.pain': 'customer_persona.primary_pain_point',
  'customer.fear': 'customer_persona.primary_fear',
  'customer.desired_identity': 'customer_persona.desired_identity',
  'brand.archetype': 'brand_persona.archetype',
  'brand.values': 'brand_persona.core_values',
  'brand.persona_line': 'hook.core_promise',
  'hook.hook_sentence': 'hook.sample_hooks',
  'voice.voice_words': 'voice.signature_phrases',
  'voice.tone_lines': 'voice.descriptor',
  'voice.never_use': 'voice.banned_phrases',
  'taboo.avoid_topics': 'taboo.red_lines',
}

/** Paths whose leaf is a LIST. A string value becomes a one-entry list. */
const LIST_PATHS = new Set([
  'brand_persona.core_values',
  'hook.sample_hooks',
  'voice.signature_phrases',
  'voice.banned_phrases',
  'taboo.red_lines',
])

export interface MappedField {
  path: string
  /** The value, in the shape the leaf actually holds. */
  value: string | string[]
  /** `document:<uuid>` — resolved by US from the block index, never by the model. */
  source: string
}

/** The brain path for an extracted field, or nothing. */
export function pathFor(field: { channel: string; key: string }): string | undefined {
  return PATHS[`${field.channel}.${field.key}`]
}

/**
 * Extracted fields → brain patches, dropping anything unmapped.
 *
 * ONE ENTRY PER PATH. Two extracted fields can land on the same leaf — a
 * document with three tone sentences maps all three to `voice.descriptor` — and
 * a patch built by overwriting would silently keep whichever came last while the
 * citation named a passage that did not contain it. List leaves accumulate;
 * scalar leaves keep the FIRST, which is the one whose citation is correct.
 */
export function mapExtractedFields(fields: readonly ExtractedField[]): MappedField[] {
  const byPath = new Map<string, MappedField>()

  for (const field of fields) {
    const path = pathFor(field)
    if (!path) continue

    const existing = byPath.get(path)
    if (!existing) {
      byPath.set(path, {
        path,
        value: LIST_PATHS.has(path) ? [field.value] : field.value,
        source: field.source_url,
      })
      continue
    }

    if (Array.isArray(existing.value) && !existing.value.includes(field.value)) {
      // A list grows. Deduped on the way in: the same sentence arriving twice
      // under two citations would inflate every count drawn off it.
      existing.value = [...existing.value, field.value]
    }
    // A scalar keeps the first. See the note above.
  }

  return [...byPath.values()]
}

/** `{ hook: { core_promise: 'x' } }` from `hook.core_promise`. Two levels, always. */
export function patchFor(mapped: MappedField): Record<string, unknown> {
  const [section, leaf] = mapped.path.split('.')
  if (!section || !leaf) return {}
  return { [section]: { [leaf]: mapped.value } }
}
