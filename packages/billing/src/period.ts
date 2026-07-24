import { z } from 'zod'

/**
 * The billing period format contract: ISO-8601 year-month, zero-padded — `YYYY-MM`.
 *
 * This is load-bearing, not cosmetic. `period` is the sole replay anchor inside
 * `monthlyGrantKey(plan, period, workspaceId)` → `grant:${plan}:${period}:${workspaceId}`,
 * so two spellings of the same month ('2026-7' vs '2026-07') are two distinct idempotency
 * keys — i.e. the same month granted twice. Pinning the format closes that vector.
 *
 * Billing-internal for Alpha under the same precedent as `PaymentProvider` (owner ruling
 * #2); promotion to @sahoda/shared is filed in REQUESTS.md.
 */
export const PeriodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be a zero-padded YYYY-MM (e.g. 2026-07)')

export type Period = z.infer<typeof PeriodSchema>

/** Parse-or-throw at a boundary. Throws a ZodError naming the expected format. */
export function parsePeriod(value: unknown): Period {
  return PeriodSchema.parse(value)
}

/** Non-throwing narrowing for guard positions. */
export function isPeriod(value: unknown): value is Period {
  return PeriodSchema.safeParse(value).success
}

/**
 * The period a date falls in, derived in **UTC**.
 *
 * Deliberately not local time: a server in IST (+05:30) reading local months would flip to
 * the next period ~5.5h early, mint a fresh `monthlyGrantKey` for a month already granted,
 * and grant a second time. UTC keeps one month = one key everywhere the code runs.
 */
export function currentPeriod(now: Date): Period {
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}
