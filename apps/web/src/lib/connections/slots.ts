import type { Connection } from '@sahoda/shared'

/**
 * A PLAN SELLS SLOTS, AND A SLOT HOLDS ONE ACCOUNT.
 *
 * ── THE THING THIS FILE EXISTS TO STOP SAYING ────────────────────────────────
 * /connections used to head itself "2 of 4 connected", where the 4 was
 * `CONNECTABLE.length` — the number of channels the PRODUCT has built. It moved
 * when Sahoda shipped an adapter and never when the customer changed plan, so on
 * Studio (12 slots) it still read "of 4" and on Free (2 slots) it read "of 4"
 * too. Two paragraphs lower the same screen said "Your Free plan includes 2
 * channels and you're using 2." One screen, two denominators, and only the small
 * grey one was true about the customer.
 *
 * The number that decides whether a Connect button works is the ROW COUNT against
 * the plan's `channels` limit — `readConnectionSlots` returns `data.length` and
 * both OAuth routes gate on it. So that is the number the screen shows.
 *
 * ── WHY "SLOT" AND NOT "CHANNEL" ─────────────────────────────────────────────
 * They are not the same count and the difference is the whole point. The unique
 * index is `(workspace_id, platform, external_account ->> 'id')`, so a workspace
 * may hold four Instagram accounts, and it always could — that is four rows, four
 * slots, one channel. Calling the allowance "channels" told a shop with two
 * Instagram accounts and a LinkedIn page that they were using two of something
 * when they were using three of the thing that runs out.
 *
 * The plan catalogue's field is still named `channels` and is deliberately not
 * renamed here: it is a stored contract read by the entitlement gate, and the
 * word on the SCREEN is what was wrong.
 */

export interface SlotUsage {
  /** Accounts connected, across every platform. One account, one slot. */
  used: number
  /** What the plan allows, or null when we could not find out. */
  limit: number | null
}

/** Room for at least one more account. Unknown limits are NOT room. */
export function hasHeadroom(usage: SlotUsage): boolean {
  return usage.limit !== null && usage.used < usage.limit
}

/**
 * Slots left, or null when the limit is unknown.
 *
 * Never negative. A workspace that downgrades keeps the accounts it already had,
 * so `used` can legitimately exceed `limit` — and "-2 slots left" is a number no
 * reader can act on. `0` is the honest floor: there is no room, which is true.
 */
export function slotsLeft(usage: SlotUsage): number | null {
  return usage.limit === null ? null : Math.max(0, usage.limit - usage.used)
}

/**
 * The sentence under the meter.
 *
 * Three cases, three different claims, and collapsing any two of them is how this
 * screen got into trouble the first time:
 *
 *   limit unknown  we could not read the plan. Say that; do not print a fraction
 *                  whose denominator we are guessing.
 *   over           they hold more than the plan allows, which happens on a
 *                  downgrade and is not an error. Nothing is taken away.
 *   normal         how many are left.
 */
export function slotSentence(usage: SlotUsage): string {
  if (usage.limit === null) return 'Sahoda could not check how many slots your plan includes.'
  if (usage.used > usage.limit) {
    return 'Your plan includes fewer slots than you have connected. Nothing was disconnected.'
  }
  const left = usage.limit - usage.used
  if (left === 0) return 'Every slot on your plan is in use.'
  return left === 1 ? '1 slot left.' : `${left} slots left.`
}

/**
 * Every connection this workspace holds, grouped by platform, in a stable order.
 *
 * ── A MAP TO AN ARRAY, NOT A MAP TO ONE ROW ──────────────────────────────────
 * The page built `new Map(rows.map((c) => [c.platform, c]))`. A Map keeps the LAST
 * value written for a key, and the rows arrive ordered by `created_at` ascending,
 * so a workspace with two Instagram accounts rendered the newer one and the older
 * one existed nowhere on the screen — not hidden behind a control, not counted,
 * simply absent, while still consuming a slot and still publishing.
 *
 * Insertion order is preserved, so accounts appear oldest first: the same order
 * `accountForWorkspace` resolves a platform-shaped question in, which keeps the
 * account at the top of the Instagram card the account /analytics is about.
 */
export function groupByPlatform(connections: readonly Connection[]): Map<string, Connection[]> {
  const grouped = new Map<string, Connection[]>()
  for (const connection of connections) {
    const existing = grouped.get(connection.platform)
    if (existing) existing.push(connection)
    else grouped.set(connection.platform, [connection])
  }
  return grouped
}
