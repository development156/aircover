import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { BrandSignal } from '@sahoda/shared'

import { queueGeneration, startPostFromPicture } from '@/app/actions/studio'
import { StudioWorkbench } from '@/components/studio/studio-workbench'
import type { CanvasPicture } from '@/lib/studio/canvas'
import { stampNote } from '@/lib/studio/stamp-copy'
import { generatableFormats } from '@/lib/studio/formats'
import { routedModels, unroutedModels } from '@/lib/studio/models'
import { uploadAccept } from '@/lib/studio/upload'
import {
  MAX_TRIES_PER_PRESS,
  describeModeBlock,
  promptHintFor,
  readyModes,
  ruleFor,
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
vi.mock('@/app/actions/studio', () => ({
  queueGeneration: vi.fn(),
  startPostFromPicture: vi.fn(),
}))
vi.mock('@/app/actions/assets', () => ({ uploadAsset: vi.fn() }))

afterEach(cleanup)

/**
 * Deliberately LARGER than any model's reference ceiling.
 *
 * It held four, which was more than the old cap of three. The models now take up
 * to sixteen, so a four-picture library could not reach any cap and the tests
 * that exercise the limit silently stopped exercising anything. Seventeen is one
 * past the highest ceiling in the catalogue.
 */
const LIBRARY = [
  { assetId: 'a1', url: 'https://example.test/1.png', title: 'A shopfront' },
  { assetId: 'a2', url: 'https://example.test/2.png', title: null },
  { assetId: 'a3', url: null, title: 'No preview' },
  { assetId: 'a4', url: 'https://example.test/4.png', title: null },
  ...Array.from({ length: 13 }, (_unused, i) => ({
    assetId: `b${i}`,
    url: `https://example.test/b${i}.png`,
    title: null,
  })),
]

const MADE = [
  {
    imageId: 'p1',
    assetId: 'asset-1',
    url: 'https://example.test/made-1.png',
    width: 1080,
    height: 1080,
    prompt: 'a plate of samosas',
    formatId: 'square',
    mime: 'image/png',
    mode: 'on_brand' as const,
    referenceAssetIds: [],
    stampedUrl: null,
    stampOutcome: null,
    madeAgo: null,
  },
  {
    imageId: 'p2',
    assetId: 'asset-2',
    url: 'https://example.test/made-2.png',
    width: 1080,
    height: 1920,
    prompt: 'the shopfront at dawn',
    formatId: 'story',
    mime: 'image/webp',
    mode: 'match' as const,
    referenceAssetIds: ['a2'],
    stampedUrl: null,
    stampOutcome: null,
    madeAgo: null,
  },
]

const open = (
  library = LIBRARY,
  // `CanvasPicture[]`, not `typeof MADE`: the literal's inferred type pinned
  // `stampedUrl` and `stampOutcome` to null, so a stamped fixture — the whole
  // point of the result-screen tests below — could not be passed in.
  pictures: CanvasPicture[] = [],
  signals: BrandSignal[] | null = [],
  balance: number | null = null,
) =>
  render(
    <StudioWorkbench
      formats={generatableFormats()}
      cost={6}
      library={library}
      pictures={pictures}
      signals={signals}
      balance={balance}
    />,
  )

/**
 * The MODE control, not "any button on the screen whose name contains this".
 *
 * ── WHY THESE QUERIES WERE NARROWED ─────────────────────────────────────────
 * They read `modeButton(/on brand/i)` and passed for
 * as long as exactly one button carried that word. The composer's chip row now
 * SUMMARISES the chosen mode, so two do, and `getByRole` refused with "found
 * multiple elements" — correctly. The old query was ambiguous before the chip
 * existed; nothing had made the ambiguity visible.
 *
 * Scoped to the fieldset rather than made more specific by string, because the
 * thing these tests are about is the mode CONTROL. A query pinned to the exact
 * label would go green again and break the next time the copy moved.
 */
function modeButton(name: RegExp): HTMLElement {
  return within(screen.getByRole('group', { name: /how should sahoda approach it/i })).getByRole(
    'button',
    { name },
  )
}

describe('choosing which model draws it', () => {
  test('the reachable models are offered by what they are good at, never by id', () => {
    const { container } = open()
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement
    expect(picker).not.toBeNull()

    // One button per reachable model, and each label and description present.
    // Matched by TEXT rather than by accessible name: the name of a card is its
    // whole content, so a word in one model's description collides with
    // another's label and `getByRole` finds two.
    expect(within(picker).getAllByRole('button')).toHaveLength(routedModels().length)
    for (const model of routedModels()) {
      expect(picker.textContent, model.id).toContain(model.label)
      expect(picker.textContent, model.id).toContain(model.goodAt)
      // The id is for the router, never for a shop owner.
      expect(picker.textContent, model.id).not.toContain(model.id)
    }
  })

  /**
   * RETARGETED. Every model in the catalogue is reachable now, so there is no
   * "not connected" section to show. The claim that survives is the one that
   * mattered: nothing is offered that cannot be drawn. When a model is added
   * ahead of its route, `models.test.ts` covers the sentence it gets.
   */
  test('nothing is offered that cannot be drawn', () => {
    const { container } = open()
    expect(container.querySelector('[data-guide="studio-model-waiting"]')).toBeNull()
    expect(unroutedModels()).toHaveLength(0)
  })

  /**
   * THE ONE THAT MAKES THE PICKER REAL. `series` is refused because the routed
   * model draws one picture per call. That was never a fact about the mode. If
   * a model that draws a whole set does not make the mode appear, the picker is
   * decoration.
   */
  test('a matching set is refused for a model that draws one at a time', () => {
    expect(readyModes('google/gemini-3-pro-image').map((r) => r.mode)).not.toContain('series')
  })

  test('and offered for a model that draws the whole set in one call', () => {
    expect(readyModes('openai/gpt-image-1').map((r) => r.mode)).toContain('series')
    expect(readyModes('bytedance-seed/seedream-5-0-lite').map((r) => r.mode)).toContain('series')
  })

  test('the model also decides how many pictures may be matched against', () => {
    expect(ruleFor('match', 'bytedance-seed/seedream-5-0-lite').maxReferences).toBe(14)
    expect(ruleFor('match', 'openai/gpt-image-1').maxReferences).toBe(16)
  })
})

describe('the modes on offer', () => {
  /**
   * RETARGETED, and the change is the point. "A set that matches" used to be
   * absent because the only routed model drew ONE picture per call. The default
   * model now draws four in one go, so the mode is OFFERED. What still has to
   * hold is that the offer tracks the model rather than a hardcoded list, which
   * the model tests above assert from both directions.
   */
  test('offers every mode the default model can actually do', () => {
    open()
    for (const rule of readyModes()) {
      expect(modeButton(new RegExp(rule.label, 'i'))).toBeTruthy()
    }
  })

  test('on brand is chosen to begin with, because it is the one that uses the brand', () => {
    open()
    expect(modeButton(/on brand/i)).toHaveAttribute('aria-pressed', 'true')
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
  /**
   * A toolbar that appears on hover does not exist for a phone, for a keyboard,
   * or for a screen reader. Half this product's users are shop owners holding a
   * phone.
   */
  test('the actions are on the screen, not behind a hover', () => {
    const { container } = open(LIBRARY, MADE)
    const actions = container.querySelector('[data-guide="studio-picture-actions"]') as HTMLElement
    expect(actions).not.toBeNull()
    expect(within(actions).getByRole('button', { name: /save it/i })).toBeTruthy()
    expect(within(actions).getByRole('button', { name: /open it large/i })).toBeTruthy()
    expect(within(actions).getByRole('button', { name: /use these words again/i })).toBeTruthy()
  })

  test('there is nothing to act on before anything is made', () => {
    const { container } = open(LIBRARY, [])
    expect(container.querySelector('[data-guide="studio-picture-actions"]')).toBeNull()
  })

  test('the picture opens large, and the way in is reachable by name', () => {
    open(LIBRARY, MADE)
    expect(screen.getByRole('button', { name: /open it large/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open "a plate of samosas" large/i })).toBeTruthy()
  })
})

describe('matching a picture', () => {
  /**
   * RETARGETED, not deleted. This asserted that the picker was HIDDEN for a mode
   * that ignores references, on the reasoning that offering one invites a choice
   * the mode then ignores. That reasoning stopped being true when picking a
   * picture began MOVING a person to the mode that uses it: the choice is now
   * honoured. What still has to hold is that the mode never silently pretends to
   * use a reference, so the legend states what will happen instead.
   */
  test('a mode that ignores references says what picking one will do', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: /explore/i }))
    expect(screen.queryByText(/which picture should Sahoda match/i)).toBeNull()
    expect(screen.getByText(/moves you to match a picture/i)).toBeTruthy()
  })

  test('matching asks for a picture before it will run', async () => {
    const user = userEvent.setup()
    open()
    await user.click(modeButton(/match a picture/i))
    expect(screen.getByRole('status').textContent).toMatch(/pick one picture/i)
    expect(screen.getByRole('button', { name: /make this picture/i })).toBeDisabled()
  })

  test('picking one clears the block', async () => {
    const user = userEvent.setup()
    open()
    await user.click(modeButton(/match a picture/i))
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
    await user.click(modeButton(/match a picture/i))

    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    const thumbs = within(picker).getAllByRole('button')
    for (const thumb of thumbs) await user.click(thumb)

    const pressed = within(picker)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
    // The CHOSEN MODEL's ceiling, not the catalogue's outer bound.
    // `MAX_REFERENCES` is now 14 (the most any model takes) and the number a
    // person meets on the default model is 3, which is what the picker enforces.
    expect(pressed).toHaveLength(ruleFor('match').maxReferences)
  })

  test('switching to a mode that ignores references clears them, rather than leaving a contradiction', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.click(modeButton(/match a picture/i))
    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    await user.click(within(picker).getAllByRole('button')[0]!)

    await user.click(screen.getByRole('button', { name: /explore/i }))
    await user.click(modeButton(/match a picture/i))
    expect(screen.getByRole('status').textContent).toMatch(/pick one picture/i)
  })

  /**
   * A picture whose preview link would not sign still EXISTS and can still be
   * matched. Dropping it would lose somebody a picture they own.
   */
  test('a picture with no preview is still offered, not hidden', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.click(modeButton(/match a picture/i))
    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    expect(within(picker).getAllByRole('button')).toHaveLength(LIBRARY.length)
    expect(within(picker).getByText(/no preview/i)).toBeTruthy()
  })

  test('an empty library says how to fill it rather than showing nothing', async () => {
    const user = userEvent.setup()
    open([])
    await user.click(modeButton(/match a picture/i))
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
    await user.click(modeButton(/match a picture/i))

    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    const thumbs = within(picker).getAllByRole('button')
    for (const thumb of thumbs) await user.click(thumb)

    // The DEFAULT model's ceiling, read from the rule rather than typed in. It
    // was 3 when one model was routed and is 14 now; a literal here would have
    // gone stale silently, which is the defect this whole test guards against
    // in the product.
    const ceiling = ruleFor('match').maxReferences
    expect(screen.getByRole('alert').textContent).toMatch(
      new RegExp(`${ceiling} pictures at once`, 'i'),
    )
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

describe('adding a picture from this device', () => {
  /**
   * THE HOLE THIS FILLS. Matching only worked on pictures already in the
   * library, so the photograph on the phone in somebody's hand could not start
   * a generation without a trip through the library and back. Most people do
   * not come back.
   */
  test('the way in is a real file control, reachable by name', async () => {
    const user = userEvent.setup()
    open()
    await user.click(modeButton(/match a picture/i))
    expect(screen.getByLabelText(/add a picture from this device/i)).toBeTruthy()
  })

  /**
   * A real `<input type="file">` is what makes this work with a keyboard, with
   * a screen reader, and on a phone where there is nothing to drag FROM. A drop
   * target alone would be a feature only a mouse can reach.
   */
  test('it is an input, not a drop target pretending to be one', async () => {
    const user = userEvent.setup()
    open()
    await user.click(modeButton(/match a picture/i))
    const control = screen.getByLabelText(/add a picture from this device/i)
    expect(control.tagName).toBe('INPUT')
    expect(control.getAttribute('type')).toBe('file')
  })

  test('what it offers is the proven list, so it cannot drift from the server', async () => {
    const user = userEvent.setup()
    open()
    await user.click(modeButton(/match a picture/i))
    const control = screen.getByLabelText(/add a picture from this device/i)
    expect(control.getAttribute('accept')).toBe(uploadAccept())
  })

  test('the empty library points at this device rather than at a library trip', async () => {
    const user = userEvent.setup()
    open([])
    await user.click(modeButton(/match a picture/i))
    expect(screen.getByText(/add one from this device/i)).toBeTruthy()
  })
})

describe('turning a picture into a post', () => {
  /**
   * THE STEP THAT WAS LOSING PICTURES. A picture that never becomes a post is
   * the whole point of this product not happening, and the route there used to
   * be: open the composer, find the library, recognise your own picture among
   * everything else in it, attach it. Four places to stop.
   */
  test('the way in is on the picture itself, named as what it does', () => {
    open(LIBRARY, MADE)
    expect(screen.getByRole('button', { name: /use it in a post/i })).toBeTruthy()
  })

  test('it starts a post from the picture that is on the canvas', async () => {
    const user = userEvent.setup()
    vi.mocked(startPostFromPicture).mockResolvedValue({ ok: true, postId: 'post-1' })
    open(LIBRARY, MADE)
    await user.click(screen.getByRole('button', { name: /use it in a post/i }))
    expect(startPostFromPicture).toHaveBeenCalledWith(MADE[0]!.assetId)
  })

  /**
   * A refusal has to be visible where the press was, not swallowed. Somebody who
   * pressed a button and saw nothing has no way to tell whether it worked.
   */
  test('a refusal is said out loud rather than swallowed', async () => {
    const user = userEvent.setup()
    vi.mocked(startPostFromPicture).mockResolvedValue({
      ok: false,
      message: 'Sign in to start a post.',
    })
    open(LIBRARY, MADE)
    await user.click(screen.getByRole('button', { name: /use it in a post/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/sign in to start a post/i)
  })
})

describe('asking for the same thing again', () => {
  /**
   * THE FASTEST USEFUL ACTION after a picture you almost like is the same
   * request with one word changed, and that used to mean retyping the sentence
   * and re-picking every reference.
   */
  test('loads the words, the mode and the size back into the controls', async () => {
    const user = userEvent.setup()
    open(LIBRARY, MADE)
    await user.click(screen.getByRole('button', { name: /use these words again/i }))

    expect(
      (screen.getByLabelText(/what should the picture show/i) as HTMLTextAreaElement).value,
    ).toBe(MADE[0]!.prompt)
    expect(modeButton(/on brand/i)).toHaveAttribute('aria-pressed', 'true')
  })

  /**
   * It FILLS the controls and stops. Firing immediately would spend credits on a
   * press that reads as "show me what I asked for", and the whole point is to
   * change something first.
   */
  test('spends nothing, because the point is to change something first', async () => {
    const user = userEvent.setup()
    open(LIBRARY, MADE)
    await user.click(screen.getByRole('button', { name: /use these words again/i }))
    expect(queueGeneration).not.toHaveBeenCalled()
  })

  test('a picture made in match mode brings its references back with it', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY, MADE)
    const strip = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    await user.click(within(strip).getAllByRole('button')[1]!)
    await user.click(screen.getByRole('button', { name: /use these words again/i }))

    expect(modeButton(/match a picture/i)).toHaveAttribute('aria-pressed', 'true')
    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    expect(within(picker).getByRole('button', { name: /picked 1 of 1/i })).toBeTruthy()
  })
})

describe('something to try, for a box nobody knows what to put in', () => {
  /**
   * A feature nobody knows what to give stays empty. That is the Tone Setup
   * ruling, made against the Brand Brain after three documents across 33
   * workspaces, and a prompt box has the same shape.
   */
  test('starters are offered while the box is empty', () => {
    const { container } = open()
    const starters = container.querySelector('[data-guide="studio-starters"]') as HTMLElement
    expect(starters).not.toBeNull()
    expect(within(starters).getAllByRole('button').length).toBeGreaterThan(2)
  })

  test('pressing one FILLS the box rather than spending anything', async () => {
    const user = userEvent.setup()
    const { container } = open()
    const starters = container.querySelector('[data-guide="studio-starters"]') as HTMLElement
    const first = within(starters).getAllByRole('button')[0]!
    const words = first.textContent
    await user.click(first)

    expect(
      (screen.getByLabelText(/what should the picture show/i) as HTMLTextAreaElement).value,
    ).toBe(words)
    expect(queueGeneration).not.toHaveBeenCalled()
  })

  test('they get out of the way once there is something to edit', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    expect(container.querySelector('[data-guide="studio-starters"]')).toBeNull()
  })
})

describe('picking a picture in a mode that ignores one', () => {
  /**
   * Explore uses no reference by definition, so a person who picks one has said
   * something the mode cannot honour. Refusing the press would be technically
   * correct and useless; moving them to the mode that DOES is what they meant.
   */
  test('moves to the mode that uses it, and says so', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.click(screen.getByRole('button', { name: /explore/i }))

    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    await user.click(within(picker).getAllByRole('button')[0]!)

    expect(modeButton(/match a picture/i)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('alert').textContent).toMatch(/moved you to match a picture/i)
  })

  test('the picture that was picked is the one that is now selected', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.click(screen.getByRole('button', { name: /explore/i }))
    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    await user.click(within(picker).getAllByRole('button')[1]!)

    expect(within(picker).getByRole('button', { name: /picked 1 of 1/i })).toBeTruthy()
  })
})

