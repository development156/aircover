'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import {
  computeProration,
  downgradeImpact,
  createCashfreeProvider,
  loadCashfreeEnv,
} from '@sahoda/billing'
import { PlanIdSchema, parseGstin } from '@sahoda/shared'

import { env } from '@/lib/env'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'
import { currentBillingPeriod } from '@/lib/wallet/checkout-state'
import { readSubscription, readUsage } from '@/lib/billing/read'
import { billingWindow } from '@/lib/billing/window'
import type {
  PlanActionState,
  PlanPreviewState,
  UpgradeCheckoutState,
} from '@/lib/billing/plan-state'
import { checkoutFailureMessage } from '@/lib/billing/checkout-failure-copy'
import {
  planChangeOrderId,
  isDuplicateOrder,
  reusedCheckoutState,
} from '@/lib/billing/plan-change-order'

/**
 * Plan changes, from the screen.
 *
 * ── WHERE THE MONEY IS COMPUTED ──────────────────────────────────────────────
 * Here, on the server, every time — never in the browser and never trusted from a form
 * field. `previewPlanChange` and `startPlanUpgrade` run the SAME `computeProration` over the
 * same subscription read, so the figure the customer is shown and the figure the card is
 * charged cannot drift. A client-supplied amount would be a price the customer can edit.
 *
 * ── WHERE THE AUTHORITY IS CHECKED ───────────────────────────────────────────
 * Not here. `set_pending_plan_change` and `upsert_billing_profile` are SECURITY DEFINER
 * functions that take identity from `auth.jwt()` and refuse a non-owner themselves, because
 * any signed-in user can call them directly through PostgREST. The checks in this file are
 * for the message the customer sees; the checks in the database are the ones that hold.
 */

/** Errors the RPCs raise, mapped to something a person can act on. */
const RPC_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Sign in to change your plan.',
  NOT_A_MEMBER: 'You are not a member of this workspace.',
  FORBIDDEN_ROLE: 'Only the workspace owner can change the plan.',
  NO_SUBSCRIPTION: 'There is no paid plan to change. Pick one to get started.',
  UNKNOWN_PLAN: 'That plan is not available.',
  NOT_A_DOWNGRADE: 'Moving up a plan takes effect straight away and goes through payment.',
  NO_PERIOD_END: 'Sahoda could not find the end of your current billing month.',
  INVALID_GSTIN: 'That GSTIN is not valid. Check the 15 characters.',
  INVALID_STATE: 'Choose the state your business is registered in.',
  INVALID_COUNTRY: 'Choose the country your business is in.',
  INVALID_NAME: 'Enter the legal name the invoice should be made out to.',
  INVALID_TAX_KIND: 'Choose how your business is registered.',
}

/**
 * Translate an RPC failure into copy.
 *
 * Substring-matched against the raised vocabulary, exactly as `upsert_connection`'s callers
 * do. Anything unrecognised becomes a fixed sentence — a Postgres message names columns and
 * constraints, and none of that belongs in front of a customer.
 */
function rpcMessage(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback
  for (const [code, message] of Object.entries(RPC_MESSAGES)) {
    if (raw.includes(code)) return message
  }
  return fallback
}

/**
 * What a move to `planId` would cost and grant.
 *
 * Read-only. Nothing is charged, nothing is written, and it is safe to call on every
 * selection change — which is the point: the customer sees the arithmetic before deciding.
 */
