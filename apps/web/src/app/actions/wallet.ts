'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { createCashfreeProvider, loadCashfreeEnv } from '@sahoda/billing'
import { PlanIdSchema } from '@sahoda/shared'

import { env } from '@/lib/env'
import { reportServerError } from '@/lib/observability/report'
import { workspaceForWrite } from '@/lib/workspaces'
import type { CheckoutState } from '@/lib/wallet/checkout-state'
import { currentBillingPeriod } from '@/lib/wallet/checkout-state'
import { checkoutFailureMessage } from '@/lib/billing/checkout-failure-copy'
import { isDuplicateOrder } from '@/lib/billing/plan-change-order'
import { reusedTopupState, topupOrderId } from '@/lib/wallet/topup-order'

/**
 * Top-up entry point. This consumes the `PaymentProvider` INTERFACE only — it never
 * implements a rail.
 *
 * ── WHY THE FIXTURE IS GONE ──────────────────────────────────────────────────
 * This used to return `createFixtureProvider()`, which minted a session id against
 * `https://fixture.local` — a host that does not resolve — so nothing here could ever
 * become a payment. It now opens a REAL Cashfree order, tagged with workspace / plan /
 * period. Those `order_tags` are the only carrier of that triple into the webhook, which
 * is what lets `PAYMENT_SUCCESS_WEBHOOK` resolve to a ledger GRANT for the right tenant.
 *
 * It is deliberately NOT the fixture behind an env flag. The fixture's HMAC secret is a
 * source literal in a public repository; keeping a code path that can construct it next to
 * the one the money uses is how a flag flip becomes free credits.
 *
 * ── WHERE THE PAYMENT HAPPENS ────────────────────────────────────────────────
 * Cashfree publishes no hosted-checkout URL: Create Order returns a `payment_session_id`
 * for the `cashfree-js` browser SDK, so `CheckoutSession.url` points at the app-owned bridge
 * route `/billing/checkout/{orderId}`, which reads the order back and hands that session to
 * the SDK. Only the `live` branch below returns the URL; a sandbox session stays labelled
 * and inert here.
 */
// Returns the concrete Cashfree provider, not the `PaymentProvider` port: the
// port has no `fetchOrder`, and the dedup below needs it (as billing.ts does).
function provider(newId?: () => string) {
  // A missing/invalid Cashfree env is a deployment state, not an exception: the customer
  // must be told card payments are not connected, not shown a generic "try again" for
  // something that will fail identically every time.
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

export async function startCheckout(planId: unknown): Promise<CheckoutState> {
  // Hoisted so the catch can tag the tenant — see lib/observability/report.ts.
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to top up credits.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const parsedPlan = PlanIdSchema.safeParse(planId)
    if (!parsedPlan.success) return { ok: false, message: 'Pick a plan to continue.' }

    // Q-06, wallet half: two presses of "Top up" for the same pack in the same
    // month land on ONE Cashfree order. The id is derived from what is bought
    // (`topupOrderId`), the order is looked up before it is created, and the id
    // flips to a fresh one only when the order it names is dead rather than
    // absent. Same shape as `startPlanUpgrade`; see `lib/wallet/topup-order.ts`.
    const period = currentBillingPeriod(new Date())
    const orderId = topupOrderId(workspace.id, parsedPlan.data, period)
    const fullOrderId = `sah_${orderId}`
    let useFreshId = false
    const rail = provider(() => (useFreshId ? randomUUID() : orderId))
    if (!rail) {
      return { ok: false, message: 'Card payments are not connected yet. Nothing was charged.' }
    }

    // ABSOLUTE, not '/wallet'. `successUrl` becomes Cashfree's `order_meta.return_url`, which
    // it hands to a browser on another origin — a relative path there resolves against
    // Cashfree's own host and sends the paying customer to a page that is not ours.
    const appBaseUrl = env.NEXT_PUBLIC_APP_URL as string
    const returnUrl = new URL('/wallet', appBaseUrl).toString()

    // Any failure reading the order (404, timeout, bad secret) reads as "nothing
    // to reuse" and falls through to create, for the reason billing.ts gives:
    // a missed dedup costs one wasted create call that then fails on its own
    // terms; a false "real failure" would block every first top-up.
    let openOrder: Awaited<ReturnType<typeof rail.fetchOrder>> | null = null
    try {
      openOrder = await rail.fetchOrder(fullOrderId)
    } catch {
      openOrder = null
    }
    if (openOrder) {
      const reused = reusedTopupState(
        rail.mode,
        openOrder,
        fullOrderId,
        parsedPlan.data,
        appBaseUrl,
      )
      if (reused) return reused
      useFreshId = true
    }

    let session: Awaited<ReturnType<typeof rail.createCheckout>>
    try {
      session = await rail.createCheckout({
        workspaceId: workspace.id,
        planId: parsedPlan.data,
        period,
        successUrl: returnUrl,
        cancelUrl: returnUrl,
      })
    } catch (error) {
      // Two genuinely concurrent calls both found nothing and both created under
      // the same id; the loser reads back the winner's order.
      if (useFreshId || !isDuplicateOrder(error)) throw error
      const winner = await rail.fetchOrder(fullOrderId)
      const reused = reusedTopupState(rail.mode, winner, fullOrderId, parsedPlan.data, appBaseUrl)
      if (!reused) throw error
      return reused
    }

    // Guard the label rather than trusting the provider id: anything that is not
    // a real charge must reach the UI marked as such.
    //
    // The `live` branch below returns `session.url`, which points at `/billing/checkout/
    // {orderId}`: the bridge page that hands `payment_session_id` to `cashfree-js`.
    if (session.mode !== 'live') {
      return {
        ok: true,
        simulated: true,
        mode: session.mode,
        sessionId: session.id,
        planId: parsedPlan.data,
      }
    }

    return { ok: true, simulated: false, mode: 'live', sessionId: session.id, url: session.url }
  } catch (error) {
    reportServerError(error, { action: 'startCheckout', workspaceId })
    // "Try again" only when trying again can work. See checkout-failure-copy.ts:
    // Cashfree answers 401 on production today, and that failure repeats
    // identically however many times the button is pressed.
    return { ok: false, message: checkoutFailureMessage(error) }
  }
}
