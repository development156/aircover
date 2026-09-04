import 'server-only'

import { cache } from 'react'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

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
  const read = await activeWorkspaceRead()
  return read.status === 'ok' ? read.workspace.id : null
})

/** Row cap for the history read. Exported so the UI can state the window it is showing. */
export const HISTORY_LIMIT = 50

/**
 * Why this is a three-way answer and not `WalletBalance | null`.
 *
 * There are three distinct things that can be true of a wallet read, and each
 * one implies a DIFFERENT remedy:
 *
 *  - `ok`           — we read it. Includes a genuine zero.
 *  - `no-workspace` — the user has no workspace, so there is no wallet to read.
 *                     The remedy is to create one, and no amount of reloading
 *                     will do it.
 *  - `unreadable`   — the read itself failed. The remedy IS to reload.
 *
 * Collapsing the last two into `null` is what put "Could not read your credit
 * balance — reload to try again" in front of every signed-in first-run user: a
 * false diagnosis attached to a remedy that could not work. Zero is not an
 * option for either failure — reporting "0 credits" would tell someone with a
 * full wallet that they cannot afford to work.
 */
export type BalanceRead =
  { status: 'ok'; balance: WalletBalance } | { status: 'no-workspace' } | { status: 'unreadable' }

/**
 * A workspace with no ledger activity has NO `credit_balances` row at all — the
 * row is materialised lazily by the first `apply_ledger_entry`. That is a real
 * zero balance, not an error, and `toBalance(null)` renders it as such.
 */
export async function readBalance(): Promise<BalanceRead> {
  try {
    // No active workspace means there is no wallet yet — a first run, not a
    // fault. Callers branch on this to offer "Create workspace" instead of a
    // reload that cannot help.
    // THE THREE-WAY ANSWER STARTS ONE LAYER UP. This used to read a `string |
    // null`, which was itself two meanings in one value — so an unreadable
    // WORKSPACE read arrived here as `no-workspace` and /home replaced the whole
    // dashboard with First run for a founder who has one. The union below is only
    // as honest as the read that feeds it.
    const read = await activeWorkspaceRead()
    if (read.status === 'unreadable') return { status: 'unreadable' }
    if (read.status === 'none') return { status: 'no-workspace' }
    const workspaceId = read.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('credit_balances')
      .select('workspace_id, balance_total, balance_held, updated_at')
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    // "We could not read your balance" is a different claim from "your balance
    // is zero" — and only one of them is recoverable by topping up. `toBalance`
    // collapses both to zero by design (it is a pure row mapper), so the
    // distinction has to be drawn here, at the I/O edge.
    if (error) {
      console.error('[wallet] balance read failed', error.code, error.message)
      return { status: 'unreadable' }
    }
    // No row is a genuine zero: the row is materialised lazily by the first
    // `apply_ledger_entry`, so a workspace that has never spent has none.
    return { status: 'ok', balance: toBalance(data) }
  } catch (error) {
    console.error('[wallet] balance read threw', error instanceof Error ? error.message : 'unknown')
    return { status: 'unreadable' }
  }
}

/*
 * There is deliberately no `readAvailableCredits(): number | null` helper any
 * more. It existed for the topbar chip and flattened `no-workspace` and
 * `unreadable` into one `null`, which is the exact conflation this union was
 * introduced to end — the chip then labelled a workspace-less user's wallet
 * "Credit balance unavailable". The chip consumes `BalanceRead` directly, so
 * there is no longer a second, lossier way to ask the same question.
 */

/**
 * How many ledger entries this workspace has, in total.
 *
 * ── WHY A SECOND READ RATHER THAN COUNTING WHAT WE LOADED ───────────────────
 * `readLedger` is windowed to `HISTORY_LIMIT`. Counting the rows it returned
 * answers "how many did we fetch", and the wallet needs to answer "how many are
 * there" — the two agree only until a workspace crosses fifty entries, at which
 * point the first silently becomes a wrong number about somebody's records.
 *
 * `head: true` fetches no rows at all, and `credit_ledger (workspace_id, seq)`
 * makes it an index range scan. Same shape as `lib/sites/read.ts` and
 * `lib/inbox/read.ts`.
 *
 * `null` is NOT ZERO. It means the count could not be taken, and the caller
 * must say so rather than printing "0 entries" over a list that has some.
 */
export async function countLedger(): Promise<number | null> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return null

    const supabase = createServerSupabase()
    const { count, error } = await supabase
      .from('credit_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)

    if (error) {
      console.error('[wallet] ledger count failed', error.code, error.message)
      return null
    }
    return count ?? null
  } catch (error) {
    console.error('[wallet] ledger count threw', error instanceof Error ? error.message : 'unknown')
    return null
  }
}

/**
 * A ledger read, and whether it is an ANSWER or a failure to get one.
 *
 * ── WHY THE FLAG EXISTS, AND WHY IT IS NOT OPTIONAL ──────────────────────────
 * `readBalance` twelve lines above already splits these, and `readSpend` over
 * this same table carries the rule word for word: "`unreadable` is NOT the same
 * claim and must never render as an empty chart, which would tell the user they
 * spent nothing when we simply could not look."
 *
 * `readLedger` was never brought along. Every failure came back as
 * `{ entries: [] }`, and both callers had nothing to branch on but
 * `entries.length === 0` — so a dropped connection printed "No credit activity
 * yet" on the wallet and "Nothing has happened yet" on Home. Both are confident
 * statements about somebody's money, made from a question that got no answer.
 *
 * A required field rather than an optional one: an optional flag would let the
 * next screen read the list and never learn that the list means nothing.
 */
export type LedgerRead = ParsedLedger & { unreadable: boolean }

/**
 * Ledger history, newest first. Sorted by `seq` (the int8 identity) rather than
 * `created_at`, which can invert for entries written inside one transaction.
 * Rows are parsed individually: `model_tier` has no DB CHECK backing it, so a
 * single junk row must not take down the page.
 */
export async function readLedger(limit = HISTORY_LIMIT): Promise<LedgerRead> {
  try {
    const workspaceId = await activeWorkspaceId()
    // NOT unreadable. There is no workspace to hold a ledger, which the screens
    // above have already answered with First-run; offering a reload here would
    // be a remedy that cannot work, since no reload creates a workspace.
    if (workspaceId === null) return { entries: [], skipped: 0, unreadable: false }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('credit_ledger')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('seq', { ascending: false })
      .limit(limit)

    if (error || !data) {
      if (error) console.error('[wallet] ledger read failed', error.code, error.message)
      return { entries: [], skipped: 0, unreadable: true }
    }
    return { ...parseEntries(data), unreadable: false }
  } catch (error) {
    console.error('[wallet] ledger read threw', error instanceof Error ? error.message : 'unknown')
    return { entries: [], skipped: 0, unreadable: true }
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
