import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { CycleStrip } from './cycle-strip'

/**
 * THE MARKER ON THE SIX-STEP RAIL IS A CLAIM ABOUT THE READER'S WEEK.
 *
 * The rail is the page's hero, and the one thing it says beyond the fixed six
 * names is WHERE THE CYCLE IS. That is read from `loop_cycles.status`, so every
 * way of getting it wrong is a screen telling somebody their week is at a stage
 * it is not:
 *
 *   · marking a stage when no cycle has ever run — an invented week
 *   · marking one for a cycle that FAILED or was CANCELLED — "still working on"
 *     something it stopped doing
 *   · putting the halt on its own stage rather than on Plan, which would make
 *     the rail disagree with the state machine the FSD describes
 *
 * There is no Test stage: nothing here ever ran a draft past an Audience Twin,
 * so the strip no longer claims one does.
 *
 * None of those is visible to a test that only checks the six names render,
 * and the names are the part that cannot change.
 */

function marked(): string | null {
  const node = document.querySelector('[aria-current="step"]')
  return node?.textContent?.match(/Collect|Reflect|Plan|Create|Stage|Report/)?.[0] ?? null
}

describe('where the rail says the cycle is', () => {
  it('marks the stage the stored status names', () => {
    render(<CycleStrip status="creating" />)
    expect(marked()).toBe('Create')
  })

  it('marks NOTHING when no cycle has ever run', () => {
    render(<CycleStrip />)
    expect(marked()).toBeNull()
    // And says so in words rather than leaving the reader to notice an absence.
    expect(screen.getByText(/Not running yet/)).toBeTruthy()
  })

  it('marks nothing for a cycle that failed or was stopped', () => {
    const { unmount } = render(<CycleStrip status="failed" />)
    expect(marked()).toBeNull()
    unmount()
    render(<CycleStrip status="cancelled" />)
    expect(marked()).toBeNull()
  })

  /**
   * The cost halt is the Plan stage finished and waiting for a person. It is not
   * an eighth thing Sahoda does, and giving it a stage of its own would put a
   * step on this rail that the state machine does not have.
   */
  it('draws the cost halt on Plan, not on a stage of its own', () => {
    render(<CycleStrip status="awaiting_cost_approval" />)
    expect(marked()).toBe('Plan')
  })

  it('counts the steps for a reader who cannot see the rail', () => {
    render(<CycleStrip status="staging" />)
    // Position and state both reach a screen reader, not colour alone.
    expect(screen.getByText(/Step 5 of 6, running now/)).toBeTruthy()
    expect(screen.getByText(/Step 1 of 6, done/)).toBeTruthy()
    expect(screen.getByText('Step 6 of 6')).toBeTruthy()
  })

  /**
   * THE MUTATION THIS EXISTS FOR: `index < current` widened to `index <= current`.
   *
   * Six tests passed through that change. It makes the RUNNING node render a
   * tick instead of its number and fills the connector leaving it — which the
   * component's own comment forbids, because a filled connector means "this
   * step finished", never "the next one started". Every test above asks WHICH
   * node is marked; none could tell done from running.
   */
  it('draws the running step as its number, never as a finished tick', () => {
    render(<CycleStrip status="creating" />)
    const node = document.querySelector('[aria-current="step"]')!
    // Create is step 4. The node shows the numeral; a tick would mean finished.
    expect(node.textContent).toMatch(/\b4\b/)
    expect(node.querySelector('svg.lucide-check')).toBeNull()
  })

  it('marks every step BEFORE the running one as finished, and none after', () => {
    render(<CycleStrip status="creating" />)
    const steps = [...document.querySelectorAll('li')]
    const done = steps.filter((li) => li.querySelector('svg.lucide-check'))
    // Collect, Reflect, Plan — three, not four. Four would mean Create counted
    // itself as finished while it is still running.
    expect(done).toHaveLength(3)
  })

  /**
   * A CYCLE THAT FAILED IS NOT A CYCLE THAT NEVER STARTED.
   * Both give a stage of -1, and the header used to say "Not running yet" over
   * a summary reading "This week did not run".
   */
  it('separates a week that stopped from a week that never began', () => {
    const { unmount } = render(<CycleStrip status="failed" />)
    expect(screen.getByText('This week stopped')).toBeTruthy()
    expect(screen.queryByText(/Not running yet/)).toBeNull()
    unmount()
    render(<CycleStrip />)
    expect(screen.getByText('Not running yet')).toBeTruthy()
  })

  /**
   * THE RAIL IS TWO HALVES PER STEP, AND THEY DO NOT MEAN THE SAME THING.
   *
   * The half ENTERING a step is travelled once that step is reached; the half
   * LEAVING it only once the step is finished. Collapse the two and the line
   * runs out of the step that is still working, which draws the cycle a stage
   * further along than it is — the same lie the tick-instead-of-a-number
   * mutation tells, in the other direction.
   *
   * Counted rather than located: at step 4 of 6 the travelled halves are the
   * three entering steps 2, 3 and 4, plus the three leaving steps 1, 2 and 3.
   * Six. Seven means the line left the running step.
   */
  it('does not run the line out of the step that is still working', () => {
    const { container } = render(<CycleStrip status="creating" />)
    const rails = [...container.querySelectorAll('span.h-px')]
    // Twelve halves: two per step, the outer two drawn transparent so every
    // column measures the same.
    expect(rails).toHaveLength(12)
    const travelled = rails.filter((r) => r.className.includes('bg-accent'))
    expect(travelled).toHaveLength(6)
  })

  /**
   * THE TWO OUTER HALVES STAY IN FLOW.
   *
   * The rail either side of a step is what makes all seven columns one width.
   * Drop the first step's left half and the last step's right half — the
   * obvious tidy-up, since neither is ever visible — and those two columns
   * become narrower than the other five, which is the one thing the reference
   * layout is entirely about.
   *
   * WHAT THIS CANNOT SEE: whether they actually occupy space. jsdom computes no
   * layout, so a width regression from any other cause is invisible here; this
   * pins the mechanism (drawn, not removed) rather than the pixels. The pixels
   * were checked by rendering at 1440, 1000 and 420 in Chromium.
   */
  it('draws the two outer halves rather than removing them', () => {
    const { container } = render(<CycleStrip status="creating" />)
    const rails = [...container.querySelectorAll('span.h-px')]
    expect(rails).toHaveLength(12)
    // Transparent, never `hidden`: a removed box is a narrower column.
    expect(rails.filter((r) => r.className.split(/\s+/).includes('hidden'))).toHaveLength(0)
    expect(rails.filter((r) => r.className.includes('bg-transparent'))).toHaveLength(2)
  })

  it('leaves the whole rail untravelled when no cycle has run', () => {
    const { container } = render(<CycleStrip />)
    const rails = [...container.querySelectorAll('span.h-px')]
    expect(rails.filter((r) => r.className.includes('bg-accent'))).toHaveLength(0)
  })

  it('still names all six steps in order, whatever the status', () => {
    render(<CycleStrip status="reported" />)
    const names = ['Collect', 'Reflect', 'Plan', 'Create', 'Stage', 'Report']
    for (const name of names) expect(screen.getByText(name)).toBeTruthy()
  })
})
