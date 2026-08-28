import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { ChannelLogo } from './channel-logo'
import { CATALOGUE } from '@/lib/connections/catalogue'

/**
 * EVERY NAMED PLATFORM HAS ITS OWN MARK.
 *
 * ── WHY THIS GUARD EXISTS AND WHY IT DID NOT BEFORE ──────────────────────────
 * `ChannelLogo` falls back to a grey `CircleSlash` for any channel with neither
 * a shipped PNG nor a drawn SVG. That fallback is correct — it says "no mark",
 * which is the true statement — and it is invisible to every other test in this
 * repository, because a tile with a placeholder renders, lays out and passes
 * every assertion about its text.
 *
 * With eight tiles the gap was survivable. On 2026-08-26 the catalogue went to
 * fifteen and eight of the new platforms shipped no asset, so without the marks
 * added alongside them this screen would have rendered EIGHT IDENTICAL grey
 * glyphs — on the one screen whose entire subject is telling platforms apart,
 * and with nothing failing to say so.
 *
 * The fallback is deliberately still reachable. It is what a channel added
 * tomorrow gets, and this test is what tells whoever adds it.
 */
describe('every catalogue platform has a mark of its own', () => {
  it('renders no placeholder for any channel the screen names', () => {
    const missing: string[] = []

    for (const entry of CATALOGUE) {
      const { container, unmount } = render(<ChannelLogo channel={entry.id} />)
      // The placeholder tags itself. Asserted through that hook rather than by
      // looking for an <svg>, because four of these marks ARE svgs — a check for
      // "is there an image" would pass on the fallback too, which is precisely
      // the blind spot this test closes.
      if (container.querySelector('[data-placeholder="true"]')) missing.push(entry.id)
      unmount()
    }

    expect(missing).toEqual([])
  })

  it('gives each platform a DISTINCT mark, not the same one twice', () => {
    // Sharing an asset is the other way to be anonymous, and it is the likelier
    // mistake: `public/channels/` ships `google-ads.png`, which is a different
    // Google product from `gbp`, and pointing at it would mislabel the channel
    // while looking perfectly fine. Marks are keyed by channel, so this catches a
    // copy-paste in the MARK map that a screenshot would not.
    const marks = new Map<string, string>()

    for (const entry of CATALOGUE) {
      const { container, unmount } = render(<ChannelLogo channel={entry.id} />)
      const node = container.firstElementChild
      // The identity of a mark: an <img> is its src, a drawn <svg> is its shape.
      const signature =
        node?.getAttribute('src') ?? (node?.innerHTML.slice(0, 400) || `none:${entry.id}`)
      const already = marks.get(signature)
      expect(already, `${entry.id} renders the same mark as ${already}`).toBeUndefined()
      marks.set(signature, entry.id)
      unmount()
    }
  })
})
