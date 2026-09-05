import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ViewerLogoSection } from './viewer-logo-section'
import type { CanvasPicture } from '@/lib/studio/canvas'

const BASE: CanvasPicture = {
  imageId: '11111111-1111-4111-8111-111111111111',
  assetId: '22222222-2222-4222-8222-222222222222',
  url: 'https://signed.example/a.png',
  width: 1024,
  height: 1024,
  prompt: 'A plate of fresh samosas',
  formatId: 'square',
  mime: 'image/png',
  mode: 'on_brand',
  referenceAssetIds: [],
  stampedUrl: null,
  stampOutcome: null,
  madeAgo: '2h ago',
}

/**
 * `anchor-note.ts` STAYS FOUR OUTCOMES, AND THIS IS WHERE A SCREEN RENDERS THEM.
 *
 * These assert the CLAIM `anchor-note.ts` itself pins — moved says which
 * corner and why, `as_chosen` says nothing, `unrecorded` renders the locked
 * marker — never the exact sentence, so a copy rewrite there does not break
 * this file.
 */
describe('the four placement outcomes', () => {
  it('unrecorded: the locked "coming soon" marker, and no claim about a real corner', () => {
    render(
      <ViewerLogoSection
        picture={{ ...BASE, stampOutcome: 'stamped', stampedUrl: 'https://signed.example/b.png' }}
        showing="stamped"
        onShowingChange={() => {}}
      />,
    )
    expect(screen.getByText(/exact placement: coming soon/i)).toBeInTheDocument()
  })

  it('as_chosen: silence — no placement sentence at all, only the toggle', () => {
    render(
      <ViewerLogoSection
        picture={{
          ...BASE,
          stampOutcome: 'stamped',
          stampedUrl: 'https://signed.example/b.png',
          stampAnchor: 'bottom-right',
          stampAnchorMovedReason: null,
        }}
        showing="stamped"
        onShowingChange={() => {}}
      />,
    )
    expect(screen.queryByText(/exact placement/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/moved the logo/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /with your logo/i })).toBeInTheDocument()
  })

  it('moved for being too busy: names the corner it actually landed in', () => {
    render(
      <ViewerLogoSection
        picture={{
          ...BASE,
          stampOutcome: 'stamped',
          stampedUrl: 'https://signed.example/b.png',
          stampAnchor: 'top-left',
          stampAnchorMovedReason: 'busy',
        }}
        showing="stamped"
        onShowingChange={() => {}}
      />,
    )
    expect(screen.getByText(/top-left corner/i)).toBeInTheDocument()
    expect(screen.getByText(/too busy/i)).toBeInTheDocument()
  })

  it('moved for legibility: a different sentence from the busy one', () => {
    render(
      <ViewerLogoSection
        picture={{
          ...BASE,
          stampOutcome: 'stamped',
          stampedUrl: 'https://signed.example/b.png',
          stampAnchor: 'top-right',
          stampAnchorMovedReason: 'unreadable',
        }}
        showing="stamped"
        onShowingChange={() => {}}
      />,
    )
    expect(screen.getByText(/top-right corner/i)).toBeInTheDocument()
    expect(screen.getByText(/hard to read/i)).toBeInTheDocument()
  })

  it('no toggle at all when there is only one picture to show', () => {
    render(
      <ViewerLogoSection
        picture={{ ...BASE, stampOutcome: 'no_logo' }}
        showing="original"
        onShowingChange={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /with your logo/i })).not.toBeInTheDocument()
    expect(screen.getByText(/no logo yet/i)).toBeInTheDocument()
  })
})
