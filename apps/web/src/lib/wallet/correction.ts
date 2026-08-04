import type { LedgerEntry } from '@sahoda/shared'

/**
 * Ledger corrections, as they are actually written.
 *
 * `credit_ledger` is append-only — nothing is ever updated or deleted — so a
 * wrong entry is fixed by writing two more: one ADJUST reversing it and one
 * re-issuing it correctly. Both carry the same `meta.correction` id, and each
 * names the entry it acts on via `meta.reverses_seq` / `meta.replaces_seq`.
 *
 * That is the right way to keep a ledger and the wrong way to read a wallet: on
 * screen it is "-100 Manual adjustment" above "+100 Manual adjustment", with
 * the entry they fix scrolled away somewhere below. Three correct rows that
 * together read as an unexplained clawback. This module reads the linkage that
 * lets the UI show them as the one event they are.
 *
 * `meta` is `jsonb` with no schema behind it, written by service-role callers,
 * so every field is treated as untrusted input. Only the linkage is read:
 * `meta.reason` is engineer-written prose that has never been through a
 * contract, and the wallet does not render text a user has no way to verify.
 */

export interface CorrectionMeta {
  /** Shared by every row of one correction. This is what groups them. */
  id: string
  /** `seq` of the entry this row reverses, when recorded. */
  reversesSeq: number | null
  /** `seq` of the entry this row re-issues, when recorded. */
  replacesSeq: number | null
}

/**
 * Long enough for a dated slug like `2026-07-25-relabel-manual-grant`, short
 * enough that a runaway value cannot become a grouping key of arbitrary size.
 */
const MAX_CORRECTION_ID_CHARS = 120

/** `seq` is an int8 identity: whole and positive, or it names nothing. */
function readSeq(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * Read a row's correction linkage, or `null` when it is not part of one.
 *
 * A missing seq reference costs the "what it corrects" line, never the
 * grouping — dropping the group over an unreadable reference would put the
 * confusing three-row sequence straight back on the screen.
 */
export function correctionMeta(entry: Pick<LedgerEntry, 'meta'>): CorrectionMeta | null {
  const meta = entry.meta

  // `typeof null === 'object'`, and an array is an object too. Neither carries
  // named fields, so both are rejected before any property read.
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    return null
  }

  const {
    correction,
    reverses_seq: reverses,
    replaces_seq: replaces,
  } = meta as Record<string, unknown>

  if (typeof correction !== 'string') {
    return null
  }

  const id = correction.trim()

  if (id === '' || id.length > MAX_CORRECTION_ID_CHARS) {
    return null
  }

  return { id, reversesSeq: readSeq(reverses), replacesSeq: readSeq(replaces) }
}
