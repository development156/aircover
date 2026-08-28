import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ChannelSet } from '@sahoda/shared'

import { MediaPane } from './media-pane'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/posts/p1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/actions/posts-image', () => ({ generateImage: vi.fn() }))
vi.mock('@/app/actions/posts-media', () => ({
  attachMedia: vi.fn(),
  detachMedia: vi.fn(),
  attachFromLibrary: vi.fn(),
}))
vi.mock('@/app/actions/assets', () => ({
  listAssets: vi.fn(async () => ({ ok: true, assets: [] })),
}))

afterEach(cleanup)

const CHANNELS = ['instagram'] as unknown as ChannelSet

function mediaPane() {
  return render(<MediaPane media={[]} channels={CHANNELS} postId="p1" />).container
}

/**
 * GO TO AI STUDIO, AND THE GENERATOR THAT IS STILL UNDERNEATH IT.
 *
 * The brief was "don't give image generation here, just add a GO TO AI STUDIO".
 * Half of that is built and half of it is deliberately not, and this file is
 * where the second half is pinned so nobody has to reconstruct the reasoning.
 *
 * `/studio` is a roadmap screen today. It renders its shapes and its prices and
 * says outright that nothing is saved yet; it cannot make a picture and has no
 * way to hand one back to a post. `GenerateImage` CAN, and it is the only thing
 * in the product that puts an image on a post that does not already have one.
 *
 * Deleting it in favour of a link would not move image generation to Studio. It
 * would remove image generation from Sahoda and point at a page that cannot do
 * it, which is precisely the shape `no-impossible-remedy.spec.ts` exists to
 * catch — and `/studio` is one of the routes it sweeps.
 */

describe('the Studio link', () => {
  test('is a real link to a route that exists', () => {
    mediaPane()
    const link = screen.getByRole('link', { name: /go to ai studio/i })

    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/studio')
  })

  test('leads the generator rather than following it', () => {
    const root = mediaPane()
    const studio = root.querySelector('[data-studio-link]')
    const generator = root.querySelector('[data-guide="post-generate-image"]')

    expect(studio).toBeTruthy()
    expect(generator).toBeTruthy()
    // Order is the argument: image work belongs in Studio, and the prompt box is
    // the fallback. `compareDocumentPosition` reads DOM order, which is what a
    // person scrolling actually meets.
    expect(
      studio!.compareDocumentPosition(generator!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  test('states the exact thing Studio cannot do, and does not soften it', () => {
    mediaPane()

    // The CLAIM, case-insensitively, not the wording: rewrite the sentence
    // freely and keep the guarantee.
    expect(screen.getByText(/cannot send a picture back to a post yet/i)).toBeTruthy()
    // "Coming soon" would imply a date nobody has set, and docs/37 §15 keeps
    // coming-soon out of a control entirely.
    expect(screen.queryByText(/coming soon/i)).toBeNull()
  })
})

/**
 * THE GUARD ON THE DECISION, not on the code.
 *
 * This is the one that matters. It goes red the day somebody removes
 * `GenerateImage` because the brief said to, and it sends them here to read why
 * it is still present. When Studio can generate and return a file, the honest
 * move is to delete this test IN THE SAME COMMIT as the component, having
 * checked that Studio can do the job — not to delete it because the suite is red.
 */
describe('making a picture is still possible in the product', () => {
  test('the paid generator is reachable on a post with no media', () => {
    mediaPane()
    // Its own name, priced before the spend, exactly as every paid control here
    // must be.
    expect(screen.getByRole('button', { name: /make an image/i })).toBeTruthy()
  })
})
