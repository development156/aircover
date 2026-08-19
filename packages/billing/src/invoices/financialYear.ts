/**
 * The Indian financial year, which is what an invoice serial is consecutive WITHIN.
 *
 * April 1 to March 31. It is not the calendar year and it is not the billing period, and
 * conflating any two of the three puts a gap in a statutory sequence: numbering that
 * restarts in January restarts three months early, and numbering that never restarts is
 * one continuous series where the law expects one per year.
 *
 * ── UTC, FOR THE SAME REASON `currentBillingPeriod` IS ───────────────────────
 * A server in Asia/Kolkata and a server in UTC disagree about which financial year
 * `2026-03-31T20:00:00Z` falls in — that instant is April 1 in IST. One of them would
 * allocate from a series the other has already closed. Reading the clock in UTC makes the
 * answer a property of the instant rather than of the machine.
 *
 * NOTE FOR THE CA CONVERSATION: this means an invoice issued in the last five and a half
 * hours of March 31 IST is numbered into the NEW financial year. If the filing has to
 * follow IST rather than UTC, this function is the one place that changes.
 */

/** Month index (0-based) the Indian financial year starts on: April. */
const FY_START_MONTH = 3

/**
 * The financial year label for an instant, as `YY-YY` — e.g. `'26-27'`.
 *
 * Two digits each because the serial has 16 characters to live in and the prefix and the
 * six-digit counter need the rest. `SL/26-27/000001` is 15; a four-digit year would not fit
 * alongside a three-character prefix.
 */
export function financialYear(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new RangeError('financialYear: invalid date')
  const year = now.getUTCFullYear()
  const startYear = now.getUTCMonth() >= FY_START_MONTH ? year : year - 1
  return `${String(startYear % 100).padStart(2, '0')}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

/** First instant of the financial year an instant falls in. Used for period reporting. */
export function financialYearStart(now: Date): Date {
  const year = now.getUTCFullYear()
  const startYear = now.getUTCMonth() >= FY_START_MONTH ? year : year - 1
  return new Date(Date.UTC(startYear, FY_START_MONTH, 1, 0, 0, 0, 0))
}
