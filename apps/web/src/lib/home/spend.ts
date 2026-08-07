import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { actionLabel } from '@/lib/wallet/entry-copy'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * Credit spend over the last 30 days, for Home's area chart.
 *
 * WHY THIS IS NOT `readLedger`. That read caps at 50 rows ordered `seq DESC`,
 * which cannot serve a month: a workspace that burns 50 entries in four days
 * would render a "30-day" chart covering four — and a truncated month looks
 * exactly like a quiet one. This is date-filtered instead, so the window is the
 * window.
 *
 * THE TRUNCATION DIRECTION MATTERS. This read still has a cap, and `seq DESC`
 * drops the OLDEST rows first. So when the cap bites, the days that vanish are
 * always at the far end of the chart — the end where "nothing happened" and "we
 * did not look" are indistinguishable to the eye. A heavy user's chart silently
 * becomes a short recent window and a busy workspace reads as brand new. That is
 * the same class of defect as a settled hold rendering "Reserved": correct rows,
 * false claim. So `capped` is returned and the UI MUST surface it, naming the
 * date coverage actually starts at rather than a row count — "from 12 Jul" is
 * something a user can act on; "500 rows" is not.
 */

/** Days in the window. */
export const SPEND_DAYS = 30

/**
 * Row cap. Far above a normal month (a heavy workspace runs a few actions a
 * day) but bounded, so a runaway ledger cannot stall the dashboard.
 */
export const SPEND_LIMIT = 500

export interface SpendDay {
  /** `YYYY-MM-DD` in UTC — the key the chart plots against. */
  date: string
  credits: number
}

export interface SpendByAction {
  action: string
  /** Human label. Never a raw machine token. */
  label: string
  credits: number
}

export interface SpendRead {
  /**
   * `empty` is a real answer — a new workspace has spent nothing. `unreadable`
   * is NOT the same claim and must never render as an empty chart, which would
   * tell the user they spent nothing when we simply could not look.
   */
  status: 'ok' | 'empty' | 'unreadable'
  /** One entry per day in the window, zero-filled, oldest first. */
  days: SpendDay[]
  byAction: SpendByAction[]
  total: number
  /** True when the row cap was hit — older days may be missing. */
  capped: boolean
  /** `YYYY-MM-DD` coverage actually starts at, or null when uncapped. */
  coveredFrom: string | null
}

const EMPTY: SpendRead = {
  status: 'empty',
  days: [],
  byAction: [],
  total: 0,
  capped: false,
  coveredFrom: null,
}

const UNREADABLE: SpendRead = { ...EMPTY, status: 'unreadable' }

/** `YYYY-MM-DD` in UTC. The chart buckets by day, not by instant. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

interface SpendRow {
  amount: unknown
  action_type: unknown
  created_at: unknown
}

export async function readSpend(now: Date = new Date()): Promise<SpendRead> {
  try {
    const workspace = await getActiveWorkspace()
    if (workspace === null) return EMPTY

    const since = new Date(now.getTime() - (SPEND_DAYS - 1) * 86_400_000)
    since.setUTCHours(0, 0, 0, 0)

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('credit_ledger')
      .select('amount, action_type, created_at')
      .eq('workspace_id', workspace.id)
      // DEBIT only. A HOLD reserves and a RELEASE un-reserves; neither moves the
      // wallet total, and counting them would roughly double every number here.
      .eq('entry_type', 'DEBIT')
      .gte('created_at', since.toISOString())
      .order('seq', { ascending: false })
      .limit(SPEND_LIMIT)

    if (error || !data) {
      if (error) console.error('[home] spend read failed', error.code, error.message)
      return UNREADABLE
    }

    const rows = data as SpendRow[]
    if (rows.length === 0) return EMPTY

    const perDay = new Map<string, number>()
    const perAction = new Map<string, number>()
    let total = 0
    let oldest: string | null = null

    for (const row of rows) {
      // PostgREST hands these back untyped. A coerced amount would put an
      // invented number on a chart, so anything unparseable is dropped.
      if (typeof row.amount !== 'number' || !Number.isFinite(row.amount)) continue
      if (typeof row.created_at !== 'string') continue
      const at = new Date(row.created_at)
      if (Number.isNaN(at.getTime())) continue

      const key = dayKey(at)
      perDay.set(key, (perDay.get(key) ?? 0) + row.amount)
      total += row.amount

      const action = typeof row.action_type === 'string' ? row.action_type : 'unknown'
      perAction.set(action, (perAction.get(action) ?? 0) + row.amount)

      if (oldest === null || key < oldest) oldest = key
    }

    const days: SpendDay[] = []
    for (let i = SPEND_DAYS - 1; i >= 0; i -= 1) {
      const key = dayKey(new Date(now.getTime() - i * 86_400_000))
      // Zero-filled: a day with no spend is a real zero and must plot as one.
      // Omitting it would let the line jump between distant points and imply
      // activity on the days in between.
      days.push({ date: key, credits: perDay.get(key) ?? 0 })
    }

    const byAction = [...perAction.entries()]
      .map(([action, credits]) => ({ action, label: actionLabel(action), credits }))
      .sort((a, b) => b.credits - a.credits)

    const capped = rows.length >= SPEND_LIMIT

    return {
      status: 'ok',
      days,
      byAction,
      total,
      capped,
      // Only meaningful when capped: uncapped, coverage IS the window, and
      // naming a later date would understate what the chart actually shows.
      coveredFrom: capped ? oldest : null,
    }
  } catch (error) {
    console.error('[home] spend read threw', error instanceof Error ? error.message : 'unknown')
    return UNREADABLE
  }
}
