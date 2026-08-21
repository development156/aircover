import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SubscriptionView } from '@sahoda/shared'

/**
 * The plan picker's three certainty states, RENDERED.
 *
 * ── WHAT THIS PROVES AND WHAT IT DOES NOT ────────────────────────────────────
 * It proves the render paths: that a scheduled downgrade shows the committed rung with a way
 * out, that a priced change shows the proposed rung with the amount on the button, and that
 * a failed preview never renders a price.
 *
 * It does NOT prove the server round trip. `set_pending_plan_change` arrives with
 * `20260819213000_billing_lifecycle.sql`, which is applied by hand and has not been, so
 * scheduling a downgrade against the live database currently returns the RPC's own "not
 * found" and the UI shows it. The RPC itself is proven in
 * `packages/db/tests/billing_lifecycle.pglite.test.ts` against real Postgres, including
 * every refusal. The seam between them is the part nothing has exercised end to end, and
 * saying so is more useful than a test that mocks both halves and proves the mock.
 */
const previewPlanChange = vi.fn()
const schedulePlanDowngrade = vi.fn()
const cancelPlanDowngrade = vi.fn()
const startPlanUpgrade = vi.fn()

// The action module is `'use server'` and pulls in server-only code; jsdom cannot load it.
vi.mock('@/app/actions/billing', () => ({
  previewPlanChange: (...a: unknown[]) => previewPlanChange(...a),
  schedulePlanDowngrade: (...a: unknown[]) => schedulePlanDowngrade(...a),
  cancelPlanDowngrade: (...a: unknown[]) => cancelPlanDowngrade(...a),
  startPlanUpgrade: (...a: unknown[]) => startPlanUpgrade(...a),
}))

const { PlanPicker } = await import('./plan-picker')

const view = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  workspaceId: '00000000-0000-4000-8000-000000000001',
  planId: 'growth',
  status: 'active',
  currentPeriodStart: '2026-08-01T00:00:00.000Z',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  pendingPlanId: null,
  pendingPlanEffectiveAt: null,
  graceEndsAt: null,
  dunningAttempts: 0,
  lastFailureAt: null,
  lastFailureCode: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a scheduled downgrade', () => {
  it('says what changes, when, and that nothing changes until then', async () => {
    const { container } = render(
      <PlanPicker
        subscription={view({
          pendingPlanId: 'starter',
          pendingPlanEffectiveAt: '2026-09-01T00:00:00.000Z',
        })}
      />,
    )
    // READ THE TEXT, and read it INSIDE the banner. `getByText(/Starter/)` matched two
    // elements — the banner and the Starter tile — which is a reminder that a page-wide text
    // query proves a string exists somewhere, not that the right component said it.
    const banner = container.querySelector('.is-committed') as HTMLElement
    expect(banner).not.toBeNull()
    const text = banner.textContent?.replace(/\s+/g, ' ') ?? ''
    expect(text).toMatch(/Moving to Starter on 1 Sept 2026/)
    expect(text).toMatch(/Until then you keep everything you have now/)
  })

  it('wears the COMMITTED rung — someone decided, and it has not happened', async () => {
    const { container } = render(
      <PlanPicker
        subscription={view({
          pendingPlanId: 'starter',
          pendingPlanEffectiveAt: '2026-09-01T00:00:00.000Z',
        })}
      />,
    )
    // Not `.is-proposed` (nobody has agreed) and not `.is-real` (it has not happened).
    expect(container.querySelector('.is-committed')).not.toBeNull()
    expect(container.querySelector('.is-proposed')).toBeNull()
  })

  it('offers a way out, and reports what came back', async () => {
    cancelPlanDowngrade.mockResolvedValue({ ok: true, message: 'Your plan stays as it is.' })
    const user = userEvent.setup()
    render(
      <PlanPicker
        subscription={view({
          pendingPlanId: 'starter',
          pendingPlanEffectiveAt: '2026-09-01T00:00:00.000Z',
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /keep my current plan/i }))
    await waitFor(() => expect(cancelPlanDowngrade).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Your plan stays as it is.')).toBeInTheDocument()
  })

  it('renders no banner at all when nothing is scheduled', () => {
    const { container } = render(<PlanPicker subscription={view()} />)
    expect(container.querySelector('.is-committed')).toBeNull()
    expect(screen.queryByText(/Moving to/)).not.toBeInTheDocument()
  })
})

