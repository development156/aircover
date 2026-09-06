import {
  BRAIN_FIELDS,
  RING_DENOMINATOR,
  fieldsInSection,
  type BrainField,
  type BrainSectionKey,
} from './fields'
import { stateOf, type Provenance } from './provenance'

/**
 * The topbar ring.
 *
 * It counts CONFIRMED fields, not filled ones. A resolve fills every field at
 * once, so a "how full is it" meter reads 100% the moment the model answers —
 * which is precisely the claim the product must not make. Confirmation is the
 * only thing worth counting because it is the only thing a person did.
 *
 * Derived fields (`alignment.*`) are outside the denominator: they are conclusions
 * drawn from the other fields, not questions anyone can answer, so including them
 * would put the ring permanently out of reach.
 */
export interface BrainRing {
  confirmed: number
  /** Seeded from setup answers and reworded by Sahoda; unconfirmed, but not a guess. */
  intake: number
  /** Editable fields only. Derived fields are excluded by construction. */
  total: number
  /** 0-100, rounded. */
  percent: number
  /** Highest-priority field still a guess, or null when every field is confirmed. */
  next: BrainField | null
}

export function brainRing(provenance: Provenance): BrainRing {
  const confirmed = BRAIN_FIELDS.filter(
    (field) => stateOf(provenance, field.path) === 'confirmed',
  ).length
  const intake = BRAIN_FIELDS.filter((field) => stateOf(provenance, field.path) === 'intake').length
  const next = BRAIN_FIELDS.find((field) => stateOf(provenance, field.path) !== 'confirmed') ?? null

  return {
    confirmed,
    intake,
    total: RING_DENOMINATOR,
    percent: Math.round((confirmed / RING_DENOMINATOR) * 100),
    next,
  }
}

/**
 * The one line the ring shows on hover — the most valuable unanswered question,
 * or an honest end state. Never a nudge without a question attached: if there is
 * nothing left to ask, say so rather than inventing urgency.
 */
export function ringHoverLine(ring: BrainRing): string {
  if (!ring.next) return 'Every field is confirmed. Sahoda writes from your answers.'
  return ring.next.question
}

/** Screen-reader label for the ring itself. Numbers are spoken, not implied by an arc. */
export function ringAriaLabel(ring: BrainRing): string {
  return `Brand Brain: ${ring.confirmed} of ${ring.total} fields confirmed. ${ringHoverLine(ring)}`
}

export interface SectionTally {
  confirmed: number
  total: number
}

/**
 * Per-section counts. Used as the EVIDENCE behind a derived field: a Signal Lock
 * drawn from five sections of which two are entirely guesses is a weaker verdict
 * than the same words drawn from confirmed answers, and the reader deserves to
 * see which one they have.
 */
export function sectionTally(provenance: Provenance, section: BrainSectionKey): SectionTally {
  const fields = fieldsInSection(section)
  return {
    confirmed: fields.filter((field) => stateOf(provenance, field.path) === 'confirmed').length,
    total: fields.length,
  }
}
