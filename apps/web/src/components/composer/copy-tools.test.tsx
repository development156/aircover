import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
vi.mock('@/app/actions/posts-ai', () => ({ rewriteSelection: vi.fn(), generateVariants: vi.fn() }))
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
 * UNDO, REDO, CLEAR AND INSERT, ON THE REAL SCREEN.
 *
 * ── WHY THIS RENDERS THE WHOLE COMPOSER ──────────────────────────────────────
 * Because the thing under test is the WIRING, and every part of it lives in a
 * different file. `useTextHistory` has its own unit tests and they cover the
 * stack; what they cannot cover is whether this screen hands it the right value,
 * whether Clear reaches `use-variants`' `setBody`, whether the caret survives a
 * React re-render of a controlled textarea, and whether four channels get four
 * independent histories rather than one shared by accident.
 *
 * Every one of those is a real defect that unit tests pass through. So this
 * mounts the composer, types into it, and presses the buttons.
 */

const BODY = 'Fresh bread every morning at the shop.'

function composer(channels: readonly string[] = ['x', 'linkedin']) {
  const post = {
    id: 'p1',
    workspace_id: 'w1',
    title: 'Diwali offer',
    body: BODY,
    channels,
    status: 'draft',
    scheduled_at: null,
    origin: 'manual',
    created_at: '',
    updated_at: '',
  } as unknown as Post

  const rendered = render(
    <Composer
      post={post}
      variants={[] as PostVariant[]}
      media={[]}
      templates={{ ok: true, templates: [] } as never}
    />,
  )

  // ── THE VERSION CARDS LIVE IN PART TWO NOW ──────────────────────────────────
  // The composer became a Meta-style map: the three parts of a post listed down
  // the side, the one being worked on filling the screen. Everything this file
  // is about — each channel's own box, its own undo history, its own emoji
  // panel — is inside "Each platform", so the fixture goes there. The rail row
  // is a real button and this is a real click, so the journey under test is the
  // one a writer takes.
  fireEvent.click(rendered.container.querySelector('[data-rail-step="2"] button') as HTMLElement)
  return rendered
}

function editor(channel: 'X' | 'LinkedIn'): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: `${channel} copy` }) as HTMLTextAreaElement
}

