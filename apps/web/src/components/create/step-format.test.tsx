import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The Format step, now that `post_variants.format` exists.
 *
 * ── THE TWO RULES THAT MAKE IT HONEST ────────────────────────────────────────
 * 1. A format is offered only if EVERY selected channel can publish it. The
 *    choice is written onto every selected channel's version, so offering one
 *    Instagram cannot do and refusing it days later at publish time is the
 *    fake-success state this product does not ship.
 * 2. Nothing is preselected. Publishing now refuses a post that contradicts its
 *    format, so a default would write an intent the customer never expressed onto
 *    every post — and the first casualty would be an ordinary text post on X that
 *    has published fine for months.
 */

const actions = vi.hoisted(() => ({ calls: [] as unknown[] }))
vi.mock('@/app/actions/posts', () => ({
  createPost: vi.fn(),
  savePost: vi.fn(),
  saveVariant: vi.fn(),
  setVariantFormat: vi.fn(async (...args: unknown[]) => {
    actions.calls.push(args)
    return { ok: true, format: args[2] }
  }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('step=format'),
}))

const { CreateFlow } = await import('./create-flow')

function renderFlow(channels: string[]) {
  return render(
    <CreateFlow
      connected={[]}
      postId={null}
      initialChannels={channels as never}
      initialBodies={{}}
      initialScheduledAt={null}
      media={[]}
      previews={[]}
      postChannels={null}
    />,
  )
}

const tile = (format: string) => document.querySelector(`[data-format="${format}"]`)

beforeEach(() => {
  actions.calls = []
})

describe('what the Format step offers', () => {
  test('offers text and photo for X on its own', () => {
    renderFlow(['x'])
    expect(tile('text')).not.toBeNull()
    expect(tile('image')).not.toBeNull()
  })

  test('does NOT offer text once Instagram is selected', () => {
    // Instagram carries `requiresMedia: true` in the frozen Constraint Engine, so a
    // text-only Instagram post cannot exist. Derived from that field, not listed.
    renderFlow(['instagram'])
    expect(tile('image')).not.toBeNull()
    expect(tile('text')).toBeNull()
    expect(screen.getByText(/Instagram has no text-only post/i)).toBeVisible()
  })

  test('takes the INTERSECTION when several channels are picked', () => {
    // X can do a set of photos, Google can only take one — so a set is not offered
    // for the pair, because the choice is written onto both.
    renderFlow(['x', 'gbp'])
    expect(tile('image')).not.toBeNull()
    expect(tile('carousel')).toBeNull()
  })

  test('offers a set where every picked channel takes more than one image', () => {
    renderFlow(['x', 'linkedin'])
    expect(tile('carousel')).not.toBeNull()
  })

  test('offers video NOWHERE, because no channel declares a video mime', () => {
    for (const channels of [['x'], ['gbp'], ['linkedin'], ['instagram']]) {
      const view = renderFlow(channels)
      expect(tile('video')).toBeNull()
      view.unmount()
    }
  })

  test('preselects nothing, and says what that means', () => {
    renderFlow(['x'])
    for (const format of ['text', 'image']) {
      expect(tile(format)?.getAttribute('aria-checked')).toBe('false')
    }
    expect(screen.getByText(/Nothing chosen/i)).toBeVisible()
  })
})

describe('choosing one', () => {
  test('marks it chosen and states what will be checked', async () => {
    const user = userEvent.setup()
    renderFlow(['x'])

    await user.click(tile('text') as Element)

    expect(tile('text')?.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/checks the post matches text only/i)).toBeVisible()
  })

  test('can be cleared, because not choosing is a real answer', async () => {
    // Publishing refuses a post that contradicts its format, so a writer who picked
    // by accident must be able to get back to "nobody has said".
    const user = userEvent.setup()
    renderFlow(['x'])

    await user.click(tile('image') as Element)
    await user.click(tile('image') as Element)

    expect(tile('image')?.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/Nothing chosen/i)).toBeVisible()
  })
})
