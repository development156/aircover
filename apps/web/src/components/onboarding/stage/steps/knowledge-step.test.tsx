import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { useState } from 'react'

import { SOURCES, UNBUILT_SOURCES } from '../refs'
import { DEFAULT_COLORS, DEFAULT_DATA, type OnboardingData } from '../store'
import { KnowledgeStep } from './knowledge-step'

/**
 * A tile may only offer what the product can actually do with it.
 *
 * Before this change every tile recorded its key into `sources`, `sources` went
 * to localStorage, and the form posted to the resolve carried none of it — under
 * a sentence reading "It is recorded on your Brand Brain now". Three of the
 * tiles (Notion, Google Drive, Shopify) additionally had no adapter behind them
 * at all.
 *
 * ── WHAT THESE TESTS DO NOT COVER ────────────────────────────────────────────
 * They cover what the step collects and hands back through `patch`. The send
 * itself lives in `use-build.ts`; that a URL reaches `addUrlDocument`, and that
 * an empty one does not, is asserted nowhere here.
 */

function Harness({ onPatch }: { onPatch?: (next: Partial<OnboardingData>) => void }) {
  const [data, setData] = useState<OnboardingData>({
    ...DEFAULT_DATA,
    colors: { ...DEFAULT_COLORS },
    sourceUrls: {},
  })
  return (
    <KnowledgeStep
      data={data}
      patch={(next) => {
        onPatch?.(next)
        setData((prev) => ({ ...prev, ...next }))
      }}
    />
  )
}

describe('the knowledge sources grid', () => {
  test('offers nothing it cannot read', () => {
    render(<Harness />)

    // Named individually rather than counted: a count passes just as well when
    // the wrong three are missing.
    for (const gone of UNBUILT_SOURCES) {
      expect(screen.queryByRole('button', { name: new RegExp(gone) })).not.toBeInTheDocument()
    }
    for (const kept of SOURCES) {
      expect(screen.getByRole('button', { name: new RegExp(kept.key) })).toBeInTheDocument()
    }
  })

  test('asks for an address as soon as a tile is picked', async () => {
    render(<Harness />)

    // Guard the guard: absent first, so its arrival is the click's doing.
    expect(screen.queryByLabelText('Which address should Sahoda read?')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Website/ }))

    expect(screen.getByLabelText('Which address should Sahoda read?')).toBeInTheDocument()
  })

  test('keeps the address against the source it was given for', async () => {
    const onPatch = vi.fn()
    render(<Harness onPatch={onPatch} />)

    await userEvent.click(screen.getByRole('button', { name: /Website/ }))
    await userEvent.type(screen.getByLabelText('Which address should Sahoda read?'), 'a.in')

    expect(onPatch).toHaveBeenLastCalledWith({ sourceUrls: { Website: 'a.in' } })
  })

  test('asks each picked source separately', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: /Website/ }))
    await userEvent.click(screen.getByRole('button', { name: /Instagram/ }))

    expect(screen.getByLabelText('Which address should Sahoda read?')).toBeInTheDocument()
    expect(screen.getByLabelText('Which profile should Sahoda read?')).toBeInTheDocument()
  })

  test('drops the address when the tile is switched off', async () => {
    const onPatch = vi.fn()
    render(<Harness onPatch={onPatch} />)

    await userEvent.click(screen.getByRole('button', { name: /Website/ }))
    await userEvent.type(screen.getByLabelText('Which address should Sahoda read?'), 'a.in')
    await userEvent.click(screen.getByRole('button', { name: /Website/ }))

    // The claim: the address goes with the tile. A kept one would be posted for
    // a source the person had just switched off.
    expect(onPatch).toHaveBeenLastCalledWith({ sources: [], sourceUrls: {} })
    expect(screen.queryByLabelText('Which address should Sahoda read?')).not.toBeInTheDocument()
  })

  test('claims a page is read rather than a source connected', () => {
    render(<Harness />)

    // "Connected" would describe an OAuth handshake that does not happen here.
    expect(screen.queryByText(/connected/i)).not.toBeInTheDocument()
    // And the old sentence claimed storage that never occurred.
    expect(screen.queryByText(/recorded on your Brand Brain/i)).not.toBeInTheDocument()
  })
})
