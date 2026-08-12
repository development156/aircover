import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { GenerateSiteState } from '@/lib/sites/state'

import { GenerateSitePanel } from './generate-site-panel'

const state = vi.hoisted(() => ({
  result: {
    ok: true,
    siteId: 's1',
    slug: 'x-abc123',
    pages: 1,
    dropped: 0,
    balanceAfter: 400,
    creditsCharged: 100,
  } as unknown as GenerateSiteState,
  calls: [] as Array<{ name: unknown; goal: unknown }>,
}))

vi.mock('@/app/actions/site-generate', () => ({
  generateSite: (name: unknown, goal: unknown) => {
    state.calls.push({ name, goal })
    return Promise.resolve(state.result)
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  state.result = {
    ok: true,
    siteId: 's1',
    slug: 'x-abc123',
    pages: 1,
    dropped: 0,
    balanceAfter: 400,
    creditsCharged: 100,
  }
  state.calls = []
})

describe('GenerateSitePanel', () => {
  test('the cost is on the button BEFORE the click, and a nameless site cannot spend', () => {
    render(<GenerateSitePanel limitNotice={null} />)

    const button = screen.getByRole('button', { name: /generate site · 100 credits/i })
    expect(button).toBeDisabled()
    expect(state.calls).toHaveLength(0)
  })

  test('one click sends name and goal', async () => {
    render(<GenerateSitePanel limitNotice={null} />)

    await userEvent.type(screen.getByLabelText(/site name/i), 'Sharma Dental')
    await userEvent.type(screen.getByLabelText(/goal/i), 'More bookings')
    await userEvent.click(screen.getByRole('button', { name: /generate site/i }))

    expect(state.calls).toEqual([{ name: 'Sharma Dental', goal: 'More bookings' }])
  })

  test('dropped parts are reported, never hidden', async () => {
    state.result = {
      ok: true,
      siteId: 's1',
      slug: 'x-abc123',
      pages: 1,
      dropped: 2,
      balanceAfter: 400,
      creditsCharged: 100,
    }

    render(<GenerateSitePanel limitNotice={null} />)
    await userEvent.type(screen.getByLabelText(/site name/i), 'A')
    await userEvent.click(screen.getByRole('button', { name: /generate site/i }))

    expect(await screen.findByText(/parts of the draft were unusable/i)).toBeInTheDocument()
  })

  test('insufficient credits shows the exact shortfall and the not-charged claim', async () => {
    state.result = { ok: false, insufficient: true, required: 100, available: 7 }

    render(<GenerateSitePanel limitNotice={null} />)
    await userEvent.type(screen.getByLabelText(/site name/i), 'A')
    await userEvent.click(screen.getByRole('button', { name: /generate site/i }))

    expect(
      await screen.findByText(/nothing was generated and you were not charged/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /top up your wallet/i })).toHaveAttribute(
      'href',
      '/wallet',
    )
  })

  test('an action failure renders the message verbatim — the action owns the charge claim', async () => {
    state.result = {
      ok: false,
      insufficient: false,
      message: 'The site could not be saved. You were not charged — try again.',
    }

    render(<GenerateSitePanel limitNotice={null} />)
    await userEvent.type(screen.getByLabelText(/site name/i), 'A')
    await userEvent.click(screen.getByRole('button', { name: /generate site/i }))

    expect(
      await screen.findByText('The site could not be saved. You were not charged — try again.'),
    ).toBeInTheDocument()
  })

  test('the plan limit is shown BEFORE the click and the button cannot spend', () => {
    render(
      <GenerateSitePanel limitNotice="Sites are on Starter and above — your Free plan doesn't include one." />,
    )

    expect(
      screen.getByText(/sites are on starter and above — your free plan doesn't include one\./i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate site/i })).toBeDisabled()
  })

  test('a blocked panel does not call the action even with a name filled in', async () => {
    render(
      <GenerateSitePanel limitNotice="Your Starter plan includes 1 site and you're using 1." />,
    )

    await userEvent.type(screen.getByLabelText(/site name/i), 'Sharma Dental')
    await userEvent.click(screen.getByRole('button', { name: /generate site/i }))

    expect(state.calls).toHaveLength(0)
  })

  test('carries the seeded tour anchor', () => {
    const { container } = render(<GenerateSitePanel limitNotice={null} />)

    expect(container.querySelector('[data-guide="sites.generate"]')).not.toBeNull()
  })
})
