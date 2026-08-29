import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

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