describe('which picture is which', () => {
  /**
   * `signReferences` sends the pictures in PICK ORDER and the first weighs most.
   * An order-free tick hides something the model acts on, so a person cannot see
   * or control it.
   */
  test('a picked reference shows its position, not just that it is picked', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.click(modeButton(/match a picture/i))
    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    const thumbs = within(picker).getAllByRole('button')

    await user.click(thumbs[1]!)
    await user.click(thumbs[0]!)

    expect(within(picker).getByText('1')).toBeTruthy()
    expect(within(picker).getByText('2')).toBeTruthy()
  })

  test('the position is announced, not only drawn', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await user.click(modeButton(/match a picture/i))
    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    await user.click(within(picker).getAllByRole('button')[0]!)

    expect(within(picker).getByRole('button', { name: /picked 1 of 1/i })).toBeTruthy()
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

describe('the composer', () => {
  /**
   * ── THE SCOPE IS THE DESIGN, NOT A COLOUR ─────────────────────────────────
   * The composer is a dark panel on a light page, and `data-surface="inverse"`
   * is the only correct way to paint one here. A hand-written dark fill would
   * look identical in a screenshot and be wrong in every token inside it:
   * `--ink` is #000000 on light, so `text-ink` would be black on near-black,
   * and `--pstrong` would be black on black at 1.23:1 the moment somebody
   * hovered the button they came to press. tokens.css's INVERSE SURFACE header
   * carries the measurements.
   *
   * This is asserted rather than left to review because the failure is
   * invisible in the theme most people develop in.
   */
  test('the composer paints itself with the inverse scope, not a hand-written fill', () => {
    const { container } = open()
    const prompt = screen.getByPlaceholderText(promptHintFor('on_brand'))
    expect(prompt.closest('[data-surface="inverse"]')).not.toBeNull()
    // And the settings sit on the same object, which is a second scope: a CSS
    // scope does not cross a sibling boundary, so the tray needs its own.
    expect(container.querySelectorAll('[data-surface="inverse"]').length).toBeGreaterThanOrEqual(2)
  })

  /**
   * The chip row is a SUMMARY of what the press will do. It reads its labels
   * from `models.ts` and `modes.ts`, the same modules the rules come from, so a
   * chip cannot name a model the picker no longer offers.
   */
  test('says which model, look, size and count this press will use', async () => {
    const user = userEvent.setup()
    const { container } = open()
    const chips = () => container.querySelector('[data-guide="studio-chips"]')!.textContent ?? ''

    // Read from `models.ts` and `modes.ts`, the modules the RULES come from, so
    // a chip cannot name a model the picker no longer offers.
    expect(chips()).toContain(routedModels()[0]!.label)
    expect(chips()).toContain(ruleFor('on_brand').label)

    // And it tracks the control rather than the first render.
    await user.click(modeButton(/explore/i))
    expect(chips()).toContain(ruleFor('explore').label)
    expect(chips()).not.toContain(ruleFor('on_brand').label)
  })

  test('the settings can be put away, and the composer stays', async () => {
    const user = userEvent.setup()
    open()
    expect(screen.getByRole('group', { name: /how should sahoda approach it/i })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /hide settings/i }))

    expect(screen.queryByRole('group', { name: /how should sahoda approach it/i })).toBeNull()
    // The thing a person came to do is still there. A composer that folded the
    // prompt away with the settings would be a screen with nothing on it.
    //
    // BY ROLE, not by placeholder: `getByPlaceholderText` finds an element that
    // is `hidden`, so the placeholder query passed against a prompt nobody
    // could see. MEASURED — adding `hidden={!settingsOpen}` to the Textarea
    // left this test green until the query moved. `getByRole` excludes what is
    // hidden from the accessibility tree, which is the thing being claimed.
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button', { name: /make this picture/i })).toBeTruthy()
  })
})

