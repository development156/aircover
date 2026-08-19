import 'server-only'

import { cache } from 'react'
import {
  BillingProfileSchema,
  InvoiceSchema,
  SubscriptionViewSchema,
  type BillingProfile,
  type Invoice,
  type SubscriptionView,
} from '@sahoda/shared'
import type { WorkspaceUsage } from '@sahoda/billing'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * Billing reads for the plan screen. Read-only PostgREST selects under the caller's JWT —
 * `subscriptions`, `invoices` and `billing_profiles` all carry member-SELECT policies and
 * every write goes through a service-role path, exactly like the wallet.
 *
 * ── EVERY READ IS THREE-WAY, FOR THE REASON `lib/wallet/read.ts` GIVES ───────
 * `ok` / `no-workspace` / `unreadable` are three different situations with three different
 * remedies, and collapsing the last two into `null` is what once told every first-run user
 * their balance could not be read. The same union is used here because the same mistake is
 * available: a plan screen that says "we could not read your plan" to somebody who has
 * never had one is a false diagnosis attached to a reload that cannot work.
 *
 * ── AND EVERY READ IS FILTERED TO THE ACTIVE WORKSPACE ───────────────────────
 * Not an authorization check — RLS is the boundary. A correctness filter: the member policy
 * admits every workspace the user belongs to, so a second membership would otherwise fold
 * two tenants' rows into one answer.
 */

/** Memoised per request so one screen's four reads share one workspace lookup. */
const activeWorkspaceId = cache(
  async (): Promise<
    { status: 'ok'; id: string } | { status: 'none' } | { status: 'unreadable' }
  > => {
    const read = await activeWorkspaceRead()
    if (read.status === 'ok') return { status: 'ok', id: read.workspace.id }
    if (read.status === 'none') return { status: 'none' }
    return { status: 'unreadable' }
  },
)

export type Read<T> =
  { status: 'ok'; data: T } | { status: 'no-workspace' } | { status: 'unreadable' }

/** How many documents the plan screen lists. Exported so the UI can state its own window. */
export const INVOICE_LIMIT = 24

/**
 * The workspace's subscription.
 *
 * A workspace with NO row is on Free, and that is a contract the schema states out loud
 * ("no row ⇒ Free"), not an assumption made here — so it is returned as `ok` with a Free
 * view rather than as an absence the caller has to interpret. Getting this wrong in the
 * other direction would be worse: reporting `unreadable` for every free workspace would put
 * an error on the plan screen of every user who has not paid yet, which is most of them.
 */
export async function readSubscription(): Promise<Read<SubscriptionView>> {
  try {
    const ws = await activeWorkspaceId()
    if (ws.status === 'unreadable') return { status: 'unreadable' }
    if (ws.status === 'none') return { status: 'no-workspace' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('subscriptions')
      .select(
        'workspace_id, plan_id, status, current_period_start, current_period_end, ' +
          'cancel_at_period_end, pending_plan_id, pending_plan_effective_at, ' +
          'grace_ends_at, dunning_attempts, last_failure_at, last_failure_code',
      )
      .eq('workspace_id', ws.id)
      // `subscriptions_one_live` bounds the LIVE ones, not the closed ones, so a workspace
      // that has cancelled and resubscribed has several rows. Newest wins; `.maybeSingle()`
      // would fail with PGRST116 and read as permanently unreadable.
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) return { status: 'unreadable' }

    /**
     * Read through `unknown`, and let zod be the boundary.
     *
     * supabase-js types a `.select()` against generated Database types. The dunning and
     * pending-plan columns arrive with `20260819213000_billing_lifecycle.sql`, which is not
     * applied yet, so those types do not know them and the whole row degrades to
     * `GenericStringError`. Casting the SHAPE would be a lie in the other direction — the
     * columns genuinely may not be there until the migration runs.
     *
     * `SubscriptionViewSchema` is what actually decides, and it runs either way. So the cast
     * removes a type that is currently wrong and keeps the check that is always right.
     */
    const row = data?.[0] as Record<string, unknown> | undefined
    if (!row) return { status: 'ok', data: freeSubscription(ws.id) }

    const parsed = SubscriptionViewSchema.safeParse({
      workspaceId: row.workspace_id,
      planId: row.plan_id,
      status: row.status,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      pendingPlanId: row.pending_plan_id,
      pendingPlanEffectiveAt: row.pending_plan_effective_at,
      graceEndsAt: row.grace_ends_at,
      dunningAttempts: row.dunning_attempts ?? 0,
      lastFailureAt: row.last_failure_at,
      lastFailureCode: row.last_failure_code,
    })
    // A row we cannot parse is UNREADABLE, never a silent fall back to Free. Falling back
    // would hand a paying customer the free tier's limits because of a schema drift.
    if (!parsed.success) return { status: 'unreadable' }
    return { status: 'ok', data: parsed.data }
  } catch {
    return { status: 'unreadable' }
  }
}

