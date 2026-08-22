import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { AUTONOMY_LEVELS } from '@sahoda/shared'

vi.mock('@/app/actions/loop-dial', () => ({
  setChannelAutonomy: vi.fn(async () => ({ ok: true })),
  setLoopSettings: vi.fn(async () => ({ ok: true })),
}))

import { AutonomyDial } from './autonomy-dial'

/**
 * THE DIAL, RENDERED — and the one invariant that only a rendered tree can check.
 *
 * "L3 is visible, labelled, and unselectable" is three claims about a DOM, and
 * the first two are satisfied by any number of wrong implementations. The third
 * is the one that matters and the one a source grep cannot settle: `<button
 * disabled>` and a `<div>` look identical in a screenshot and are completely
 * different to a screen reader — the first is announced as a button, offered,
 * taken, and does nothing, which reads as a broken app rather than an unbuilt
 * feature.
 */

beforeEach(() => {
  vi.clearAllMocks()
})

function open(): HTMLElement {
  // The ladder lives in a <details>; jsdom renders its contents regardless, but
  // opening it is what a reader does.
  const summary = screen.getByText('What each level means')
  const details = summary.closest('details')
  if (details) details.open = true
  return details ?? document.body
}

describe('the Autonomy Dial', () => {
  it('offers exactly the three storable levels per connected channel', () => {
    const { container } = render(
      <AutonomyDial connected={['instagram', 'linkedin']} chosen={{}} defaultLevel={1} />,
    )
    // `fieldset`, not `getAllByRole('group')` — <details> ALSO maps to role
    // group in HTML-AAM, so the role query returned the ladder as a third
    // "channel". The pickers are the fieldsets and nothing else is.
    const pickers = [...container.querySelectorAll('fieldset')]
    expect(pickers).toHaveLength(2)
    for (const picker of pickers) {
      const radios = within(picker).getAllByRole('radio')
      // Three, not four. The fourth rung is not a control anywhere in this tree.
      expect(radios).toHaveLength(3)
    }
  })

  it('SHOWS L3 and its reason', () => {
    render(<AutonomyDial connected={['instagram']} chosen={{}} defaultLevel={1} />)
    const ladder = open()
    expect(within(ladder).getByText(/L3/)).toBeTruthy()
    expect(within(ladder).getByText(/Autopilot/)).toBeTruthy()
    // Labelled as unavailable, and the reason is stated rather than implied.
    expect(within(ladder).getByText(/not available/i)).toBeTruthy()
    const l3 = AUTONOMY_LEVELS.find((l) => l.code === 'L3')!
    expect(within(ladder).getByText(new RegExp(l3.needs.slice(0, 40)))).toBeTruthy()
  })

  it('renders L3 as TEXT — not a button, not disabled, not aria-disabled', () => {
    const { container } = render(
      <AutonomyDial connected={['instagram']} chosen={{}} defaultLevel={1} />,
    )
    open()
    const autopilot = screen.getByText(/Autopilot/).closest('li')
    expect(autopilot).toBeTruthy()
    // Not a control of any kind.
    expect(autopilot!.querySelector('button')).toBeNull()
    expect(autopilot!.querySelector('input')).toBeNull()
    expect(autopilot!.querySelector('[role="button"]')).toBeNull()
    // And not pretending to be a momentarily-unavailable one either —
    // aria-disabled describes a control that EXISTS, which would be untrue here.
    expect(autopilot!.querySelector('[aria-disabled]')).toBeNull()
    expect(autopilot!.hasAttribute('aria-disabled')).toBe(false)

    // No level 3 radio exists anywhere in the whole tree, under any name.
    const radios = [...container.querySelectorAll('input[type="radio"]')]
    expect(radios).toHaveLength(3)
    for (const r of radios) {
      expect(r.closest('label')?.textContent).not.toMatch(/Autopilot/)
    }
  })

  it('says a channel is UNSET rather than claiming a level nobody picked', () => {
    render(<AutonomyDial connected={['instagram']} chosen={{}} defaultLevel={1} />)
    // "Not set" is a different claim from "L1", and only one of them is true of a
    // workspace that has never opened this screen.
    expect(screen.getByText(/Not set/i)).toBeTruthy()
    const checked = [...document.querySelectorAll('input[type="radio"]')].filter(
      (r) => (r as HTMLInputElement).checked,
    )
    expect(checked).toHaveLength(0)
  })

  it('marks the level a person DID pick', () => {
    render(<AutonomyDial connected={['instagram']} chosen={{ instagram: 2 }} defaultLevel={1} />)
    expect(screen.queryByText(/Not set/i)).toBeNull()
    const checked = [...document.querySelectorAll('input[type="radio"]')].filter(
      (r) => (r as HTMLInputElement).checked,
    )
    expect(checked).toHaveLength(1)
    expect(checked[0]!.closest('label')?.textContent).toMatch(/Approve to publish/)
  })

  it('says so plainly when there is no channel to set a level for', () => {
    render(<AutonomyDial connected={[]} chosen={{}} defaultLevel={1} />)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.getByText(/Connect a channel/i)).toBeTruthy()
  })

  /**
   * A workspace whose only connection has EXPIRED has no dial and has also not
   * failed to connect anything. Production held four such rows on 2026-08-22.
   * Telling that person to "connect a channel" is the screen asserting
   * something about their account that is not true, and the remedy it points at
   * is the wrong one — they need to reconnect, not connect.
   */
  it('tells someone whose connection lapsed to reconnect, not to connect', () => {
    render(<AutonomyDial connected={[]} lapsed={['instagram']} chosen={{}} defaultLevel={1} />)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.getByText(/lapsed/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Reconnect/i }).getAttribute('href')).toBe(
      '/connections',
    )
    // The claim it must NOT make.
    expect(screen.queryByText(/Connect a channel and its dial appears/i)).toBeNull()
  })

  it('offers the dial when a channel is live, even alongside a lapsed one', () => {
    render(<AutonomyDial connected={['instagram']} lapsed={['x']} chosen={{}} defaultLevel={1} />)
    expect(screen.queryAllByRole('radio').length).toBeGreaterThan(0)
    expect(screen.queryByText(/lapsed/i)).toBeNull()
  })
})
