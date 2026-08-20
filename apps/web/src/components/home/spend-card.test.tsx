import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SpendRead } from '@/lib/home/spend'

import { SpendCard } from './spend-card'

vi.stubGlobal(
  'matchMedia',
  vi.fn().mockImplementation((query: string) => ({
    matches: true, // reduced motion, so CountUp renders its value synchronously
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  })),
)

const base: SpendRead = {
  status: 'empty',
  days: [],
  byAction: [],
  total: 0,
  coveredFrom: null,
  capped: false,
}

describe('the spend total tells the two zeroes apart', () => {
  it('a successful read with no rows shows 0, because that is knowledge', () => {
    // `lib/home/spend.ts:118` returns EMPTY when rows.length === 0 after a read
    // that WORKED. The true answer is zero and we know it, so claiming we never
    // measured would be the honesty rule running backwards.
    render(<SpendCard spend={base} />)
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('a read that threw shows the unreadable mark, never 0', () => {
    render(<SpendCard spend={{ ...base, status: 'unreadable' }} />)
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.getByText(/credits spent in the last 30 days could not be read/i)).toBeTruthy()
  })

  it('says it is empty exactly once', () => {
    const { container } = render(<SpendCard spend={base} />)
    // The defect this card was built to fix: SpendArea and SpendBars each owned
    // an empty state, so a new workspace read two sentences making one claim.
    expect(container.querySelectorAll('[data-testid="card-empty"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-testid="chart-empty"]')).toHaveLength(0)
  })
})