export async function previewPlanChange(planId: unknown): Promise<PlanPreviewState> {
  try {
    const parsed = PlanIdSchema.safeParse(planId)
    if (!parsed.success) return { ok: false, message: 'Pick a plan to see what it costs.' }

    const subscription = await readSubscription()
    if (subscription.status === 'no-workspace') {
      return { ok: false, message: 'Create a workspace before choosing a plan.' }
    }
    if (subscription.status === 'unreadable') {
      // Not a zero and not a free plan. Showing "₹499 today" off a failed read would quote a
      // price computed from a plan we do not actually know the customer is on.
      return { ok: false, message: 'Sahoda could not read your current plan just now.' }
    }

    const now = new Date()
    const window = billingWindow(subscription.data, now)
    const proration = computeProration({
      fromPlanId: subscription.data.planId,
      toPlanId: parsed.data,
      periodStart: window.start,
      periodEnd: window.end,
      now,
      currentPeriodPaid: window.currentPeriodPaid,
    })

    // The counts are a claim about the customer's own business, so a failed count becomes a
    // null impact rather than an empty one — "nothing is over your limit" is a different
    // sentence from "we could not count what you have".
    const usage = await readUsage()
    const impact =
      usage.status === 'ok'
        ? downgradeImpact({
            toPlanId: parsed.data,
            effectiveAt: new Date(proration.effectiveAt),
            usage: usage.data,
          })
        : null

    return { ok: true, proration, impact }
  } catch (error) {
    reportServerError(error, { action: 'previewPlanChange' })
    return { ok: false, message: 'Sahoda could not work out what that plan would cost.' }
  }
}

/**
 * Schedule a downgrade for the end of the period already paid for.
 *
 * Never immediate, and the database refuses to make it so. Credits already granted may
 * already be spent, and `apply_ledger_entry` cannot take a balance below zero — MEASURED:
 * the whole transaction aborts and writes nothing. Deferring is the only design under which
 * the ledger stays honest.
 */
export async function schedulePlanDowngrade(planId: unknown): Promise<PlanActionState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change your plan.' }

    const parsed = PlanIdSchema.safeParse(planId)
    if (!parsed.success) return { ok: false, message: 'Pick a plan to move to.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('set_pending_plan_change', {
      p_workspace_id: ws.workspace.id,
      p_plan_id: parsed.data,
    })

    if (error) {
      return {
        ok: false,
        message: rpcMessage(error.message, 'Sahoda could not schedule that change.'),
      }
    }

    revalidatePath('/settings/plan')
    const effective = (data as { effective_at?: string } | null)?.effective_at
    return {
      ok: true,
      message: effective
        ? `Scheduled. You keep everything you have until ${new Date(effective).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`
        : 'Scheduled for the end of your current billing month.',
    }
  } catch (error) {
    reportServerError(error, { action: 'schedulePlanDowngrade', workspaceId })
    return { ok: false, message: 'Sahoda could not schedule that change.' }
  }
}

/** Undo a scheduled downgrade. Idempotent — cancelling a cancellation is a no-op. */
export async function cancelPlanDowngrade(): Promise<PlanActionState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change your plan.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('clear_pending_plan_change', {
      p_workspace_id: ws.workspace.id,
    })
    if (error) {
      return { ok: false, message: rpcMessage(error.message, 'Sahoda could not undo that.') }
    }

    revalidatePath('/settings/plan')
    return { ok: true, message: 'Your plan stays as it is.' }
  } catch (error) {
    reportServerError(error, { action: 'cancelPlanDowngrade', workspaceId })
    return { ok: false, message: 'Sahoda could not undo that.' }
  }
}

/**
 * Open a payment for an upgrade, charged at the PRORATED amount.
 *
 * The proration is recomputed here rather than accepted from the caller, and the resulting
 * figures travel to the webhook inside `order_tags` — the only carrier a Cashfree webhook
 * has. `changeId` is minted here and becomes the ledger idempotency key, so a redelivery
 * replays and a SECOND upgrade in the same month does not — that key is unrelated to the
 * order id below, which guards a different replay (two ORDERS, not two grants; see
 * `@/lib/billing/plan-change-order` — Q-06).
 */
