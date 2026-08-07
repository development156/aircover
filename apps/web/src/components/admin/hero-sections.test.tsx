import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { OpsRoadmapItem } from '@sahoda/shared'

import { AlphaChip } from './alpha-chip'
import {
  BlockedPanel,
  CannotProvePanel,
  FreshnessLine,
  ShippedPanel,
  WaitingPanel,
} from './hero-sections'
import { freshnessOf } from '@/lib/ops/freshness'

const TODAY = new Date('2026-08-01T12:00:00.000Z')

function alphaItems(): OpsRoadmapItem[] {
  return Array.from({ length: 14 }, (_, i) => ({
    id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
    code: `A${i + 1}`,
    stage: 'alpha',
    title: `Alpha item ${i + 1}`,
    weight: 1,
    status: 'todo',
    target_date: null,
    sort: i,
    created_at: TODAY.toISOString(),
    updated_at: TODAY.toISOString(),
  }))
}

describe('the Alpha warning is demoted but never softened', () => {
  it('states the count and the date on the collapsed chip', () => {
    // Demoting a warning is a layout decision. If the reader had to expand it to
    // learn there IS a problem, the demotion would have become a suppression.
    render(<AlphaChip items={alphaItems()} today={TODAY} />)

    // The count sits in its own span for tabular-nums, so the sentence spans
    // several nodes — assert on the rendered text, not on one node.
    expect(screen.getByText(/Alpha gate:/).textContent).toMatch(
      /Alpha gate:\s*6 of 14\s*failing, audited 25 Jul, not re-run since/,
    )
  })

  it('keeps the failing items out of sight until asked, then names all six', async () => {
    render(<AlphaChip items={alphaItems()} today={TODAY} />)

    const details = screen.getByText(/Alpha gate:/).closest('details')!
    expect(details.open).toBe(false)

    await userEvent.click(screen.getByText(/Alpha gate:/))
    expect(details.open).toBe(true)

    for (const code of ['A3', 'A5', 'A9', 'A12', 'A13', 'A14']) {
      expect(within(details).getByText(code)).toBeInTheDocument()
    }
  })

  it('still says the eleven behavioural checks are unverified, not passed', async () => {
    render(<AlphaChip items={alphaItems()} today={TODAY} />)
    await userEvent.click(screen.getByText(/Alpha gate:/))

    expect(screen.getByText(/unverified, not failed/)).toBeInTheDocument()
    expect(screen.getByText(/never been run/)).toBeInTheDocument()
  })

  it('says the record and the roadmap disagree rather than shrinking the count', () => {
    // Only A3 exists, so five recorded failures match nothing. The headline must
    // still read 6, with the mismatch stated.
    const oneItem = alphaItems().filter((item) => item.code === 'A3')
    render(<AlphaChip items={oneItem} today={TODAY} />)

    expect(screen.getByText(/6 of 1\b/)).toBeInTheDocument()
    expect(screen.getByText(/5 recorded failures no longer match/)).toBeInTheDocument()
  })
})

describe('the hero panels never render an absence as a pass', () => {
  it('says what is blocked, with the reason', () => {
    render(
      <BlockedPanel
        cards={[{ code: 'SL-040', headline: 'Walk the console by hand.', reason: 'needs a login' }]}
      />,
    )
    expect(screen.getByText('Walk the console by hand.')).toBeInTheDocument()
    expect(screen.getByText('needs a login')).toBeInTheDocument()
  })

  it('says a blocked card has no reason rather than staying silent', () => {
    render(<BlockedPanel cards={[{ code: 'SL-040', headline: 'A card.', reason: null }]} />)
    expect(screen.getByText('Blocked, with no reason recorded.')).toBeInTheDocument()
  })

  it('says nothing is blocked in words, rather than rendering an empty box', () => {
    render(<BlockedPanel cards={[]} />)
    expect(screen.getByText('Nothing is blocked.')).toBeInTheDocument()
  })

  it('says nothing shipped, which is a real answer', () => {
    render(<ShippedPanel cards={[]} />)
    expect(screen.getByText('Nothing reached Done in the last seven days.')).toBeInTheDocument()
  })

  it('labels a hand-recorded claim differently from a read one', () => {
    // A transcription and a live reading must never look the same on screen.
    render(
      <CannotProvePanel
        claims={[
          { key: 'a', source: 'derived', what: 'Never ran.', from: 'no run recorded' },
          { key: 'b', source: 'recorded', what: 'Never executed.', from: 'SL-050' },
        ]}
      />,
    )
    expect(screen.getByText(/Read from the record/)).toBeInTheDocument()
    expect(screen.getByText(/Recorded by hand/)).toBeInTheDocument()
  })

  it('names the person and the single next action, with a date', () => {
    render(
      <WaitingPanel
        entries={[
          {
            code: 'SL-043',
            who: 'DIVAS — a decision',
            action: 'Approve the second database.',
            since: '2026-07-30',
          },
        ]}
      />,
    )
    expect(screen.getByText('DIVAS — a decision')).toBeInTheDocument()
    expect(screen.getByText('Approve the second database.')).toBeInTheDocument()
    expect(screen.getByText(/SL-043 · since 2026-07-30/)).toBeInTheDocument()
  })
})

describe('the freshness line', () => {
  const ago = (ms: number) => new Date(TODAY.getTime() - ms).toISOString()

  it('is quiet when the board is current', () => {
    render(<FreshnessLine freshness={freshnessOf(ago(10 * 60_000), TODAY)} />)
    expect(screen.getByText('Last synced 10 minutes ago').className).toContain('text-muted')
  })

  it('goes crimson once the board is a day behind', () => {
    render(<FreshnessLine freshness={freshnessOf(ago(30 * 60 * 60_000), TODAY)} />)
    expect(screen.getByText('Last synced 1 day ago').className).toContain('text-danger')
  })

  it('goes crimson, not silent, when we cannot tell at all', () => {
    render(<FreshnessLine freshness={freshnessOf(null, TODAY)} />)
    expect(screen.getByText(/Last sync unknown/).className).toContain('text-danger')
  })
})
