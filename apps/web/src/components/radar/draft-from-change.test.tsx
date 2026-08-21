import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { DraftFromChangeState } from '@/lib/radar/state'

import { DraftFromChange, SpendRefusal } from './draft-from-change'

/**
 * THE SPEND, THE REFUSAL, AND THE SENTENCE NOBODY HAS EVER READ.
 *
 * ── THE REFUSAL IS RENDERED, NOT INSPECTED ──────────────────────────────────
 * This repo has already shipped "needs 1 credits" in `inline-rewrite.tsx` — a
 * grammatical fault that survived review because the only way to reach that
 * branch is to run a workspace to zero, and a fresh workspace starts with 100
 * credits. Reading the source proves the plural is COMPUTED; only rendering it
 * proves what it computes to.
 *
 * ── AND IT IS EXERCISED AT `required: 1`, WHICH RADAR'S OWN PRICE IS NOT ────
 * Drafting costs `post_variants`, which is 3. A test that only used the real
 * price would exercise the plural branch exclusively and leave the singular —
 * the one that was broken elsewhere — completely unread. So the singular is
 * asserted directly, at a figure this action will not itself produce today, and
 * will keep being asserted if the price ever moves to 1.
 */

const state = vi.hoisted(() => ({
  result: {
    ok: true,
    postId: 'post-1',
    variants: 1,
    creditsCharged: 3,
  } as DraftFromChangeState,
  calls: [] as Array<{ changeId: unknown; channels: unknown }>,
}))

vi.mock('@/app/actions/radar', () => ({
  draftFromRadarChange: (changeId: unknown, channels: unknown) => {
    state.calls.push({ changeId, channels })
    return Promise.resolve(state.result)
  },
}))

beforeEach(() => {
  state.result = { ok: true, postId: 'post-1', variants: 1, creditsCharged: 3 }
  state.calls = []
})

describe('the zero-balance refusal', () => {
  test('reads as a singular at one credit', () => {
    render(<SpendRefusal required={1} available={0} />)
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).toContain('needs 1 credit and you have 0')
    expect(text).not.toContain('1 credits')
  })

  test('reads as a plural at more than one', () => {
    render(<SpendRefusal required={3} available={2} />)
    expect(screen.getByRole('alert').textContent).toContain('needs 3 credits and you have 2')
  })

  test('states that nothing was charged, and offers the wallet', () => {
    render(<SpendRefusal required={3} available={0} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Nothing was written and you were not charged')
    expect(screen.getByRole('link', { name: /top up your wallet/i })).toHaveAttribute(
      'href',
      '/wallet',
    )
  })

  test('the refusal arrives through the real click path, not only in isolation', async () => {
    state.result = { ok: false, insufficient: true, required: 3, available: 0 }
    render(<DraftFromChange changeId="chg-1" competitorName="A Shop" channels={['instagram']} />)
    await userEvent.click(screen.getByRole('button'))
    expect((await screen.findByRole('alert')).textContent).toContain('needs 3 credits')
  })
})

describe('the cost is shown before anything is spent', () => {
  test('the button carries the price, and the price is the config price', () => {
    render(<DraftFromChange changeId="chg-1" competitorName="A Shop" channels={['instagram']} />)
    // 3 is `post_variants` in pricing.config.json, reached through creditCost().
    expect(screen.getByRole('button').textContent).toContain('3 credits')
  })

  test('nothing is called until the button is pressed', () => {
    render(<DraftFromChange changeId="chg-1" competitorName="A Shop" channels={['instagram']} />)
    expect(state.calls).toEqual([])
  })

  test('the panel says the output is a draft a person approves', () => {
    const { container } = render(
      <DraftFromChange changeId="chg-1" competitorName="A Shop" channels={['instagram']} />,
    )
    expect(container.textContent).toContain('stays a draft until you approve it')
    expect(container.textContent).toContain('nothing about this is published for you')
  })

  test('with no channel connected it offers the connection, not a dead button', () => {
    render(<DraftFromChange changeId="chg-1" competitorName="A Shop" channels={[]} />)
    // A `<button disabled>` is still announced as a button: a reader is offered
    // an action, takes it, and nothing happens.
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('link', { name: /connect a channel/i })).toBeInTheDocument()
  })

  test('a success says what was charged and links to the draft', async () => {
    render(<DraftFromChange changeId="chg-1" competitorName="A Shop" channels={['instagram']} />)
    await userEvent.click(screen.getByRole('button'))
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('Wrote a draft for 3 credits')
    expect(screen.getByRole('link', { name: /read it and approve it/i })).toHaveAttribute(
      'href',
      '/posts/post-1',
    )
  })

  test('a failure after the draft exists still points at the draft', async () => {
    state.result = {
      ok: false,
      insufficient: false,
      postId: 'post-9',
      message: 'Could not write the copy.',
    }
    render(<DraftFromChange changeId="chg-1" competitorName="A Shop" channels={['instagram']} />)
    await userEvent.click(screen.getByRole('button'))
    // The draft is not silently lost — the observation it came from has moved on
    // in the feed by the time anyone looks again.
    expect(await screen.findByRole('link', { name: /the draft is still here/i })).toHaveAttribute(
      'href',
      '/posts/post-9',
    )
  })

  test('the channel list sent to the server is deduped by the caller it came from', async () => {
    render(
      <DraftFromChange
        changeId="chg-1"
        competitorName="A Shop"
        channels={['instagram', 'linkedin']}
      />,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(state.calls).toEqual([{ changeId: 'chg-1', channels: ['instagram', 'linkedin'] }])
  })
})
