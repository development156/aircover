import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/app/actions/loop-dial', () => ({
  setLoopSettings: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/app/actions/loop-cycle', () => ({
  runCycleToPreview: vi.fn(async () => ({ ok: true })),
}))

import { LoopControls } from './controls'

/**
 * THE REASON THE LOOP WILL NOT PLAN, ON THE SCREEN, WITH SOMEWHERE TO GO.
 *
 * ── WHAT THIS REPLACED ───────────────────────────────────────────────────────
 * A hand-written ladder in this component that knew two of the six causes and
 * phrased both differently from the cron's words for the same state. The other
 * four — never enabled, credits, a lapsed connection, a week already planned —
 * produced a disabled button and no sentence at all.
 *
 * ── WHY A RENDERED TREE AND NOT A UNIT TEST OF explain() ─────────────────────
 * `verdict.test.ts` already pins every sentence. What only a DOM can settle is
 * whether the sentence REACHES a reader and whether the remedy beside it is a
 * link somebody can follow. A correct string held by a component that never
 * renders it is the failure this file exists to catch.
 */

const BASE = {
  paused: false,
  weeklyBudgetCredits: 150,
  cycleCost: 20,
  hasChannels: true,
  cycleRunning: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoopControls — the refusal notice', () => {
  it('renders the sentence and a link that can fix it', () => {
    render(
      <LoopControls
        {...BASE}
        hasChannels={false}
        refusal={{
          sentence: 'Connect a channel first — Sahoda has nowhere to plan for.',
          remedy: { href: '/connections', label: 'Connect a channel' },
        }}
      />,
    )

    expect(screen.getByText(/Connect a channel first/, { exact: false })).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Connect a channel' })
    expect(link).toHaveAttribute('href', '/connections')
  })

  /**
   * A reason with nowhere useful to send someone must still SAY the reason.
   * Rendering nothing because there is no link would lose the sentence, which
   * is the half that carries the information.
   */
  it('renders the sentence when there is no remedy to offer', () => {
    render(
      <LoopControls
        {...BASE}
        refusal={{ sentence: 'Sahoda already planned week 35 of 2026.', remedy: null }}
      />,
    )
    expect(screen.getByText(/already planned week 35/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  /**
   * An eligible workspace is told where the cycle STOPS, which is the fear a
   * button called "Plan my week" creates on a product that can also write it.
   * It must not be shown a refusal it is not in.
   */
  it('says where the cycle stops when there is nothing to refuse', () => {
    render(<LoopControls {...BASE} refusal={null} />)
    expect(
      screen.getByText('Stops at a cost preview. Nothing is written until you approve it.'),
    ).toBeInTheDocument()
  })

  /**
   * The remedy is a real anchor even when it points into this page. The
   * `already_planned` sentence says "open it", and the thing to open is the
   * cycle section below — a span styled like a link would make that a lie.
   */
  it('renders an in-page remedy as a followable link', () => {
    render(
      <LoopControls
        {...BASE}
        paused
        refusal={{
          sentence: 'The Loop is paused — resume it and Sahoda will plan your next week.',
          remedy: { href: '#loop-controls', label: 'Turn the Loop on' },
        }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Turn the Loop on' })).toHaveAttribute(
      'href',
      '#loop-controls',
    )
  })
})

/**
 * THE SPEND BAR IS A FIGURE ABOUT THE CUSTOMER'S OWN MONEY.
 *
 * Two ways to get it wrong, and neither is visible to a test that checks the
 * panel renders: drawing a bar when NO budget is set — a limit the customer
 * never chose, shown as if they had — and letting a bar that has gone past its
 * budget draw past its track, which reads as a different quantity from the one
 * the numbers beside it state.
 */
describe('LoopControls — what the run facts may claim', () => {
  it('shows the spend against the budget when one is set', () => {
    render(
      <LoopControls
        {...BASE}
        run={{ spentCredits: 85, budgetCredits: 150, startedAt: null, duration: null }}
      />,
    )
    const bar = screen.getByRole('progressbar', { name: /Credits used/ })
    expect(bar).toHaveAttribute('aria-valuenow', '85')
    expect(bar).toHaveAttribute('aria-valuemax', '150')
    expect(screen.getByText(/of 150 credits/)).toBeTruthy()
  })

  it('draws NO bar when no budget was set, and still reports the spend', () => {
    render(
      <LoopControls
        {...BASE}
        run={{ spentCredits: 85, budgetCredits: null, startedAt: null, duration: null }}
      />,
    )
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText(/Spent this cycle/)).toBeTruthy()
  })

  it('draws NO bar for a budget of ZERO, which is a choice and not a scale', () => {
    // ── A REAL STORED VALUE THAT IS NOT A PROPORTION ────────────────────────
    // The gate was `budgetCredits !== null`, so a budget of 0 rendered a bar
    // with `aria-valuemax=0` under `aria-valuenow=85` and the sentence "Used 85
    // of 0 credits" — while the fill drew EMPTY, because `share` divides by the
    // budget. Every part of that is wrong in a different way, and `CreditsCard`
    // beside it already guarded `budget > 0`.
    render(
      <LoopControls
        {...BASE}
        run={{ spentCredits: 85, budgetCredits: 0, startedAt: null, duration: null }}
      />,
    )
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/of 0 credits/)).toBeNull()
    // The spend still has to be reported. Removing the bar must not remove the fact.
    expect(screen.getByText(/Spent this cycle/)).toBeTruthy()
    expect(screen.getByText('85')).toBeTruthy()
  })

  it('keeps an overspent bar inside its track while the figures still say so', () => {
    const { container } = render(
      <LoopControls
        {...BASE}
        run={{ spentCredits: 200, budgetCredits: 150, startedAt: null, duration: null }}
      />,
    )
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLElement
    expect(fill.style.width).toBe('100%')
    // The bar is capped; the sentence is not.
    expect(screen.getByText(/of 150 credits/)).toBeTruthy()
    expect(screen.getByText('200')).toBeTruthy()
  })

  it('says nothing about a cycle when there is no cycle to describe', () => {
    render(<LoopControls {...BASE} />)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/Spent this cycle/)).toBeNull()
    expect(screen.queryByText(/This cycle/)).toBeNull()
  })
})

