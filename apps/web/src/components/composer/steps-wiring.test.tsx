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

/**
 * ── AN UNSAVED DRAFT SURVIVES A TEST, AND THAT MADE THIS FILE LIE ────────────
 * The composer stashes unsaved changes in `sessionStorage` under the post's id,
 * so the reader gets them back after a crash or a closed tab. Every test here
 * uses the same id, so the test that empties a body and unticks a channel left
 * that behind and the NEXT render picked it up: a post handed two channels
 * rendered with none, and the failure named a missing version card rather than
 * the leak. Cleared between tests, which is what a fresh tab is.
 */
afterEach(() => sessionStorage.clear())

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
 * THE THREE PARTS, WIRED TO THE RIGHT ROWS.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
 * `composer-steps.test.ts` proves the RULES and `composer-rail.test.tsx` proves
 * the REFUSAL, and both can be entirely correct while the composer hands the
 * wrong step to the wrong row — `steps.write` to all three would leave every one
 * of those tests green and every gate wide open. An adversarial pass named that
 * gap before it was filled. This is the only test that renders the real screen
 * and reads which rows are actually locked and what each one opens.
 */
function lockState(container: HTMLElement) {
  return [1, 2, 3].map((index) =>
    container.querySelector(`[data-rail-step="${index}"]`)?.getAttribute('data-rail-locked'),
  )
}

function railButton(container: HTMLElement, index: 1 | 2 | 3) {
  return container.querySelector(`[data-rail-step="${index}"] button`) as HTMLElement
}

/** Which part is filling the screen, read off the panel itself. */
function shown(container: HTMLElement) {
  return container.querySelector('[data-composer-panel]')?.getAttribute('data-composer-panel')
}

describe('the composer’s three parts, on the real screen', () => {
  test('an empty post offers only the first part', () => {
    expect(lockState(composer())).toEqual(['false', 'true', 'true'])
  })

  test('writing something opens the second part, and only the second', () => {
    expect(lockState(composer({ body: 'Fresh bread every morning.' }))).toEqual([
      'false',
      'false',
      'true',
    ])
  })

  test('picking a channel opens the third', () => {
    expect(lockState(composer({ body: 'Fresh bread every morning.', channels: ['x'] }))).toEqual([
      'false',
      'false',
      'false',
    ])
  })

  test('a post that already has channels keeps them, even with the body emptied', () => {
    // The rule this lane has now written four times: the gate is on the OFFER.
    // Select-all-delete mid-edit must not pull the platform part out from under
    // a post that already names two.
    expect(lockState(composer({ body: '', channels: ['x', 'linkedin'] }))).toEqual([
      'false',
      'false',
      'false',
    ])
  })

  test('a part already open does not shut under the cursor', async () => {
    // ── THE LATCH, ON THE REAL SCREEN ───────────────────────────────────────
    // The rules alone are not enough here: `composer.tsx` could drop the latch
    // entirely and every test of the rules would stay green. So this drives the
    // actual screen through the exact sequence that traps a person — empty the
    // words, then untick the last channel — and reads the rail back.
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })
    expect(lockState(container)).toEqual(['false', 'false', 'false'])

    fireEvent.change(screen.getByLabelText('Your post'), { target: { value: '' } })

    fireEvent.click(railButton(container, 2))
    const tile = container.querySelector('[data-channel-tile="x"]')
    expect(tile).not.toBeNull()
    fireEvent.click(tile as HTMLElement)

    await waitFor(() => expect(lockState(container)).toEqual(['false', 'false', 'false']))
  })
})

describe('what each row actually opens', () => {
  test('the screen opens on the words, whatever the post already holds', () => {
    // A writer opening a finished draft is here to read it. Landing them on a
    // schedule picker answers a question they did not ask.
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })

    expect(shown(container)).toBe('1')
    expect(screen.getByLabelText('Your post')).toBeVisible()
  })

  test('the second row opens every platform’s version at once, not a tab strip', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x', 'linkedin'] })
    fireEvent.click(railButton(container, 2))

    expect(shown(container)).toBe('2')
    // BOTH cards, together. Showing one platform at a time is the single thing
    // this product must never do: the whole point is that the reader sees what
    // each platform is getting side by side.
    expect(container.querySelector('[data-version-card="x"]')).not.toBeNull()
    expect(container.querySelector('[data-version-card="linkedin"]')).not.toBeNull()
  })

  test('the third row opens the send panel', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })
    fireEvent.click(railButton(container, 3))

    expect(shown(container)).toBe('3')
    expect(screen.getByRole('heading', { name: /^send it$/i })).toBeVisible()
  })

  test('a locked row refuses the click rather than moving the screen', () => {
    const container = composer()

    fireEvent.click(railButton(container, 2))
    fireEvent.click(railButton(container, 3))

    // Still on the words, because neither of those has been earned. A rail that
    // moved anyway would make the padlock decoration.
    expect(shown(container)).toBe('1')
  })

  test('each row carries the part it is supposed to carry', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })

    // ── WHY THE TITLES ARE PINNED AND NOT JUST THE ORDER ────────────────────
    // Swapping two titles leaves every lock in the right place and the screen
    // telling people to send a post at part two. The title is the only part of
    // a row most readers ever act on.
    const titles = [1, 2, 3].map((index) =>
      container
        .querySelector(`[data-rail-step="${index}"] button`)
        ?.textContent?.replace(String(index), '')
        .trim(),
    )

    expect(titles[0]).toMatch(/^Write your post/)
    expect(titles[1]).toMatch(/^Each platform/)
    expect(titles[2]).toMatch(/^Send it/)
  })

  test('the send panel is announced once, not twice', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })
    fireEvent.click(railButton(container, 3))

    // The panel names itself. The rail row beside it is navigation, not a
    // heading, so there is exactly one heading with this name on the screen.
    expect(screen.getAllByRole('heading', { name: /^send it$/i })).toHaveLength(1)
  })

  test('the send panel still has a name a screen reader can read out', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })
    fireEvent.click(railButton(container, 3))

    const panel = container.querySelector('section#finish')
    const labelledBy = panel?.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(container.querySelector(`#${labelledBy}`)?.textContent).toMatch(/send it/i)
  })
})

describe('the platforms listed under the second row', () => {
  test('a channel on the post is listed, and pointing at it opens that part', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x', 'linkedin'] })

    const row = container.querySelector('[data-rail-channel="linkedin"]')
    expect(row).not.toBeNull()
    expect(row?.textContent).toMatch(/linkedin/i)

    fireEvent.click(row as HTMLElement)
    expect(shown(container)).toBe('2')
  })

  test('a post with no channels lists none', () => {
    const container = composer({ body: 'Fresh bread.' })
    expect(container.querySelector('[data-rail-channel]')).toBeNull()
  })
})

describe('a blank post is never sent somewhere it cannot go', () => {
  test('it is not told to pick a channel in a part that refuses clicks', () => {
    composer()

    // ── NO IMPOSSIBLE REMEDY ────────────────────────────────────────────────
    // The versions pane has its own empty state. It used to read "pick a
    // channel in step 2" unconditionally, which on a blank post points at a row
    // that will not open — a remedy that cannot work is worse than no remedy,
    // because the reader tries it.
    expect(screen.queryByText(/pick a channel in step 2/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/write your post first/i).length).toBeGreaterThan(0)
  })

  test('once there are words, the part that was refused is the one it points at', () => {
    const container = composer({ body: 'Fresh bread every morning.' })
    fireEvent.click(railButton(container, 2))

    expect(screen.getByText(/pick a channel in step 2/i)).toBeVisible()
  })
})