describe('what Sahoda will send, shown before the spend', () => {
  const SIGNALS: BrandSignal[] = [
    { field: 'voice', certainty: 'confirmed', value: 'Warm, plain-spoken, never salesy' },
    { field: 'palette', certainty: 'guessed', value: 'Warm cream, deep brown, one orange' },
  ]

  test('names each signal, and marks which ones were guessed', () => {
    open(LIBRARY, [], SIGNALS)

    expect(screen.getByText('Warm, plain-spoken, never salesy')).toBeTruthy()
    expect(screen.getByText('Warm cream, deep brown, one orange')).toBeTruthy()
    // The certainty is carried for a screen reader too, not by a dot alone.
    expect(screen.getByText(/which Sahoda guessed/i)).toBeTruthy()
    expect(screen.getByText(/which you confirmed/i)).toBeTruthy()
  })

  /**
   * ── THREE STATES, NEVER TWO ───────────────────────────────────────────────
   * `BrandSignalsSchema`'s own header forbids collapsing these: an empty array
   * means the Brand Brain had nothing to add, which a person can act on; null
   * means the read failed, which they cannot. A screen that said "no brand
   * signals" for both would tell somebody their brain was empty when it was
   * unreadable.
   */
  test('an empty Brand Brain and an unreadable one are different sentences', () => {
    open(LIBRARY, [], [])
    const empty = screen.getByText(/nothing from your brand brain/i).textContent ?? ''
    expect(empty).toMatch(/fill it in/i)
    cleanup()

    open(LIBRARY, [], null)
    const unread = screen.getByText(/could not read your brand brain/i).textContent ?? ''
    // It must not claim the brain is empty, and it must not offer filling it in
    // as the remedy for a read that failed.
    expect(unread).not.toMatch(/nothing from your brand brain/i)
    expect(screen.queryByText(/fill it in/i)).toBeNull()
  })
})

