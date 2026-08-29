import { BRAIN_FIELDS } from '@/lib/brand/fields'

/**
 * How many Brand Brain fields a PERSON has agreed to, out of the ring's 15.
 *
 * ── ONE COUNT, TWO READERS ───────────────────────────────────────────────────
 * /brain draws a confirmation ring and the Loop decides what to say about the
 * voice a week will be written in. Both are fractions of the same brain, so
 * they are computed here rather than twice — two implementations of "how much
 * of this is confirmed" is two numbers on two screens about one thing.
 *
 * ── ONLY THE PATHS THE RING COUNTS ───────────────────────────────────────────
 * `field_meta` can hold entries for paths that are not on the ring: a derived
 * field like `alignment.signal_lock`, or a key left behind by an older payload
 * shape. Counting those would print a fraction larger than the one /brain shows
 * for the same brain — and the customer is being asked to act on that number.
 *
 * Not server-only, deliberately: the Sunday cron reaches it too, and it is
 * arithmetic over a JSON blob with no port and no query behind it.
 */
export function countConfirmedFields(payload: unknown): number {
  const meta = (payload as { field_meta?: Record<string, unknown> } | null | undefined)?.field_meta
  if (!meta || typeof meta !== 'object') return 0
  return BRAIN_FIELDS.filter((field) => {
    const entry = meta[field.path] as { confirmed?: unknown } | undefined
    return entry?.confirmed === true
  }).length
}
