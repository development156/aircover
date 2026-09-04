import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { storageState } from '@sahoda/shared'

import { StoragePanel } from './storage-panel'
import type { StorageUsage } from '@/lib/storage/usage'

/**
 * The panel's job is to be honest about four different answers, only one of which
 * is a number. These tests assert the CLAIM each state makes, not its wording, so
 * the sentences can be rewritten freely and the guarantees survive.
 */

const MB = 1_000_000
const GB = 1_000_000_000
const ok = (used: number): StorageUsage => ({ kind: 'ok', state: storageState(used) })

describe('StoragePanel', () => {
  it('shows what is used and what is left', () => {
    render(<StoragePanel usage={ok(400 * MB)} />)

    expect(screen.getByText(/400 MB of 1 GB/)).toBeInTheDocument()
    expect(screen.getByText(/600 MB left/)).toBeInTheDocument()
    expect(screen.getByText('40% used')).toBeInTheDocument()
  })

  it('names the trash, because trashed files still take up room', () => {
    // Without this a person who trashed 400 MB and saw no movement would read the
    // meter as broken, reasoning correctly from what the screen told them.
    render(<StoragePanel usage={ok(400 * MB)} />)

    expect(screen.getByText(/trash still take up space/i)).toBeInTheDocument()
  })

  it('says a full workspace is full, and what actually frees space', () => {
    render(<StoragePanel usage={ok(GB)} />)

    expect(screen.getByText(/this workspace is full/i)).toBeInTheDocument()
    expect(screen.getByText(/delete some files for good/i)).toBeInTheDocument()
    expect(screen.getByText('100% used')).toBeInTheDocument()
  })

  it('DRAWS NO BAR and claims no figure when the read failed', () => {
    // The defect this exists to prevent: an empty meter is a statement about the
    // customer's own library, and a failed read is no basis for one.
    render(<StoragePanel usage={{ kind: 'read_failed' }} />)

    expect(screen.getByText(/not a reading of your library/i)).toBeInTheDocument()
    expect(screen.queryByText(/% used/)).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    // Never the word that would imply a measurement.
    expect(screen.queryByText(/0 B of/)).not.toBeInTheDocument()
  })

  it('separates "not deployed yet" from "read failed" — one alarms, one does not', () => {
    render(<StoragePanel usage={{ kind: 'not_deployed' }} />)

    expect(screen.getByText(/nothing is wrong with your files/i)).toBeInTheDocument()
    expect(screen.getByText(/uploading still works/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('tells someone with no workspace what to do instead of showing them a bar', () => {
    render(<StoragePanel usage={{ kind: 'no_workspace' }} />)

    expect(screen.getByText(/create a workspace/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('gives the bar the same sentence a sighted reader gets', () => {
    render(<StoragePanel usage={ok(950 * MB)} />)

    expect(screen.getByRole('img')).toHaveAttribute('aria-label', '950 MB of 1 GB used, 95%')
  })

  it('renders no fill at all at zero, rather than a sliver that reads as "a little"', () => {
    const { container } = render(<StoragePanel usage={ok(0)} />)

    expect(screen.getByText('0% used')).toBeInTheDocument()
    expect(container.querySelector('.bg-accent')).toBeNull()
  })
})
