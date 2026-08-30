import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE MOUNT, BECAUSE THE WIRING IS WHERE THIS ONE BROKE.
 *
 * `going-out.test.tsx` proves the panel is present in every state it is HANDED.
 * That says nothing about whether the page hands it those states, and the first
 * version of this mount returned null for an unreadable read — the quieter form
 * of exactly the lie the panel was written to avoid. A reader whose read had
 * failed would have seen a screen identical to one where autopilot has nothing
 * pending.
 *
 * Two green guards either side of a wiring decision, and nothing on the wiring:
 * the same shape as the three seams this branch already closed. So the page is
 * rendered here, with its reads faked, and the branch is asserted.
 */

const loop = vi.hoisted(() => ({ readLoop: vi.fn() }))
const going = vi.hoisted(() => ({ readGoingOut: vi.fn() }))

vi.mock('@/lib/loop/read', () => loop)
vi.mock('@/lib/loop/autopilot/going-out', () => going)
vi.mock('@/app/actions/loop-controls', () => ({
  killLoop: vi.fn(),
  resolveLearning: vi.fn(),
  setAutonomy: vi.fn(),
  startCycle: vi.fn(),
  pauseLoop: vi.fn(),
  setWeeklyBudget: vi.fn(),
  approveCost: vi.fn(),
  cancelCycle: vi.fn(),
}))
vi.mock('@/app/actions/autopilot-stop', () => ({ stopAutopilotPost: vi.fn() }))

const { default: LoopPage } = await import('./page')

const snapshot = {
  enabled: true,
  paused: false,
  weeklyBudgetCredits: 150,
  availableCredits: 500,
  brain: { resolved: true, confirmed: 15, total: 15 },
  dial: new Map(),
  connected: ['x'],
  lapsed: [],
  briefs: [],
  learnings: [],
  cycle: null,
  planningWeek: { isoYear: 2026, isoWeek: 35 },
  openCycle: null,
}

beforeEach(() => {
  loop.readLoop.mockResolvedValue({ status: 'ok', snapshot })
  going.readGoingOut.mockResolvedValue({ status: 'unreadable' })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('the going-out section is mounted, in every state the read can answer', () => {
  it('renders it saying Sahoda could not look when the read FAILED', async () => {
    render(await LoopPage())

    // The defect this file exists for. Not absent, and not "nothing waiting".
    expect(screen.getByRole('heading', { name: /set to go out/i })).toBeInTheDocument()
    expect(screen.getByText(/could not check/i)).toBeInTheDocument()
    expect(screen.queryByText(/nothing is waiting/i)).not.toBeInTheDocument()
  })

  it('renders the armed-and-idle sentence when the read succeeded with nothing pending', async () => {
    going.readGoingOut.mockResolvedValue({
      status: 'ready',
      view: {
        state: 'armed-idle',
        sentence: 'Nothing is waiting to go out right now.',
        remedy: null,
        count: 0,
      },
      waiting: [],
    })

    render(await LoopPage())

    expect(screen.getByText(/nothing is waiting/i)).toBeInTheDocument()
    expect(screen.queryByText(/could not check/i)).not.toBeInTheDocument()
  })

  it('lists the waiting posts when there are some', async () => {
    going.readGoingOut.mockResolvedValue({
      status: 'ready',
      view: {
        state: 'waiting',
        sentence: 'One post is set to go out.',
        remedy: 'Stop it before Sahoda hands it over.',
        count: 1,
      },
      waiting: [{ postId: 'p1', variantId: 'v1', channel: 'x', postTitle: 'Friday offer' }],
    })

    render(await LoopPage())

    expect(screen.getByText('Friday offer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop this one/i })).toBeInTheDocument()
  })

  it('omits it only when there is no workspace, where the page says that itself', async () => {
    going.readGoingOut.mockResolvedValue({ status: 'no-workspace' })

    render(await LoopPage())

    expect(screen.queryByRole('heading', { name: /set to go out/i })).not.toBeInTheDocument()
  })

  it('does not take the page down when the going-out read failed', async () => {
    // The Loop's own content must still be there. A section that cannot be read
    // is a section, not an outage.
    render(await LoopPage())
    expect(screen.getByRole('heading', { name: /^the loop$/i })).toBeInTheDocument()
  })
})
