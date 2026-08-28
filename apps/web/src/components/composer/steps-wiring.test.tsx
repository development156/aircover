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
/**
 * `savePost` RESOLVES HERE, and that is load-bearing rather than tidy.
 *
 * A bare `vi.fn()` resolves to `undefined`, and `use-autosave` reads `.ok` off
 * the result — so the save path throws, the bar's Save button never reaches its
 * second half, and any test of what happens AFTER a save passes or fails for
 * reasons that have nothing to do with its subject.
 */
vi.mock('@/app/actions/posts', () => ({
  createPost: vi.fn(async () => ({ ok: true, id: 'p1', updatedAt: '2026-08-28T00:00:01.000Z' })),
  savePost: vi.fn(async () => ({ ok: true, updatedAt: '2026-08-28T00:00:01.000Z' })),
  saveVariant: vi.fn(async () => ({ ok: true, version: 1 })),
  setVariantFormat: vi.fn(async () => ({ ok: true })),
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

describe('each part holds its own contents and nobody else’s', () => {
  /**
   * ── WHY THIS IS NOT COVERED BY "THE SECOND ROW OPENS THE VERSIONS" ─────────
   * Those tests say a part CONTAINS what it should. Nothing said a part does
   * not also contain the other two, and an adversarial pass proved it: rendering
   * the writing box on part two as well, or the send panel on part two as well,
   * left the whole suite green. A screen showing all three at once is the exact
   * thing the founder's ruling replaced.
   */
  const WRITING = 'Your post'
  const versionCards = (c: HTMLElement) => c.querySelectorAll('[data-version-card]').length
  const sendPanel = (c: HTMLElement) => c.querySelector('section#finish')

  test('the words, and nothing from the other two', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })

    expect(screen.getByLabelText(WRITING)).toBeVisible()
    expect(versionCards(container)).toBe(0)
    expect(container.querySelector('[data-channel-tile]')).toBeNull()
    expect(sendPanel(container)).toBeNull()
  })

  test('each platform, and nothing from the other two', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })
    fireEvent.click(railButton(container, 2))

    expect(versionCards(container)).toBe(1)
    expect(container.querySelector('[data-channel-tile]')).not.toBeNull()
    expect(screen.queryByLabelText(WRITING)).not.toBeInTheDocument()
    expect(sendPanel(container)).toBeNull()
  })

  test('sending, and nothing from the other two', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })
    fireEvent.click(railButton(container, 3))

    expect(sendPanel(container)).not.toBeNull()
    expect(screen.queryByLabelText(WRITING)).not.toBeInTheDocument()
    expect(versionCards(container)).toBe(0)
  })

  test('the panel is a named region, and the row that opened it is the name', () => {
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })
    fireEvent.click(railButton(container, 2))

    // Without this a screen-reader user presses a row and is told nothing at
    // all: `aria-current` is the only signal and it is back in the rail.
    const panel = container.querySelector('#composer-panel')
    expect(panel?.getAttribute('role')).toBe('region')
    expect(panel?.getAttribute('aria-labelledby')).toBe('rail-step-2')
    expect(container.querySelector('#rail-step-2')?.textContent).toMatch(/each platform/i)
  })
})

describe('the bar’s Save takes the reader to the send panel', () => {
  test('every press, even when the address already says finish', async () => {
    // ── THE WIRING, NOT THE BUTTON ──────────────────────────────────────────
    // `commit-bar.test.tsx` proves the BAR asks. Nothing proved the composer
    // listens: dropping `onFinish` from the call site left the whole suite
    // green, which an adversarial pass found by doing exactly that. This is the
    // only test that presses the real button on the real screen.
    //
    // The address is set to `#finish` first ON PURPOSE. That is the state the
    // defect lived in: assigning a hash that is already set fires no event, so
    // the second press used to save the post and move nothing.
    window.location.hash = 'finish'
    const container = composer({ body: 'Fresh bread.', channels: ['x'] })
    expect(shown(container)).toBe('3')

    fireEvent.click(railButton(container, 1))
    expect(shown(container)).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
    await waitFor(() => expect(shown(container)).toBe('3'))
    window.location.hash = ''
  })

  test('and an address alone is never a way past a lock', async () => {
    // A post with words and no platform cannot send, so a link naming the send
    // panel is refused the same as the row is. An address is a request, not an
    // exemption.
    window.location.hash = 'finish'
    const container = composer({ body: 'Fresh bread.' })

    expect(shown(container)).toBe('1')
    window.location.hash = ''
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

describe('no remedy that cannot work', () => {
  test('a blank post is told to write, and is not sent anywhere', () => {
    composer()

    // The two locked rows are the only advice a blank post gets, and both say
    // the one thing that works. Nothing points at a part that refuses clicks.
    expect(screen.getAllByText(/write your post first/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/pick a platform/i)).not.toBeInTheDocument()
  })

  test('the empty versions pane points at the picker on its own screen', () => {
    // ── THIS SENTENCE HAS BEEN WRONG TWICE, IN OPPOSITE DIRECTIONS ──────────
    // It said "above" when the picker was below, then "in step 2" when the
    // reader was standing in step 2. So the guard is not the wording: it is
    // that whatever the sentence points at is ON THIS SCREEN and usable. The
    // picker is asserted here as an actual element in the same panel.
    const container = composer({ body: 'Fresh bread every morning.' })
    fireEvent.click(railButton(container, 2))

    const panel = container.querySelector('#composer-panel') as HTMLElement
    expect(panel.textContent).toMatch(/pick a platform above/i)
    expect(panel.querySelector('[data-channel-tile]')).not.toBeNull()

    // And it is genuinely above: the picker comes before the pane in the
    // document, which is what "above" means to the reader being advised.
    const tile = panel.querySelector('[data-channel-tile]') as Node
    const sentence = [...panel.querySelectorAll('p')].find((el) =>
      /pick a platform above/i.test(el.textContent ?? ''),
    ) as Node
    expect(tile.compareDocumentPosition(sentence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
