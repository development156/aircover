import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createCashfreeProvider, loadCashfreeEnv } from '@sahoda/billing'
import { PLAN_CATALOG, PlanIdSchema } from '@sahoda/shared'

import { PageTitle } from '@/components/page-title'
import { CashfreeCheckout, type CashfreeSdkMode } from '@/components/billing/cashfree-checkout'
import { buttonVariants } from '@/components/ui/button'
import { env } from '@/lib/env'
import { reportServerError } from '@/lib/observability/report'
import { activeWorkspaceRead } from '@/lib/workspaces'
import { rupees } from '@/lib/billing/plan-copy'

export const metadata = { title: 'Checkout' }
/** Reads a live order from the provider on every request. */
export const dynamic = 'force-dynamic'

/**
 * `/billing/checkout/{orderId}` — the destination `CheckoutSession.url` names.
 *
 * ── WHY THIS ROUTE EXISTS AT ALL ─────────────────────────────────────────────
 * Cashfree publishes no hosted-checkout URL. Create Order returns a `payment_session_id` for
 * the `cashfree-js` browser SDK, so the app has to own the page that hands it over. This is
 * that page: it reads the real order back from Cashfree, states what is true about it, and,
 * while the order is still payable, mounts `CashfreeCheckout` with the order's own session.
 *
 * ── EVERY ORDER STATE IS ITS OWN SENTENCE ────────────────────────────────────
 * Cashfree's `order_status` is the only fact this page has. ACTIVE with a session is the one
 * state that can be paid; PAID means Cashfree took the money and the webhook, not this page,
 * writes the credits; EXPIRED and TERMINATED both mean nothing was charged. Anything else is
 * shown verbatim rather than coerced into a state this page knows, because a status it has
 * never seen is exactly the case where guessing is most dangerous.
 *
 * Nothing here claims credits. The ledger is written by the webhook alone, and this page ran
 * no query that could produce a balance, so no state renders a figure.
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
  // TWO answers, and only one of them is a missing page. A workspace read that merely
  // FAILED must not 404: that tells a customer who has just paid that the page they were
  // sent to does not exist. `none` still 404s: an order belongs to a workspace, so without
  // one there is genuinely nothing at this address.
  if (workspace.status === 'unreadable') {
    return (
      <Shell>
        <h2 className="type-h3">Sahoda could not check your workspace just now</h2>
        <p className="type-body mt-1.5 text-muted">
          This is not a payment problem and nothing about your order has changed. Reload this page
          in a moment, or open your wallet to see where it got to.
        </p>
        <Back />
      </Shell>
    )
  }
  if (workspace.status !== 'ok') notFound()

  let cashfree: ReturnType<typeof loadCashfreeEnv>
  try {
    cashfree = loadCashfreeEnv()
  } catch {
    return (
      <Shell>
        <h2 className="type-h3">Card payments are not connected</h2>
        <p className="type-body mt-1.5 text-muted">
          Nothing was charged and nothing was added to your wallet. This is a setup that has not
          been finished, not a payment that failed.
        </p>
        <Back />
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
    // The provider could not be reached, or refused us. Either way it is Sahoda's problem
    // and the customer's money has not moved. Say that, not that their payment failed.
    reportServerError(error, { action: 'checkoutBridge', workspaceId: workspace.workspace.id })
    return (
      <Shell>
        <h2 className="type-h3">Sahoda could not reach the payment provider</h2>
        <p className="type-body mt-1.5 text-muted">
          Nothing was charged. Try again from the wallet, and if it keeps happening it is a problem
          at our end rather than with your card.
        </p>
        <Back />
      </Shell>
    )
  }

  // An order id is guessable. Anything that is not THIS workspace's order is a 404: no
  // existence oracle, the same rule the definer functions follow.
  if (order.tags?.workspace_id !== workspace.workspace.id) notFound()

  const planId = PlanIdSchema.safeParse(order.tags?.plan_id)
  const amountInr = Number(order.tags?.change_amount_inr ?? '')
  const isPlanChange = Number.isFinite(amountInr) && order.tags?.change_id !== undefined
  // The amount is stated only when the order actually carries one. A plan change carries
  // its prorated figure in the tags; a plain purchase is the catalogue price. Neither is
  // invented here: an amount this page could not read is a slot that does not render.
  const amountLabel = isPlanChange
    ? rupees(Math.round(amountInr * 100))
    : planId.success
      ? rupees(PLAN_CATALOG[planId.data].priceInr * 100)
      : null
  // The SDK's own vocabulary. Derived from CASHFREE_ENV on the server, never from a
  // NEXT_PUBLIC_ value: the env that opened the order is the env that must collect it.
  const mode: CashfreeSdkMode = cashfree.env === 'live' ? 'production' : 'sandbox'
  const state = orderState(order.status)

  return (
    <Shell>
      <h2 className="type-h3">{HEADLINE[state]}</h2>
      <dl className="mt-4 space-y-2 border-t border-line-soft pt-4">
        <Row label="Order">
          <span className="num font-mono text-[12px]">{order.orderId}</span>
        </Row>
        {planId.success ? <Row label="Plan">{PLAN_CATALOG[planId.data].name}</Row> : null}
        {amountLabel ? (
          <Row label="Amount">
            <span className="num">{amountLabel}</span>
          </Row>
        ) : null}
        {order.status ? <Row label="Status">{STATUS_WORD[state] ?? order.status}</Row> : null}
      </dl>

      {state === 'payable' && order.paymentSessionId ? (
        <CashfreeCheckout
          paymentSessionId={order.paymentSessionId}
          mode={mode}
          amountLabel={amountLabel}
        />
      ) : null}
      {state === 'payable' && !order.paymentSessionId ? (
        <Notice tone="warn">
          Sahoda could not get a payment session for this order, so there is nothing to pay with
          here. Nothing was charged. Start a new order from the wallet.
        </Notice>
      ) : null}
      {state === 'paid' ? (
        <Notice tone="ok">
          Cashfree confirmed your payment. Credits land within a minute, as soon as Cashfree tells
          Sahoda about it. Your wallet shows them the moment they arrive.
        </Notice>
      ) : null}
      {state === 'expired' ? (
        <Notice tone="warn">
          This order expired before it was paid. Nothing was charged. Start a new order from the
          wallet if you still want it.
        </Notice>
      ) : null}
      {state === 'cancelled' ? (
        <Notice tone="warn">
          This order was cancelled before it was paid. Nothing was charged. Start a new order from
          the wallet if you still want it.
        </Notice>
      ) : null}
      {state === 'unknown' ? (
        <Notice tone="warn">
          Sahoda could not tell what state this order is in. If you paid, the credits still land
          once Cashfree confirms the payment; if you did not, nothing was charged.
        </Notice>
      ) : null}

      <Back />
    </Shell>
  )
}

type OrderState = 'payable' | 'paid' | 'expired' | 'cancelled' | 'unknown'

/** Cashfree's `order_status` vocabulary, and only that. Anything else stays unknown. */
function orderState(status: string | null): OrderState {
  switch (status) {
    case 'ACTIVE':
      return 'payable'
    case 'PAID':
      return 'paid'
    case 'EXPIRED':
      return 'expired'
    case 'TERMINATED':
    case 'TERMINATION_REQUESTED':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

const HEADLINE: Record<OrderState, string> = {
  payable: 'Your order is open',
  paid: 'Payment received',
  expired: 'Order expired',
  cancelled: 'Order cancelled',
  unknown: 'Your order',
}

/** The customer's word for a status this page knows. An unknown status is shown verbatim. */
const STATUS_WORD: Partial<Record<OrderState, string>> = {
  payable: 'Awaiting payment',
  paid: 'Paid',
  expired: 'Expired',
  cancelled: 'Cancelled',
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

function Notice({ tone, children }: { tone: 'ok' | 'warn'; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className={`type-body mt-4 rounded-input px-3 py-2.5 ${
        tone === 'ok' ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn'
      }`}
    >
      {children}
    </p>
  )
}

function Back() {
  return (
    <Link href="/wallet" className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} mt-4`}>
      Back to wallet
    </Link>
  )
}
