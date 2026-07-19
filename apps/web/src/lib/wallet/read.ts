import 'server-only'

import { cache } from 'react'

import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

import { toBalance, type WalletBalance } from './balance'
import { parseEntries, type ParsedLedger } from './parse-entries'

/**
 * Wallet reads. `credit_balances` and `credit_ledger` carry member-SELECT
 * policies only (writes go through `app.apply_ledger_entry`, service-role), so
 * these are read-only PostgREST selects under the caller's JWT.
 *
 * There is no `available` column, no view and no wallet RPC — available is
 * derived in `toBalance` via `availableCredits()` from @sahoda/shared.
 *
 * Every read here is filtered to the ACTIVE workspace. RLS remains the security
 * boundary and this filter is NOT an authorization check — the cookie behind the
 * active workspace is not a grant (see `lib/workspaces.ts`). It is a CORRECTNESS
 * filter: the member policy is
 * `workspace_id in (select app.member_workspace_ids())`, which admits EVERY
 * workspace the user belongs to, so a second membership would otherwise fold two
 * tenants' rows into one answer. `credit_balances` is keyed one row per
 * workspace, so `.maybeSingle()` would then see two rows and fail with PGRST116 —
 * a wallet that reads as permanently unreadable, with no reload that fixes it.
 */

/**
 * Memoised per request so the three wallet reads on `/wallet` share one
 * workspace lookup instead of issuing three. Falls back to an extra round trip
 * if a caller runs outside a request scope — no correctness impact either way.
 */
const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const workspace = await getActiveWorkspace()
  return workspace?.id ?? null
})

/** Row cap for the history read. Exported so the UI can state the window it is showing. */
export const HISTORY_LIMIT = 50

/**
 * A workspace with no ledger activity has NO `credit_balances` row at all — the
 * row is materialised lazily by the first `apply_ledger_entry`. That is a real
 * zero balance, not an error, and `toBalance(null)` renders it as such.
 */
export async function readBalance(): Promise<WalletBalance | null> {
  try {
    // No active workspace means we never looked at a balance. That is the
    // unreadable case, not a zero one — reporting "0 credits" here would tell
    // someone with a full wallet that they cannot afford to work.
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return null

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('credit_balances')
      .select('workspace_id, balance_total, balance_held, updated_at')
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    // NULL means "we could not read your balance", which is a different claim
    // from "your balance is zero" — and only one of them is recoverable by
    // topping up. `toBalance` collapses both to zero by design (it is a pure
    // row mapper), so the distinction has to be drawn here, at the I/O edge.
    if (error) {
      console.error('[wallet] balance read failed', error.code, error.message)
      return null
    }
    // No row is a genuine zero: the row is materialised lazily by the first
    // `apply_ledger_entry`, so a workspace that has never spent has none.
    return toBalance(data)
  } catch (error) {
    console.error('[wallet] balance read threw', error instanceof Error ? error.message : 'unknown')
    return null
  }
}

/**
 * Available credits for the topbar chip, or `null` when the balance could not be
 * read. The chip renders `null` as an em dash rather than a zero for the same
 * reason `readBalance` returns it.
 */
export async function readAvailableCredits(): Promise<number | null> {
  const balance = await readBalance()
  return balance?.available ?? null
}

/**
 * Ledger history, newest first. Sorted by `seq` (the int8 identity) rather than
 * `created_at`, which can invert for entries written inside one transaction.
 * Rows are parsed individually: `model_tier` has no DB CHECK backing it, so a
 * single junk row must not take down the page.
 */
export async function readLedger(limit = HISTORY_LIMIT): Promise<ParsedLedger> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return { entries: [], skipped: 0 }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('credit_ledger')
      .select('*')
      .eq('workspace_id', workspaceId)
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
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return []

    const supabase = createServerSupabase()

    // A HOLD keeps its `hold_expires_at` after it settles, so the column alone
    // does NOT mean "open" — filtering on it would report every past charge as
    // stuck credits. Openness is the ABSENCE of a settling entry, which
    // PostgREST cannot express as an anti-join, so we read both sides and
    // subtract here. `settles_entry_id` is unique, so at most one settles each.
    //
    // Both sides carry the same workspace filter. Scoping only one would compare
    // one tenant's holds against another's settlements; and because each side is
    // capped, a second workspace's rows could push a settling entry out of the
    // window and report a settled hold as stuck credits.
    const [holds, settlements] = await Promise.all([
      supabase
        .from('credit_ledger')
        .select('id, hold_expires_at')
        .eq('workspace_id', workspaceId)
        .eq('entry_type', 'HOLD')
        .order('seq', { ascending: false })
        .limit(HISTORY_LIMIT),
      supabase
        .from('credit_ledger')
        .select('settles_entry_id')
        .eq('workspace_id', workspaceId)
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