/** The Free view for a workspace with no subscription row. Every field is a stated default. */
function freeSubscription(workspaceId: string): SubscriptionView {
  return {
    workspaceId,
    planId: 'free',
    status: 'active',
    // Deliberately null, not "the current calendar month". A free workspace has no billing
    // period, and inventing one would put a renewal date on a screen where nothing renews.
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    pendingPlanId: null,
    pendingPlanEffectiveAt: null,
    graceEndsAt: null,
    dunningAttempts: 0,
    lastFailureAt: null,
    lastFailureCode: null,
  }
}

/** Tax invoices and credit notes, newest first. */
export async function readInvoices(): Promise<Read<Invoice[]>> {
  try {
    const ws = await activeWorkspaceId()
    if (ws.status === 'unreadable') return { status: 'unreadable' }
    if (ws.status === 'none') return { status: 'no-workspace' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('workspace_id', ws.id)
      .order('issued_at', { ascending: false })
      .limit(INVOICE_LIMIT)

    if (error) return { status: 'unreadable' }

    // Parse each row and DROP the ones that do not fit, rather than failing the page. A
    // single malformed document must not hide every valid one — the same call the wallet's
    // `parseEntries` makes. The count of dropped rows is surfaced by the caller.
    const invoices = (data ?? []).flatMap((row) => {
      const parsed = InvoiceSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })
    return { status: 'ok', data: invoices }
  } catch {
    return { status: 'unreadable' }
  }
}

/** Who the invoice is made out to, or `null` when the customer has not told us. */
export async function readBillingProfile(): Promise<Read<BillingProfile | null>> {
  try {
    const ws = await activeWorkspaceId()
    if (ws.status === 'unreadable') return { status: 'unreadable' }
    if (ws.status === 'none') return { status: 'no-workspace' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('billing_profiles')
      .select('*')
      .eq('workspace_id', ws.id)
      .maybeSingle()

    if (error) return { status: 'unreadable' }
    if (!data) return { status: 'ok', data: null }

    const parsed = BillingProfileSchema.safeParse(data)
    return parsed.success ? { status: 'ok', data: parsed.data } : { status: 'unreadable' }
  } catch {
    return { status: 'unreadable' }
  }
}

/**
 * What the workspace actually holds, COUNTED.
 *
 * These numbers drive a sentence telling a customer how many of their own things they have
 * ("you have 5 of 3 channels"), which is a claim about their business — the one class of
 * figure this product may never invent. So a count that fails makes the whole read
 * `unreadable`; there is deliberately no `?? 0`, because a zero here would silently report
 * that nothing is over the limit.
 */
export async function readUsage(): Promise<Read<WorkspaceUsage>> {
  try {
    const ws = await activeWorkspaceId()
    if (ws.status === 'unreadable') return { status: 'unreadable' }
    if (ws.status === 'none') return { status: 'no-workspace' }

    const supabase = createServerSupabase()
    const [channels, sites, seats] = await Promise.all([
      supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ws.id),
      supabase.from('sites').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id),
      supabase
        .from('workspace_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('workspace_id', ws.id),
    ])

    if (
      channels.error ||
      sites.error ||
      seats.error ||
      channels.count === null ||
      sites.count === null ||
      seats.count === null
    ) {
      return { status: 'unreadable' }
    }

    return {
      status: 'ok',
      data: { channels: channels.count, sites: sites.count, seats: seats.count },
    }
  } catch {
    return { status: 'unreadable' }
  }
}
