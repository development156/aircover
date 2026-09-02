import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { createCashfreeProvider, loadCashfreeEnv } from '@sahoda/billing'
import { activeWorkspaceRead } from '@/lib/workspaces'

import CheckoutBridgePage from './page'

/**
 * `/billing/checkout/{orderId}` with `fetchOrder` STUBBED.
 *
 * The page's job is to state what is true about a real order and, when the order is still
 * payable, hand its session to the bridge component. Each of Cashfree's order states is a
 * different sentence here, and the two that matter most are pinned by their CLAIM:
 *
 *   ACTIVE  the bridge renders, with THIS order's session id and the deployment's mode
 *   PAID    "payment received", credits land when the webhook writes the grant, and NO
 *           balance figure, because this page ran no query that could produce one
 *
 * Nothing here proves Cashfree accepts the session. That needs a key pair it honours,
 * which this deployment does not have. What it proves is that the page no longer says
 * "the payment step is not connected yet" to a customer holding a payable order.
 */

vi.mock('@sahoda/billing', () => ({
  createCashfreeProvider: vi.fn(),
  loadCashfreeEnv: vi.fn(),
}))
vi.mock('@/lib/workspaces', () => ({ activeWorkspaceRead: vi.fn() }))
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://app.sahoda.test' } }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
// The bridge's own behaviour is proven in `cashfree-checkout.test.tsx`; here what matters
// is WHETHER it renders and WHAT it was handed.
vi.mock('@/components/billing/cashfree-checkout', () => ({
  CashfreeCheckout: (p: { paymentSessionId: string; mode: string; amountLabel: string | null }) => (
    <div
      data-testid="cashfree-checkout"
      data-session={p.paymentSessionId}
      data-mode={p.mode}
      data-amount={p.amountLabel ?? ''}
    />
  ),
}))

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001'
const fetchOrder = vi.fn()

const order = (over: Record<string, unknown> = {}) => ({
  orderId: 'sah_1',
  status: 'ACTIVE',
  tags: { workspace_id: WORKSPACE_ID, plan_id: 'starter', period: '2026-09' },
  paymentSessionId: 'session_abc123',
  ...over,
})

async function page() {
  return render(await CheckoutBridgePage({ params: Promise.resolve({ orderId: 'sah_1' }) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadCashfreeEnv).mockReturnValue({
    appId: 'id',
    secretKey: 'secret',
    env: 'live',
    baseUrl: 'https://api.cashfree.com/pg',
  })
  vi.mocked(createCashfreeProvider).mockReturnValue({
    fetchOrder,
  } as unknown as ReturnType<typeof createCashfreeProvider>)
  vi.mocked(activeWorkspaceRead).mockResolvedValue({
    status: 'ok',
    workspace: { id: WORKSPACE_ID, name: 'Shop' },
  } as unknown as Awaited<ReturnType<typeof activeWorkspaceRead>>)
})

describe('a payable order', () => {
  test('hands THIS order’s session and the deployment’s mode to the bridge', async () => {
    fetchOrder.mockResolvedValue(order())
    await page()

    const bridge = screen.getByTestId('cashfree-checkout')
    expect(bridge).toHaveAttribute('data-session', 'session_abc123')
    expect(bridge).toHaveAttribute('data-mode', 'production')
    // The catalogue price for a plain purchase, formatted by the server.
    expect(bridge).toHaveAttribute('data-amount', '₹1,999')
    expect(screen.queryByText(/not connected yet/i)).not.toBeInTheDocument()
  })

  test('says sandbox to the SDK when the deployment is sandbox', async () => {
    vi.mocked(loadCashfreeEnv).mockReturnValue({
      appId: 'id',
      secretKey: 'secret',
      env: 'sandbox',
      baseUrl: 'https://sandbox.cashfree.com/pg',
    })
    fetchOrder.mockResolvedValue(order())
    await page()
    expect(screen.getByTestId('cashfree-checkout')).toHaveAttribute('data-mode', 'sandbox')
  })

  test('hands the prorated amount, not the catalogue price, for a plan change', async () => {
    fetchOrder.mockResolvedValue(
      order({
        tags: {
          workspace_id: WORKSPACE_ID,
          plan_id: 'growth',
          period: '2026-09',
          change_id: 'c1',
          change_amount_inr: '1000',
        },
      }),
    )
    await page()
    expect(screen.getByTestId('cashfree-checkout')).toHaveAttribute('data-amount', '₹1,000')
  })

  test('without a session there is nothing to pay with, and the page says so instead of pretending', async () => {
    fetchOrder.mockResolvedValue(order({ paymentSessionId: null }))
    await page()

    expect(screen.queryByTestId('cashfree-checkout')).not.toBeInTheDocument()
    expect(screen.getByText(/could not get a payment session for this order/i)).toBeInTheDocument()
    expect(screen.getByText(/Nothing was charged/)).toBeInTheDocument()
  })
})

describe('an order that is no longer payable', () => {
  test('PAID: says the payment was received and that credits land via confirmation, with no invented balance', async () => {
    fetchOrder.mockResolvedValue(order({ status: 'PAID', paymentSessionId: null }))
    await page()

    expect(screen.getByRole('heading', { name: /Payment received/ })).toBeInTheDocument()
    expect(screen.getByText(/Credits land within a minute/)).toBeInTheDocument()
    expect(screen.queryByTestId('cashfree-checkout')).not.toBeInTheDocument()
    // No query on this page produced a balance, so none may be shown.
    expect(screen.queryByText(/\d[\d,]*\s+credits/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /wallet/i })).toHaveAttribute('href', '/wallet')
  })

  test('EXPIRED: says it expired unpaid and that nothing was charged, and offers no pay button', async () => {
    fetchOrder.mockResolvedValue(order({ status: 'EXPIRED', paymentSessionId: null }))
    await page()

    expect(screen.getByText(/expired before it was paid/i)).toBeInTheDocument()
    expect(screen.getByText(/Nothing was charged/)).toBeInTheDocument()
    expect(screen.queryByTestId('cashfree-checkout')).not.toBeInTheDocument()
  })

  test('TERMINATED: says it was cancelled, not that it failed', async () => {
    fetchOrder.mockResolvedValue(order({ status: 'TERMINATED', paymentSessionId: null }))
    await page()

    expect(screen.getByText(/was cancelled/i)).toBeInTheDocument()
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('cashfree-checkout')).not.toBeInTheDocument()
  })

  test('a status this page has never seen is shown verbatim, never coerced into one it knows', async () => {
    fetchOrder.mockResolvedValue(order({ status: 'SOMETHING_NEW', paymentSessionId: null }))
    await page()

    expect(screen.getByText('SOMETHING_NEW')).toBeInTheDocument()
    expect(screen.getByText(/could not tell what state this order is in/i)).toBeInTheDocument()
    expect(screen.queryByTestId('cashfree-checkout')).not.toBeInTheDocument()
    expect(screen.queryByText(/Payment received/)).not.toBeInTheDocument()
  })
})

describe('someone else’s order', () => {
  test('is a 404, so an order id cannot be used as an existence oracle', async () => {
    fetchOrder.mockResolvedValue(order({ tags: { workspace_id: 'other', plan_id: 'starter' } }))
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
