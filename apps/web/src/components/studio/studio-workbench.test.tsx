import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { StudioWorkbench } from '@/components/studio/studio-workbench'
import { generatableFormats } from '@/lib/studio/formats'
import {
  MAX_REFERENCES,
  MAX_TRIES_PER_PRESS,
  describeModeBlock,
  promptHintFor,
  readyModes,
} from '@/lib/studio/modes'

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

const MADE = [
  {
    imageId: 'p1',
    url: 'https://example.test/made-1.png',
    width: 1080,
    height: 1080,
    prompt: 'a plate of samosas',
    formatId: 'square',
    mime: 'image/png',
  },
  {
    imageId: 'p2',
    url: 'https://example.test/made-2.png',
    width: 1080,
    height: 1920,
    prompt: 'the shopfront at dawn',
    formatId: 'story',
    mime: 'image/webp',
  },
]

const open = (library = LIBRARY, pictures: typeof MADE = []) =>
  render(
    <StudioWorkbench
      formats={generatableFormats()}
      cost={6}
      library={library}
      pictures={pictures}
    />,
  )

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

describe('the canvas draws the picture, not a description of one', () => {
  /**
   * THE POINT OF THE SCREEN. Somebody spends credits and then has to decide
   * whether to use what came back. A line of text saying "made" is a receipt,
   * not a delivered feature: the decision needs the picture, at its real shape.
   */
  test('shows the newest picture this workspace has made', () => {
    open(LIBRARY, MADE)
    const shown = screen.getByAltText('a plate of samosas')
    expect(shown.getAttribute('src')).toBe('https://example.test/made-1.png')
  })

  test('says what will appear only while there is nothing to show', () => {
    open(LIBRARY, MADE)
    expect(screen.queryByText(/your picture appears here/i)).toBeNull()
  })

  test('the strip carries every picture, so one can be judged against the last', () => {
    const { container } = open(LIBRARY, MADE)
    const strip = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    expect(within(strip).getAllByRole('button')).toHaveLength(MADE.length)
  })

  test('clicking an older one puts it on the canvas', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY, MADE)
    const strip = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    await user.click(within(strip).getAllByRole('button')[1]!)

    const canvas = container.querySelector('[data-guide="studio-canvas"]') as HTMLElement
    expect(within(canvas).getByAltText('the shopfront at dawn')).toBeTruthy()
  })

  test('with nothing made, there is no strip to scroll rather than an empty one', () => {
    const { container } = open(LIBRARY, [])
    expect(container.querySelector('[data-guide="studio-strip"]')).toBeNull()
    expect(screen.getByText(/your picture appears here/i)).toBeTruthy()
  })

  /**
   * The picture is a control, not decoration: judging a photograph at 400 pixels
   * wide is not judging it. Both the canvas and the header offer the way in, so
   * neither a mouse habit nor a keyboard one has to be learned.
   */
  test('the picture opens large, and the way in is reachable by name', () => {
    open(LIBRARY, MADE)
    expect(screen.getByRole('button', { name: /open it large/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open "a plate of samosas" large/i })).toBeTruthy()
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
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a cup of chai')
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

describe('a press that changes nothing must say why', () => {
  /**
   * THE DEFECT THIS TEST EXISTS FOR. Clicking a fifth picture used to be
   * silently dropped: the tile did not select, nothing moved, nothing was said.
   * A control that ignores a press without explaining is worse than a refusal,
   * because the person cannot tell whether they missed the target or the app is
   * broken.
   */
  test('a pick beyond the limit is explained rather than ignored', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.click(screen.getByRole('button', { name: /match a picture/i }))

    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    const thumbs = within(picker).getAllByRole('button')
    for (const thumb of thumbs) await user.click(thumb)

    expect(screen.getByRole('alert').textContent).toMatch(/3 pictures at once/i)
  })

  test('the sentence is the one the action would refuse with, not a second wording', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.click(screen.getByRole('button', { name: /change a picture/i }))

    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    const thumbs = within(picker).getAllByRole('button')
    await user.click(thumbs[0]!)
    await user.click(thumbs[1]!)

    // Trimmed: the paragraph carries a trailing space before the top-up link
    // slot. The CLAIM is the sentence, and it must be the module's, character
    // for character, not a second wording the screen invented.
    expect(screen.getByRole('alert').textContent?.trim()).toBe(
      describeModeBlock({ mode: 'edit', references: 2 }),
    )
  })
})

describe('the box says what to type for the mode that is chosen', () => {
  /**
   * The mode buttons change what the box is FOR. One fixed sentence answers the
   * first mode and misleads the rest, and the cost is somebody typing the wrong
   * kind of prompt and paying for the result.
   */
  test('the hint changes with the mode', async () => {
    const user = userEvent.setup()
    open()
    const box = screen.getByLabelText(/what should the picture show/i)
    const first = box.getAttribute('placeholder')

    await user.click(screen.getByRole('button', { name: /explore/i }))
    expect(box.getAttribute('placeholder')).not.toBe(first)

    await user.click(screen.getByRole('button', { name: /change a picture/i }))
    expect(box.getAttribute('placeholder')).toMatch(/background/i)
  })

  test('every mode on offer has its own hint', () => {
    const hints = readyModes().map((rule) => promptHintFor(rule.mode))
    expect(new Set(hints).size).toBe(hints.length)
  })
})

describe('asking for more than one', () => {
  /**
   * THE MONEY SENTENCE. Somebody who chose four options and was shown the price
   * of one has not been told what this press costs. The total is what leaves
   * their wallet, so the total is what the screen names.
   */
  test('the price shown is the TOTAL for the press, not the unit price', async () => {
    const user = userEvent.setup()
    const { container } = open()
    const counts = container.querySelector('[data-guide="studio-count"]') as HTMLElement
    await user.click(within(counts).getByRole('button', { name: '4' }))
    expect(document.body.textContent).toMatch(/24\s*credits/)
  })

  /**
   * The routed model draws one picture per call, so four are four calls and
   * will NOT match. Saying otherwise would promise a carousel, which is the
   * thing `MODE_RULES` refuses to fake.
   */
  test('says plainly that the options will not match each other', async () => {
    const user = userEvent.setup()
    const { container } = open()
    const counts = container.querySelector('[data-guide="studio-count"]') as HTMLElement
    await user.click(within(counts).getByRole('button', { name: '3' }))
    expect(screen.getByText(/will not match each other/i)).toBeTruthy()
  })

  test('one is chosen to begin with, and says nothing extra about matching', () => {
    const { container } = open()
    const counts = container.querySelector('[data-guide="studio-count"]') as HTMLElement
    expect(within(counts).getByRole('button', { name: '1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.queryByText(/will not match each other/i)).toBeNull()
  })

  test('the choice stops at the bound the action enforces', () => {
    const { container } = open()
    const counts = container.querySelector('[data-guide="studio-count"]') as HTMLElement
    expect(within(counts).getAllByRole('button')).toHaveLength(MAX_TRIES_PER_PRESS)
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
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    expect(button).toBeEnabled()
  })
})
