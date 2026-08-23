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
    //
    // ── ASSERTED ON THE COUNT, NOT ON WHICH TREATMENT ─────────────────────
    // This read `card-empty === 1 && chart-empty === 0`, which pinned the
    // COMPONENT rather than the property, and went red when the treatment
    // became `chart-sparse` — a correct change failing a test that named an
    // implementation. The claim was never "it uses CardEmpty"; it is "it says
    // so once". All three ids are counted so a future fourth treatment cannot
    // slip a second sentence in beside an existing one.
    const statements = container.querySelectorAll(
      '[data-testid="card-empty"],[data-testid="chart-empty"],[data-testid="chart-sparse"]',
    )
    expect(statements, 'one statement of emptiness, in whichever treatment').toHaveLength(1)
  })
})

/**
 * THE TWO PROPERTIES THAT CAME BACK FROM `charts.test.tsx` WHEN `SpendArea` WENT.
 *
 * Both were held against a component the card no longer renders. They are held
 * here now, against the card itself — which is stronger, because one of them
 * (the coverage note) was DROPPED by the rewrite and no test noticed: the
 * sentence lived inside the chart, so replacing the chart took it with it.
 */
describe('what the card must not stop saying', () => {
  const days = (values: number[]) =>
    values.map((credits, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, credits }))

  it('a capped read names the DATE coverage starts at, not a row count', () => {
    // `readSpend` truncates oldest-first, so a capped window begins later than
    // the reader assumes and the total under-reports. "from 12 Jul" is
    // something a person can reason about; "500 rows" is not.
    render(
      <SpendCard
        spend={{
          ...base,
          status: 'ok',
          days: days([1, 2, 3]),
          total: 6,
          capped: true,
          coveredFrom: '2026-07-12',
        }}
      />,
    )
    expect(screen.getByText(/12 Jul/)).toBeTruthy()
  })

  it('an uncapped read shows no coverage note', () => {
    render(<SpendCard spend={{ ...base, status: 'ok', days: days([1, 2, 3]), total: 6 }} />)
    expect(screen.queryByText(/Showing from/i)).toBeNull()
  })

  it('a window that was read and had no spend is never the no-data state', () => {
    // Days that were READ and genuinely had no spend must not be reported as
    // "we have nothing". The chart draws thirty stubs; the sentence must not
    // claim an absence.
    render(<SpendCard spend={{ ...base, status: 'ok', days: days([0, 0, 0]), total: 0 }} />)
    expect(screen.queryByText(/could not/i)).toBeNull()
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('one active day is charted AND captioned, not withheld', () => {
    // The floor's real job was stopping a reader inferring a trend from one
    // spike. That claim is kept in words; the chart is not withheld to make it.
    render(<SpendCard spend={{ ...base, status: 'ok', days: days([0, 0, 0, 0, 6]), total: 6 }} />)
    expect(screen.getByText(/not enough to read as a trend/i)).toBeTruthy()
    expect(screen.queryByTestId('chart-sparse')).toBeNull()
  })
})
