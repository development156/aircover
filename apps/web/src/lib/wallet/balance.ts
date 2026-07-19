import { CreditBalanceSchema, availableCredits } from '@sahoda/shared'
import type { LedgerEntry } from '@sahoda/shared'

/**
 * The wallet hero number and its held subline.
 *
 * There is no `available` column, no view and no wallet RPC — apps/web reads
 * `credit_balances` under RLS and computes. The hero is `available`, never
 * `total`: `total` includes credits already committed to in-flight actions and
 * would overstate what the user can actually spend.
 */
export interface WalletBalance {
  readonly total: number
  readonly held: number
  /** Spendable credits. Always the hero number. Never negative. */
  readonly available: number
  readonly hasHold: boolean
  /** Secondary line, present only while credits are held. */
  readonly heldNote: string | null
}

/**
 * A factory, not a shared constant. Returning one frozen-in-module object from
 * every zero path would hand each caller the *same* object: a single caller that
 * writes to its result would then corrupt every later zero read in the process,
 * and a wallet would show a number no row ever contained.
 */
const zeroBalance = (): WalletBalance => ({
  total: 0,
  held: 0,
  available: 0,
  hasHold: false,
  heldNote: null,
})

/** Explicit locale so the grouping is deterministic across server and client renders. */
const formatCredits = (value: number): string => new Intl.NumberFormat('en-US').format(value)

/**
 * Build the wallet balance from a raw `credit_balances` row.
 *
 * A workspace with no ledger activity has **no row at all** — the row is created
 * lazily by `apply_ledger_entry` — so a missing row reads as zero rather than as
 * an error. Anything that does not match the contract (a PostgREST error object,
 * a string, numeric columns arriving as text) also reads as zero: a wallet that
 * says "0 credits" is recoverable, a wallet that throws is not.
 *
 * Values are clamped into a coherent range before `available` is derived. The DB
 * CHECK is `balance_held <= balance_total`, so this is unreachable in valid data,
 * but a hero of "-150 credits" must never reach a user.
 */
export function toBalance(row: unknown): WalletBalance {
  const parsed = CreditBalanceSchema.safeParse(row)

  if (!parsed.success) {
    return zeroBalance()
  }

  const total = Math.max(0, parsed.data.balance_total)
  const held = Math.min(Math.max(0, parsed.data.balance_held), total)

  return {
    total,
    held,
    available: availableCredits({ balance_total: total, balance_held: held }),
    hasHold: held > 0,
    heldNote: held > 0 ? heldNoteFor(held) : null,
  }
}

/**
 * Copy for the held subline.
 *
 * Held credits are not spent — a failed action settles its hold back. Saying so
 * keeps the number from reading as a deduction the user has already paid.
 */
function heldNoteFor(held: number): string {
  const amount = formatCredits(held)

  return held === 1
    ? `${amount} credit held by an action in progress. Released when it finishes or fails.`
    : `${amount} credits held by actions in progress. Released when they finish or fail.`
}

/**
 * Describe open holds that have outlived their expiry.
 *
 * No expired-hold reaper exists anywhere in the system, so these credits stay
 * held until the stalled action is settled by hand. Presenting that as an
 * ordinary hold would be dishonest — the user would wait for a release that
 * nothing is scheduled to perform.
 *
 * Returns `null` when nothing is stale. A hold with no expiry, or with an expiry
 * that will not parse, is *not* counted: an unknown deadline is not evidence of
 * a stall, and crying wolf here would train users to ignore the note.
 *
 * `now` is a parameter so callers stay deterministic and testable.
 */
export function staleHoldNote(
  openHolds: ReadonlyArray<Pick<LedgerEntry, 'hold_expires_at'>>,
  now: Date,
): string | null {
  const cutoff = now.getTime()

  const stale = openHolds.filter((hold) => {
    if (hold.hold_expires_at === null) {
      return false
    }

    const expiresAt = Date.parse(hold.hold_expires_at)

    // Strictly past: a hold expiring exactly now has not yet stalled.
    return Number.isFinite(expiresAt) && expiresAt < cutoff
  }).length

  if (stale === 0) {
    return null
  }

  // No reaper exists, so the copy must not imply the credits come back on their
  // own. "Will be released when it settles" would be the exact false comfort the
  // note is here to prevent — the user would wait instead of asking for help.
  return stale === 1
    ? '1 hold has passed its expiry — those credits are held by a stalled action and are not released automatically. They stay held until that action is settled.'
    : `${formatCredits(stale)} holds have passed their expiry — those credits are held by stalled actions and are not released automatically. They stay held until those actions are settled.`
}
