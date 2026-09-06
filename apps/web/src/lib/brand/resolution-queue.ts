import { BRAIN_FIELDS, type BrainField, type BrainFieldMetaKind } from './fields'
import { readLeaf, type BrainLeaf } from './leaf'
import { stateOf, type FieldState, type Provenance } from './provenance'
import type { BrandMemoryPayload } from '@sahoda/shared'

/**
 * The Signal Resolution Console's queue: which guesses to put in front of a
 * person, and in what order.
 *
 * ── WHY THE ORDER IS NOT JUST THE REGISTRY ORDER ─────────────────────────────
 * `BRAIN_FIELDS` is already sorted by how much a field shapes what Sahoda
 * writes, and `brainRing().next` simply takes the first unconfirmed entry. That
 * is the right question for a one-line nudge in the topbar. It is the wrong
 * question for a console, because it answers "what matters most?" and not
 * "which of these did Sahoda have no business answering?"
 *
 * The second question has a real answer in the data, and it is the sharpest
 * thing this codebase knows about its own Brand Brain. `FieldKindSchema`
 * (packages/shared, brand/audiences.ts) defines what each kind licenses, and of
 * ASKED it says, in the contract itself:
 *
 *     ASKED — only they know it. NEVER guessed.
 *
 * Eleven of the fifteen registered fields are `asked`. A resolve fills all
 * fifteen. So the moment a brain is resolved and nothing is confirmed, eleven
 * fields hold model answers to questions the contract says the model may not
 * answer. That is not a bug in the resolve — a brain has to start somewhere,
 * and a blank form is worse — but it IS the thing a person should spend their
 * attention on first, and it is derivable rather than asserted.
 *
 * NEGOTIATED is the opposite case and must not be lumped in with it: "they have
 * the instinct, we have the craft … always shown as two outputs with 'which
 * sounds like you?'". A model proposal on `voice.descriptor` is the field
 * working as designed. Ranking it beside an unearned answer about the
 * customer's own red lines would flatten the one distinction worth drawing.
 *
 * `mandated` and `derived` never appear here. `mandated` needs a regime pack
 * that nothing selects yet, and `derived` fields live in `DERIVED_FIELDS`,
 * outside the ring, because a conclusion is not something a person can confirm.
 */

export interface QueueEntry {
  field: BrainField
  value: BrainLeaf
  state: FieldState
  /**
   * True when the field holds no value at all. A blank guess is a different
   * situation from a wrong one — there is nothing to agree with — so the row
   * offers correction and never a bare confirm.
   */
  blank: boolean
}

export function isBlank(value: BrainLeaf): boolean {
  return Array.isArray(value) ? value.length === 0 : value.trim().length === 0
}

/** Registry position, so ordering within a kind stays the priority order. */
const PRIORITY = new Map(BRAIN_FIELDS.map((field, index) => [field.path, index]))

/** Unentitled guesses first. Within a kind, the registry's own priority. */
const KIND_RANK: Record<BrainFieldMetaKind, number> = { asked: 0, negotiated: 1 }

function entry(field: BrainField, payload: BrandMemoryPayload, provenance: Provenance): QueueEntry {
  /**
   * `readLeaf` returns `undefined` when the path names nothing — a section the
   * stored payload does not carry. `BrandMemoryPayloadSchema` requires all six,
   * so this should be unreachable for a row that parsed; it is handled anyway
   * because the alternative is a crash on the one screen whose whole subject is
   * how little Sahoda is entitled to assume.
   *
   * MISSING READS AS BLANK, never as a value. The empty shape is taken from the
   * field's declared `kind`, so a list stays a list — handing a string to a
   * list editor is how a repair invents a value that was never there.
   */
  const raw = readLeaf(payload, field.path)
  const value: BrainLeaf = raw ?? (field.kind === 'list' ? [] : '')
  return { field, value, state: stateOf(provenance, field.path), blank: isBlank(value) }
}

function byRank(a: QueueEntry, b: QueueEntry): number {
  // What the person told Sahoda comes before anything Sahoda made up.
  const intake = Number(b.state === 'intake') - Number(a.state === 'intake')
  if (intake !== 0) return intake
  const kind = KIND_RANK[a.field.metaKind] - KIND_RANK[b.field.metaKind]
  if (kind !== 0) return kind
  return (PRIORITY.get(a.field.path) ?? 0) - (PRIORITY.get(b.field.path) ?? 0)
}