describe('the result screen: which version, and why there is only one', () => {
  const stamped = {
    imageId: 'p9',
    assetId: 'asset-9',
    url: 'https://example.test/original.png',
    width: 1080,
    height: 1080,
    prompt: 'a plate of samosas',
    formatId: 'square',
    mime: 'image/png',
    mode: 'on_brand' as const,
    referenceAssetIds: [],
    stampedUrl: 'https://example.test/stamped.png',
    stampOutcome: 'stamped' as const,
    madeAgo: null,
  }

  test('shows the stamped version first, because that is the one they will post', () => {
    open(LIBRARY, [stamped])
    expect(screen.getByAltText(/with your logo/i)).toHaveAttribute('src', stamped.stampedUrl)
  })

  test('the original is one press away, and nothing is deleted to get to it', async () => {
    const user = userEvent.setup()
    open(LIBRARY, [stamped])

    await user.click(screen.getByRole('button', { name: /without it/i }))

    expect(screen.getByAltText(stamped.prompt)).toHaveAttribute('src', stamped.url)
    expect(screen.getByText(/does not delete the other/i)).toBeTruthy()
  })

  /**
   * ── A TOGGLE OVER ONE PICTURE IS A CONTROL THAT DOES NOTHING ──────────────
   * Same defect class as a remedy that leads nowhere. Every answer but
   * `stamped` has exactly one picture, so the control is absent rather than
   * present-and-inert.
   */
  test.each([['no_logo'], ['logo_unreadable'], ['failed']] as const)(
    'offers no choice when the outcome is %s',
    (outcome) => {
      open(LIBRARY, [{ ...stamped, stampedUrl: null, stampOutcome: outcome }])
      expect(screen.queryByRole('button', { name: /without it/i })).toBeNull()
    },
  )

  test('offers no choice when a stamped copy exists but its link would not sign', () => {
    // The outcome says stamped and there is no URL to show. Offering the toggle
    // would put a control on screen with nothing behind half of it.
    open(LIBRARY, [{ ...stamped, stampedUrl: null }])
    expect(screen.queryByRole('button', { name: /without it/i })).toBeNull()
  })

  test('asks stamp-copy for the sentence rather than writing its own', () => {
    for (const outcome of [null, 'no_logo', 'logo_unreadable', 'failed', 'stamped'] as const) {
      cleanup()
      open(LIBRARY, [{ ...stamped, stampOutcome: outcome }])
      const note = stampNote(outcome)
      expect(screen.getByText(note.title), String(outcome)).toBeTruthy()
      expect(screen.getByText(note.body), String(outcome)).toBeTruthy()
    }
  })

  test('a picture made before stamping is not reported as a failure', () => {
    open(LIBRARY, [{ ...stamped, stampedUrl: null, stampOutcome: null }])
    expect(screen.getByText(/nothing went wrong/i)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /add your logo/i })).toBeNull()
  })

  test('the one remedy that exists is offered, and only where it works', () => {
    open(LIBRARY, [{ ...stamped, stampedUrl: null, stampOutcome: 'no_logo' }])
    expect(screen.getByRole('link', { name: /add your logo/i })).toBeTruthy()
    cleanup()

    open(LIBRARY, [{ ...stamped, stampedUrl: null, stampOutcome: 'failed' }])
    expect(screen.queryByRole('link', { name: /add your logo|replace your logo/i })).toBeNull()
  })
})