export async function startPlanUpgrade(planId: unknown): Promise<UpgradeCheckoutState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change your plan.' }

    const parsed = PlanIdSchema.safeParse(planId)
    if (!parsed.success) return { ok: false, message: 'Pick a plan to move to.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const subscription = await readSubscription()
    if (subscription.status !== 'ok') {
      return { ok: false, message: 'Sahoda could not read your current plan just now.' }
    }

    const now = new Date()
    const window = billingWindow(subscription.data, now)
    const proration = computeProration({
      fromPlanId: subscription.data.planId,
      toPlanId: parsed.data,
      periodStart: window.start,
      periodEnd: window.end,
      now,
      currentPeriodPaid: window.currentPeriodPaid,
    })

    // A downgrade must not reach a payment page. It is scheduled, never charged.
    if (proration.kind !== 'upgrade') {
      return { ok: false, message: 'That is not a move up, so there is nothing to pay.' }
    }

    const period = currentBillingPeriod(now)
    const orderId = planChangeOrderId(ws.workspace.id, parsed.data, period)
    const fullOrderId = `sah_${orderId}`

    // The id `createCheckout` actually creates under. Deterministic by default — see
    // `planChangeOrderId` — but flipped to a fresh one below if `fullOrderId` turns out to
    // name an order that is DEAD rather than absent: reusing a dead order's id would have
    // `createCheckout` collide with it for the rest of the billing period, which is worse
    // than the double-order defect this guards against. A function, not a value, because
    // `provider()` captures it once and `createCheckout` calls it lazily.
    let useFreshId = false
    const rail = provider(() => (useFreshId ? randomUUID() : orderId))
    if (!rail) {
      return { ok: false, message: 'Card payments are not connected yet. Nothing was charged.' }
    }

    // Q-06: a second `startPlanUpgrade` for the SAME upgrade must land on the order the
    // first call opened, not a new one. Checked BEFORE `createCheckout`, because Cashfree
    // rejects a duplicate `order_id` outright rather than replaying — reading the order
    // back is the recovery path, not the primary one.
    //
    // Any failure here — 404 for an id nothing was created against, a timeout, a bad
    // secret — is read as "no reusable order yet" and falls through to create. Cashfree's
    // not-found shape for `GET /orders/{id}` is NOT confirmed against a live account this
    // session has no access to (see the report for this change), so the direction of the
    // guess matters: reading a REAL outage as "not found" costs one missed dedup and one
    // wasted create call, which then throws its own correct error — reading a genuine
    // not-found as a real failure would block the very first upgrade of every workspace on
    // an unverified status code, which is worse than the defect this guard exists to fix.
    let openOrder: Awaited<ReturnType<typeof rail.fetchOrder>> | null = null
    try {
      openOrder = await rail.fetchOrder(fullOrderId)
    } catch {
      openOrder = null
    }

    const appBaseUrl = env.NEXT_PUBLIC_APP_URL as string

    if (openOrder) {
      const reused = reusedCheckoutState(
        rail.mode,
        openOrder,
        fullOrderId,
        parsed.data,
        proration.amountDuePaise,
        appBaseUrl,
      )
      if (reused) return reused
      // Found something, but it is no longer payable (EXPIRED, TERMINATED, …). Do not
      // create the fresh order under the SAME id — see the comment on `useFreshId` above.
      useFreshId = true
    }

    // ABSOLUTE, not '/settings/plan'. This becomes Cashfree's `order_meta.return_url`, which
    // it hands to a browser on another origin — a relative path there resolves against
    // Cashfree's own host and sends the paying customer to a page that is not ours.
    const returnUrl = new URL('/settings/plan', appBaseUrl).toString()

    let session: Awaited<ReturnType<typeof rail.createCheckout>>
    try {
      session = await rail.createCheckout({
        workspaceId: ws.workspace.id,
        planId: parsed.data,
        period,
        successUrl: returnUrl,
        cancelUrl: returnUrl,
        planChange: {
          changeId: randomUUID(),
          amountPaise: proration.amountDuePaise,
          credits: proration.creditsGranted,
        },
      })
    } catch (error) {
      // A GENUINELY concurrent second call: both saw `isOrderNotFound` above (neither order
      // existed yet) and both reached here under the same deterministic id. `useFreshId`
      // guarantees this can only be OUR id colliding with itself, never the dead order's, so
      // the recovery is always "read the order the other call just created".
      if (useFreshId || !isDuplicateOrder(error)) throw error
      const winner = await rail.fetchOrder(fullOrderId)
      const reused = reusedCheckoutState(
        rail.mode,
        winner,
        fullOrderId,
        parsed.data,
        proration.amountDuePaise,
        appBaseUrl,
      )
      if (!reused) throw error
      return reused
    }

    // Guard the LABEL rather than trusting the provider id: anything that is not a real
    // charge must reach the UI marked as such. The live branch returns `session.url`, which
    // points at the bridge route that hands `payment_session_id` to `cashfree-js`.
    if (session.mode !== 'live') {
      return {
        ok: true,
        simulated: true,
        mode: session.mode,
        sessionId: session.id,
        planId: parsed.data,
        amountDuePaise: proration.amountDuePaise,
        reused: false,
      }
    }

    return {
      ok: true,
      simulated: false,
      mode: 'live',
      sessionId: session.id,
      url: session.url,
      reused: false,
    }
  } catch (error) {
    reportServerError(error, { action: 'startPlanUpgrade', workspaceId })
    // Same reasoning as `startCheckout`: a permanent provider refusal must not
    // be sold to a customer as something pressing the button again will fix.
    return { ok: false, message: checkoutFailureMessage(error) }
  }
}

