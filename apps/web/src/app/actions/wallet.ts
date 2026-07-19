'use server'

import { auth } from '@clerk/nextjs/server'
import { createFixtureProvider, type PaymentProvider } from '@sahoda/billing'
import { PlanIdSchema } from '@sahoda/shared'

import { getActiveWorkspace } from '@/lib/workspaces'
import type { CheckoutState } from '@/lib/wallet/checkout-state'
import { currentBillingPeriod } from '@/lib/wallet/checkout-state'

/**
 * Top-up entry point. This consumes the `PaymentProvider` INTERFACE only — it
 * never implements a rail. Real Cashfree sandbox wiring belongs to the billing
 * lane; when it lands, the single `provider()` line below changes and nothing
 * else does.
 *
 * Today the only implementation is the fixture double, whose checkout URL is
 * `https://fixture.local/checkout?…` — a host that does not resolve. So this
 * action deliberately does NOT redirect: sending someone to a dead URL and
 * calling it checkout is a fake success. It returns the labelled session and the
 * page renders it as a sandbox result with no payment taken.
 */
function provider(): PaymentProvider {
  return createFixtureProvider()
}

export async function startCheckout(planId: unknown): Promise<CheckoutState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to top up credits.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, message: 'Create a workspace first.' }

    const parsedPlan = PlanIdSchema.safeParse(planId)
    if (!parsedPlan.success) return { ok: false, message: 'Pick a plan to continue.' }

    const rail = provider()
    const session = await rail.createCheckout({
      workspaceId: workspace.id,
      planId: parsedPlan.data,
      period: currentBillingPeriod(new Date()),
      // Both are required by the interface. They are never followed on the
      // fixture path, which is exactly why nothing here redirects.
      successUrl: '/wallet',
      cancelUrl: '/wallet',
    })

    // Guard the label rather than trusting the provider id: anything that is not
    // a real charge must reach the UI marked as such.
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
  } catch {
    return { ok: false, message: 'Could not start a top-up — try again.' }
  }
}