function press(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('every channel gets its own controls, and they say which channel', () => {
  test('two channels means two Clears, two Undos and two Redos, all distinguishable', () => {
    composer()

    // If any of these had a shared name, `getByRole` would throw on the
    // duplicate — which is exactly the failure a screen-reader user hits.
    for (const target of ['X copy', 'LinkedIn copy']) {
      expect(screen.getByRole('button', { name: `Clear ${target}` })).toBeTruthy()
      expect(screen.getByRole('button', { name: `Undo the last change to ${target}` })).toBeTruthy()
      expect(
        screen.getByRole('button', { name: `Redo the last undone change to ${target}` }),
      ).toBeTruthy()
    }
    // And the post's own box has its own set, named for it rather than a
    // channel. It is in part ONE — the words themselves — so the fixture goes
    // back there to look, which is also the claim that the two sets are
    // genuinely separate rather than one set rendered twice.
    fireEvent.click(document.querySelector('[data-rail-step="1"] button') as HTMLElement)
    expect(screen.getByRole('button', { name: 'Clear your post' })).toBeTruthy()
  })

  test('nothing is offered as usable before there is anything to undo', () => {
    composer()
    expect(screen.getByRole('button', { name: 'Undo the last change to X copy' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(
      screen.getByRole('button', { name: 'Redo the last undone change to X copy' }),
    ).toHaveProperty('disabled', true)
  })

  test('Clear is not offered on a channel that is already empty', () => {
    composer()
    press('Clear X copy')
    expect(screen.getByRole('button', { name: 'Clear X copy' })).toHaveProperty('disabled', true)
  })
})

describe('Clear', () => {
  test('empties the channel it names and leaves the others holding their words', () => {
    composer()
    expect(editor('X').value).toBe(BODY)
    expect(editor('LinkedIn').value).toBe(BODY)

    press('Clear X copy')

    expect(editor('X').value).toBe('')
    // The defect this catches is one shared history or one shared handler across
    // four cards, which reads as "Clear wiped everything".
    expect(editor('LinkedIn').value).toBe(BODY)
  })

  test('and the words come back whole, which is why there is no confirm dialog', () => {
    composer()
    press('Clear X copy')
    expect(editor('X').value).toBe('')

    press('Undo the last change to X copy')

    expect(editor('X').value).toBe(BODY)
  })
})

describe('undo and redo follow the words of one channel only', () => {
  test('undoing X does not move LinkedIn', () => {
    composer()
    fireEvent.change(editor('X'), { target: { value: 'Fresh bread today only.' } })
    fireEvent.change(editor('LinkedIn'), { target: { value: 'We bake at four in the morning.' } })

    press('Undo the last change to X copy')

    expect(editor('X').value).toBe(BODY)
    expect(editor('LinkedIn').value).toBe('We bake at four in the morning.')
  })

  test('redo puts back what the undo took, and then has nothing left to do', () => {
    composer()
    fireEvent.change(editor('X'), { target: { value: 'Fresh bread today only.' } })
    press('Undo the last change to X copy')
    expect(editor('X').value).toBe(BODY)

    press('Redo the last undone change to X copy')

    expect(editor('X').value).toBe('Fresh bread today only.')
    expect(
      screen.getByRole('button', { name: 'Redo the last undone change to X copy' }),
    ).toHaveProperty('disabled', true)
  })
})

/**
 * The table itself is fetched on first open, from a chunk of its own, so that
 * 108 glyphs are not shipped to every writer who opens a post. That is why
 * every case here OPENS the picker and then awaits: a synchronous query would
 * pass today and go red the moment the split it exists to protect is real.
 */
describe('the emoji and symbol picker', () => {
  function toggle(target: string): HTMLElement {
    return screen.getByRole('button', { name: `Add an emoji or symbol to ${target}` })
  }

  // NOT named `open`. `window.open` exists in jsdom, so a helper of that name
  // that failed to be declared would resolve to it silently and every case here
  // would run against an unopened picker — which is exactly what happened once.
  async function openPicker(target: string) {
    fireEvent.click(toggle(target))
    // The first glyph to arrive proves the chunk resolved and rendered.
    await screen.findByRole('button', { name: `Insert rupee into ${target}` })
  }

  function pick(target: string, name: string) {
    fireEvent.click(screen.getByRole('button', { name: `Insert ${name} into ${target}` }))
  }

  test('ships no glyph with the route — the table arrives when the picker is opened', async () => {
    composer()
    // Nothing before the click. If this ever passes with the panel already
    // populated, the dynamic import has been turned back into a static one and
    // the composer's build budget is 9.7 kB worse than it looks.
    expect(screen.queryByRole('button', { name: 'Insert rupee into X copy' })).toBeNull()

    await openPicker('X copy')

    expect(screen.getByRole('button', { name: 'Insert rupee into X copy' })).toBeTruthy()
  })

  test('the toggle says whether the panel is open, and names its panel', () => {
    composer()
    expect(toggle('X copy').getAttribute('aria-expanded')).toBe('false')
    const controls = toggle('X copy').getAttribute('aria-controls')
    expect(controls).toBeTruthy()
    // Closed, so the panel it points at is genuinely absent rather than hidden.
    expect(document.getElementById(controls as string)).toBeNull()

    fireEvent.click(toggle('X copy'))

    expect(toggle('X copy').getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(controls as string)).toBeTruthy()
  })

  test('each channel opens its own panel and leaves the others shut', async () => {
    composer()
    await openPicker('X copy')

    expect(toggle('LinkedIn copy').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Insert rupee into LinkedIn copy' })).toBeNull()
  })

  test('inserts AT THE CARET, not at the end of the box', async () => {
    composer()
    await openPicker('X copy')
    const box = editor('X')

    // "Fresh|" — six characters in, which is where a writer putting a symbol
    // beside a word actually is. Appending would be the lazy answer and it is
    // the one thing that makes the control not worth using.
    box.setSelectionRange(5, 5)
    fireEvent.select(box)

    pick('X copy', 'rupee')

    expect(editor('X').value).toBe('Fresh\u{20B9} bread every morning at the shop.')
  })

  test('replaces a selection rather than inserting beside it', async () => {
    composer()
    await openPicker('X copy')
    const box = editor('X')
    box.setSelectionRange(0, 5) // "Fresh"
    fireEvent.select(box)

    pick('X copy', 'sparkles')

    expect(editor('X').value).toBe('\u{2728} bread every morning at the shop.')
  })

  test('an insert is one undo step, and only touches its own channel', async () => {
    composer()
    await openPicker('X copy')
    const box = editor('X')
    box.setSelectionRange(5, 5)
    fireEvent.select(box)
    pick('X copy', 'rupee')

    press('Undo the last change to X copy')

    expect(editor('X').value).toBe(BODY)
    expect(editor('LinkedIn').value).toBe(BODY)
  })

  test('searching narrows to the matching names and says so when nothing matches', async () => {
    composer()
    await openPicker('X copy')
    const search = screen.getByLabelText('Search emoji and symbols for X copy')

    fireEvent.change(search, { target: { value: 'rupee' } })
    expect(screen.queryByRole('button', { name: 'Insert sparkles into X copy' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Insert rupee into X copy' })).toBeTruthy()

    fireEvent.change(search, { target: { value: 'zzz' } })
    // The claim is about THIS SET, not about emoji: the writer's own device still
    // has every one of them, and saying otherwise would be a false remedy.
    expect(screen.getByText(/device/i)).toBeTruthy()
  })
})
