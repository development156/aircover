import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/app/actions/loop-dial', () => ({ setLoopSettings: vi.fn(async () => ({ ok: true })) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { LoopStatus } from './loop-status'
import { LOOP_SCHEDULE_SENTENCE } from '@/lib/loop/schedule'

const WEEKDAY = LOOP_SCHEDULE_SENTENCE.replace(/^Every /, '')

/**
 * "NEVER TURNED ON" IS NOT "PAUSED", AND THE PILL IS WHERE THAT GETS CONFUSED.
 *
 * `paused` reads false for a workspace nobody has ever enabled — the same value
 * as "switched on and running" — which is why `enabled` is stored separately.
 * A pill that reads those two facts as one tells a customer who has never opened
 * the Loop that it is paused, implying a schedule was taken away from them, and
 * it tells a customer whose Loop is genuinely off that it is on.
 *
 * The state also has to reach somebody who cannot see the colour, so each of the
 * three is asserted as WORDS.
 */
describe('the status pill', () => {
  /**
   * THE PAIR THAT ACTUALLY OCCURS, AND THE ONE THIS FILE USED TO TEST INSTEAD.
   *
   * `readLoop` sets `enabled` from whether a `loop_settings` ROW EXISTS and
   * `paused` from `Boolean(row?.paused)`. No row therefore means enabled:false
   * AND paused:FALSE — the same pair as a live, idle Loop. `enabled:false` with
   * `paused:true` cannot be produced at all.
   *
   * An earlier version of this test asserted that impossible pair, so it was
   * green while the label read "On, waiting for Sunday" to every workspace that
   * had never opened the Loop — which, measured on 2026-08-28, is most of them.
   */
  it('says the Loop was never turned on — for the pair a missing row produces', () => {
    render(<LoopStatus enabled={false} paused={false} running={false} />)
    expect(screen.getByText('Not turned on')).toBeTruthy()
    expect(screen.queryByText(/waiting for/i)).toBeNull()
    expect(screen.queryByText('Paused')).toBeNull()
  })

  it('never claims a Loop nobody enabled is running', () => {
    render(<LoopStatus enabled={false} paused={false} running />)
    expect(screen.getByText('Not turned on')).toBeTruthy()
    expect(screen.queryByText('Running now')).toBeNull()
  })

  it('says paused when a Loop that WAS on has been paused', () => {
    render(<LoopStatus enabled paused running={false} />)
    expect(screen.getByText('Paused')).toBeTruthy()
  })

  it('separates a cycle working right now from one waiting for its day', () => {
    const { unmount } = render(<LoopStatus enabled paused={false} running />)
    expect(screen.getByText('Running now')).toBeTruthy()
    unmount()
    render(<LoopStatus enabled paused={false} running={false} />)
    // The day is not typed here: it comes from the deployment's own cron.
    expect(screen.getByText(new RegExp(`waiting for ${WEEKDAY}`, 'i'))).toBeTruthy()
  })

  /**
   * The button says what pressing it DOES, not what the state is. "Pause" on a
   * paused Loop is the ambiguity this asserts against.
   */
  it('offers the action that changes the state, never the state itself', () => {
    const { unmount } = render(<LoopStatus enabled paused running={false} />)
    expect(screen.getByRole('button', { name: /Turn the Loop on/ })).toBeTruthy()
    unmount()
    render(<LoopStatus enabled paused={false} running={false} />)
    expect(screen.getByRole('button', { name: /Pause the Loop/ })).toBeTruthy()
  })
})
