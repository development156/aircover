import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'

import { toBalance, type WalletBalance } from './balance'
import { parseEntries, type ParsedLedger } from './parse-entries'

/**
 * Wallet reads. `credit_balances` and `credit_ledger` carry member-SELECT
 * policies only (writes go through `app.apply_ledger_entry`, service-role), so
 * these are read-only PostgREST selects under the caller's JWT.
 *
 * There is no `available` column, no view and no wallet RPC — available is
 * derived in `toBalance` via `availableCredits()` from @sahoda/shared.
 */

const HISTORY_LIMIT = 50

/**
 * A workspace with no ledger activity has NO `credit_balances` row at all — the
 * row is materialised lazily by the first `apply_ledger_entry`. That is a real
 * zero balance, not an error, and `toBalance(null)` renders it as such.
 */
export async function readBalance(): Promise<WalletBalance> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('credit_balances')
      .select('workspace_id, balance_total, balance_held, updated_at')
      .maybeSingle()

    if (error) {
      console.error('[wallet] balance read failed', error.code, error.message)
      return toBalance(null)
    }
    return toBalance(data)
  } catch (error) {
    console.error('[wallet] balance read threw', error instanceof Error ? error.message : 'unknown')
    return toBalance(null)
  }
}

/**
 * Ledger history, newest first. Sorted by `seq` (the int8 identity) rather than
 * `created_at`, which can invert for entries written inside one transaction.
 * Rows are parsed individually: `model_tier` has no DB CHECK backing it, so a
 * single junk row must not take down the page.
 */
export async function readLedger(limit = HISTORY_LIMIT): Promise<ParsedLedger> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('credit_ledger')
      .select('*')
      .order('seq', { ascending: false })
      .limit(limit)

    if (error || !data) {
      if (error) console.error('[wallet] ledger read failed', error.code, error.message)
      return { entries: [], skipped: 0 }
    }
    return parseEntries(data)
  } catch (error) {
    console.error('[wallet] ledger read threw', error instanceof Error ? error.message : 'unknown')
    return { entries: [], skipped: 0 }
  }
}

/**
 * Open HOLDs — a HOLD with no settling DEBIT/RELEASE. Used only to tell the user
 * honestly when credits are stuck behind a stalled action: no expired-hold
 * reaper exists anywhere in the system yet (see REQUESTS.md), so a crashed job
 * leaves credits held indefinitely with no recourse.
 */
export async function readOpenHolds(): Promise<{ hold_expires_at: string | null }[]> {
  try {
    const supabase = createServerSupabase()

    // A HOLD keeps its `hold_expires_at` after it settles, so the column alone
    // does NOT mean "open" — filtering on it would report every past charge as
    // stuck credits. Openness is the ABSENCE of a settling entry, which
    // PostgREST cannot express as an anti-join, so we read both sides and
    // subtract here. `settles_entry_id` is unique, so at most one settles each.
    const [holds, settlements] = await Promise.all([
      supabase
        .from('credit_ledger')
        .select('id, hold_expires_at')
        .eq('entry_type', 'HOLD')
        .order('seq', { ascending: false })
        .limit(HISTORY_LIMIT),
      supabase
        .from('credit_ledger')
        .select('settles_entry_id')
        .not('settles_entry_id', 'is', null)
        .order('seq', { ascending: false })
        .limit(HISTORY_LIMIT * 2),
    ])

    if (holds.error || !holds.data) return []

    // A failed settlements read must not manufacture stale-hold warnings out of
    // settled rows: with no settled set we cannot tell open from closed, so we
    // report nothing rather than something false.
    if (settlements.error || !settlements.data) return []

    const settled = new Set(
      settlements.data.flatMap((row) => {
        const id = (row as { settles_entry_id?: unknown }).settles_entry_id
        return typeof id === 'string' ? [id] : []
      }),
    )

    return holds.data.flatMap((row) => {
      const { id, hold_expires_at: expiresAt } = row as {
        id?: unknown
        hold_expires_at?: unknown
      }
      if (typeof id !== 'string' || settled.has(id)) return []
      return [{ hold_expires_at: typeof expiresAt === 'string' ? expiresAt : null }]
    })
  } catch {
    return []
  }
}
