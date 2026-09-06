import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { MiniBars, Sparkline } from './sparkline'

describe('Sparkline', () => {
  test('draws one path per measured run and names the series', () => {
    const { container } = render(
      <Sparkline values={[100, 100, 80, null, 60, 60]} label="Credits over 6 days, 100 to 60" />,
    )
    expect(screen.getByRole('img', { name: /credits over 6 days/i })).toBeInTheDocument()
    // Two runs (the null breaks the line), each a fill plus a stroke.
    expect(container.querySelectorAll('path.spark-draw')).toHaveLength(2)
    // The path uses the theme's own accent, never a literal colour.
    expect(container.querySelector('svg')?.getAttribute('style')).toMatch(/var\(--brand\)/)
  })

  test('draws nothing at all when nothing was measured', () => {
    const { container } = render(<Sparkline values={[null, null]} label="Nothing" />)
    expect(container.firstChild).toBeNull()
  })

  test('a flat series is a level line, not a line on the floor', () => {
    const { container } = render(<Sparkline values={[100, 100, 100]} label="Flat" />)
    const d = container.querySelector('path.spark-draw')?.getAttribute('d') ?? ''
    // Every y is the mid-height (14), never the baseline (28) or the top (0).
    const ys = [...d.matchAll(/[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]))
    expect(ys.every((y) => y === 14)).toBe(true)
  })
})

describe('MiniBars', () => {
  test('draws a stub for every bucket and a bar only where there is a count', () => {
    const { container } = render(
      <MiniBars
        values={[0, 2, 0, 1, 0, 0, 0]}
        label="Two on Monday, one on Wednesday"
        emphasis={0}
      />,
    )
    expect(screen.getByRole('img', { name: /two on monday/i })).toBeInTheDocument()
    // 7 stubs + 2 bars
    expect(container.querySelectorAll('rect')).toHaveLength(9)
  })

  test('an all-zero week is seven stubs and no invented scale', () => {
    const { container } = render(
      <MiniBars values={[0, 0, 0, 0, 0, 0, 0]} label="Nothing planned" />,
    )
    expect(container.querySelectorAll('rect')).toHaveLength(7)
  })
})
