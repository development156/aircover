/**
 * How much a workspace may store, and how to talk about what it has used.
 *
 * ── ONE GIGABYTE, PER WORKSPACE, FLAT ────────────────────────────────────────
 * Founder's ruling, 2026-09-04. Not per account and not per plan: every workspace
 * gets the same 1 GB whatever it pays. A plan dimension was considered and left
 * out deliberately — `PlanLimitsSchema` advertises `loopLevel`, `seats` and
 * `twinSize` and enforces none of them, and adding a fourth advertised-unenforced
 * number would be worse than a constant that is true.
 *
 * ── DECIMAL, BECAUSE THE READER IS NOT A COMPUTER ────────────────────────────
 * 1 GB here is 1,000,000,000 bytes, matching `MEDIA_UPLOAD_CAP_BYTES` in
 * `apps/web` and the way every operating system has reported file sizes for
 * fifteen years. `constraints.ts` uses BINARY megabytes for the per-post media
 * caps because those mirror what the platforms publish, and the two live side by
 * side on purpose: one is our promise, the other is theirs.
 *
 * ── WHAT COUNTS ──────────────────────────────────────────────────────────────
 * Everything the workspace has put in a bucket: the asset library, the crops made
 * from it, media attached straight to a post, and knowledge PDFs. **Trashed
 * assets still count**, because trashing writes `deleted_at` and does not remove
 * one byte. Any screen showing this number has to say so, or a person who
 * "deleted" 400 MB and saw no movement will read the meter as broken.
 *
 * Pure module: numbers in, numbers out. No I/O, no formatting decisions that
 * depend on a locale, nothing that needs a database.
 */

/** One gigabyte, decimal. The whole allowance for one workspace. */
export const WORKSPACE_STORAGE_LIMIT_BYTES = 1_000_000_000

/** Shown as "1 GB" wherever the allowance is named, so the copy cannot drift from the number. */
export const WORKSPACE_STORAGE_LIMIT_LABEL = '1 GB'

/**
 * The fraction at which a workspace is warned rather than refused.
 *
 * Not a second limit. Nothing behaves differently at 0.9 except that the meter
 * changes tone, which is the only honest use of a threshold that refuses nothing.
 */
export const STORAGE_WARN_FRACTION = 0.9

export interface StorageState {
  usedBytes: number
  limitBytes: number
  /** Never negative: a workspace over the limit has nothing left, not a debt. */
  remainingBytes: number
  /** 0 to 1, clamped. Above the limit it is 1, because a bar cannot show 140%. */
  fraction: number
  /** At or past the limit. */
  full: boolean
  /** Past the warn threshold and not yet full. `full` and `nearlyFull` are never both true. */
  nearlyFull: boolean
}

/**
 * Turn a byte count into everything a screen or a guard needs.
 *
 * `usedBytes` is clamped at zero rather than trusted. The sum behind it comes
 * from four tables whose `bytes` columns are nullable on three of them, so a
 * negative or NaN reaching here means something upstream is wrong and a meter
 * drawn backwards would hide it.
 */
export function storageState(
  usedBytes: number,
  limitBytes: number = WORKSPACE_STORAGE_LIMIT_BYTES,
): StorageState {
  const used = Number.isFinite(usedBytes) && usedBytes > 0 ? Math.floor(usedBytes) : 0
  const limit = limitBytes > 0 ? limitBytes : WORKSPACE_STORAGE_LIMIT_BYTES
  const remaining = Math.max(0, limit - used)
  const full = used >= limit

  return {
    usedBytes: used,
    limitBytes: limit,
    remainingBytes: remaining,
    fraction: Math.min(1, used / limit),
    full,
    nearlyFull: !full && used / limit >= STORAGE_WARN_FRACTION,
  }
}

/**
 * Would one more file of this size fit?
 *
 * Asked BEFORE any bytes are accepted, which is the whole point: a refusal after
 * the upload has already cost the customer their wait and us the transfer, and
 * leaves an object we then have to sweep. Founder's ruling, 2026-09-04.
 *
 * `>` and not `>=`: a file that lands exactly on the limit fits. A workspace with
 * 1,000,000,000 bytes free and a 1,000,000,000-byte file is at its allowance, not
 * over it.
 */
export function storageWouldExceed(state: StorageState, incomingBytes: number): boolean {
  const incoming = Number.isFinite(incomingBytes) && incomingBytes > 0 ? incomingBytes : 0
  return state.usedBytes + incoming > state.limitBytes
}

/**
 * Bytes as a person would say them. Decimal units, and never more precision than
 * the number earns.
 *
 * A meter reading "0.9537 GB" invites arithmetic nobody asked for. Under a
 * megabyte rounds to whole KB, under a gigabyte to whole MB, and only gigabytes
 * carry a decimal place — the one scale where the next digit is worth real space.
 */
export function formatStorageBytes(bytes: number): string {
  const value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  if (value < 1_000) return `${Math.round(value)} B`
  if (value < 1_000_000) return `${Math.round(value / 1_000)} KB`
  if (value < 1_000_000_000) return `${Math.round(value / 1_000_000)} MB`
  return `${(value / 1_000_000_000).toFixed(1)} GB`
}
