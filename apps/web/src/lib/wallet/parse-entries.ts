import { LedgerEntrySchema, type LedgerEntry } from '@sahoda/shared'

/**
 * Result of parsing a raw `credit_ledger` payload.
 *
 * `skipped` is surfaced rather than hidden: `credit_ledger.model_tier` carries no
 * CHECK constraint in the DB, so a service-role writer can store a value the
 * contract does not recognise. We drop those rows instead of failing the whole
 * wallet page, but the count stays honest so the UI can say so.
 */
export interface ParsedLedger {
  /** Successfully parsed rows, newest first (by `seq`). */
  entries: LedgerEntry[]
  /** Rows that did not match the contract. Never hidden from the caller. */
  skipped: number
}

/**
 * Parse raw ledger rows defensively.
 *
 * Every row is validated on its own — one malformed row must not take the page
 * down. Ordering is by `seq` DESC because `seq` is the int8 identity, whereas
 * `created_at` can invert under lock contention.
 *
 * Non-array input (a PostgREST error object, `null`, a string) yields an empty
 * result rather than throwing.
 */
export function parseEntries(rows: unknown): ParsedLedger {
  if (!Array.isArray(rows)) {
    return { entries: [], skipped: 0 }
  }

  const entries: LedgerEntry[] = []
  let skipped = 0

  for (const row of rows) {
    const parsed = LedgerEntrySchema.safeParse(row)

    if (parsed.success) {
      entries.push(parsed.data)
    } else {
      skipped += 1
    }
  }

  // `entries` is local, so sorting it does not mutate the caller's array.
  return { entries: entries.sort((a, b) => b.seq - a.seq), skipped }
}

/**
 * A plain decimal, the only shape Postgres `numeric` ever serialises to:
 * optional sign, digits, optional fraction, optional exponent.
 *
 * `Number()` alone is too permissive for a cost we are about to render as money —
 * it happily reads `0x1F` as 31, `0b11` as 3 and `0o17` as 15. `cogs_usd_est` is
 * typed `NumericSchema` (`number | string`), so *any* string survives schema
 * validation and reaches here. Anchoring on this pattern means a value we cannot
 * read as a decimal is reported as absent rather than rendered as an invented
 * dollar amount.
 */
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

/**
 * Coerce `cogs_usd_est` to a number for display.
 *
 * The column is Postgres `numeric`, which PostgREST serialises as a JSON string.
 * Returns `null` for anything that is not a finite decimal — including the empty
 * string, which `Number()` would otherwise turn into a misleading `0`.
 */
export function cogsUsd(entry: Pick<LedgerEntry, 'cogs_usd_est'>): number | null {
  const raw = entry.cogs_usd_est

  if (raw === null || raw === undefined) {
    return null
  }

  if (typeof raw === 'string' && !DECIMAL.test(raw.trim())) {
    return null
  }

  const value = Number(raw)

  if (!Number.isFinite(value)) {
    return null
  }

  // Normalise -0 so a zero cost never renders with a nonsense minus sign.
  return value === 0 ? 0 : value
}