describe('the rest of the composer the design asked for', () => {
  test('shows the balance when it was read, and nothing at all when it was not', () => {
    open(LIBRARY, [], [], 1240)
    expect(screen.getByText(/credits left/i).textContent).toMatch(/1,240/)
    cleanup()

    // NULL IS NOT ZERO. `readBalance` answers three ways and only one is a
    // number; rendering "0 credits left" for a read that FAILED would tell
    // somebody with a full wallet they cannot afford to work.
    open(LIBRARY, [], [], null)
    expect(screen.queryByText(/credits left/i)).toBeNull()
    expect(screen.queryByText(/\b0\b/)).toBeNull()
  })

  test('names the controls that are designed and not built, as text not buttons', () => {
    open()
    for (const title of ['Leave out', 'Same again', 'Follow how closely', 'Tidy my words']) {
      expect(screen.getByText(title), title).toBeTruthy()
      // A disabled button is still announced as an action a reader could take,
      // which `design-lint.mjs` rule 3 refuses outright. These are spans.
      expect(screen.queryByRole('button', { name: title }), title).toBeNull()
    }
    expect(screen.getByText(/nothing here changes what a press does today/i)).toBeTruthy()
  })

  test('a picture can be added without leaving the composer', async () => {
    const user = userEvent.setup()
    open()
    // Two upload controls exist and they carry DIFFERENT names, so a screen
    // reader — and this query — can say which is which.
    const inComposer = screen.getByLabelText(/add a picture to match/i)
    const inSettings = screen.getByLabelText(/add a picture from this device/i)
    expect(inComposer).not.toBe(inSettings)
    expect(inComposer.getAttribute('accept')).toBe(uploadAccept())
    await user.click(screen.getByRole('button', { name: /hide settings/i }))
    // The composer's route survives the settings being put away; the other does
    // not, which is the whole reason the composer has one.
    expect(screen.getByLabelText(/add a picture to match/i)).toBeTruthy()
    expect(screen.queryByLabelText(/add a picture from this device/i)).toBeNull()
  })

  test('every earlier picture carries the two facts that tell it from the others', () => {
    const made = [
      { ...MADE[0]!, formatId: 'square', madeAgo: '2 h ago', stampedUrl: null, stampOutcome: null },
      {
        ...MADE[1]!,
        formatId: 'story',
        madeAgo: '3 days ago',
        stampedUrl: null,
        stampOutcome: null,
      },
    ]
    open(LIBRARY, made)

    expect(screen.getByText(/square · 2 h ago/i)).toBeTruthy()
    expect(screen.getByText(/story · 3 days ago/i)).toBeTruthy()
  })

  test('a picture whose age would not parse still shows its shape', () => {
    // `madeAgo` is null when the row's timestamp will not parse. The caption
    // carries what it has rather than inventing a time.
    open(LIBRARY, [{ ...MADE[0]!, formatId: 'square', madeAgo: null }])
    expect(screen.getByText('square')).toBeTruthy()
  })

  test('the earlier strip shows the stamped version where there is one', () => {
    open(LIBRARY, [
      { ...MADE[0]!, stampedUrl: 'https://example.test/stamped.png', stampOutcome: 'stamped' },
    ])
    // What they would post is what the thumbnail should show.
    const thumb = screen.getAllByRole('button', { name: MADE[0]!.prompt })[0]!
    expect(thumb.querySelector('img')!.getAttribute('src')).toBe('https://example.test/stamped.png')
  })
})

