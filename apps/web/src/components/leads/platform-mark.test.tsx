import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { PlatformMark } from './platform-mark'
import { PLATFORM_LABELS } from '@/components/inbox/platform-label'
import type { InboxPlatform } from '@sahoda/shared'

const PLATFORMS = Object.keys(PLATFORM_LABELS) as InboxPlatform[]

/**
 * ── WHY `data-mark` AND NOT THE BRAND COLOUR ────────────────────────────────
 * These marks carry no text, no title and no accessible name of their own — by
 * design, because the name is rendered beside them and announcing it twice is
 * worse than not announcing it here. `brand-marks.tsx` stamps `data-mark` for
 * exactly this reason. Matching a brand hex in a test file instead is refused
 * outright by `design-lint.mjs`, and rightly.
 */
describe('the mark on a lead', () => {
  it('shows the real Instagram logo, not two letters', () => {
    const { container } = render(<PlatformMark platform="instagram" />)
    expect(container.querySelector('[data-mark="instagram"]')).not.toBeNull()
    expect(screen.queryByText('ig')).toBeNull()
  })

  it('shows the real mark for every platform whose artwork this product holds', () => {
    for (const [platform, mark] of [
      ['facebook', 'facebook'],
      ['reddit', 'reddit'],
      // A Google Business Profile lead came through Google, and the four-colour
      // G is what a reader recognises. Same pairing as the Connections screen.
      ['googlebusiness', 'google'],
    ] as const) {
      const { container, unmount } = render(<PlatformMark platform={platform} />)
      expect(container.querySelector(`[data-mark="${mark}"]`), platform).not.toBeNull()
      unmount()
    }
  })

  /**
   * The monogram is not a leftover. Four of the eight platforms have no supplied
   * artwork, and drawing a trademarked logo from memory is the thing this file
   * has always refused: a wrong logo is worse than honest initials.
   */
  it('keeps the monogram where there is no artwork to show', () => {
    for (const platform of ['whatsapp', 'twitter', 'bluesky', 'telegram'] as const) {
      const { container, unmount } = render(<PlatformMark platform={platform} />)
      expect(container.querySelector('[data-mark]'), platform).toBeNull()
      unmount()
    }
  })

  /**
   * ── THE GUARANTEE THAT MUST SURVIVE FOR EVERY PLATFORM ────────────────────
   * Whichever branch a platform takes, the reader is told its NAME. Losing that
   * on the brand-mark path would leave a screen-reader user with a lead from
   * nowhere, and it is the exact thing a change like this breaks silently.
   */
  it('names every platform, on both paths', () => {
    for (const platform of PLATFORMS) {
      const { container, unmount } = render(<PlatformMark platform={platform} />)
      // The screen-reader span specifically, not any text on the badge. X's
      // label IS "X" and its monogram is "X" too, so a text query matches twice
      // and would have failed on a mark that is perfectly correct.
      expect(container.querySelector('.sr-only')?.textContent, platform).toBe(
        PLATFORM_LABELS[platform],
      )
      unmount()
    }
  })

  it('renders nothing at all when a lead arrived on no platform', () => {
    // Null is not a failure. A site-form lead genuinely came through no
    // platform, and a grey question mark would invent a gap.
    const { container } = render(<PlatformMark platform={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('survives a platform this product has never heard of', () => {
    render(<PlatformMark platform="mastodon" />)
    // Its own name, not our failure to recognise it.
    expect(screen.getByText('mastodon')).toBeTruthy()
    expect(screen.getByText('ma')).toBeTruthy()
  })
})
