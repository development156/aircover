import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LibraryStatus, selectedSizeSummary } from './library-status'
import type { AssetCard } from '@/lib/assets/view'

const card = (id: string, bytes: number | null): AssetCard => ({
  id,
  title: `${id}.jpg`,
  alt: null,
  kind: 'image',
  mime: 'image/jpeg',
  bytes,
  width: 800,
  height: 600,
  createdAt: '2026-08-20T00:00:00.000Z',
  previewUrl: null,
  usage: [],
  folderIds: [],
  deletedAt: null,
})

describe('selectedSizeSummary', () => {
  it('is the exact sum when every selected file has a real size', () => {
    expect(selectedSizeSummary([card('a', 1000), card('b', 2000)])).toBe('3 KB')
  })

  it('never claims a number when nothing is selected', () => {
    expect(selectedSizeSummary([])).toBeNull()
  })

  it('states the file count instead of a wrong total when nothing is measurable', () => {
    expect(selectedSizeSummary([card('a', null), card('b', null)])).toBe('Size unknown for 2 files')
  })

  it('states a floor, and says how many were not counted, rather than under-reporting silently', () => {
    const result = selectedSizeSummary([card('a', 1_048_576), card('b', null)])
    expect(result).toContain('At least')
    expect(result).toContain('1 file not counted')
    // The number itself must be the REAL sum of what was measurable, not a
    // guess and not a silent zero for the null one.
    expect(result).toMatch(/1(\.0)? MB/)
  })
})

describe('LibraryStatus', () => {
  it('never renders a selection size that could be wrong, even with a null-byte file selected', () => {
    render(
      <LibraryStatus
        visibleCount={3}
        totalCount={5}
        selectedCards={[card('a', 1_048_576), card('b', null)]}
        capped={false}
      />,
    )
    expect(screen.getByText(/At least 1(\.0)? MB/)).toBeInTheDocument()
    expect(screen.getByText(/1 file not counted/)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('shows no selection summary at all when nothing is selected', () => {
    render(<LibraryStatus visibleCount={5} totalCount={5} selectedCards={[]} capped={false} />)
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })
})
