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
  /**
   * ── THESE THREE WERE RETARGETED, AND HERE IS THE MOVE ──────────────────────
   * They asserted that L3 was NOT a control: three radios per channel, an
   * "unavailable" label, and no input anywhere under Autopilot. Every one of
   * those was true and correct while `AutonomyLevelSchema` stopped at 2.
   *
   * On 2026-08-30 the union opened to 3 and the database trigger became the
   * thing that decides. CLAUDE.md's fifth copy rule says retarget rather than
   * delete, and the claim these protected survives the change — it inverts. It
   * was never "L3 must be absent": it was THE SCREEN MUST NOT OFFER A CONTROL
   * THAT LEADS NOWHERE. A disabled button is a dead end wearing the costume of a
   * control, and so is an enabled one whose refusal is a Postgres error string.
   * So L3 is a real control now, and what makes that honest is that its three
   * refusals are sentences — asserted in `autopilot-refusal-copy.test.ts`.
   */
  it('offers all four levels per connected channel, autopilot included', () => {
    const { container } = render(
      <AutonomyDial connected={['instagram', 'linkedin']} chosen={{}} defaultLevel={1} />,
    )
    // `fieldset`, not `getAllByRole('group')` — <details> ALSO maps to role
    // group in HTML-AAM, so the role query returned the ladder as a third
    // "channel". The pickers are the fieldsets and nothing else is.
    const pickers = [...container.querySelectorAll('fieldset')]
    expect(pickers).toHaveLength(2)
    for (const picker of pickers) {
      // Four, not three. The fourth rung is a control now.
      expect(within(picker).getAllByRole('radio')).toHaveLength(4)
    }
  })

  it('SHOWS L3 and what it needs, without calling it unavailable', () => {
    render(<AutonomyDial connected={['instagram']} chosen={{}} defaultLevel={1} />)
    const ladder = open()
    expect(within(ladder).getByText(/L3/)).toBeTruthy()
    expect(within(ladder).getByText(/Autopilot/)).toBeTruthy()
    // The label that must NOT survive: it stopped being true.
    expect(within(ladder).queryByText(/not available/i)).toBeNull()
    // The preconditions are still stated, because a reader who has not met them
    // should learn that from the ladder rather than from a refusal.
    const l3 = AUTONOMY_LEVELS.find((l) => l.code === 'L3')!
    expect(within(ladder).getByText(new RegExp(l3.needs.slice(0, 40)))).toBeTruthy()
  })

  it('renders L3 as a REAL control, never a disabled one', () => {
    const { container } = render(
      <AutonomyDial connected={['instagram']} chosen={{}} defaultLevel={1} />,
    )
    const radios = [...container.querySelectorAll('input[type="radio"]')]
    const autopilot = radios.find((r) => /Autopilot/.test(r.closest('label')?.textContent ?? ''))

    expect(autopilot).toBeTruthy()
    // Not disabled and not aria-disabled. A dead end wearing the costume of a
    // control is the defect, whichever direction it points: the refusal belongs
    // to the database, and it answers in sentences.
    expect(autopilot!.hasAttribute('disabled')).toBe(false)
    expect(autopilot!.getAttribute('aria-disabled')).toBeNull()
  })

  it('keeps the unreachable-rung machinery, for the day there is one again', () => {
    // `AUTONOMY_LEVELS` still carries `storable`, and the dial still branches on
    // it. Nothing is unstorable today, so that block renders nothing — which is
    // correct, and different from the branch having been deleted.
    expect(AUTONOMY_LEVELS.every((l) => l.storable)).toBe(true)
  })

  it('shows no lock and no unavailable rung while every level is storable', () => {
    const { container } = render(
      <AutonomyDial connected={['instagram']} chosen={{}} defaultLevel={1} />,
    )
    open()
    expect(screen.queryByText(/not available/i)).toBeNull()
    // Four radios in the one picker: nothing is described-but-unreachable.
    expect([...container.querySelectorAll('input[type="radio"]')]).toHaveLength(4)
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
