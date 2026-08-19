import { render, screen, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CountUp } from './count-up'

/**
 * The two properties docs/26 §8.1 makes load-bearing:
 *   1. under `prefers-reduced-motion` the number is CORRECT ON FIRST PAINT —
 *      not "eventually correct", and not animated fast;
 *   2. the value it lands on is exactly the value it was given.
 */

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CountUp', () => {
  it('renders the final value immediately under prefers-reduced-motion', () => {
    setReducedMotion(true)
    render(<CountUp value={1234} />)
    // Not `findByText`. The assertion is that it is already right, synchronously.
    expect(screen.getByText('1,234')).toBeTruthy()
  })

  it('lands on exactly the value it was given', async () => {
    setReducedMotion(false)
    render(<CountUp value={4820} />)
    // Drive the rAF loop past its duration rather than waiting on wall time.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900))
    })
    expect(screen.getByText('4,820')).toBeTruthy()
  })

  it('renders the real number on the server render, so no-JS is not a zero', () => {
    setReducedMotion(true)
    const { container } = render(<CountUp value={77} />)
    expect(container.textContent).toBe('77')
  })

  it('carries tabular figures so the digits do not jitter as they count', () => {
    setReducedMotion(true)
    const { container } = render(<CountUp value={99} />)
    expect(container.querySelector('span')?.className).toContain('num')
  })
})