/**
 * Everything still a guess, in the order to resolve it.
 *
 * Derived from `BRAIN_FIELDS` rather than from the payload's own keys, so a key
 * the model invented cannot put a row on this page — the registry is the only
 * thing that decides what a field is.
 */
export function resolutionQueue(payload: BrandMemoryPayload, provenance: Provenance): QueueEntry[] {
  return BRAIN_FIELDS.map((field) => entry(field, payload, provenance))
    .filter((candidate) => candidate.state !== 'confirmed')
    .sort(byRank)
}

/** Everything a person has already stood behind. Registry order; no re-ranking. */
export function settledFields(payload: BrandMemoryPayload, provenance: Provenance): QueueEntry[] {
  return BRAIN_FIELDS.map((field) => entry(field, payload, provenance)).filter(
    (candidate) => candidate.state === 'confirmed',
  )
}

export interface QueueTally {
  /** Seeded from setup answers; the wording is Sahoda's, the substance theirs. */
  fromIntake: number
  /** Guesses on fields the contract says are only the owner's to answer. */
  unearned: number
  /** Guesses on fields where a proposal is what the field is FOR. */
  proposed: number
  /** Every registered field still unconfirmed, intake ones included. */
  total: number
  /** Unconfirmed fields that are Sahoda's own: `total` minus `fromIntake`. */
  guesses: number
  /** Every registered field. The denominator the ring uses. */
  registered: number
}

export function queueTally(queue: readonly QueueEntry[]): QueueTally {
  const guesses = queue.filter((item) => item.state !== 'intake')
  return {
    fromIntake: queue.length - guesses.length,
    guesses: guesses.length,
    unearned: guesses.filter((item) => item.field.metaKind === 'asked').length,
    proposed: guesses.filter((item) => item.field.metaKind === 'negotiated').length,
    total: queue.length,
    registered: BRAIN_FIELDS.length,
  }
}

/**
 * Why this field is a guess, and what that guess is worth — the console's "why",
 * quoted from the contract rather than invented at the call site.
 *
 * NOTE WHAT THIS DELIBERATELY DOES NOT SAY. It never claims a field came from a
 * particular page, sentence or document. Nothing records that: the mesh is
 * handed the whole door text and returns all fifteen fields in one object, so
 * no stored fact links a field to a passage. `FieldMeta.source` could hold a URL
 * — the contract allows it — but stamping one per field would turn a
 * BRAIN-level fact ("this brain was resolved from acme.com") into a FIELD-level
 * claim ("this sentence came from acme.com"), which is a different assertion and
 * an unverifiable one. The door belongs in the header, once, and it is stated
 * there. See `brain-origin.ts`.
 */
export interface Entitlement {
  /** Short marker for ONE row. Singular. Not rendered visibly; it is the row's sr-only marker. */
  label: string
  /** Header over the whole run of rows of this kind. Plural. */
  heading: string
  /** One sentence: what the contract says about this kind of field. Stated once per group. */
  line: string
}

export const ENTITLEMENT: Record<BrainFieldMetaKind, Entitlement> = {
  asked: {
    label: 'Only you know this',
    heading: 'Only you know these',
    line: 'Only you can answer these. Sahoda filled them in so it could start. Your answer is always better than its guess.',
  },
  negotiated: {
    label: 'Sahoda wrote this',
    heading: 'Sahoda wrote these for you',
    line: 'These are the things Sahoda is good at writing: how you sound, how formal you are, which phrases are yours. Keep each one, or change it.',
  },
}

export function entitlementOf(field: BrainField): Entitlement {
  return ENTITLEMENT[field.metaKind]
}

/** The group for fields seeded from setup answers. Not an entitlement: the person IS entitled. */
export const INTAKE_GROUP: Entitlement = {
  label: 'From your answer',
  heading: 'Check Sahoda kept your meaning',
  line: 'You told Sahoda these when you set up. Sahoda wrote them in its own words. If the words are right, confirm them. If not, correct them.',
}

/** The heading, sentence and marker for a row: intake rows are grouped by state, the rest by kind. */
export function groupOf(entry: QueueEntry): Entitlement {
  return entry.state === 'intake' ? INTAKE_GROUP : ENTITLEMENT[entry.field.metaKind]
}
