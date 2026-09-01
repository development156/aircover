import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { RadarScope } from './radar-scope'

/**
 * The radar is decoration, and decoration on this product still may not say
 * something untrue. Two things it could easily claim and must not: that
 * businesses are being watched when none are, and that a scan is running when
 * the collector is not built.
 */

const marks = (container: HTMLElement) => container.querySelectorAll('.radar-mark').length

describe('RadarScope', () => {
  it('draws an empty sky when nobody is being watched', () => {
    // The obvious build scatters eight decorative dots. On a first run that is
    // a radar tracking eight businesses the reader has never named.
    const { container } = render(<RadarScope marks={0} scanning />)
    expect(marks(container)).toBe(0)
    // The face is still drawn, so the panel is a radar rather than a hole.
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(4)
  })

  it('draws exactly one mark per business watched', () => {
    expect(marks(render(<RadarScope marks={1} scanning />).container)).toBe(1)
    expect(marks(render(<RadarScope marks={6} scanning />).container)).toBe(6)
  })

  it('stops adding marks past what the face can hold, rather than overflowing', () => {
    // A workspace watching forty businesses gets a legible radar and the real
    // number in words beside it, not forty dots in a 400px circle.
    expect(marks(render(<RadarScope marks={40} scanning />).container)).toBe(10)
  })

  it('does not animate a scan that is not happening', () => {
    // `collector === 'absent'` means the weekly read is not built. A sweeping
    // radar over that screen is an animation claiming work nobody is doing.
    // `getAttribute('class')`, not `.className`: on an SVG element `className`
    // is an `SVGAnimatedString` at runtime and a plain `string` to TypeScript,
    // so `.baseVal` is a compile error and would read `undefined` on anything
    // that is not SVG. The attribute is the same value in both worlds.
    const still = render(<RadarScope marks={3} scanning={false} />).container
    expect(still.querySelector('.radar-scope')!.getAttribute('class')).not.toContain('is-scanning')

    const live = render(<RadarScope marks={3} scanning />).container
    expect(live.querySelector('.radar-scope')!.getAttribute('class')).toContain('is-scanning')
  })

  it('times each mark to the beam that passes it', () => {
    // The brightening is a negative animation delay equal to the mark's own
    // angle as a fraction of the turn — no timer, no state, and the peak lands
    // on the frame the sweep is over it. A missing or positive delay makes
    // every mark flash together, which reads as a blinking light rather than a
    // detection.
    const { container } = render(<RadarScope marks={4} scanning />)
    const delays = [...container.querySelectorAll('.radar-mark')].map(
      (el) => (el as SVGElement).style.animationDelay,
    )
    expect(delays).toHaveLength(4)
    for (const delay of delays) {
      expect(delay).toMatch(/^-\d/)
    }
    // And they differ, or the marks share a beam moment.
    expect(new Set(delays).size).toBe(4)
  })

  it('is hidden from a screen reader, because the counts beside it say the same thing', () => {
    const { container } = render(<RadarScope marks={3} scanning />)
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
  })
})
