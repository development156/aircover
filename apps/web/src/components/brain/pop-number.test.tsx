import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { PopNumber } from './pop-number'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('PopNumber', () => {
  test('shows the new figure at once and lifts for a beat, then rests', () => {
    const { rerender } = render(<PopNumber value={2} />)
    expect(screen.getByText('2')).not.toHaveClass('num-pop')

    rerender(<PopNumber value={3} />)
    expect(screen.getByText('3')).toHaveClass('num-pop')

    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(screen.getByText('3')).not.toHaveClass('num-pop')
  })

  test('a first render never pops', () => {
    render(<PopNumber value={7} />)
    expect(screen.getByText('7')).not.toHaveClass('num-pop')
  })
})
