import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { StudioWorkbench } from '@/components/studio/studio-workbench'
import { generatableFormats } from '@/lib/studio/formats'
import { MAX_REFERENCES } from '@/lib/studio/modes'

/**
 * THE WORKBENCH, AND THE RULES IT MUST NOT RE-IMPLEMENT.
 *
 * Every assertion below is about a rule that lives in `modes.ts` and is asked by
 * BOTH this screen and the server action. A screen that offered a mode the
 * action refuses wastes a press; one that hid a mode the action allows costs a
 * feature. These tests are what makes "one module, asked by both" mean anything.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/actions/studio', () => ({ queueGeneration: vi.fn() }))

afterEach(cleanup)

const LIBRARY = [
  { assetId: 'a1', url: 'https://example.test/1.png', title: 'A shopfront' },
  { assetId: 'a2', url: 'https://example.test/2.png', title: null },
  { assetId: 'a3', url: null, title: 'No preview' },
  { assetId: 'a4', url: 'https://example.test/4.png', title: null },
]

const open = (library = LIBRARY) =>
  render(<StudioWorkbench formats={generatableFormats()} cost={6} library={library} />)

describe('the modes on offer', () => {
  test('offers the three that work and not the one that cannot be made honestly', () => {
    open()
    expect(screen.getByRole('button', { name: /on brand/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /explore/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /match a picture/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /a set that matches/i })).toBeNull()
  })

  test('on brand is chosen to begin with, because it is the one that uses the brand', () => {
    open()
    expect(screen.getByRole('button', { name: /on brand/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

describe('the canvas', () => {
  /**
   * An empty rectangle reads as something that failed to load. The canvas is
   * always saying which of three things is true.
   */
  test('says what will appear there before anything has been made', () => {
    open()
    expect(screen.getByText(/your picture appears here/i)).toBeTruthy()
  })

  /**
   * THE SHAPE IS THE JUDGEMENT. A story is 1080 by 1920 and a link card is 1200
   * by 628, and the same picture is a different picture in each. A canvas that
   * held one fixed shape would show every result cropped or letterboxed against
   * something it is not, which is worse than showing nothing: it would be a
   * wrong preview of a thing somebody just paid for.
   *
   * Asserted as the CHOSEN format's own numbers rather than a shape like
   * `\d+ / \d+`, because a canvas pinned to `1 / 1` satisfies that shape and
   * fails the claim. MEASURED: pinning it green-lit this test before this
   * rewrite.
   */
  test('is sized to the chosen format, not to a fixed shape', () => {
    const first = generatableFormats()[0]!
    const { container } = open()
    const canvas = container.querySelector('[data-guide="studio-canvas"]') as HTMLElement | null
    expect(canvas).not.toBeNull()
    expect(canvas!.style.aspectRatio).toBe(`${first.width} / ${first.height}`)
  })

  test('changing the size changes the canvas, so the shape follows the choice', async () => {
    const user = userEvent.setup()
    const story = generatableFormats().find((f) => f.width !== f.height)
    expect(story, 'no format with a non-square shape to switch to').toBeTruthy()

    const { container } = open()
    const canvas = container.querySelector('[data-guide="studio-canvas"]') as HTMLElement
    const before = canvas.style.aspectRatio

    await user.selectOptions(screen.getByLabelText(/what size/i), story!.id)

    expect(canvas.style.aspectRatio).toBe(`${story!.width} / ${story!.height}`)
    expect(canvas.style.aspectRatio).not.toBe(before)
  })
})

describe('matching a picture', () => {
  test('the picker is hidden for a mode that ignores references', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: /explore/i }))
    expect(screen.queryByText(/which picture should Sahoda match/i)).toBeNull()
    expect(screen.queryByText(/anything Sahoda should match/i)).toBeNull()
  })

  test('matching asks for a picture before it will run', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: /match a picture/i }))
    expect(screen.getByRole('status').textContent).toMatch(/pick one picture/i)
    expect(screen.getByRole('button', { name: /make this picture/i })).toBeDisabled()
  })

  test('picking one clears the block', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: /match a picture/i }))
    await user.type(screen.getByPlaceholderText(/plate of fresh samosas/i), 'a cup of chai')
    await user.click(screen.getAllByRole('button', { pressed: false })[3]!)
    expect(screen.queryByText(/pick one picture/i)).toBeNull()
  })

  /**
   * MEASURED per model at OpenRouter's capability endpoint: three on the model
   * this product routes to. A fourth would be silently dropped by some
   * providers, which is a defect nobody reports.
   */
  test('the selection cannot grow past what the model will look at', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.click(screen.getByRole('button', { name: /match a picture/i }))

    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    const thumbs = within(picker).getAllByRole('button')
    for (const thumb of thumbs) await user.click(thumb)

    const pressed = within(picker)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(MAX_REFERENCES)
  })

  test('switching to a mode that ignores references clears them, rather than leaving a contradiction', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.click(screen.getByRole('button', { name: /match a picture/i }))
    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    await user.click(within(picker).getAllByRole('button')[0]!)

    await user.click(screen.getByRole('button', { name: /explore/i }))
    await user.click(screen.getByRole('button', { name: /match a picture/i }))
    expect(screen.getByRole('status').textContent).toMatch(/pick one picture/i)
  })

  /**
   * A picture whose preview link would not sign still EXISTS and can still be
   * matched. Dropping it would lose somebody a picture they own.
   */
  test('a picture with no preview is still offered, not hidden', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.click(screen.getByRole('button', { name: /match a picture/i }))
    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    expect(within(picker).getAllByRole('button')).toHaveLength(LIBRARY.length)
    expect(within(picker).getByText(/no preview/i)).toBeTruthy()
  })

  test('an empty library says how to fill it rather than showing nothing', async () => {
    const user = userEvent.setup()
    open([])
    await user.click(screen.getByRole('button', { name: /match a picture/i }))
    expect(screen.getByText(/you have no pictures yet/i)).toBeTruthy()
  })
})

describe('before any spend', () => {
  test('the price is named, from the pricing file rather than a literal', () => {
    open()
    expect(document.body.textContent).toMatch(/6\s*credits/)
  })

  test('the button waits for a description, because an empty prompt cannot be drawn', async () => {
    const user = userEvent.setup()
    open()
    const button = screen.getByRole('button', { name: /make this picture/i })
    expect(button).toBeDisabled()
    await user.type(screen.getByPlaceholderText(/plate of fresh samosas/i), 'a shopfront')
    expect(button).toBeEnabled()
  })
})