describe('pricing a change before it is charged', () => {
  const proration = {
    kind: 'upgrade' as const,
    fromPlanId: 'starter' as const,
    toPlanId: 'growth' as const,
    effectiveAt: '2026-08-16T12:00:00.000Z',
    immediate: true,
    unusedBasisPoints: 5_000,
    remainderChargePaise: 74_950,
    unusedCreditPaise: 24_950,
    amountDuePaise: 50_000,
    creditsGranted: 1_750,
  }

  it('shows the arithmetic and puts the amount on the button', async () => {
    previewPlanChange.mockResolvedValue({ ok: true, proration, impact: null })
    const user = userEvent.setup()
    render(<PlanPicker subscription={view({ planId: 'starter' })} />)

    await user.click(screen.getByRole('button', { name: /^Growth/ }))

    expect(
      await screen.findByText(/Growth for the rest of this month: ₹749.50\./),
    ).toBeInTheDocument()
    expect(screen.getByText(/Less the ₹249\.50 of Starter/)).toBeInTheDocument()
    expect(screen.getByText(/You pay ₹500 today, then ₹1,499 a month\./)).toBeInTheDocument()
    // "Continue" would leave the customer to guess what pressing it costs.
    expect(
      screen.getByRole('button', { name: 'Pay ₹500 and switch to Growth' }),
    ).toBeInTheDocument()
  })

  it('wears the PROPOSED rung — priced, and nobody has agreed', async () => {
    previewPlanChange.mockResolvedValue({ ok: true, proration, impact: null })
    const user = userEvent.setup()
    const { container } = render(<PlanPicker subscription={view({ planId: 'starter' })} />)
    await user.click(screen.getByRole('button', { name: /^Growth/ }))
    await screen.findByText(/If you make this change/i)
    expect(container.querySelector('.is-proposed')).not.toBeNull()
  })

  it('says it could not count, rather than implying nothing is over the limit', async () => {
    // `impact: null` means the counts failed. "Nothing is over your limit" and "we could not
    // count what you have" are different claims and must not render as the same silence.
    previewPlanChange.mockResolvedValue({ ok: true, proration, impact: null })
    const user = userEvent.setup()
    render(<PlanPicker subscription={view({ planId: 'starter' })} />)
    await user.click(screen.getByRole('button', { name: /^Growth/ }))
    expect(await screen.findByText(/could not count your channels and sites/i)).toBeInTheDocument()
  })

  it('names what is kept when the new plan is smaller, and promises no deletion', async () => {
    previewPlanChange.mockResolvedValue({
      ok: true,
      proration: {
        ...proration,
        kind: 'downgrade',
        immediate: false,
        amountDuePaise: 0,
        creditsGranted: 0,
        remainderChargePaise: 0,
        unusedCreditPaise: 0,
      },
      impact: {
        toPlanId: 'starter',
        effectiveAt: '2026-09-01T00:00:00.000Z',
        over: [{ dimension: 'channels', have: 6, allowed: 4 }],
        nothingIsDeleted: true,
        blocksNewCreates: true,
      },
    })
    const user = userEvent.setup()
    render(<PlanPicker subscription={view()} />)
    await user.click(screen.getByRole('button', { name: /^Starter/ }))

    expect(await screen.findByText(/6 of 4 channels/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing\s+is removed/)).toBeInTheDocument()
    // A downgrade is scheduled, never charged.
    expect(screen.queryByText(/You pay/)).not.toBeInTheDocument()
  })

  it('never renders a price when the preview failed', async () => {
    previewPlanChange.mockResolvedValue({
      ok: false,
      message: 'Sahoda could not read your current plan just now.',
    })
    const user = userEvent.setup()
    render(<PlanPicker subscription={view({ planId: 'starter' })} />)
    await user.click(screen.getByRole('button', { name: /^Growth/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not read your current plan/i)
    expect(alert).toHaveTextContent(/Nothing was charged/)
    expect(screen.queryByRole('button', { name: /Pay ₹/ })).not.toBeInTheDocument()
  })

  it('labels a sandbox order as one, rather than as a completed purchase', async () => {
    previewPlanChange.mockResolvedValue({ ok: true, proration, impact: null })
    startPlanUpgrade.mockResolvedValue({
      ok: true,
      simulated: true,
      mode: 'sandbox',
      sessionId: 'sess_1',
      planId: 'growth',
      amountDuePaise: 50_000,
    })
    const user = userEvent.setup()
    render(<PlanPicker subscription={view({ planId: 'starter' })} />)

    await user.click(screen.getByRole('button', { name: /^Growth/ }))
    await user.click(await screen.findByRole('button', { name: 'Pay ₹500 and switch to Growth' }))

    const status = await screen.findByText(/sandbox order was opened/i)
    expect(status).toHaveTextContent(/Nothing was charged and no credits were added/)
  })
})