/** Who the invoice is made out to. */
export async function saveBillingDetails(input: unknown): Promise<PlanActionState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change your billing details.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const form = input as Record<string, unknown>
    const taxKind = String(form.taxKind ?? '')
    const legalName = String(form.legalName ?? '').trim()
    const gstin = String(form.gstin ?? '')
      .trim()
      .toUpperCase()

    if (!['registered', 'unregistered', 'overseas'].includes(taxKind)) {
      return { ok: false, message: RPC_MESSAGES.INVALID_TAX_KIND as string }
    }
    if (legalName.length === 0) {
      return { ok: false, message: RPC_MESSAGES.INVALID_NAME as string }
    }
    // Checked here so the customer gets the message next to the field. The DATABASE checks it
    // too (`app.gstin_is_valid`), because this function is not the only way in — anyone signed
    // in can call the RPC directly, so a check that lives only here is a suggestion.
    if (taxKind === 'registered' && parseGstin(gstin) === null) {
      return { ok: false, message: RPC_MESSAGES.INVALID_GSTIN as string }
    }

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('upsert_billing_profile', {
      p_workspace_id: ws.workspace.id,
      p_tax_kind: taxKind,
      p_legal_name: legalName,
      p_gstin: taxKind === 'registered' ? gstin : null,
      p_state_code: taxKind === 'unregistered' ? String(form.stateCode ?? '') : null,
      p_country_code: taxKind === 'overseas' ? String(form.countryCode ?? '') : null,
      p_address: form.address ? String(form.address) : null,
      p_billing_email: form.billingEmail ? String(form.billingEmail) : null,
    })

    if (error) {
      return {
        ok: false,
        message: rpcMessage(error.message, 'Sahoda could not save your billing details.'),
      }
    }

    revalidatePath('/settings/plan')
    return { ok: true, message: 'Saved. New invoices will carry these details.' }
  } catch (error) {
    reportServerError(error, { action: 'saveBillingDetails', workspaceId })
    return { ok: false, message: 'Sahoda could not save your billing details.' }
  }
}

/**
 * The payment rail, or null when it is not configured.
 *
 * A missing Cashfree env is a deployment state, not an exception: the customer must be told
 * card payments are not connected, not shown a generic "try again" for something that will
 * fail identically every time.
 *
 * `newId` is optional and defaults to the provider's own `randomUUID()` — `startCheckout`'s
 * top-up path wants a fresh id every time. `startPlanUpgrade` is the one caller that passes
 * a deterministic one, so a duplicate order can be found (`fetchOrder`) instead of opened
 * twice.
 */
function provider(newId?: () => string) {
  let cashfree: ReturnType<typeof loadCashfreeEnv>
  try {
    cashfree = loadCashfreeEnv()
  } catch {
    return null
  }
  const appBaseUrl = env.NEXT_PUBLIC_APP_URL
  if (!appBaseUrl) return null
  return createCashfreeProvider({ env: cashfree, appBaseUrl, ...(newId ? { newId } : {}) })
}
