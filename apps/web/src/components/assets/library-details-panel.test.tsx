import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/actions/assets', () => ({ updateAsset: vi.fn(), deleteAsset: vi.fn() }))

const { LibraryDetailsPanel } = await import('./library-details-panel')

import type { AssetCard } from '@/lib/assets/view'

const card = (over: Partial<AssetCard> = {}): AssetCard => ({
  id: 'a',
  title: 'photo.jpg',
  alt: 'A description',
  kind: 'image',
  mime: 'image/jpeg',
  bytes: 1000,
  width: null,
  height: null,
  createdAt: '2026-08-20T00:00:00.000Z',
  previewUrl: null,
  usage: [],
  folderIds: [],
  ...over,
})

describe('F4: the details panel', () => {
  it('prints the absence mark for an unmeasured dimension, never 0', () => {
    render(<LibraryDetailsPanel card={card({ width: null, height: null })} onDeleted={() => {}} />)

    // The absence mark carries an accessible name naming exactly what was
    // not measured — asserting THAT, not a visual glyph, is the claim this
    // test exists to pin.
    expect(
      screen.getByText('Dimensions has not been measured yet', { selector: '.sr-only' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText('0×0')).not.toBeInTheDocument()
  })

  it('prints the real dimensions when they are known', () => {
    render(<LibraryDetailsPanel card={card({ width: 1600, height: 900 })} onDeleted={() => {}} />)
    expect(screen.getByText('1600×900')).toBeInTheDocument()
  })

  it('shows a quiet prompt, never a claim about a file, when nothing is selected', () => {
    render(<LibraryDetailsPanel card={null} onDeleted={() => {}} />)
    expect(screen.getByText('Select a file to see its details.')).toBeInTheDocument()
  })
})
