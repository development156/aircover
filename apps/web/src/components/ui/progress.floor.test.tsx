import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'

import { Progress } from './progress'

/**
 * A FILL NARROWER THAN IT IS TALL IS A DOT, NOT A BAR.
 *
 * MEASURED in Chromium: at 26 of 3,000 characters the composer's LinkedIn meter
 * rendered its fill 7.5px wide against a 7px height with a 4px radius, which
 * closes into a circle. It was reported as a stray orange dot, and it was one.
 *
 * ── WHAT WOULD MAKE THIS TEST WORTHLESS ──────────────────────────────────────
 * Only asserting the floor. A floor applied unconditionally would paint a stub
 * on a post nobody has typed into, claiming progress that has not happened. So
 * the zero case is asserted first and carries equal weight.
 */
describe('the meter fill', () => {
  const fillOf = (value: number) => {
    const { container } = render(<Progress value={value} label="test" />)
    return (container.querySelector('[role="progressbar"]')?.firstElementChild as HTMLElement).style
  }

  test('stays at nothing when nothing has been written', () => {
    // The counterweight. A floor that ignores zero invents progress.
    const s = fillOf(0)
    expect(s.width).toBe('0%')
    expect(s.minWidth).toBe('0px')
  })

  test('never renders narrower than it is tall once there IS something', () => {
    // 26 of 3,000 is 0.87%, which measured 7.5px on an 868px track.
    const s = fillOf(0.87)
    expect(s.width).toBe('0.87%')
    expect(s.minWidth).toBe('14px')
  })

  test('leaves an ordinary fill alone', () => {
    // The floor must not become the width. At 9% on the same track the fill is
    // 81px and reads correctly already.
    expect(fillOf(9).width).toBe('9%')
  })

  test('still clamps out of range, which the floor must not disturb', () => {
    expect(fillOf(140).width).toBe('100%')
    expect(fillOf(-5).width).toBe('0%')
    expect(fillOf(-5).minWidth).toBe('0px')
  })
})
