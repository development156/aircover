import type { Channel } from '@sahoda/shared'

/**
 * What each channel's copy was at when this page was rendered — or an admission
 * that this database does not track it yet.
 *
 * ── WHY THIS IS NOT JUST A `number` ON `PostVariant` ─────────────────────────
 * `PostVariantSchema` lives in `@sahoda/shared`, which is a frozen contract, and
 * it is a plain object schema — so it STRIPS any column it does not name. The
 * `version` column added by 20260819000000 travels back from the database and is
 * discarded before any screen sees it. Fixing that at the contract is not an
 * option, so the version is read at the render edge instead, out of the same rows
 * the parse throws it away from.
 *
 * ── THE THREE-WAY SHAPE IS THE POINT ─────────────────────────────────────────
 * `supported: false` means the column is not there — this app is running against
 * a database the migration has not reached, which is the NORMAL state until the
 * founder applies it. Every write then behaves exactly as it does today.
 *
 * `supported: true` with no entry for a channel means the column IS there and
 * that channel has no copy stored yet. That is a different thing from "we cannot
 * tell", and collapsing the two would make the very first save of every channel
 * look like a clash with a writer who does not exist.
 */
export type VariantVersions =
  { supported: false } | { supported: true; byChannel: Partial<Record<Channel, number>> }

/** Nothing tracked. The value every read falls back to, and the app's state today. */
export const VERSIONS_UNSUPPORTED: VariantVersions = { supported: false }

/**
 * What to send with a save of `channel`.
 *
 * `undefined` — do not attempt a compare-and-set; save the way the app always has.
 * `null`      — compare against "no row yet", which creates one.
 * a number    — compare against that stored version.
 *
 * The three are deliberately distinct at the type level, because the server has to
 * tell them apart and `null` and `undefined` mean opposite things here.
 */
export function expectedVersionFor(
  versions: VariantVersions,
  channel: Channel,
): number | null | undefined {
  if (!versions.supported) return undefined
  return versions.byChannel[channel] ?? null
}

/**
 * Read the versions out of raw `post_variants` rows.
 *
 * ── WHY PRESENCE AND NOT AN ERROR CODE ───────────────────────────────────────
 * The obvious way to find out whether a column exists is to ask for it and read
 * the error. That means branching on a code — `42703` from Postgres, something
 * else again from the API layer in front of it — and a detector built on a code
 * nobody has observed is a detector that quietly picks the wrong branch.
 *
 * This asks nothing extra. The read that already runs selects every column, so if
 * the column is there it is on the object and if it is not it is absent. There is
 * no second query, no code to guess at, and the check cannot be wrong about a
 * database it is looking straight at.
 *
 * One deliberate strictness: a row whose `version` is present but not a whole
 * positive number is treated as the column being absent for that row. A version
 * that is not a number cannot be compared against, and sending a bad one would
 * turn every save into a refusal.
 */
export function versionsFromRows(rows: readonly unknown[]): VariantVersions {
  let sawColumn = false
  const byChannel: Partial<Record<Channel, number>> = {}

  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null) continue
    const row = raw as Record<string, unknown>
    if (!('version' in row)) continue
    sawColumn = true

    const version = row.version
    const channel = row.channel
    if (typeof channel !== 'string') continue
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) continue
    byChannel[channel as Channel] = version
  }

  // No row carried the column. With rows in hand that settles it — the column is
  // not there. With NO rows it settles nothing, which is why `read.ts` asks a
  // second, direct question in that one case rather than assuming. See
  // `inconclusive` below.
  return sawColumn ? { supported: true, byChannel } : VERSIONS_UNSUPPORTED
}

/**
 * Did the rows leave the question open?
 *
 * A post with no channel copy yet returns no rows, and no rows carry no columns —
 * so `versionsFromRows` cannot tell a database without the column from a post
 * without any copy. It answers "unsupported" for both, which is safe but wrong
 * half the time, and wrong in the direction that matters: it would put the FIRST
 * save of a brand-new post back on the old last-write-wins path, which is the one
 * save two tabs are most likely to make at the same moment.
 *
 * So the caller asks the database directly in this one case. Exported rather than
 * inlined because the reason is worth reading next to the function it corrects.
 */
export function inconclusive(rows: readonly unknown[]): boolean {
  return rows.length === 0
}