describe('LoopControls — the budget field saves on blur, so blur must know what it is saving', () => {
  /**
   * `Number('')` is 0. Clearing the field to retype it and tabbing away wrote a
   * budget of zero, silently, and a reload showed "0" (MEASURED 2026-09-06).
   */
  it('writes nothing for an emptied field and puts the saved figure back', async () => {
    const { setLoopSettings } = await import('@/app/actions/loop-dial')
    render(<LoopControls {...BASE} />)
    const input = screen.getByLabelText('Weekly budget in credits') as HTMLInputElement

    await userEvent.clear(input)
    await userEvent.tab()

    expect(setLoopSettings).not.toHaveBeenCalled()
    expect(input.value).toBe('150')
  })

  it('writes nothing when the figure did not change', async () => {
    const { setLoopSettings } = await import('@/app/actions/loop-dial')
    render(<LoopControls {...BASE} />)

    await userEvent.click(screen.getByLabelText('Weekly budget in credits'))
    await userEvent.tab()

    expect(setLoopSettings).not.toHaveBeenCalled()
  })

  it('saves a changed figure and says so', async () => {
    const { setLoopSettings } = await import('@/app/actions/loop-dial')
    render(<LoopControls {...BASE} />)
    const input = screen.getByLabelText('Weekly budget in credits')

    await userEvent.clear(input)
    await userEvent.type(input, '120')
    await userEvent.tab()

    await waitFor(() => expect(setLoopSettings).toHaveBeenCalledWith({ weeklyBudgetCredits: 120 }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved.'))
  })
})
