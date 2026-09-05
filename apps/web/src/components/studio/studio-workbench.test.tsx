import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import type { BrandSignal } from '@sahoda/shared'

import { queueGeneration, startPostFromPicture } from '@/app/actions/studio'
import { refineStudioPrompt } from '@/app/actions/studio-prompt'
import { StudioWorkbench } from '@/components/studio/studio-workbench'
import type { CanvasPicture } from '@/lib/studio/canvas'
import { stampNote } from '@/lib/studio/stamp-copy'
import { generatableFormats } from '@/lib/studio/formats'
import { routedModels, unroutedModels } from '@/lib/studio/models'
import type { LibraryPicture, LibraryRead } from '@/lib/studio/read'
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
vi.mock('@/app/actions/studio-prompt', () => ({ refineStudioPrompt: vi.fn() }))

beforeAll(() => {
  // `<dialog>` is not implemented in jsdom and `Modal` only ever calls these
  // two. Same stub `picture-viewer.test.tsx` uses, for the same reason: the
  // reference thumbnail preview (`reference-preview.tsx`) is built on the same
  // `Modal`.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})

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

/**
 * A list is the ok read, the common case. A `LibraryRead` is passed whole when a
 * test is about the OTHER answers, which a list cannot express.
 */
const open = (
  library: LibraryPicture[] | LibraryRead = LIBRARY,
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
      library={Array.isArray(library) ? { status: 'ok', pictures: library } : library}
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

/**
 * ── PILLS OPEN THEIR OWN PANEL, ONE AT A TIME ─────────────────────────────
 * The redesign replaced the single always-open settings tray with pills that
 * each open their own picker below the bar. These helpers click the pill by
 * its accessible name — the axis on the label, never the bare value the eye
 * reads — so a test does not care which model, mode or size happens to be
 * selected when it runs.
 */
async function openApproach(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /^approach,/i }))
}
async function openMatch(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /^match,/i }))
}
async function openModel(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /^model,/i }))
}
async function openSize(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /^size,/i }))
}
async function openLogo(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /^logo,/i }))
}

/**
 * Opens Approach and picks a mode by name, in one step. Picking a mode also
 * moves the bar to the Match panel (see `chooseMode` in the component), which
 * is what makes the reference legend and grid visible immediately afterwards
 * without a second click — the same thing the old always-open tray did for
 * free.
 */
async function chooseModeUI(user: ReturnType<typeof userEvent.setup>, name: RegExp): Promise<void> {
  await openApproach(user)
  await user.click(modeButton(name))
}

