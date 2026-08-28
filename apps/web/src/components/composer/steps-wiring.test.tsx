import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Post, PostVariant } from '@sahoda/shared'

import { Composer } from './composer'

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
vi.mock('@/app/actions/posts-ai', () => ({
  rewriteSelection: vi.fn(),
  generateVariants: vi.fn(),
  rewriteCaption: vi.fn(),
}))
vi.mock('@/app/actions/posts', () => ({
  createPost: vi.fn(),
  savePost: vi.fn(),
  saveVariant: vi.fn(),
  setVariantFormat: vi.fn(),
}))
vi.mock('@/app/actions/posts-schedule', () => ({ schedulePost: vi.fn(), cancelSchedule: vi.fn() }))
vi.mock('@/app/actions/posts-publish', () => ({ simulatePublish: vi.fn() }))
vi.mock('@/app/actions/templates', () => ({ saveTemplate: vi.fn(), deleteTemplate: vi.fn() }))

afterEach(cleanup)

const base = {
  id: 'p1',
  workspace_id: 'w1',
  title: 'Diwali offer',
  body: '',
  channels: [] as readonly string[],
  status: 'draft',
  scheduled_at: null,
  origin: 'human',
  created_at: '2026-08-28T00:00:00.000Z',
  updated_at: '2026-08-28T00:00:00.000Z',
}

function composer(over: { body?: string; channels?: readonly string[] } = {}) {
  return render(
    <Composer
      post={{ ...base, ...over } as unknown as Post}
      variants={[] as PostVariant[]}
      media={[]}
      templates={{ ok: true, templates: [] } as never}
    />,
  ).container
}

/**
 * THE THREE STEPS, WIRED TO THE RIGHT SECTIONS.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
 * `composer-steps.test.ts` proves the RULES and `step-section.test.tsx` proves
 * the REFUSAL, and both can be entirely correct while the composer passes the
 * wrong step to the wrong section — `steps.write` to all three would leave every
 * one of those eleven tests green and every gate wide open. An adversarial pass
 * named that gap before it was filled. This is the only test that renders the
 * real screen and reads which sections are actually locked.
 *
 * Asserted through `data-step-locked`, which is the marker the section renders
 * for exactly this purpose — the alternative is querying for controls that are
 * deliberately absent from the accessibility tree when locked, which cannot
 * distinguish "refused" from "never rendered".
 */
function lockState(container: HTMLElement) {
  return [1, 2, 3].map((index) =>
    container.querySelector(`[data-step="${index}"]`)?.getAttribute('data-step-locked'),
  )
}

describe('the composer’s steps, on the real screen', () => {
  test('an empty post offers only step one', () => {
    expect(lockState(composer())).toEqual(['false', 'true', 'true'])
  })

  test('writing something opens step two, and only step two', () => {
    expect(lockState(composer({ body: 'Fresh bread every morning.' }))).toEqual([
      'false',
      'false',
      'true',
    ])
  })

  test('picking a channel opens step three', () => {
    expect(lockState(composer({ body: 'Fresh bread every morning.', channels: ['x'] }))).toEqual([
      'false',
      'false',
      'false',
    ])
  })

  test('a post that already has channels keeps them, even with the body emptied', () => {
    // The rule this lane has now written three times: the gate is on the OFFER.
    // Select-all-delete mid-edit must not pull the channel section out from
    // under a post that already names two.
    expect(lockState(composer({ body: '', channels: ['x', 'linkedin'] }))).toEqual([
      'false',
      'false',
      'false',
    ])
  })

  test('each number carries the step it is supposed to carry', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })

    // ── WHY THE TITLES ARE PINNED AND NOT JUST THE ORDER ────────────────────
    // Swapping two titles leaves the order test green, every lock in the right
    // place, and the screen telling people to send a post at step two. The
    // heading is the only part of a step most readers ever act on.
    const titles = [1, 2, 3].map((index) =>
      container.querySelector(`#step-${index}`)?.textContent?.replace(String(index), '').trim(),
    )
    expect(titles).toEqual(['Write your post', 'Choose where it goes', 'Send it'])
  })

  test('step three is announced once, not twice', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })
    void container

    // The send panel carries its own heading when it stands alone. Inside the
    // sequence the numbered step already says "Send it" directly above it, and
    // two identical headings read as two sections to anyone moving by heading.
    expect(screen.getAllByRole('heading', { name: /^send it$/i })).toHaveLength(1)
  })

  test('a blank post is never sent to a step that will not take the click', () => {
    composer()

    // ── NO IMPOSSIBLE REMEDY ────────────────────────────────────────────────
    // The versions pane sits inside step one and has its own empty state. It
    // used to read "pick a channel in step 2" unconditionally, which on a blank
    // post points at a panel that is refusing clicks — a remedy that cannot
    // work is worse than no remedy, because the reader tries it.
    expect(screen.queryByText(/pick a channel in step 2/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/write your post first/i).length).toBeGreaterThan(0)
  })

  test('once there are words, the pane points at the step that is now open', () => {
    composer({ body: 'Fresh bread every morning.' })

    expect(screen.getByText(/pick a channel in step 2/i)).toBeVisible()
  })

  test('a step already open does not shut under the cursor', async () => {
    // ── THE LATCH, ON THE REAL SCREEN ───────────────────────────────────────
    // The rules alone are not enough here: `composer.tsx` could drop the latch
    // entirely and every test of the rules would stay green. So this drives the
    // actual screen through the exact sequence that traps a person — empty the
    // words, then untick the last channel — and reads the locks back.
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })
    expect(lockState(container)).toEqual(['false', 'false', 'false'])

    const body = screen.getByLabelText('Your post')
    fireEvent.change(body, { target: { value: '' } })

    const tile = container.querySelector('[data-channel-tile="x"]')
    expect(tile).not.toBeNull()
    fireEvent.click(tile as HTMLElement)

    await waitFor(() => expect(lockState(container)).toEqual(['false', 'false', 'false']))
  })

  test('the three sections are in the order the numbers claim', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })

    // A numbered sequence whose sections render out of order is worse than no
    // numbering: the reader trusts the number over the position and is wrong.
    const order = [...container.querySelectorAll('[data-step]')].map((el) =>
      el.getAttribute('data-step'),
    )
    expect(order).toEqual(['1', '2', '3'])
  })
})
