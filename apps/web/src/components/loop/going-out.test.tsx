import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GoingOut } from './going-out'
import { GOING_OUT_UNREADABLE, goingOutView } from '@/lib/loop/autopilot/going-out-copy'

/**
 * The panel, and the two ways a screen like this normally lies.
 *
 * FIRST, by disappearing. Hiding the section when the list is empty leaves a
 * reader who has never armed a channel with no way to learn the setting exists,
 * and makes a failed read look exactly like an empty queue. The panel renders
 * in every state and says which one it is in.
 *
 * SECOND, by assuming the stop worked. `stopAutopilotPost` answers three ways,
 * and "stopped" printed over a post that already went out is the false claim
 * this whole module exists to avoid.
 */

const action = vi.hoisted(() => ({ stopAutopilotPost: vi.fn() }))
vi.mock('@/app/actions/autopilot-stop', () => action)

const rows = [
  { postId: 'p1', variantId: 'v1', channel: 'x' as const, postTitle: 'Friday offer' },
  { postId: 'p2', variantId: 'v2', channel: 'gbp' as const, postTitle: 'New opening hours' },
]

beforeEach(() => {
  action.stopAutopilotPost.mockResolvedValue({ ok: true, outcome: 'stopped' })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('the panel is present in every state', () => {
  it('says the setup is the reason when no channel is armed, and offers no stop button', () => {
    render(<GoingOut view={goingOutView({ armed: [], waiting: [] })} waiting={[]} />)

    expect(screen.getByRole('heading', { name: /set to go out/i })).toBeInTheDocument()
    expect(screen.getByText(/on its own/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says nothing is waiting when a channel IS armed, which is a different claim', () => {
    render(<GoingOut view={goingOutView({ armed: ['x'], waiting: [] })} waiting={[]} />)

    expect(screen.getByText(/nothing is waiting/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lists every waiting post with its channel, and a stop for each', () => {
    render(<GoingOut view={goingOutView({ armed: ['x'], waiting: rows })} waiting={rows} />)

    expect(screen.getByText('Friday offer')).toBeInTheDocument()
    expect(screen.getByText('New opening hours')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /stop this one/i })).toHaveLength(2)
  })
})

describe('stopping one post', () => {
  it('stops only the row that was pressed', async () => {
    render(<GoingOut view={goingOutView({ armed: ['x'], waiting: rows })} waiting={rows} />)

    await userEvent.click(screen.getAllByRole('button', { name: /stop this one/i })[0]!)

    expect(action.stopAutopilotPost).toHaveBeenCalledTimes(1)
    expect(action.stopAutopilotPost).toHaveBeenCalledWith('p1', 'v1')
    // The other row is untouched and still stoppable.
    expect(screen.getAllByRole('button', { name: /stop this one/i })).toHaveLength(1)
  })

  it('claims the post did not go out ONLY when the action said stopped', async () => {
    render(
      <GoingOut view={goingOutView({ armed: ['x'], waiting: [rows[0]!] })} waiting={[rows[0]!]} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /stop this one/i }))

    expect(await screen.findByText(/nothing went out/i)).toBeInTheDocument()
  })

  it('never says stopped when the post had already gone', async () => {
    action.stopAutopilotPost.mockResolvedValue({ ok: true, outcome: 'already' })
    render(
      <GoingOut view={goingOutView({ armed: ['x'], waiting: [rows[0]!] })} waiting={[rows[0]!]} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /stop this one/i }))

    const settled = await screen.findByText(/too late/i)
    expect(settled).toBeInTheDocument()
    expect(screen.queryByText(/nothing went out/i)).not.toBeInTheDocument()
  })

  it('treats a missing outcome as "already", never as a success', async () => {
    // A response that forgot to say which is not evidence the post was caught.
    action.stopAutopilotPost.mockResolvedValue({ ok: true })
    render(
      <GoingOut view={goingOutView({ armed: ['x'], waiting: [rows[0]!] })} waiting={[rows[0]!]} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /stop this one/i }))

    expect(await screen.findByText(/too late/i)).toBeInTheDocument()
  })

  it('reports a failure without claiming a charge, and leaves the row stoppable', async () => {
    action.stopAutopilotPost.mockResolvedValue({ ok: false, message: 'Sahoda could not reach it.' })
    render(
      <GoingOut view={goingOutView({ armed: ['x'], waiting: [rows[0]!] })} waiting={[rows[0]!]} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /stop this one/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not reach it/i)
    expect(alert).toHaveTextContent(/nothing was charged/i)
    expect(screen.getByRole('button', { name: /stop this one/i })).toBeInTheDocument()
  })
})

describe('the read that could not answer', () => {
  it('still renders the panel, saying Sahoda could not look', () => {
    // The first version of the Loop page mount returned null here, which is the
    // quieter form of the same lie: a reader gets a screen identical to one
    // where autopilot has nothing pending. Caught by turning this file's own
    // "present in every state" rule on the page.
    render(<GoingOut view={GOING_OUT_UNREADABLE} waiting={[]} />)

    expect(screen.getByRole('heading', { name: /set to go out/i })).toBeInTheDocument()
    expect(screen.getByText(/could not check/i)).toBeInTheDocument()
    expect(screen.queryByText(/nothing is waiting/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