describe('the shape of the screen', () => {
  /**
   * ── ONE COLUMN, NOT TWO ────────────────────────────────────────────────────
   * The artboard has no 420px composer beside a large empty canvas panel: the
   * composer is a single wide panel and the result stacks beneath it. The
   * regression this guards is the class that made the screen two columns on a
   * wide viewport, `wide:grid-cols-[...]`, coming back.
   */
  test('the root is a single column, not a two-column grid', () => {
    const { container } = open()
    const root = container.querySelector('[data-guide="studio-workbench"]') as HTMLElement
    expect(root).not.toBeNull()
    expect(root.className).not.toMatch(/grid-cols/)
  })

  /**
   * ── THE RESULT COMES AFTER THE COMPOSER, NOT BESIDE IT ────────────────────
   * With the second column gone there is no `max-wide` fallback hiding a
   * side-by-side layout at narrow widths: the composer section and the canvas
   * section are SIBLINGS in document order, composer first, so the result and
   * the "Made earlier" strip read as what comes next rather than what sits
   * beside it.
   */
  test('the composer section precedes the canvas section in the same flow', () => {
    // A picture has to exist for the canvas section to render at all — see
    // "the canvas" describe block below for the empty-state guard.
    const { container } = open(LIBRARY, MADE)
    const root = container.querySelector('[data-guide="studio-workbench"]') as HTMLElement
    const make = root.querySelector('#studio-make') as HTMLElement
    const canvas = root.querySelector('#studio-canvas') as HTMLElement
    expect(make).not.toBeNull()
    expect(canvas).not.toBeNull()
    // `compareDocumentPosition` bit 4 (DOCUMENT_POSITION_FOLLOWING) means
    // `canvas` comes after `make` in the tree, not nested inside a sibling
    // column beside it.
    expect(make.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  /**
   * ── THE PAGE IS CONTENT-LED, NOT ONE CAPPED COLUMN ────────────────────────
   * RETARGETED for the bar redesign. The old screen capped and centred the
   * WHOLE page at the 720px composer's own width. The bar keeps a measure of
   * its own — 820px, capped and centred — but the root no longer carries any
   * cap at all, because the work grid beneath it wants the page's own width.
   * `gen3.py`'s own header says so: "a grid of pictures wants room and a line
   * of text does not."
   */
  test('the root itself carries no width cap, so the work below can run full width', () => {
    const { container } = open()
    const root = container.querySelector('[data-guide="studio-workbench"]') as HTMLElement
    expect(root.className).not.toMatch(/max-w-\[var\(--measure-form\)\]/)
  })

  /**
   * The bar is still capped, so the prompt keeps a readable measure even
   * though the page around it does not.
   *
   * RETARGETED. `mx-auto` used to centre this column, which drifted its left
   * edge away from the title's own left edge (flush at the page gutter) the
   * moment the viewport was wider than 820px plus whatever margin centring
   * produced — one of the four different alignments this screen used to
   * show at once. The column is capped, not centred, so its left edge is the
   * container's own edge and matches the title's.
   */
  test('the bar itself is capped at 820px and left-aligned, not centred', () => {
    const { container } = open()
    const bar = container.querySelector('[data-guide="studio-bar"]') as HTMLElement
    const wrap = bar.parentElement as HTMLElement
    expect(wrap.className).toContain('max-w-[820px]')
    expect(wrap.className).not.toContain('mx-auto')
  })
})

describe('choosing which model draws it', () => {
  test('the reachable models are offered by what they are good at, never by id', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await openModel(user)
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
   * RETARGETED again, and back to the state the "not connected" section was
   * built for. Three models are page-verified but not generation-verified (they
   * 400 on every press), so they are shown as waiting rather than offered. What
   * must hold: the models a person can actually choose are exactly the routed
   * ones, and the waiting ones appear in the "not connected" section instead of
   * as pressable cards. `models.test.ts` covers the routed/allow-list pair.
   */
  test('only reachable models are offered, and the rest are shown as waiting', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await openModel(user)

    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement
    // One pressable card per routed model, and no more.
    expect(within(picker).getAllByRole('button')).toHaveLength(routedModels().length)

    // The waiting models are present, but as locked entries, not as buttons.
    const waiting = container.querySelectorAll('[data-guide="studio-model-waiting"]')
    expect(waiting).toHaveLength(unroutedModels().length)
    expect(unroutedModels().length).toBeGreaterThan(0)
    for (const model of unroutedModels()) {
      expect(picker.textContent, model.id).toContain(model.label)
    }
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
  test('offers every mode the default model can actually do', async () => {
    const user = userEvent.setup()
    open()
    await openApproach(user)
    for (const rule of readyModes()) {
      expect(modeButton(new RegExp(rule.label, 'i'))).toBeTruthy()
    }
  })

  test('on brand is chosen to begin with, because it is the one that uses the brand', async () => {
    const user = userEvent.setup()
    open()
    await openApproach(user)
    expect(modeButton(/on brand/i)).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('the canvas', () => {
  /**
   * RETARGETED. The old screen showed a large empty panel — sized to the
   * chosen format, saying "your picture appears here" — before anybody had
   * pressed anything. The founder's own words: "800px of empty canvas... the
   * page currently ends in a huge empty panel waiting for a picture." The
   * artboard has no such object, and neither does this screen now: before a
   * first picture exists, there is no canvas panel at all. `Generate Image`'s
   * own spinner (asserted in "before any spend" below) is the loading state
   * for a first press.
   */
  test('there is no canvas panel before anything has been made', () => {
    const { container } = open(LIBRARY, [])
    expect(container.querySelector('[data-guide="studio-canvas"]')).toBeNull()
    expect(screen.queryByText(/your picture appears here/i)).toBeNull()
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
   *
   * RETARGETED to a fixture WITH a picture, because the panel this asserts
   * against no longer exists before one does.
   */
  test('is sized to the chosen format, not to a fixed shape', () => {
    const first = generatableFormats()[0]!
    const { container } = open(LIBRARY, MADE)
    const canvas = container.querySelector('[data-guide="studio-canvas"]') as HTMLElement | null
    expect(canvas).not.toBeNull()
    expect(canvas!.style.aspectRatio).toBe(`${first.width} / ${first.height}`)
  })

  test('changing the size changes the canvas, so the shape follows the choice', async () => {
    const user = userEvent.setup()
    const story = generatableFormats().find((f) => f.width !== f.height)
    expect(story, 'no format with a non-square shape to switch to').toBeTruthy()

    const { container } = open(LIBRARY, MADE)
    const canvas = container.querySelector('[data-guide="studio-canvas"]') as HTMLElement
    const before = canvas.style.aspectRatio

    await openSize(user)
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

  test('the canvas names the shape and age of the picture on it', () => {
    open(LIBRARY, [{ ...MADE[0]!, width: 1600, height: 1000, madeAgo: 'just now' }])
    const meta = screen.getByText(
      (_content, node) => node?.textContent === '1600 × 1000 · just now',
    )
    expect(meta).toBeTruthy()
  })

  test('a picture whose age would not parse shows the shape alone', () => {
    open(LIBRARY, [{ ...MADE[0]!, width: 1600, height: 1000, madeAgo: null }])
    const meta = screen.getByText((_content, node) => node?.textContent === '1600 × 1000')
    expect(meta).toBeTruthy()
  })

  test('clicking an older one puts it on the canvas', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY, MADE)
    const strip = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    await user.click(within(strip).getAllByRole('button')[1]!)

    const canvas = container.querySelector('[data-guide="studio-canvas"]') as HTMLElement
    expect(within(canvas).getByAltText('the shopfront at dawn')).toBeTruthy()
  })

  test('with nothing made, there is no strip to scroll and no canvas panel either', () => {
    const { container } = open(LIBRARY, [])
    expect(container.querySelector('[data-guide="studio-strip"]')).toBeNull()
    expect(container.querySelector('[data-guide="studio-canvas"]')).toBeNull()
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
    await chooseModeUI(user, /explore/i)
    expect(screen.queryByText(/which picture should Sahoda match/i)).toBeNull()
    expect(screen.getByText(/moves you to match a picture/i)).toBeTruthy()
  })

  test('matching asks for a picture before it will run', async () => {
    const user = userEvent.setup()
    open()
    await chooseModeUI(user, /match a picture/i)
    expect(screen.getByRole('status').textContent).toMatch(/pick one picture/i)
    expect(screen.getByRole('button', { name: /generate image/i })).toBeDisabled()
  })

  test('picking one clears the block', async () => {
    const user = userEvent.setup()
    open()
    await chooseModeUI(user, /match a picture/i)
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
    await chooseModeUI(user, /match a picture/i)

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
    await chooseModeUI(user, /match a picture/i)
    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    await user.click(within(picker).getAllByRole('button')[0]!)

    await chooseModeUI(user, /explore/i)
    await chooseModeUI(user, /match a picture/i)
    expect(screen.getByRole('status').textContent).toMatch(/pick one picture/i)
  })

  /**
   * A picture whose preview link would not sign still EXISTS and can still be
   * matched. Dropping it would lose somebody a picture they own.
   */
  test('a picture with no preview is still offered, not hidden', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await chooseModeUI(user, /match a picture/i)
    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    expect(within(picker).getAllByRole('button')).toHaveLength(LIBRARY.length)
    expect(within(picker).getByText(/no preview/i)).toBeTruthy()
  })

  test('an empty library says how to fill it rather than showing nothing', async () => {
    const user = userEvent.setup()
    open([])
    await chooseModeUI(user, /match a picture/i)
    expect(screen.getByText(/you have no pictures yet/i)).toBeTruthy()
  })

  /**
   * THE CLAIM, NOT THE WORDING. "You have no pictures yet" is a statement about
   * the library, and on a failed read it is false: the person may have thirty.
   * "We asked and got nothing" and "we could not ask" are different sentences
   * and only the true one may be shown.
   *
   * MUTATION: render the empty-library paragraph for every non-ok status and
   * the second assertion goes red.
   */
  test('a library that could not be read says so, and never claims it is empty', async () => {
    const user = userEvent.setup()
    open({ status: 'unreadable' })
    await chooseModeUI(user, /match a picture/i)
    expect(screen.getByText(/sahoda could not read your pictures/i)).toBeTruthy()
    expect(screen.queryByText(/no pictures yet/i)).toBeNull()
  })

  /** The remedy that still works is kept; the one that does not (retry the read) is not offered. */
  test('a failed read still offers the device, which works regardless of the read', async () => {
    const user = userEvent.setup()
    open({ status: 'unreadable' })
    await chooseModeUI(user, /match a picture/i)
    expect(screen.getByText(/sahoda could not read your pictures/i).textContent).toMatch(
      /from this device/i,
    )
    expect(screen.getByText(/sahoda could not read your pictures/i).textContent).not.toMatch(
      /reload|try again|refresh/i,
    )
  })

  test('no workspace is a third answer, not an empty library and not a failure', async () => {
    const user = userEvent.setup()
    open({ status: 'no-workspace' })
    await chooseModeUI(user, /match a picture/i)
    expect(screen.queryByText(/no pictures yet/i)).toBeNull()
    expect(screen.queryByText(/could not read/i)).toBeNull()
    expect(screen.getByText(/no workspace/i)).toBeTruthy()
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
    await chooseModeUI(user, /match a picture/i)

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
    await chooseModeUI(user, /change a picture/i)

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
    await chooseModeUI(user, /match a picture/i)
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
    await chooseModeUI(user, /match a picture/i)
    const control = screen.getByLabelText(/add a picture from this device/i)
    expect(control.tagName).toBe('INPUT')
    expect(control.getAttribute('type')).toBe('file')
  })

  test('what it offers is the proven list, so it cannot drift from the server', async () => {
    const user = userEvent.setup()
    open()
    await chooseModeUI(user, /match a picture/i)
    const control = screen.getByLabelText(/add a picture from this device/i)
    expect(control.getAttribute('accept')).toBe(uploadAccept())
  })

  test('the empty library points at this device rather than at a library trip', async () => {
    const user = userEvent.setup()
    open([])
    await chooseModeUI(user, /match a picture/i)
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
    await openApproach(user)
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

    await openApproach(user)
    expect(modeButton(/match a picture/i)).toHaveAttribute('aria-pressed', 'true')
    await openMatch(user)
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
    await chooseModeUI(user, /explore/i)

    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    await user.click(within(picker).getAllByRole('button')[0]!)

    await openApproach(user)
    expect(modeButton(/match a picture/i)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('alert').textContent).toMatch(/moved you to match a picture/i)
  })

  test('the picture that was picked is the one that is now selected', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await chooseModeUI(user, /explore/i)
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
    await chooseModeUI(user, /match a picture/i)
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
    await chooseModeUI(user, /match a picture/i)
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

    await chooseModeUI(user, /explore/i)
    expect(box.getAttribute('placeholder')).not.toBe(first)

    await chooseModeUI(user, /change a picture/i)
    expect(box.getAttribute('placeholder')).toMatch(/background/i)
  })

  test('every mode on offer has its own hint', () => {
    const hints = readyModes().map((rule) => promptHintFor(rule.mode))
    expect(new Set(hints).size).toBe(hints.length)
  })
})

describe('asking for more than one', () => {
  /**
   * RETARGETED for the stepper. The count used to be four separate buttons (one
   * per number); it is now a −/+ a person reads at a glance, bounded by the
   * same `MAX_TRIES_PER_PRESS` the action enforces.
   */
  async function stepUp(user: ReturnType<typeof userEvent.setup>, times: number): Promise<void> {
    const more = screen.getByRole('button', { name: /more pictures this press/i })
    for (let i = 0; i < times; i++) await user.click(more)
  }

  /**
   * THE MONEY SENTENCE. Somebody who chose four options and was shown the price
   * of one has not been told what this press costs. The total is what leaves
   * their wallet, so the total is what the screen names.
   */
  test('the price shown is the TOTAL for the press, not the unit price', async () => {
    const user = userEvent.setup()
    open()
    await stepUp(user, 3)
    expect(document.body.textContent).toMatch(/24\s*credits/)
  })

  /**
   * The routed model draws one picture per call, so four are four calls and
   * will NOT match. Saying otherwise would promise a carousel, which is the
   * thing `MODE_RULES` refuses to fake.
   */
  test('says plainly that the options will not match each other', async () => {
    const user = userEvent.setup()
    open()
    await stepUp(user, 2)
    expect(screen.getByText(/will not match each other/i)).toBeTruthy()
  })

  test('one is chosen to begin with, and says nothing extra about matching', () => {
    const { container } = open()
    const counts = container.querySelector('[data-guide="studio-count"]') as HTMLElement
    expect(within(counts).getByText('1')).toBeTruthy()
    expect(
      within(counts).getByRole('button', { name: /fewer pictures this press/i }),
    ).toBeDisabled()
    expect(screen.queryByText(/will not match each other/i)).toBeNull()
  })

  test('the choice stops at the bound the action enforces', async () => {
    const user = userEvent.setup()
    const { container } = open()
    const counts = container.querySelector('[data-guide="studio-count"]') as HTMLElement
    await stepUp(user, MAX_TRIES_PER_PRESS + 2)
    expect(within(counts).getByText(String(MAX_TRIES_PER_PRESS))).toBeTruthy()
    expect(within(counts).getByRole('button', { name: /more pictures this press/i })).toBeDisabled()
  })
})

describe('before any spend', () => {
  test('the price is named, from the pricing file rather than a literal', () => {
    open()
    expect(document.body.textContent).toMatch(/6\s*credits/)
  })

  /**
   * THE MONEY SENTENCE, PER MODEL. The total on the primary was a fixed
   * number handed in by the page, so choosing "The best one" left it reading
   * the everyday price while the hold was taken at the premium one. The label
   * a person reads before pressing has to be the figure that leaves the wallet.
   *
   * RETARGETED for the redesign: the price is no longer a separate label with
   * a pipe separator (`Make a picture · 12 credits`) — it is the primary
   * button's own second line, read here off the button's accessible name.
   *
   * MUTATION: compute `cost` from `IMAGE_TIER_ACTION.draft` regardless of
   * `modelId` in `studio-workbench.tsx` and this goes red.
   */
  test('the total follows the chosen model, before the press', async () => {
    /**
     * RETARGETED AGAIN, 2026-09-04, and the reason is a fact about the world
     * rather than a fact about this component.
     *
     * This test used to switch to "The best one" and read the price change off
     * the primary. It cannot any more: three of the four Studio models are now
     * `routed: false` and render as LOCKED entries, because every generation
     * against them returned HTTP_400 and not one has ever succeeded. Exactly
     * one model is choosable, so there is nothing to switch TO, and a test that
     * clicks a model card is asserting a choice the product no longer offers.
     *
     * What survives is the half that is still exercisable and still the thing
     * that once shipped broken: the figure on the button is the figure that
     * leaves the wallet, and it tracks the COUNT. `cost-per-model` is now
     * covered where it can be, on the pure function in `models.test.ts`, rather
     * than through a UI switch that cannot happen.
     *
     * WHEN A SECOND MODEL IS ROUTED, restore the switch half of this test. The
     * guard in `models.test.ts` that every choosable model is routed is what
     * will tell you that day has come.
     *
     * MUTATION: drop the `* count` from the total in `studio-workbench.tsx`
     * and this goes red on the second assertion.
     */
    const user = userEvent.setup()
    const { container } = open()

    // The locked models are still SHOWN, and still not choosable. That is the
    // claim the picker makes now, so it is the claim this asserts.
    await openModel(user)
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement
    const pressable = within(picker)
      .getAllByRole('button')
      .filter((button) => button.textContent?.includes('credits a picture'))
    expect(
      pressable.length,
      'exactly one model is routed today, so exactly one model card is pressable',
    ).toBe(1)

    expect(screen.getByRole('button', { name: /generate image/i }).textContent).toMatch(
      /6\s*credits/,
    )

    const more = screen.getByRole('button', { name: /more pictures this press/i })
    await user.click(more)
    expect(screen.getByRole('button', { name: /generate image/i }).textContent).toMatch(
      /12\s*credits/,
    )
  })

  test('the button waits for a description, because an empty prompt cannot be drawn', async () => {
    const user = userEvent.setup()
    open()
    const button = screen.getByRole('button', { name: /generate image/i })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    expect(button).toBeEnabled()
  })
})

describe('a second press cannot reach the action while the first is in flight', () => {
  /**
   * ── THE FOUNDER'S OWN REASON: A SECOND PRESS BURNS CREDITS ────────────────
   * `disabled={!ready || busy}` reads as a complete guard and is not one on
   * its own: `busy` is `isPending` from `useTransition`, REACT STATE that
   * updates on the NEXT render rather than the instant `generate` runs.
   * `fireEvent.click` three times with nothing awaited between them fires all
   * three DOM handlers in the same tick, before React has painted the
   * disabled button — the exact window a fast double click, or a second
   * Enter fired before a re-render, lands in. `queueGeneration` is held open
   * on a promise this test controls, so what is proved is that the SECOND and
   * THIRD clicks never reach the action at all, not merely that their result
   * was discarded.
   *
   * MUTATION: delete `if (pressLocked.current) return` (and its paired
   * `pressLocked.current = true`) from `generate` in `studio-workbench.tsx`
   * and this goes red: `queueGeneration` called three times.
   */
  test('a second and third click while the first is in flight never reach queueGeneration', async () => {
    let resolve: ((value: Awaited<ReturnType<typeof queueGeneration>>) => void) | null = null
    vi.mocked(queueGeneration).mockImplementation(
      () =>
        new Promise((res) => {
          resolve = res
        }),
    )
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    const button = screen.getByRole('button', { name: /generate image/i })

    // ── ALL THREE INSIDE ONE `act`, ON PURPOSE ────────────────────────────
    // `fireEvent.click` on its own wraps EACH call in its own `act`, which
    // flushes React's pending state (including `busy`) before the next call
    // — that would let the `disabled` attribute alone catch the second
    // click and prove nothing about the race the founder described. A
    // single `act` around all three keeps them in the SAME tick, before any
    // re-render, which is the actual window a fast double click or a second
    // Enter lands in.
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(queueGeneration).toHaveBeenCalledTimes(1)

    resolve!({ ok: true, generationId: 'g1', balanceAfter: 5, made: 1, asked: 1 })
    await waitFor(() => expect(button).not.toBeDisabled())

    // And a genuinely NEW press after the first one settled is not blocked by
    // a lock the first press forgot to release.
    fireEvent.click(button)
    expect(queueGeneration).toHaveBeenCalledTimes(2)

    // ── SETTLED, NOT LEFT DANGLING ─────────────────────────────────────────
    // A transition `start()`ed on THIS press and never resolved before the
    // test ends leaves React's own act queue believing work is still
    // outstanding, which can stall a LATER test's `act`/`waitFor` calls that
    // have nothing to do with this one — measured against
    // `prompt-refine-control`'s own double-press test, which hung
    // indefinitely only when this test ran first and left its second press
    // unresolved.
    resolve!({ ok: true, generationId: 'g2', balanceAfter: 4, made: 1, asked: 1 })
    await waitFor(() => expect(button).not.toBeDisabled())
  })

  /**
   * ── UNMISTAKABLE, NOT JUST DISABLED ────────────────────────────────────
   * The founder could not tell anything was happening before this: the
   * button carried `aria-busy` and nothing else said so. This asserts the
   * label itself names what is happening, the button announces it to a
   * screen reader, and the place a first picture would appear says so too
   * — not merely that the press is blocked.
   *
   * MUTATION: leave the button's label as "Generate Image" while `busy` and
   * this goes red on the first assertion.
   */
  test('the button and the empty canvas both say Sahoda is working, not just that the button is disabled', async () => {
    vi.mocked(queueGeneration).mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    open(LIBRARY, [])
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    const button = screen.getByRole('button', { name: /generate image/i })

    fireEvent.click(button)

    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.textContent).toMatch(/generating image/i)
    expect(screen.getByText(/generating your first image now/i)).toBeTruthy()
  })
})

describe('the bar', () => {
  /**
   * ── EXACTLY ONE OBJECT INVERTS, AND IT IS THE BAR ─────────────────────────
   * RETARGETED. `data-surface="inverse"` was dropped entirely and then
   * reinstated by founder ruling, scoped to the composer bar alone: without
   * it, the bar and the page shared the same fill in dark theme (1.30:1,
   * `#171717` on `#0d0d0d`) and read as barely separated from the ground it
   * sits on. This asserts the scope exists exactly once, and that the one
   * element carrying it is the bar — never "Will send", the result bar, the
   * work grid or the empty state, all of which must follow the page theme.
   */
  test('exactly one element inverts, and it is the composer bar', () => {
    const { container } = open()
    const inverted = container.querySelectorAll('[data-surface="inverse"]')
    expect(inverted).toHaveLength(1)
    expect(inverted[0]).toHaveAttribute('data-guide', 'studio-bar')
  })

  /**
   * ── NO RESERVED HEIGHT BEFORE ANYTHING IS TYPED ───────────────────────────
   * The shared `Textarea` carries `min-h-[74px]` unconditionally, which is
   * correct for a field sized on purpose and wrong here: `autoGrow` measures
   * `scrollHeight` and sets an inline height, and a CSS `min-height` above
   * that inline value still wins, which was the ~80px of dead space that used
   * to open the bar before anything was typed. `min-h-0` overrides it.
   */
  test('the prompt box carries no reserved minimum height', () => {
    open()
    const prompt = screen.getByLabelText(/what should the picture show/i)
    expect(prompt.className).toMatch(/(^|\s)min-h-0(\s|$)/)
  })

  /**
   * ── THE PRIMARY'S HOVER USES THE INVERSE-SCOPE PAIR, NOT `--ink` ──────────
   * Inside `data-surface="inverse"`, `--ink` is white (light theme) or black
   * (dark theme, nested under `[data-theme="dark"]`) — either way it is the
   * SAME colour the scope already uses for text, so a primary hovering to
   * `bg-ink` with a literal `text-white` (the shared `Button`'s own recipe)
   * paints the label on top of its own fill the moment they match. `Generate
   * Image` must hover through `--pstrong`/`--pstrong-fg` instead, the pair
   * the scope solves for exactly this control.
   */
  test('generate image hovers through the inverse-scope pair, never through --ink', () => {
    open()
    const button = screen.getByRole('button', { name: /generate image/i })
    expect(button.className).toMatch(/hover:bg-primary-strong/)
    expect(button.className).toMatch(/hover:text-primary-strong-foreground/)
    expect(button.className).not.toMatch(/hover:bg-ink\b/)
  })

  /**
   * The pills are a SUMMARY of what the press will do. They read their labels
   * from `models.ts` and `modes.ts`, the same modules the rules come from, so a
   * pill cannot name a model the picker no longer offers.
   */
  test('says which model, approach and size this press will use', async () => {
    const user = userEvent.setup()
    const { container } = open()
    const chips = () => container.querySelector('[data-guide="studio-chips"]')!.textContent ?? ''

    expect(chips()).toContain(routedModels()[0]!.label)
    expect(chips()).toContain(ruleFor('on_brand').label)

    // And it tracks the control rather than the first render.
    await chooseModeUI(user, /explore/i)
    expect(chips()).toContain(ruleFor('explore').label)
    expect(chips()).not.toContain(ruleFor('on_brand').label)
  })

  /**
   * BARE VALUES, NOT "AXIS VALUE". The pill used to print its own axis beside
   * the value ("Model Everyday"), which the artboard never does: it states the
   * value and a caret, and the axis lives on the accessible name instead.
   */
  test('the pills are bare values with a caret, not "axis value" pairs', () => {
    const { container } = open()
    const chipsEl = container.querySelector('[data-guide="studio-chips"]') as HTMLElement
    // `aria-expanded` is the pill's own attribute (it opens a panel); the
    // stepper's −/+ buttons also carry an `aria-label` but no `aria-expanded`,
    // so filtering on that keeps this to the five doors.
    const chipButtons = within(chipsEl)
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-expanded'))

    // Match, Model, Approach, Size, Logo — five doors, each summarised bare.
    expect(chipButtons).toHaveLength(5)
    for (const button of chipButtons) {
      expect(button.textContent).not.toMatch(/^(Match|Model|Approach|Size|Logo),/)
    }
  })

  /**
   * ── PERMANENT, NOT GATED ──────────────────────────────────────────────────
   * "Will send" and "Not built" live on the bar's own always-on rows, never
   * inside a pill's own panel. Opening and closing a panel must not take them
   * with it, because they are what a person reads before deciding whether to
   * open anything at all.
   */
  test('will send and not built survive opening and closing a panel', async () => {
    const user = userEvent.setup()
    const { container } = open()
    const signalsFirst = () =>
      container.querySelector('[data-guide="studio-signals"]') as HTMLElement | null
    const comingSoonFirst = () =>
      container.querySelector('[data-guide="studio-coming-soon"]') as HTMLElement | null
    expect(signalsFirst()).not.toBeNull()
    expect(comingSoonFirst()).not.toBeNull()

    await openApproach(user)
    expect(signalsFirst()).not.toBeNull()
    expect(comingSoonFirst()).not.toBeNull()
    expect(screen.getByText('Leave out')).toBeTruthy()

    await openApproach(user) // toggles it closed again
    expect(signalsFirst()).not.toBeNull()
    expect(comingSoonFirst()).not.toBeNull()
  })

  /**
   * ── CLOSED BY DEFAULT, AND THE BAR STAYS USABLE ───────────────────────────
   * The bar reads as ~100px on first paint: no pill's own panel is open until
   * pressed. The thing a person came to do — write the prompt, press
   * Generate Image — is there regardless.
   */
  test('no panel is open by default, and the bar stays usable', () => {
    open()
    expect(screen.queryByRole('group', { name: /how should sahoda approach it/i })).toBeNull()
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button', { name: /generate image/i })).toBeTruthy()
  })

  /** Only one pill's panel is open at a time, so the bar never grows back into six stacked cards. */
  test('opening a second pill closes the first', async () => {
    const user = userEvent.setup()
    open()
    await openApproach(user)
    expect(screen.getByRole('group', { name: /how should sahoda approach it/i })).toBeTruthy()

    await openModel(user)
    expect(screen.queryByRole('group', { name: /how should sahoda approach it/i })).toBeNull()
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
   * ── A LABEL COLUMN, AND VALUES THAT ALIGN ─────────────────────────────────
   * RETARGETED shape. This used to be one `flex-wrap` row where the eyebrow
   * stayed inline with the first pair and later labels started wherever the
   * previous value's wrap happened to end. A real two-column structure: every
   * label lives in a `dt` that never wraps, every value in a `dd` clamped to
   * two lines rather than left to run to the page edge — the value's WORDS
   * are unchanged, only how many lines it may claim.
   */
  test('each label sits in a column that never wraps, and long values clamp to two lines', () => {
    const long: BrandSignal = {
      field: 'business',
      certainty: 'confirmed',
      value: 'Character Mentor, a tutoring studio that pairs each learner with a story',
    }
    const { container } = open(LIBRARY, [], [long])
    const signals = container.querySelector('[data-guide="studio-signals"]') as HTMLElement
    const dt = signals.querySelector('dt') as HTMLElement
    expect(dt).not.toBeNull()
    expect(dt.className).toMatch(/whitespace-nowrap/)
    expect(dt.textContent).toContain('Business')

    const dd = signals.querySelector('dd') as HTMLElement
    const value = within(dd).getByText(long.value)
    expect(value.className).toMatch(/line-clamp-2/)
    // The words themselves are never trimmed to make it fit.
    expect(value.textContent).toBe(long.value)
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

  /**
   * THE SINGLE WORST THING ON THE OLD SCREEN. `brandSignalsFor`'s `colours`
   * leaf carries the raw theme tokens joined with `, ` — real values look like
   * `oklch(0.5663 0.16 262.1)` — and the old pill printed that string straight
   * to a shop owner. A brand colour is painted as a swatch, never spelled out
   * as notation.
   *
   * MUTATION: render `signal.value` directly for the `colours` field instead
   * of branching on `colourValuesOf` and this goes red on the first
   * assertion.
   */
  test('brand colours render as swatches, never as oklch notation', () => {
    const colours: BrandSignal = {
      field: 'colours',
      certainty: 'guessed',
      value: 'oklch(0.5663 0.16 262.1), oklch(0.98 0.01 90)',
    }
    const { container } = open(LIBRARY, [], [colours])

    expect(container.textContent).not.toMatch(/oklch\(/i)
    const signals = container.querySelector('[data-guide="studio-signals"]') as HTMLElement
    const swatches = signals.querySelectorAll('span[style*="background"]')
    expect(swatches).toHaveLength(2)
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

  /**
   * THE STATUS DOT. Filled only when the logo is actually on the picture on
   * screen right now, asked of `stampNote(outcome).dotFilled` rather than
   * re-derived here, for the same reason the title and body are asked of it.
   */
  test('the status dot is filled for a stamped picture and hollow for every other answer', () => {
    const { container } = open(LIBRARY, [stamped])
    const bar = container.querySelector('[data-guide="studio-logo-bar"]') as HTMLElement
    expect(bar.querySelector('.bg-primary')).not.toBeNull()
    cleanup()

    const { container: other } = open(LIBRARY, [
      { ...stamped, stampedUrl: null, stampOutcome: 'no_logo' },
    ])
    const otherBar = other.querySelector('[data-guide="studio-logo-bar"]') as HTMLElement
    expect(otherBar.querySelector('.bg-primary')).toBeNull()
  })

  /**
   * WHICH FRAME THIS IS. `active.url` is always the model's own output, so
   * that claim is true for the original in every outcome. The exact placed
   * size is true only of the stamped frame and is not recorded per picture,
   * so it is locked rather than guessed at.
   */
  test('says plainly which frame is on screen, and locks the placement it cannot know', async () => {
    const user = userEvent.setup()
    open(LIBRARY, [stamped])
    expect(screen.getByText(/exact placement: coming soon/i)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /without it/i }))
    expect(screen.getByText(/as the model drew it/i)).toBeTruthy()
    expect(screen.queryByText(/exact placement: coming soon/i)).toBeNull()
  })

  test('a single-version answer states the frame without offering a locked placement', () => {
    open(LIBRARY, [{ ...stamped, stampedUrl: null, stampOutcome: 'no_logo' }])
    expect(screen.getByText(/as the model drew it/i)).toBeTruthy()
    expect(screen.queryByText(/exact placement: coming soon/i)).toBeNull()
  })

  /**
   * ── THE MOVE IS THE ONE OUTCOME THAT MUST NEVER BE SILENT ──────────────────
   * The renderer measures all four corners and may stamp the mark somewhere
   * other than the corner the customer set. A control that quietly does
   * something else is the defect this screen exists to avoid, so these assert
   * the CLAIM (that a move is reported, and which reason it gives) rather than
   * the sentence, which `anchor-note.ts` owns and may rewrite freely.
   */
  test('says the logo moved, and why, when the chosen corner was busy', () => {
    open(LIBRARY, [{ ...stamped, stampAnchor: 'top-left', stampAnchorMovedReason: 'busy' }])
    const note = screen.getByText(/moved the logo/i)
    expect(note.textContent).toMatch(/top-left/i)
    expect(note.textContent).toMatch(/busy/i)
    expect(screen.queryByText(/exact placement: coming soon/i)).toBeNull()
  })

  test('gives a different reason when the mark would not have been readable', () => {
    open(LIBRARY, [
      { ...stamped, stampAnchor: 'bottom-left', stampAnchorMovedReason: 'unreadable' },
    ])
    const note = screen.getByText(/moved the logo/i)
    expect(note.textContent).toMatch(/bottom-left/i)
    expect(note.textContent).toMatch(/read/i)
    expect(note.textContent).not.toMatch(/busy/i)
  })

  /**
   * Recorded AND stamped where asked is the case with nothing to say. It must
   * not fall back to the lock: the lock claims the placement was never
   * recorded, and here it was.
   */
  test('says nothing at all when the mark went where it was asked to', () => {
    open(LIBRARY, [{ ...stamped, stampAnchor: 'bottom-right', stampAnchorMovedReason: null }])
    expect(screen.queryByText(/moved the logo/i)).toBeNull()
    expect(screen.queryByText(/exact placement: coming soon/i)).toBeNull()
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

  /**
   * ── SAVE AND USE IN A POST ARE NAMED, NOT OFFERED ───────────────────────────
   * `Main.dc.html` draws both as live orange controls in this bar. Nothing
   * behind either one exists here — "Save it" and "Use it in a post" already
   * work, on the picture actions row above the canvas — so this bar states the
   * two names and locks them, the same house pattern as the four coming-soon
   * controls in the composer: a `<span>` carrying `Lock`, never
   * `<button disabled>`, which `design-lint.mjs` rule 3 refuses outright because
   * a screen reader still announces a disabled button as an action.
   */
  test('Save and Use in a post are locked in this bar, not real actions', () => {
    const { container } = open(LIBRARY, [stamped])
    const bar = container.querySelector('[data-guide="studio-logo-bar"]') as HTMLElement
    expect(bar).not.toBeNull()

    // Named, so the reader knows what is coming.
    const save = within(bar).getByText('Save')
    const useInAPost = within(bar).getByText('Use in a post')

    // Never a button, disabled or otherwise: a disabled button is still
    // announced as an action a screen reader could take.
    expect(save.closest('button')).toBeNull()
    expect(useInAPost.closest('button')).toBeNull()
    expect(within(bar).queryByRole('button', { name: /^save$/i })).toBeNull()
    expect(within(bar).queryByRole('button', { name: /^use in a post$/i })).toBeNull()

    // "Save it" and "Use it in a post" are the real, working actions
    // elsewhere on the screen; this bar's own pair must not collide with them.
    expect(within(bar).queryByRole('button', { name: /save it/i })).toBeNull()
    expect(within(bar).queryByRole('button', { name: /use it in a post/i })).toBeNull()
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
    for (const title of ['Leave out', 'Same again', 'Follow how closely']) {
      expect(screen.getByText(title), title).toBeTruthy()
      // A disabled button is still announced as an action a reader could take,
      // which `design-lint.mjs` rule 3 refuses outright. These are spans.
      expect(screen.queryByRole('button', { name: title }), title).toBeNull()
    }
    expect(screen.getByText(/nothing here changes what a press does today/i)).toBeTruthy()
  })

  /**
   * ── A NAME LEAVES THIS ROW THE DAY IT SHIPS ───────────────────────────────
   * "Tidy my words" stayed in `COMING_SOON` after the refiner shipped, so this
   * row showed a lock beside a control that was rendering, working and
   * charging a credit a few hundred pixels above it. The guard is about the
   * CLASS of defect rather than that one string: nothing may be named as
   * missing while a working control for it sits on the same screen.
   *
   * WHAT IT CANNOT SEE: it checks this row against the refiner alone. Another
   * name going stale the same way, for a control this test does not query,
   * would pass.
   */
  test('does not name the prompt refiner as missing while the refiner is on screen', () => {
    open()
    const refiner = screen.getByRole('button', { name: /rewrite|refine|tidy/i })
    expect(refiner).toBeTruthy()
    const row = screen.getByText(/not built yet/i).parentElement as HTMLElement
    expect(row.textContent).not.toMatch(/tidy my words/i)
  })

  /**
   * ── "N MORE" IS LEGIBLE, NOT FADING CHROME ────────────────────────────────
   * A promise about what is coming, not a disabled control: it stays a
   * `<span>` with a `Lock` icon (never `<button disabled>`, design-lint rule
   * 3), but it must not carry `opacity-70` on top of `text-muted`'s own
   * lighter weight — that combination reads as disabled rather than as a
   * label worth reading.
   */
  test('"N more" is legible: a span with a lock, and no extra dimming', () => {
    const { container } = open()
    const chips = container.querySelector('[data-guide="studio-chips"]') as HTMLElement
    const more = Array.from(chips.querySelectorAll('span')).find(
      (el) => /more$/i.test(el.textContent?.trim() ?? '') && el.querySelector('svg') !== null,
    ) as HTMLElement
    expect(more).toBeTruthy()
    expect(more.tagName).toBe('SPAN')
    expect(more.className).not.toMatch(/opacity-70/)
  })

  /**
   * RETARGETED. The composer used to carry an always-present "quick add" tile
   * even with nothing picked — the same door as the Match pill beside it,
   * adjacent, twice. Now the Match pill is the ONE way in for a first
   * picture: its own panel carries the full `ReferenceUpload`. Once a
   * picture is actually picked, the numbered-thumbnail row appears and
   * carries its own compact tile, so a SECOND picture can be added without
   * reopening the panel — that quick-add capability survives, just moved to
   * only where a picture has already been picked.
   */
  test('the quick-add tile is not a second door before anything is picked', () => {
    open(LIBRARY)
    expect(screen.queryByRole('group', { name: /how should sahoda approach it/i })).toBeNull()
    // No compact tile in the composer's own row yet: the Match pill is the
    // only way in for a first picture.
    expect(screen.queryByLabelText(/add a picture to match/i)).toBeNull()
  })

  test('once a picture is picked, another can be added without reopening the panel', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY)
    await openMatch(user)
    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    await user.click(within(picker).getAllByRole('button')[0]!)

    // Closing the panel again — the numbered thumbnail row and its own
    // compact tile stay in the composer, reachable with no panel open.
    await openMatch(user)
    expect(screen.queryByRole('group', { name: /how should sahoda approach it/i })).toBeNull()
    const inComposer = screen.getByLabelText(/add a picture to match/i)
    expect(inComposer.getAttribute('accept')).toBe(uploadAccept())

    // The full picker, with its own sentence and legend, lives behind the
    // Match pill — a DIFFERENT name, so a screen reader can say which is
    // which — and is not present until that pill is opened again.
    expect(screen.queryByLabelText(/add a picture from this device/i)).toBeNull()
    await openMatch(user)
    const inSettings = screen.getByLabelText(/add a picture from this device/i)
    expect(inComposer).not.toBe(inSettings)
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

  /**
   * The strip's tiles are real, named controls even though they do not yet do
   * anything beyond swapping the canvas — this is where a remix view will open
   * from, and the artboard says so beside the eyebrow.
   */
  test('says how to open one, and each tile is a real button with a name', () => {
    const { container } = open(LIBRARY, MADE)
    expect(screen.getByText(/open one to change it/i)).toBeTruthy()

    const strip = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    for (const tile of within(strip).getAllByRole('button')) {
      expect(tile).not.toBeDisabled()
      expect(tile.getAttribute('aria-label')).toBeTruthy()
    }
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
    await user.click(screen.getByRole('button', { name: /generate image/i }))
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
    await openLogo(user)
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
    await openLogo(user)
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
    await openLogo(user)
    const logoFieldset = container.querySelector('[data-guide="studio-logo"]') as HTMLElement
    const corner = container.querySelector('[data-guide="studio-logo-corner"]') as HTMLElement
    for (const button of within(corner).getAllByRole('button')) expect(button).toBeEnabled()

    await user.click(within(logoFieldset).getByRole('button', { name: /leave it off/i }))
    for (const button of within(corner).getAllByRole('button')) expect(button).toBeDisabled()
  })
})

describe('first run: nothing made yet', () => {
  /**
   * ── NEVER A VOID, NEVER INVENTED PICTURES ─────────────────────────────────
   * The old screen simply ended after the composer before a first picture
   * existed. The redesign replaces the grid with a line stating the claim
   * plainly — never a blank stretch of page and never a sample picture this
   * workspace did not make.
   */
  test('the grid is replaced by a line saying nothing has been made, with no invented picture', () => {
    const { container } = open(LIBRARY, [])
    expect(screen.getByText(/nothing made yet/i)).toBeTruthy()
    const empty = container.querySelector('[data-guide="studio-empty"]') as HTMLElement
    expect(empty).not.toBeNull()
    // Never invented sample pictures: no img in the empty-run block.
    expect(within(empty).queryAllByRole('img')).toHaveLength(0)
  })

  /**
   * RETARGETED. The starters used to render a SECOND time here — the same
   * five chips the bar already shows above whenever the prompt is empty,
   * which on a fresh workspace is always true at the same moment as this
   * block. The bar keeps them; this block states its claim in words and does
   * not open a second copy of the same control.
   */
  test('the empty-run block does not repeat the bar’s own starter chips', () => {
    const { container } = open(LIBRARY, [])
    const barStarters = container.querySelector('[data-guide="studio-starters"]') as HTMLElement
    expect(barStarters).not.toBeNull()
    expect(within(barStarters).getAllByRole('button').length).toBeGreaterThan(2)

    const empty = container.querySelector('[data-guide="studio-empty"]') as HTMLElement
    // The empty-run block carries no control of its own: no second set of
    // starter buttons duplicating the bar's.
    expect(within(empty).queryAllByRole('button')).toHaveLength(0)
    // And the whole screen offers each starter's own words exactly once.
    expect(container.querySelectorAll('[data-guide="studio-starters"]')).toHaveLength(1)
  })

  test('the empty-run block disappears once a picture exists', () => {
    const { container } = open(LIBRARY, MADE)
    expect(container.querySelector('[data-guide="studio-empty"]')).toBeNull()
  })
})

describe('the work grid: full page width, with a filter row', () => {
  const square = { ...MADE[0]!, imageId: 'sq', width: 1080, height: 1080 }
  const story = {
    ...MADE[1]!,
    imageId: 'story',
    width: 1080,
    height: 1920,
    stampedUrl: null,
    stampOutcome: null,
  }
  const wide = {
    ...MADE[0]!,
    imageId: 'wide',
    width: 1600,
    height: 900,
    stampedUrl: null,
    stampOutcome: null,
  }
  const stamped = {
    ...MADE[0]!,
    imageId: 'stamped',
    width: 1080,
    height: 1080,
    stampedUrl: 'https://example.test/stamped.png',
    stampOutcome: 'stamped' as const,
  }
  const SHAPES = [square, story, wide, stamped]

  test('all four shapes are shown under "All"', () => {
    const { container } = open(LIBRARY, SHAPES)
    const grid = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    expect(within(grid).getAllByRole('button')).toHaveLength(SHAPES.length)
  })

  /**
   * THE FILTER NARROWS BY THE PICTURE'S OWN SHAPE, never by the format
   * currently chosen for the NEXT press — a fact about a future picture is not
   * a fact about one already made.
   *
   * MUTATION: filter by `formatId === chosen?.id` instead of the picture's own
   * width/height and this goes red the moment two shapes share a formatId.
   */
  test('"Square post" narrows the grid to square pictures', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY, SHAPES)
    const filters = container.querySelector('[data-guide="studio-filter"]') as HTMLElement
    await user.click(within(filters).getByRole('button', { name: 'Square post' }))

    const grid = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    // Both the plain square and the stamped-square picture are square.
    expect(within(grid).getAllByRole('button')).toHaveLength(2)
  })

  test('"Story" and "Wide" narrow to the tall and the landscape picture respectively', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY, SHAPES)
    const filters = container.querySelector('[data-guide="studio-filter"]') as HTMLElement
    const grid = () => container.querySelector('[data-guide="studio-strip"]') as HTMLElement

    await user.click(within(filters).getByRole('button', { name: 'Story' }))
    expect(within(grid()).getAllByRole('button')).toHaveLength(1)
    expect(within(grid()).getByRole('button', { name: story.prompt })).toBeTruthy()

    await user.click(within(filters).getByRole('button', { name: 'Wide' }))
    expect(within(grid()).getAllByRole('button')).toHaveLength(1)
    expect(within(grid()).getByRole('button', { name: wide.prompt })).toBeTruthy()
  })

  test('"With logo" narrows to pictures Sahoda actually stamped', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY, SHAPES)
    const filters = container.querySelector('[data-guide="studio-filter"]') as HTMLElement
    await user.click(within(filters).getByRole('button', { name: 'With logo' }))

    const grid = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    expect(within(grid).getAllByRole('button')).toHaveLength(1)
    expect(within(grid).getByRole('button', { name: stamped.prompt })).toBeTruthy()
  })

  test('a filter that matches nothing says so rather than showing an empty grid silently', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY, [square])
    const filters = container.querySelector('[data-guide="studio-filter"]') as HTMLElement
    await user.click(within(filters).getByRole('button', { name: 'Story' }))
    expect(container.querySelector('[data-guide="studio-strip"]')).toBeNull()
    expect(screen.getByText(/nothing matches this filter/i)).toBeTruthy()
  })

  /** The bar keeps its own cap; the grid runs the page's own width. */
  test("the grid is not capped at the bar's own measure", () => {
    const { container } = open(LIBRARY, SHAPES)
    const grid = container.querySelector('[data-guide="studio-strip"]') as HTMLElement
    expect(grid.className).not.toMatch(/max-w-\[820px\]/)
  })
})

/** Picks the given library thumbnails, in order, via the Match panel. */
async function pickReferences(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
  indices: number[],
): Promise<void> {
  await chooseModeUI(user, /match a picture/i)
  const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
  const thumbs = within(picker).getAllByRole('button')
  for (const at of indices) {
    // eslint-disable-next-line no-await-in-loop -- picks must land in order.
    await user.click(thumbs[at]!)
  }
}

describe('the composer thumbnail strip is not a dead end', () => {
  /**
   * ── CLICK OPENS A PREVIEW, NEVER REMOVES ────────────────────────────────────
   * The thumbnail used to carry the removal handler directly. Now it opens
   * `ReferencePreview`, and removal lives only on the small X beside it.
   */
  test('clicking a picked thumbnail opens a large preview of it', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await pickReferences(user, container, [0]) // LIBRARY[0] = 'A shopfront'

    const strip = container.querySelector('[data-guide="studio-picked"]') as HTMLElement
    await user.click(within(strip).getByRole('button', { name: /open a shopfront large/i }))

    // `ReferencePreview` renders the same zoom control `PictureViewer` does,
    // which only exists once the dialog is actually open and showing an image.
    expect(screen.getByRole('button', { name: /zoomed to 100%/i })).toBeTruthy()
  })

  /**
   * ── THE X IS THE ONLY REMOVAL PATH, AND IT NAMES WHICH ONE ──────────────────
   * MUTATION: change the X's `onClick` to always drop `picked[0]` and this goes
   * red on the second assertion (removing 'a2', at index 1, would instead drop
   * 'a1' and leave 'a2' — the surviving thumbnail's accessible name would read
   * "picked 1 of 1" but for the wrong picture).
   */
  test('the X removes the named reference and renumbers the rest', async () => {
    const user = userEvent.setup()
    const { container } = open()
    // LIBRARY[0]='A shopfront' (a1, picked first), LIBRARY[1]=null-titled (a2,
    // picked second). The X pressed below belongs to the SECOND thumbnail, so
    // a mutation that always drops `picked[0]` removes the WRONG one — 'A
    // shopfront' — and this test would then find it gone instead of kept.
    await pickReferences(user, container, [0, 1])

    const strip = container.querySelector('[data-guide="studio-picked"]') as HTMLElement
    expect(
      within(strip).getByRole('button', { name: /open a shopfront large, picked 1 of 2/i }),
    ).toBeTruthy()
    expect(
      within(strip).getByRole('button', { name: /stop matching this picture, picked 2 of 2/i }),
    ).toBeTruthy()

    await user.click(
      within(strip).getByRole('button', { name: /stop matching this picture, picked 2 of 2/i }),
    )

    // The SECOND of two was removed. 'A shopfront' survives, still first, and
    // only one thumbnail remains.
    expect(strip.querySelectorAll('img').length).toBe(1)
    expect(strip.querySelectorAll('[aria-label^="Stop matching"]')).toHaveLength(1)
    expect(
      within(strip).getByRole('button', { name: /open a shopfront large, picked 1 of 1/i }),
    ).toBeTruthy()
  })

  /** A genuine `<button>`, named for WHICH reference it drops, never "Remove". */
  test('the removal control names which reference it removes', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await pickReferences(user, container, [0])
    const strip = container.querySelector('[data-guide="studio-picked"]') as HTMLElement
    const removers = within(strip).getAllByRole('button', { name: /stop matching/i })
    expect(removers).toHaveLength(1)
    expect(removers[0]!.getAttribute('aria-label')).not.toBe('Remove')
    expect(removers[0]!.getAttribute('aria-label')).toMatch(/a shopfront/i)
  })
})

describe('rewrite for the model', () => {
  /** The button carries the same total-cost pattern Generate Image uses. */
  test('shows its price before it is pressed', () => {
    open()
    const button = screen.getByRole('button', { name: /rewrite for the model/i })
    expect(button.textContent).toMatch(/1 credit\b/i)
  })

  test('is disabled while the prompt is empty', () => {
    open()
    expect(screen.getByRole('button', { name: /rewrite for the model/i })).toBeDisabled()
  })

  test('becomes enabled once something is typed', async () => {
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    expect(screen.getByRole('button', { name: /rewrite for the model/i })).toBeEnabled()
  })

  /**
   * MUTATION: delete `if (pressLocked.current) return` (and its paired
   * `pressLocked.current = true`) from `refine` in `prompt-refine-control.tsx`
   * and this goes red: `refineStudioPrompt` called more than once.
   */
  test('a second click while the first is in flight never reaches refineStudioPrompt twice', async () => {
    let resolve: ((value: Awaited<ReturnType<typeof refineStudioPrompt>>) => void) | null = null
    vi.mocked(refineStudioPrompt).mockImplementation(
      () =>
        new Promise((res) => {
          resolve = res
        }),
    )
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    const button = screen.getByRole('button', { name: /rewrite for the model/i })

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(refineStudioPrompt).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolve!({
        ok: true,
        original: 'a shopfront',
        refined: 'a warmly lit shopfront, morning light',
        headline: 'Built from your words alone',
        body: 'Sahoda read your Brand Brain and found nothing in it that changes an image prompt.',
        brainState: 'ok',
        usedSignals: [],
        balanceAfter: 99,
        creditsCharged: 1,
      })
    })
    await waitFor(() => expect(button).not.toBeDisabled())
  })

  /** The original is never lost: accepting a refinement can always be undone. */
  test('a refined prompt can be reverted back to exactly what was typed', async () => {
    vi.mocked(refineStudioPrompt).mockResolvedValue({
      ok: true,
      original: 'a shopfront',
      refined: 'a warmly lit shopfront, morning light',
      headline: 'Built from your words alone',
      body: 'Sahoda read your Brand Brain and found nothing in it that changes an image prompt.',
      brainState: 'ok',
      usedSignals: [],
      balanceAfter: 99,
      creditsCharged: 1,
    })
    const user = userEvent.setup()
    open()
    const prompt = screen.getByLabelText(/what should the picture show/i) as HTMLTextAreaElement
    await user.type(prompt, 'a shopfront')
    await user.click(screen.getByRole('button', { name: /rewrite for the model/i }))

    await waitFor(() => expect(prompt.value).toBe('a warmly lit shopfront, morning light'))

    await user.click(screen.getByRole('button', { name: /get your own words back/i }))
    expect(prompt.value).toBe('a shopfront')
  })

  /**
   * ── THREE STATES, EACH ITS OWN SENTENCE ──────────────────────────────────
   * MUTATION: hardcode one Brand Brain sentence for all three states in
   * `prompt-refine-control.tsx` (render `result.headline` as a fixed string)
   * and every assertion below but the first goes red.
   */
  test.each([
    ['unreadable', 'Sahoda could not read your Brand Brain this time'],
    ['empty', 'Sahoda has nothing about your brand to work from yet'],
    ['ok', 'Built from your words alone'],
  ] as const)(
    "renders the engine's own sentence for the %s Brand Brain state",
    async (brainState, headline) => {
      vi.mocked(refineStudioPrompt).mockResolvedValue({
        ok: true,
        original: 'a shopfront',
        refined: 'a warmly lit shopfront',
        headline,
        body: 'placeholder body',
        brainState,
        usedSignals: [],
        balanceAfter: 99,
        creditsCharged: 1,
      })
      const user = userEvent.setup()
      open()
      await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
      await user.click(screen.getByRole('button', { name: /rewrite for the model/i }))

      expect(await screen.findByText(new RegExp(headline, 'i'))).toBeTruthy()
    },
  )

  test('an insufficient balance names both numbers, never a generic refusal', async () => {
    vi.mocked(refineStudioPrompt).mockResolvedValue({
      ok: false,
      insufficient: true,
      required: 1,
      available: 0,
    })
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    await user.click(screen.getByRole('button', { name: /rewrite for the model/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/1 credit.*0 credits/i)
  })
})

/**
 * `scrollHeight` is not implemented by jsdom's layout engine (there is no
 * layout engine), so `Textarea`'s own `fit()` — which reads it to decide how
 * tall to grow — always sees 0 unless a test supplies one. This stub answers
 * with a height proportional to the number of lines in the field's OWN value,
 * which is enough to prove the grow-then-cap behaviour without needing a real
 * browser: an empty field reports its `rows={3}` rest height, and a field with
 * many lines reports something taller than the ceiling.
 */
function stubScrollHeightByLineCount(): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      const value = this instanceof HTMLTextAreaElement ? this.value : ''
      const lines = Math.max(3, value.split('\n').length)
      return lines * 18
    },
  })
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original)
  }
}