describe('control over the logo Sahoda stamps', () => {
  async function press(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    await user.click(screen.getByRole('button', { name: /make this picture/i }))
  }

  test("a press with nothing touched sends exactly today's default: on, bottom right, medium", async () => {
    vi.mocked(queueGeneration).mockResolvedValue({
      ok: true,
      generationId: 'g1',
      balanceAfter: 5,
      made: 1,
      asked: 1,
    })
    const user = userEvent.setup()
    open()
    await press(user)

    expect(queueGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        stamp: { enabled: true, anchor: 'bottom-right', sizeStep: 'medium' },
      }),
    )
  })

  test('turning the stamp off is what the next press carries', async () => {
    vi.mocked(queueGeneration).mockResolvedValue({
      ok: true,
      generationId: 'g1',
      balanceAfter: 5,
      made: 1,
      asked: 1,
    })
    const user = userEvent.setup()
    const { container } = open()
    const logoFieldset = container.querySelector('[data-guide="studio-logo"]') as HTMLElement
    await user.click(within(logoFieldset).getByRole('button', { name: /leave it off/i }))
    await press(user)

    expect(queueGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        stamp: expect.objectContaining({ enabled: false }),
      }),
    )
  })

  test('picking a corner and a size step is what the next press carries', async () => {
    vi.mocked(queueGeneration).mockResolvedValue({
      ok: true,
      generationId: 'g1',
      balanceAfter: 5,
      made: 1,
      asked: 1,
    })
    const user = userEvent.setup()
    const { container } = open()
    const corner = container.querySelector('[data-guide="studio-logo-corner"]') as HTMLElement
    const size = container.querySelector('[data-guide="studio-logo-size"]') as HTMLElement
    await user.click(within(corner).getByRole('button', { name: /top left/i }))
    await user.click(within(size).getByRole('button', { name: /large/i }))
    await press(user)

    expect(queueGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        stamp: { enabled: true, anchor: 'top-left', sizeStep: 'large' },
      }),
    )
  })

  test('the corner and size controls are disabled once the stamp is off, not hidden', async () => {
    const user = userEvent.setup()
    const { container } = open()
    const logoFieldset = container.querySelector('[data-guide="studio-logo"]') as HTMLElement
    const corner = container.querySelector('[data-guide="studio-logo-corner"]') as HTMLElement
    for (const button of within(corner).getAllByRole('button')) expect(button).toBeEnabled()

    await user.click(within(logoFieldset).getByRole('button', { name: /leave it off/i }))
    for (const button of within(corner).getAllByRole('button')) expect(button).toBeDisabled()
  })
})
