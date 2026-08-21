import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createCashfreeProvider, loadCashfreeEnv } from '@sahoda/billing'
import { PLAN_CATALOG, PlanIdSchema } from '@sahoda/shared'

import { PageTitle } from '@/components/page-title'
import { buttonVariants } from '@/components/ui/button'
import { env } from '@/lib/env'
import { reportServerError } from '@/lib/observability/report'
import { activeWorkspaceRead } from '@/lib/workspaces'
import { rupees } from '@/lib/billing/plan-copy'

export const metadata = { title: 'Checkout' }
/** Reads a live order from the provider on every request. */
export const dynamic = 'force-dynamic'

/**
 * `/billing/checkout/{orderId}` — the destination `CheckoutSession.url` has always named.
 *
 * ── WHY THIS ROUTE EXISTS AT ALL ─────────────────────────────────────────────
 * Cashfree publishes no hosted-checkout URL. Create Order returns a `payment_session_id` for
 * the `cashfree-js` browser SDK, so the app has to own the page that hands it over. Until
 * now `session.url` pointed here and nothing was here — a 404 dressed as a purchase, sitting
 * one env flip away from being shown to a paying customer. `actions/wallet.ts` carries a
 * NOTE FOR THE LIVE FLIP saying exactly that.
 *
 * ── WHAT IT DOES AND DOES NOT DO TODAY ───────────────────────────────────────
 * It reads the real order from Cashfree and states what is true about it. It does NOT yet
 * hand the session to the SDK, and it does not pretend to: MEASURED on 2026-08-19, this
 * deployment's `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` hold the identical 40-character
 * value, and a real sandbox Create Order returns
 *
 *     HTTP 401 {"message":"authentication Failed","code":"request_failed",
 *               "type":"authentication_error"}
 *
 * So no order can be opened from this deployment at all, and an SDK integration written
 * against it could not be exercised even once. Shipping an untestable payment step and
 * calling it done is the "mock-success in prod path" the project forbids; shipping a page
 * that says precisely what is and is not connected is not a dead end, it is a labelled one.
 *
 * ── AND WHY IT DOES NOT CONFIRM AN ORDER IT CANNOT PLACE ─────────────────────
 * An order id in a URL is guessable. The page resolves the order through the provider and
 * compares `order_tags.workspace_id` to the caller's active workspace; anything else is a
 * 404, so this route cannot be used to discover whether someone else's order exists.
 */
export default async function CheckoutBridgePage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params

  const workspace = await activeWorkspaceRead()
  if (workspace.status !== 'ok') notFound()

  let cashfree: ReturnType<typeof loadCashfreeEnv>
  try {
    cashfree = loadCashfreeEnv()
  } catch {
    return (
      <Shell>
        <p className="type-h3">Card payments are not connected</p>
        <p className="type-body mt-1.5 text-muted">
          Nothing was charged and nothing was added to your wallet. This is a setup that has not
          been finished, not a payment that failed.
        </p>
      </Shell>
    )
  }

  const provider = createCashfreeProvider({
    env: cashfree,
    appBaseUrl: env.NEXT_PUBLIC_APP_URL as string,
  })

  let order: Awaited<ReturnType<typeof provider.fetchOrder>>
  try {
    order = await provider.fetchOrder(orderId)
  } catch (error) {
    // The provider could not be reached, or refused us. Either way this is OUR problem to
    // fix and the customer's money has not moved — say that, rather than implying their
    // payment failed.
    reportServerError(error, { action: 'checkoutBridge', workspaceId: workspace.workspace.id })
    return (
      <Shell>
        <p className="type-h3">Sahoda could not reach the payment provider</p>
        <p className="type-body mt-1.5 text-muted">
          Nothing was charged. Try again from the wallet, and if it keeps happening it is a problem
          at our end rather than with your card.
        </p>
        <Back />
      </Shell>
    )
  }

  // An order id is guessable. Anything that is not THIS workspace's order is a 404 — no
  // existence oracle, the same rule the definer functions follow.
  if (order.tags?.workspace_id !== workspace.workspace.id) notFound()

  const planId = PlanIdSchema.safeParse(order.tags?.plan_id)
  const amountInr = Number(order.tags?.change_amount_inr ?? '')
  const isPlanChange = Number.isFinite(amountInr) && order.tags?.change_id !== undefined

  return (
    <Shell>
      <p className="type-h3">Your order is open</p>
      <dl className="mt-4 space-y-2 border-t border-line-soft pt-4">
        <Row label="Order">
          <span className="num font-mono text-[12px]">{order.orderId}</span>
        </Row>
        {planId.success ? <Row label="Plan">{PLAN_CATALOG[planId.data].name}</Row> : null}
        {/*
          The amount is shown only when the order actually states one. A plan change carries
          its prorated figure in the tags; a plain purchase is the catalogue price. Neither
          is invented here — an amount this page could not read is a slot that does not
          render at all.
        */}
        {isPlanChange ? (
          <Row label="Amount">
            <span className="num">{rupees(Math.round(amountInr * 100))}</span>
          </Row>
        ) : planId.success ? (
          <Row label="Amount">
            <span className="num">{rupees(PLAN_CATALOG[planId.data].priceInr * 100)}</span>
          </Row>
        ) : null}
        {order.status ? <Row label="Status">{order.status}</Row> : null}
      </dl>

      {/*
        Coming-soon is a DIV, never a `<button disabled>` (docs/26 §10.2). A disabled button
        is still announced as a button: a screen reader offers the action, the customer takes
        it, nothing happens, and the failure reads as a broken app rather than an unbuilt
        step. Guarded by e2e/design-system.spec.ts for exactly this shape.
      */}
      <div className="is-proposed mt-4 rounded-card px-3 py-3">
        <p className="type-h3">The payment step is not connected yet</p>
        <p className="type-body mt-1.5">
          Your order exists and nothing has been charged. Sahoda cannot collect the payment from
          this page yet, so no credits have been added and none will be until a payment actually
          completes.
        </p>
      </div>

      <Back />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-grid">
      <PageTitle>Checkout</PageTitle>
      <section className="surface-ring rounded-card bg-surface px-4 py-4">{children}</section>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <dt className="type-sm text-muted">{label}</dt>
      <dd className="type-body min-w-0 break-all">{children}</dd>
    </div>
  )
}

function Back() {
  return (
    <Link href="/wallet" className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} mt-4`}>
      Back to wallet
    </Link>
  )
}
