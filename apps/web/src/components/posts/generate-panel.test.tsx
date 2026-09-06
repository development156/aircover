import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChannelSet } from '@sahoda/shared'

import { GeneratePanel } from './generate-panel'
import { generateVariants } from '@/app/actions/posts-ai'

vi.mock('@/app/actions/posts-ai', () => ({ generateVariants: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

afterEach(cleanup)

const CHANNELS = ['x', 'linkedin'] as unknown as ChannelSet

function panel(channels: ChannelSet = CHANNELS) {
  return render(
    <GeneratePanel
      channels={channels}
      flush={vi.fn(async () => 'p1')}
      onGenerated={vi.fn()}
      emphasis="primary"
    />,
  ).container
}

/**
 * WHAT THE PAID RUN SAYS IT DOES.
 *
 * `content_variants` now asks the model to work the words a customer would
 * search for into each caption. That sentence implies RESEARCH on its own, and
 * this product has none: docs/50 established that there is no keyword-volume
 * source, no trend feed and no competitor data anywhere in it. So the denial is
 * load-bearing copy, not a caveat, and it is guarded like one.
 */
describe('the line under the adapt button', () => {
  test('says the search terms come from the writer, not from a source we do not have', () => {
    panel()

    // The CLAIM, case-insensitively, not the wording. Rewrite the sentence
    // freely and keep the guarantee.
    expect(screen.getByText(/from your own post/i)).toBeTruthy()
    expect(screen.getByText(/not from what is popular/i)).toBeTruthy()
  })

  test('promises no volume, no trend and no ranking', () => {
    const root = panel()
    const text = root.textContent ?? ''

    // The exact words that would turn an honest sentence into a claim about
    // data this product cannot produce.
    for (const forbidden of [/\btrending\b/i, /search volume/i, /\brank(ing|s)?\b/i, /\bSEO\b/]) {
      expect(text, `${forbidden} promises research Sahoda does not do`).not.toMatch(forbidden)
    }
  })

  test('says nothing at all when there is no channel to adapt for', () => {
    // A description of an action nobody can take is furniture. The button is
    // already disabled here; a sentence about what it would do is not.
    const root = panel([] as unknown as ChannelSet)

    expect(root.textContent ?? '').not.toMatch(/search for/i)
  })
})

describe('a dropped connection does not crash the composer', () => {
  test('shows an inline failure when the generate action rejects', async () => {
    // MEASURED on the preview: a server action REJECTS on a dropped connection
    // rather than resolving to `{ ok: false }`, and the unguarded await let the
    // rejection escape the transition and fall to the route error boundary —
    // the whole composer replaced by "This screen didn't load". Remove the
    // try/catch and this rejection throws in act() and the test errors.
    vi.mocked(generateVariants).mockRejectedValueOnce(new Error('Failed to fetch'))
    const user = userEvent.setup()
    panel()

    await user.click(screen.getByRole('button', { name: /adapt for/i }))

    expect(await screen.findByText(/couldn.t finish that just now/i)).toBeTruthy()
  })
})
