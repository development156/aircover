import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpsChangelogEntry } from '@sahoda/shared'

import { ChangelogRail } from './changelog-rail'

function entry(
  over: Partial<OpsChangelogEntry> & Pick<OpsChangelogEntry, 'seq' | 'id'>,
): OpsChangelogEntry {
  return {
    title: 'The sync commands are in place',
    summary_plain: 'You can now move a card with one command.',
    details_tech: null,
    kind: 'added',
    author: 'GIRIJA',
    author_overridden: false,
    task_codes: [],
    tourable: false,
    happened_at: '2026-07-25T19:15:40Z',
    created_at: '2026-07-25T19:15:40Z',
    updated_at: '2026-07-25T19:15:40Z',
    ...over,
  }
}

const ENTRY = entry({ id: 'a', seq: 58, task_codes: ['SL-011'] })

function mockClipboard(impl: (text: string) => Promise<void>) {
  const writeText = vi.fn(impl)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

describe('ChangelogRail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the plain summary without asking, and hides technical detail', () => {
    render(<ChangelogRail entries={[entry({ id: 'a', seq: 58, details_tech: 'Uses an RPC.' })]} />)

    expect(screen.getByText('You can now move a card with one command.')).toBeVisible()
    // Present but behind the disclosure — doc 13 §8 keeps jargon out of the way.
    expect(screen.getByText('Technical details')).toBeInTheDocument()
    expect(screen.getByRole('group')).not.toHaveAttribute('open')
  })

  it('renders no disclosure at all when there is no technical detail', () => {
    render(<ChangelogRail entries={[ENTRY]} />)
    expect(screen.queryByText('Technical details')).toBeNull()
  })

  it('copies the plain text, which carries no markdown syntax', async () => {
    const writeText = mockClipboard(async () => {})
    render(<ChangelogRail entries={[ENTRY]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))

    const copied = writeText.mock.calls[0]![0]
    expect(copied).toContain('The sync commands are in place')
    expect(copied).not.toMatch(/[#*`]/)
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('copies markdown separately, with the technical detail included', async () => {
    const writeText = mockClipboard(async () => {})
    render(<ChangelogRail entries={[entry({ id: 'a', seq: 58, details_tech: 'Uses an RPC.' })]} />)

    await userEvent.click(screen.getByRole('button', { name: 'MD' }))

    const copied = writeText.mock.calls[0]![0]
    expect(copied).toContain('### The sync commands are in place')
    expect(copied).toContain('Uses an RPC.')
  })

  it("says it couldn't copy when the clipboard refuses", async () => {
    // The failure that matters: a button flashing "Copied" over an empty
    // clipboard is discovered by pasting nothing into WhatsApp.
    mockClipboard(async () => {
      throw new Error('denied')
    })
    render(<ChangelogRail entries={[ENTRY]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByText("Couldn't copy")).toBeInTheDocument()
  })

  it("says it couldn't copy when there is no clipboard API at all", async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    render(<ChangelogRail entries={[ENTRY]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByText("Couldn't copy")).toBeInTheDocument()
  })

  it('groups by IST day, so an evening entry files under the right date', () => {
    // 19:15 UTC is 00:45 the next day in IST.
    render(<ChangelogRail entries={[ENTRY]} />)
    expect(screen.getByRole('heading', { name: 'Sunday, 26 July 2026' })).toBeInTheDocument()
  })

  it('links task codes to their board anchors', () => {
    render(<ChangelogRail entries={[ENTRY]} />)
    expect(screen.getByRole('link', { name: 'SL-011' })).toHaveAttribute('href', '#task-SL-011')
  })

  it('shows the server-assigned author, never a client guess', () => {
    render(<ChangelogRail entries={[ENTRY]} />)
    expect(screen.getByText('GIRIJA')).toBeInTheDocument()
  })

  it('offers a per-day copy alongside the per-entry ones', async () => {
    const writeText = mockClipboard(async () => {})
    render(
      <ChangelogRail
        entries={[ENTRY, entry({ id: 'b', seq: 57, title: 'Progress is visible' })]}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Copy day' }))
    const copied = writeText.mock.calls[0]![0]

    expect(copied).toContain('Sunday, 26 July 2026')
    expect(copied).toContain('Progress is visible')
  })

  it('says an empty changelog is empty, and what fills it', () => {
    render(<ChangelogRail entries={[]} />)
    const section = screen.getByRole('region', { name: 'Changelog entries' })

    expect(within(section).getByText(/No entries yet/)).toBeInTheDocument()
  })
})
