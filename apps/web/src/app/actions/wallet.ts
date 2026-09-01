'use server'

import { auth } from '@clerk/nextjs/server'
import { createCashfreeProvider, loadCashfreeEnv, type PaymentProvider } from '@sahoda/billing'
import { PlanIdSchema } from '@sahoda/shared'

import { env } from '@/lib/env'
import { reportServerError } from '@/lib/observability/report'
import { workspaceForWrite } from '@/lib/workspaces'
import type { CheckoutState } from '@/lib/wallet/checkout-state'
import { currentBillingPeriod } from '@/lib/wallet/checkout-state'

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
 * ── WHAT STILL DOES NOT REDIRECT, AND WHY ────────────────────────────────────
 * Cashfree publishes no hosted-checkout URL: Create Order returns a `payment_session_id`
 * for the `cashfree-js` browser SDK, so `CheckoutSession.url` points at an app-owned bridge
 * route (`/billing/checkout/{orderId}`) that does not exist yet. Sending someone there and
 * calling it checkout would be a 404 dressed as a purchase, so this keeps returning a
 * labelled session and lets the panel say plainly that the payment page is not reachable.
 */
function provider(): PaymentProvider | null {
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

  return createCashfreeProvider({ env: cashfree, appBaseUrl })
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

    const rail = provider()
    if (!rail) {
      return { ok: false, message: 'Card payments are not connected yet. Nothing was charged.' }
    }

    // ABSOLUTE, not '/wallet'. `successUrl` becomes Cashfree's `order_meta.return_url`, which
    // it hands to a browser on another origin — a relative path there resolves against
    // Cashfree's own host and sends the paying customer to a page that is not ours.
    const appBaseUrl = env.NEXT_PUBLIC_APP_URL as string
    const returnUrl = new URL('/wallet', appBaseUrl).toString()

    const session = await rail.createCheckout({
      workspaceId: workspace.id,
      planId: parsedPlan.data,
      period: currentBillingPeriod(new Date()),
      successUrl: returnUrl,
      cancelUrl: returnUrl,
    })

    // Guard the label rather than trusting the provider id: anything that is not
    // a real charge must reach the UI marked as such.
    //
    // NOTE FOR THE LIVE FLIP: the `live` branch below returns `session.url`, which points at
    // `/billing/checkout/{orderId}` — the bridge page that hands `payment_session_id` to
    // `cashfree-js`. THAT ROUTE DOES NOT EXIST YET. Setting CASHFREE_ENV=live before it does
    // would render "Open the payment page" as a link to a 404, which is precisely the fake
    // success this action was written to avoid.
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
    return { ok: false, message: 'Could not start a top-up. Try again.' }
  }
}