describe('the prompt is a generous, growing textarea', () => {
  /**
   * ── THREE LINES AT REST, NOT ONE ───────────────────────────────────────────
   * The founder's own complaint: a single-line box on a screen whose entire
   * purpose is describing a picture.
   */
  test('rests at three lines, not one', () => {
    open()
    const prompt = screen.getByLabelText(/what should the picture show/i)
    expect(prompt).toHaveAttribute('rows', '3')
  })

  /**
   * MUTATION: change `maxRows={8}` to `maxRows={3}` on the prompt in
   * `studio-workbench.tsx` and this goes red — the box would cap at its own
   * rest height and never grow at all.
   */
  test('grows past three lines as content is typed, then stops and scrolls', () => {
    const restore = stubScrollHeightByLineCount()
    try {
      open()
      const prompt = screen.getByLabelText(/what should the picture show/i) as HTMLTextAreaElement

      fireEvent.input(prompt, { target: { value: Array(5).fill('a line').join('\n') } })
      const grown = Number.parseFloat(prompt.style.height)
      expect(grown).toBeGreaterThan(3 * 18)
      expect(prompt.style.overflowY).toBe('hidden')

      // Comfortably past the 8-line ceiling.
      fireEvent.input(prompt, { target: { value: Array(20).fill('a line').join('\n') } })
      const capped = Number.parseFloat(prompt.style.height)
      expect(capped).toBe(8 * 18)
      expect(prompt.style.overflowY).toBe('auto')
    } finally {
      restore()
    }
  })

  /** Enter is unchanged: it inserts a newline and spends nothing. */
  test('Enter inserts a newline rather than submitting', async () => {
    vi.mocked(queueGeneration).mockClear()
    const user = userEvent.setup()
    open()
    const prompt = screen.getByLabelText(/what should the picture show/i) as HTMLTextAreaElement
    await user.type(prompt, 'a shopfront{Enter}at dawn')

    expect(prompt.value).toBe('a shopfront\nat dawn')
    expect(queueGeneration).not.toHaveBeenCalled()
  })

  /**
   * ── THE ADDED AFFORDANCE ────────────────────────────────────────────────
   * MUTATION: remove the `(event.metaKey || event.ctrlKey) &&` check so a
   * bare Enter also submits, and this goes red together with the test above:
   * Enter alone would then call `queueGeneration`.
   */
  test('Ctrl+Enter submits when the prompt is ready', async () => {
    vi.mocked(queueGeneration).mockClear()
    vi.mocked(queueGeneration).mockResolvedValue({
      ok: true,
      generationId: 'g1',
      balanceAfter: 10,
      made: 1,
      asked: 1,
    })
    const user = userEvent.setup()
    open()
    const prompt = screen.getByLabelText(/what should the picture show/i)
    await user.type(prompt, 'a shopfront')
    await user.type(prompt, '{Control>}{Enter}{/Control}')

    expect(queueGeneration).toHaveBeenCalledTimes(1)
  })

  /** The same readiness rule the button's own `disabled` enforces. */
  test('Ctrl+Enter does nothing while the prompt is empty', async () => {
    // Cleared, not asserted from zero: an earlier test in this file may have
    // already called `queueGeneration` for an unrelated press, and this test
    // is about calls made from THIS press alone.
    vi.mocked(queueGeneration).mockClear()
    const user = userEvent.setup()
    open()
    const prompt = screen.getByLabelText(/what should the picture show/i)
    await user.type(prompt, '{Control>}{Enter}{/Control}')

    expect(queueGeneration).not.toHaveBeenCalled()
  })
})
