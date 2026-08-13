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
  it('states failing, partial and descoped counts on the collapsed chip', () => {
    // Demoting a warning is a layout decision. If the reader had to expand it to
    // learn there IS a problem, the demotion would have become a suppression.
    // Partial belongs on the FACE for the same reason: four half-built items
    // hidden behind a click reads as four fewer problems.
    render(<AlphaChip items={alphaItems()} today={TODAY} />)

    // The counts sit in their own spans for tabular-nums, so the sentence spans
    // several nodes — assert on the rendered text, not on one node.
    expect(screen.getByText(/Alpha gate:/).textContent).toMatch(
      /Alpha gate:\s*4 of 14\s*failing · 4\s*partial · 1\s*out of scope, audited 25 Jul/,
    )
  })

  it('states the descope on the face, so the count never shrinks in silence', () => {
    // The one-item difference is the whole risk of this feature, so it is on the
    // collapsed chip — a reader who never clicks must still learn the number was
    // reduced and by how much.
    render(<AlphaChip items={alphaItems()} today={TODAY} />)
    expect(screen.getByText(/Alpha gate:/).textContent).toMatch(/out of scope/)
  })

  it('keeps the failing items out of sight until asked, then names all four', async () => {
    render(<AlphaChip items={alphaItems()} today={TODAY} />)

    const details = screen.getByText(/Alpha gate:/).closest('details')!
    expect(details.open).toBe(false)

    await userEvent.click(screen.getByText(/Alpha gate:/))
    expect(details.open).toBe(true)

    for (const code of ['A3', 'A8', 'A13', 'A14']) {
      expect(within(details).getByText(code)).toBeInTheDocument()
    }
  })

  it('names the partial items under their own heading, never merged into the failures', async () => {
    // The status exists so that "does half of what was asked" is neither counted
    // as broken nor left silent. Merging the two lists loses exactly that.
    render(<AlphaChip items={alphaItems()} today={TODAY} />)
    await userEvent.click(screen.getByText(/Alpha gate:/))

    expect(screen.getByText(/Partly working/)).toBeInTheDocument()
    for (const code of ['A2', 'A5', 'A9', 'A10']) {
      expect(screen.getByText(code)).toBeInTheDocument()
    }
  })

  it('shows the evidence behind a status, not just the verdict', async () => {
    // A status with no evidence is a number the reader has to trust. A8 flipped
    // from an implied pass to a fail, so the reason has to be on screen.
    render(<AlphaChip items={alphaItems()} today={TODAY} />)
    await userEvent.click(screen.getByText(/Alpha gate:/))

    const a8 = screen.getByText('A8').closest('li')!
    expect(within(a8).getByText(/fixture/)).toBeInTheDocument()
  })

  it('accounts for the passing remainder instead of leaving it silent', async () => {
    // The failure this prevents: "4 failing" read as "the other ten are fine".
    // Ten of them were last looked at on 25 Jul.
    render(<AlphaChip items={alphaItems()} today={TODAY} />)
    await userEvent.click(screen.getByText(/Alpha gate:/))

    expect(screen.getByText(/have not been re-checked since/)).toBeInTheDocument()
  })

  it('names the descoped item under its own heading, with a reason and a date', async () => {
    // Present, but NOT in the failure list — the separation is the point. A12
    // vanishing entirely would be the same defect as counting it as broken.
    render(<AlphaChip items={alphaItems()} today={TODAY} />)
    await userEvent.click(screen.getByText(/Alpha gate:/))

    expect(screen.getByText(/Taken out of scope on purpose/)).toBeInTheDocument()

    const descopeItem = screen.getByText('A12').closest('li')!
    expect(within(descopeItem).getByText(/out of beta scope/)).toBeInTheDocument()
    expect(within(descopeItem).getByText(/Decided 2026-08-13/)).toBeInTheDocument()
  })

  it('separates the ten unrun behavioural checks from the one known unmeetable', async () => {
    // A9's evidence now cites the five-minute cron, which makes the ±60s check
    // known-failing. Saying all eleven "have never been run" alongside that
    // would put two contradictory claims in one panel.
    render(<AlphaChip items={alphaItems()} today={TODAY} />)
    await userEvent.click(screen.getByText(/Alpha gate:/))

    expect(screen.getByText(/unverified, not failed/)).toBeInTheDocument()
    expect(screen.getByText(/cannot be met as built/)).toBeInTheDocument()
    expect(screen.queryByText(/that gate has never been run/i)).not.toBeInTheDocument()
  })

  it('says the audit cannot be matched to the build when no SHA was recorded', () => {
    // Undefined is the LOCAL case and a real deployed one. It must never render
    // as agreement — "cannot verify" and "matches" are different claims.
    render(<AlphaChip items={alphaItems()} today={TODAY} />)
    expect(screen.getByText(/recorded no deployed commit/)).toBeInTheDocument()
  })

  it('states both SHAs as fact when the deploy has moved past the audit', async () => {
    // Deliberately muted, not an alarm: work lands several times a day, so a red
    // banner here would be lit permanently and learned past within a week.
    render(
      <AlphaChip
        items={alphaItems()}
        today={TODAY}
        deployedSha="565913e0abcdef1234567890abcdef1234567890"
      />,
    )
    await userEvent.click(screen.getByText(/Alpha gate:/))

    expect(screen.getByText(/565913e/)).toBeInTheDocument()
    expect(screen.getByText(/Work has landed since/)).toBeInTheDocument()
  })

  it('reports a match when the deployed commit is the audited one', () => {
    render(
      <AlphaChip
        items={alphaItems()}
        today={TODAY}
        deployedSha="a9aad9c5f4ed8244ef5a34a16aa57efd6278f76f"
      />,
    )
    expect(screen.getByText(/which is the commit deployed/)).toBeInTheDocument()
  })

  it('says the record and the roadmap disagree rather than shrinking the count', () => {
    // Only A3 exists, so twelve of the thirteen counted items match nothing. The
    // headline must still read 4, with the mismatch stated.
    const oneItem = alphaItems().filter((item) => item.code === 'A3')
    render(<AlphaChip items={oneItem} today={TODAY} />)

    expect(screen.getByText(/4 of 1\b/)).toBeInTheDocument()
    expect(screen.getByText(/12 assessed items no longer match/)).toBeInTheDocument()
  })

  it('flags an out-of-scope code that matches no roadmap item', () => {
    // The descope is the one place a code can leave the failure count, so a typo
    // there silently erases a real failure. A12 matches nothing in this roadmap.
    const oneItem = alphaItems().filter((item) => item.code === 'A3')
    render(<AlphaChip items={oneItem} today={TODAY} />)

    expect(screen.getByText(/1 out-of-scope code matches no roadmap item/)).toBeInTheDocument()
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
