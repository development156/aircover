'use server'

import { auth } from '@clerk/nextjs/server'
import { createCashfreeProvider, loadCashfreeEnv, type PaymentProvider } from '@sahoda/billing'
import { inrForCredits, PlanIdSchema, refuseTopUpCredits, TOP_UP } from '@sahoda/shared'
import { creditWord } from '@/lib/credit-words'

import { env } from '@/lib/env'
import { reportServerError } from '@/lib/observability/report'
import { workspaceForWrite } from '@/lib/workspaces'
import type { CheckoutState } from '@/lib/wallet/checkout-state'
import { currentBillingPeriod } from '@/lib/wallet/checkout-state'
import { checkoutFailureMessage } from '@/lib/billing/checkout-failure-copy'
import type { TopUpState } from '@/lib/wallet/topup-state'
import { readSubscription } from '@/lib/billing/read'

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

/** The sentence each refusal gets. One per reason, because "invalid amount" helps nobody. */
const TOP_UP_REFUSALS = {
  'not-a-number': 'Choose how many credits you want.',
  'below-minimum': `The smallest top-up is ${TOP_UP.min_credits.toLocaleString('en-IN')} ${creditWord(TOP_UP.min_credits)}.`,
  'above-maximum': `The largest top-up is ${TOP_UP.max_credits.toLocaleString('en-IN')} ${creditWord(TOP_UP.max_credits)}. Buy it twice for more.`,
  'not-a-step': `Credits are sold in steps of ${TOP_UP.step_credits.toLocaleString('en-IN')}.`,
} as const

/**
 * BUY A PACK OF CREDITS. Not a plan — nothing here renews, and no entitlement moves.
 *
 * ── THE QUANTITY IS CHECKED HERE, NOT ONLY ON THE SCREEN ─────────────────────
 * `refuseTopUpCredits` is the same function the panel calls, so what the button
 * refuses and what this refuses cannot drift. It is called again on this side
 * because a server action is a public endpoint: the panel's check is a courtesy to
 * the customer, this one is the rule.
 *
 * ── THE PRICE IS DERIVED, NEVER ACCEPTED ─────────────────────────────────────
 * The caller sends credits and nothing else. The rupees come from `inrForCredits`
 * on this side, travel to Cashfree as the order amount, and are checked AGAIN
 * against the same rate when the webhook comes back. A price posted by a browser
 * would be a price a customer could choose.
 *
 * ── THE PLAN TAG IS CONTEXT, NOT THE PRODUCT ─────────────────────────────────
 * The order still records which plan the workspace was on, because a support
 * question about a charge starts there. It grants nothing: the webhook reads the
 * two top-up tags and never looks at the plan for a pack. An unreadable
 * subscription therefore cannot block a purchase — it falls back to `free`, which
 * is what a workspace with no subscription row genuinely is.
 */
export async function startTopUp(credits: unknown): Promise<TopUpState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to buy credits.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const refusal = refuseTopUpCredits(credits)
    if (refusal) return { ok: false, message: TOP_UP_REFUSALS[refusal] }
    const wanted = credits as number

    const rail = provider()
    if (!rail) {
      return { ok: false, message: 'Card payments are not connected yet. Nothing was charged.' }
    }

    const subscription = await readSubscription()
    const planId = subscription.status === 'ok' ? subscription.data.planId : 'free'

    const appBaseUrl = env.NEXT_PUBLIC_APP_URL as string
    const returnUrl = new URL('/wallet', appBaseUrl).toString()

    const session = await rail.createCheckout({
      workspaceId: ws.workspace.id,
      planId,
      period: currentBillingPeriod(new Date()),
      successUrl: returnUrl,
      cancelUrl: returnUrl,
      topUp: { credits: wanted, amountPaise: inrForCredits(wanted) * 100 },
    })

    if (session.mode !== 'live') {
      return {
        ok: true,
        simulated: true,
        mode: session.mode,
        sessionId: session.id,
        credits: wanted,
      }
    }

    return {
      ok: true,
      simulated: false,
      mode: 'live',
      sessionId: session.id,
      url: session.url,
      credits: wanted,
    }
  } catch (error) {
    reportServerError(error, { action: 'startTopUp', workspaceId })
    return { ok: false, message: 'Could not start your top-up. Nothing was charged.' }
  }
}
