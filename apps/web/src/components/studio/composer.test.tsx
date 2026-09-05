import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import type { BrandSignal } from '@sahoda/shared'

import { queueGeneration } from '@/app/actions/studio'
import { refineStudioPrompt } from '@/app/actions/studio-prompt'
import { Composer } from '@/components/studio/composer'
import { generatableFormats } from '@/lib/studio/formats'
import { STUDIO_MODELS, routedModels, unroutedModels } from '@/lib/studio/models'
import type { LibraryPicture, LibraryRead } from '@/lib/studio/read'
import { uploadAccept } from '@/lib/studio/upload'
import { PROMPT_STARTERS } from '@/lib/studio/prompt'
import {
  MAX_TRIES_PER_PRESS,
  describeModeBlock,
  promptHintFor,
  readyModes,
  ruleFor,
} from '@/lib/studio/modes'

/**
 * THE COMPOSER, EXTRACTED, AND THE RULES IT MUST NOT RE-IMPLEMENT.
 *
 * This file OWNS what used to be `studio-workbench.test.tsx`'s composer
 * coverage: every assertion below is about a rule that lives in `modes.ts`
 * and is asked by BOTH this bar and the server action, plus the bar's own
 * shape (the bar, the pills, the panels, the picked-reference tiles, the
 * refiner, "Will send," "Not built yet"). What moved to
 * `studio-workbench.test.tsx` is the wall around this bar; what was deleted
 * outright lived in the inline "canvas" result section the redesign removed
 * — see that file's own header for exactly which tests those were and why.
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
  // reference thumbnail preview (`reference-preview.tsx`) is built on the
  // same `Modal`.
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
 * It held four, which was more than the old cap of three. The models now
 * take up to sixteen, so a four-picture library could not reach any cap and
 * the tests that exercise the limit silently stopped exercising anything.
 * Seventeen is one past the highest ceiling in the catalogue.
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

const open = (
  library: LibraryPicture[] | LibraryRead = LIBRARY,
  signals: BrandSignal[] | null = [],
  balance: number | null = null,
) =>
  render(
    <Composer
      formats={generatableFormats()}
      library={Array.isArray(library) ? { status: 'ok', pictures: library } : library}
      signals={signals}
      balance={balance}
    />,
  )

/**
 * The MODE control, not "any button on the screen whose name contains this".
 * Scoped to the fieldset rather than made more specific by string, because
 * the thing these tests are about is the mode CONTROL.
 */
function modeButton(name: RegExp): HTMLElement {
  return within(screen.getByRole('group', { name: /how should sahoda approach it/i })).getByRole(
    'button',
    { name },
  )
}

/**
 * ── PILLS OPEN THEIR OWN PANEL, ONE AT A TIME ─────────────────────────────
 * These helpers click the pill by its accessible name — the axis on the
 * label, never the bare value the eye reads — so a test does not care which
 * model, mode or size happens to be selected when it runs.
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
 * moves the bar to the Match panel, which is what makes the reference legend
 * and grid visible immediately afterwards without a second click.
 */
async function chooseModeUI(user: ReturnType<typeof userEvent.setup>, name: RegExp): Promise<void> {
  await openApproach(user)
  await user.click(modeButton(name))
}

describe('the shape of the bar', () => {
  /**
   * ── CAPPED AT 820PX AND CENTRED ────────────────────────────────────────
   * `Wall.dc.html` is the spec for the rebuilt screen and draws the bar with
   * `margin: 0 auto` — centred, not flush against the page's own left edge.
   * The wall's compact header no longer needs the bar's left edge to line up
   * with a title that used to run the page's own width, so the earlier
   * "capped, not centred" ruling (kept in this file's git history) is
   * superseded by the new artboard.
   */
  test('is capped at 820px and centred', () => {
    const { container } = open()
    const bar = container.querySelector('[data-guide="studio-bar"]') as HTMLElement
    const wrap = bar.parentElement as HTMLElement
    expect(wrap.className).toContain('max-w-[820px]')
    expect(wrap.className).toContain('mx-auto')
  })
})

describe('choosing which model draws it', () => {
  test('the reachable models are offered by what they are good at, never by id', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await openModel(user)
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement
    expect(picker).not.toBeNull()

    expect(within(picker).getAllByRole('button')).toHaveLength(routedModels().length)
    for (const model of routedModels()) {
      expect(picker.textContent, model.id).toContain(model.label)
      expect(picker.textContent, model.id).toContain(model.goodAt)
      expect(picker.textContent, model.id).not.toContain(model.id)
    }
  })

  test('only reachable models are offered, and the rest are shown as waiting', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await openModel(user)

    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement
    expect(within(picker).getAllByRole('button')).toHaveLength(routedModels().length)

    const waiting = container.querySelectorAll('[data-guide="studio-model-waiting"]')
    expect(waiting).toHaveLength(unroutedModels().length)
    expect(unroutedModels().length).toBeGreaterThan(0)
    for (const model of unroutedModels()) {
      expect(picker.textContent, model.id).toContain(model.label)
    }
  })

  /**
   * RETARGETED. This pair asserted that the offer TRACKS the model: refused for
   * one that draws a single picture, offered for one that draws four. Both
   * halves read a measured fact about the provider, and that was the wrong
   * question — the mesh can only ask for one picture whatever the model can
   * draw, so offering the mode delivered separate pictures sold as a set.
   *
   * What the screen must hold now is that no model reaches it, which is the
   * claim `modes.test.ts` binds to the schema. (4ec68060 retargeted this in
   * `studio-workbench.test.tsx`; wt-girija had moved the pair here, and the
   * 2026-09-05 merge carried the retarget across.)
   */
  test('a matching set is offered by no model, because none of them can be asked', () => {
    for (const model of STUDIO_MODELS) {
      expect(
        readyModes(model.id).map((r) => r.mode),
        model.id,
      ).not.toContain('series')
    }
  })

  test('the model also decides how many pictures may be matched against', () => {
    expect(ruleFor('match', 'bytedance-seed/seedream-5-0-lite').maxReferences).toBe(14)
    expect(ruleFor('match', 'openai/gpt-image-1').maxReferences).toBe(16)
  })
})

describe('the modes on offer', () => {
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

describe('matching a picture', () => {
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

  test('a library that could not be read says so, and never claims it is empty', async () => {
    const user = userEvent.setup()
    open({ status: 'unreadable' })
    await chooseModeUI(user, /match a picture/i)
    expect(screen.getByText(/sahoda could not read your pictures/i)).toBeTruthy()
    expect(screen.queryByText(/no pictures yet/i)).toBeNull()
  })

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
  test('a pick beyond the limit is explained rather than ignored', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await chooseModeUI(user, /match a picture/i)

    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    const thumbs = within(picker).getAllByRole('button')
    for (const thumb of thumbs) await user.click(thumb)

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

    expect(screen.getByRole('alert').textContent?.trim()).toBe(
      describeModeBlock({ mode: 'edit', references: 2 }),
    )
  })
})

describe('adding a picture from this device', () => {
  test('the way in is a real file control, reachable by name', async () => {
    const user = userEvent.setup()
    open()
    await chooseModeUI(user, /match a picture/i)
    expect(screen.getByLabelText(/add a picture from this device/i)).toBeTruthy()
  })

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

describe('something to try, for a box nobody knows what to put in', () => {
  test('starters are offered while the box is empty', () => {
    const { container } = open()
    const starters = container.querySelector('[data-guide="studio-starters"]') as HTMLElement
    expect(starters).not.toBeNull()
    expect(within(starters).getAllByRole('button').length).toBeGreaterThan(2)
  })

  /**
   * ── THE CHIP SHOWS A SUBJECT, THE BOX GETS THE SENTENCE ───────────────────
   * The chip carries a short label so five of them sit on one line above the
   * box. This test used to read the chip's own text and expect it back out of
   * the textarea, which pinned the two to the same string. The CLAIM was never
   * that they were the same string: it is that pressing a chip fills the box
   * with the starter it stands for and spends nothing. So the assertion moved
   * onto `PROMPT_STARTERS`, and the second one keeps the chip honest — its
   * tooltip must be exactly the sentence the box is about to get, so a person
   * can see the whole thing before pressing.
   */
  test('pressing one FILLS the box rather than spending anything', async () => {
    const user = userEvent.setup()
    const { container } = open()
    const starters = container.querySelector('[data-guide="studio-starters"]') as HTMLElement
    const first = within(starters).getAllByRole('button')[0]!
    const starter = PROMPT_STARTERS[0]!

    expect(first.textContent).toBe(starter.label)
    expect(first.getAttribute('title')).toBe(starter.prompt)

    await user.click(first)

    expect(
      (screen.getByLabelText(/what should the picture show/i) as HTMLTextAreaElement).value,
    ).toBe(starter.prompt)
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
  async function stepUp(user: ReturnType<typeof userEvent.setup>, times: number): Promise<void> {
    const more = screen.getByRole('button', { name: /more pictures this press/i })
    for (let i = 0; i < times; i++) await user.click(more)
  }

  test('the price shown is the TOTAL for the press, not the unit price', async () => {
    const user = userEvent.setup()
    open()
    await stepUp(user, 3)
    expect(document.body.textContent).toMatch(/24\s*credits/)
  })

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

  test('the total follows the chosen model, before the press', async () => {
    /**
     * Three of the four Studio models are `routed: false` and render as
     * LOCKED entries, because every generation against them returned
     * HTTP_400 and not one has ever succeeded. Exactly one model is
     * choosable, so there is nothing to switch TO. What survives is the
     * half that is still exercisable: the figure on the button is the
     * figure that leaves the wallet, and it tracks the COUNT.
     *
     * WHEN A SECOND MODEL IS ROUTED, restore the switch half of this test.
     */
    const user = userEvent.setup()
    const { container } = open()

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
   *
   * MUTATION: delete `if (pressLocked.current) return` (and its paired
   * `pressLocked.current = true`) from `generate` in `use-composer.ts` and
   * this goes red: `queueGeneration` called three times.
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

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(queueGeneration).toHaveBeenCalledTimes(1)

    resolve!({ ok: true, generationId: 'g1', balanceAfter: 5, made: 1, asked: 1 })
    await waitFor(() => expect(button).not.toBeDisabled())

    fireEvent.click(button)
    expect(queueGeneration).toHaveBeenCalledTimes(2)

    resolve!({ ok: true, generationId: 'g2', balanceAfter: 4, made: 1, asked: 1 })
    await waitFor(() => expect(button).not.toBeDisabled())
  })

  /**
   * ── UNMISTAKABLE, NOT JUST DISABLED ────────────────────────────────────
   * RETARGETED: the "first picture" message this used to also assert is now
   * the WALL's own copy, fed by `onBusyChange` — see
   * `studio-workbench.test.tsx`'s "says Sahoda is working on the first
   * press" for that half.
   */
  test('the button says Sahoda is working, not just that it is disabled', async () => {
    vi.mocked(queueGeneration).mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    const button = screen.getByRole('button', { name: /generate image/i })

    fireEvent.click(button)

    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.textContent).toMatch(/generating image/i)
  })

  /** `onBusyChange` is how the wall learns a press is in flight; a caller that does not pass it must not crash. */
  test('reports busy to a caller that asks, and does nothing if nobody does', async () => {
    vi.mocked(queueGeneration).mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    const seen: boolean[] = []
    render(
      <Composer
        formats={generatableFormats()}
        library={{ status: 'ok', pictures: LIBRARY }}
        signals={[]}
        balance={null}
        onBusyChange={(busy) => seen.push(busy)}
      />,
    )
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    fireEvent.click(screen.getByRole('button', { name: /generate image/i }))
    await waitFor(() => expect(seen).toContain(true))
  })
})

describe('the bar', () => {
  test('exactly one element inverts, and it is the composer bar', () => {
    const { container } = open()
    const inverted = container.querySelectorAll('[data-surface="inverse"]')
    expect(inverted).toHaveLength(1)
    expect(inverted[0]).toHaveAttribute('data-guide', 'studio-bar')
  })

  test('the prompt box carries no reserved minimum height', () => {
    open()
    const prompt = screen.getByLabelText(/what should the picture show/i)
    expect(prompt.className).toMatch(/(^|\s)min-h-0(\s|$)/)
  })

  test('generate image hovers through the inverse-scope pair, never through --ink', () => {
    open()
    const button = screen.getByRole('button', { name: /generate image/i })
    expect(button.className).toMatch(/hover:bg-primary-strong/)
    expect(button.className).toMatch(/hover:text-primary-strong-foreground/)
    expect(button.className).not.toMatch(/hover:bg-ink\b/)
  })

  test('says which model, approach and size this press will use', async () => {
    const user = userEvent.setup()
    const { container } = open()
    const chips = () => container.querySelector('[data-guide="studio-chips"]')!.textContent ?? ''

    expect(chips()).toContain(routedModels()[0]!.label)
    expect(chips()).toContain(ruleFor('on_brand').label)

    await chooseModeUI(user, /explore/i)
    expect(chips()).toContain(ruleFor('explore').label)
    expect(chips()).not.toContain(ruleFor('on_brand').label)
  })

  test('the pills are bare values with a caret, not "axis value" pairs', () => {
    const { container } = open()
    const chipsEl = container.querySelector('[data-guide="studio-chips"]') as HTMLElement
    const chipButtons = within(chipsEl)
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-expanded'))

    expect(chipButtons).toHaveLength(5)
    for (const button of chipButtons) {
      expect(button.textContent).not.toMatch(/^(Match|Model|Approach|Size|Logo),/)
    }
  })

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
   * ── A REMEDY ONLY WHERE ONE WORKS ─────────────────────────────────────────
   * The "Will send" disclosure offers "Open your Brand Brain" for the two
   * answers a person can act on (a brain with guesses to confirm, an empty one
   * to fill) and withholds it when the read FAILED, because opening the brain
   * is not what fixes a read that could not be made. wt-jiban's claim, kept
   * inside the closed disclosure the founder ruled for.
   */
  test('will send offers the Brand Brain when it has something, or nothing, to add', async () => {
    const user = userEvent.setup()
    open(LIBRARY, [{ field: 'voice', certainty: 'guessed', value: 'warm and direct' }])
    expect(screen.queryByRole('link', { name: /open your brand brain/i })).toBeNull()
    await user.click(screen.getByRole('button', { name: /will send/i }))
    expect(screen.getByRole('link', { name: /open your brand brain/i }).getAttribute('href')).toBe(
      '/brain',
    )
  })

  test('and when the brain is empty, because filling it is the remedy', async () => {
    const user = userEvent.setup()
    open(LIBRARY, [])
    await user.click(screen.getByRole('button', { name: /will send/i }))
    expect(screen.getByRole('link', { name: /open your brand brain/i })).toBeTruthy()
  })

  test('but not when the read failed, because opening the brain does not fix a read', async () => {
    const user = userEvent.setup()
    open(LIBRARY, null)
    await user.click(screen.getByRole('button', { name: /will send/i }))
    expect(screen.getByText(/could not read your brand brain/i)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /open your brand brain/i })).toBeNull()
  })

  test('no panel is open by default, and the bar stays usable', () => {
    open()
    expect(screen.queryByRole('group', { name: /how should sahoda approach it/i })).toBeNull()
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button', { name: /generate image/i })).toBeTruthy()
  })

  test('opening a second pill closes the first', async () => {
    const user = userEvent.setup()
    open()
    await openApproach(user)
    expect(screen.getByRole('group', { name: /how should sahoda approach it/i })).toBeTruthy()

    await openModel(user)
    expect(screen.queryByRole('group', { name: /how should sahoda approach it/i })).toBeNull()
  })

  test('choosing a size updates the Size pill', async () => {
    const user = userEvent.setup()
    const { container } = open()
    const story = generatableFormats().find((f) => f.width !== f.height)
    expect(story, 'no format with a non-square shape to switch to').toBeTruthy()

    await openSize(user)
    await user.selectOptions(screen.getByLabelText(/what size/i), story!.id)

    const chips = container.querySelector('[data-guide="studio-chips"]') as HTMLElement
    expect(
      within(chips).getByRole('button', { name: new RegExp(`^Size, ${story!.label}`, 'i') }),
    ).toBeTruthy()
  })
})

describe('"will send", behind a closed disclosure', () => {
  /**
   * ── REFERENCE, NOT A DECISION TAKEN ON EVERY PRESS ────────────────────
   * `Wall.dc.html`'s own ruling: a permanent block here cost the wall a row
   * of pictures. Closed by default; opening it never spends anything.
   *
   * MUTATION: render the disclosure open by default (`useState(true)` in
   * `composer-will-send.tsx`) and the first assertion below goes red.
   */
  test('is closed by default, and opens on click', async () => {
    const SIGNALS: BrandSignal[] = [
      { field: 'voice', certainty: 'confirmed', value: 'Warm, plain-spoken, never salesy' },
    ]
    const user = userEvent.setup()
    open(LIBRARY, SIGNALS)

    const toggle = screen.getByRole('button', { name: /will send/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Warm, plain-spoken, never salesy')).toBeNull()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Warm, plain-spoken, never salesy')).toBeTruthy()
  })
})

describe('what Sahoda will send, shown before the spend', () => {
  const SIGNALS: BrandSignal[] = [
    { field: 'voice', certainty: 'confirmed', value: 'Warm, plain-spoken, never salesy' },
    { field: 'palette', certainty: 'guessed', value: 'Warm cream, deep brown, one orange' },
  ]

  test('names each signal, and marks which ones were guessed', async () => {
    const user = userEvent.setup()
    open(LIBRARY, SIGNALS)
    await user.click(screen.getByRole('button', { name: /will send/i }))

    expect(screen.getByText('Warm, plain-spoken, never salesy')).toBeTruthy()
    expect(screen.getByText('Warm cream, deep brown, one orange')).toBeTruthy()
    expect(screen.getByText(/which Sahoda guessed/i)).toBeTruthy()
    expect(screen.getByText(/which you confirmed/i)).toBeTruthy()
  })

  test('each label sits in a column that never wraps, and long values clamp to two lines', async () => {
    const long: BrandSignal = {
      field: 'business',
      certainty: 'confirmed',
      value: 'Character Mentor, a tutoring studio that pairs each learner with a story',
    }
    const user = userEvent.setup()
    const { container } = open(LIBRARY, [long])
    await user.click(screen.getByRole('button', { name: /will send/i }))
    const signals = container.querySelector('[data-guide="studio-signals"]') as HTMLElement
    const dt = signals.querySelector('dt') as HTMLElement
    expect(dt).not.toBeNull()
    expect(dt.className).toMatch(/whitespace-nowrap/)
    expect(dt.textContent).toContain('Business')

    const dd = signals.querySelector('dd') as HTMLElement
    const value = within(dd).getByText(long.value)
    expect(value.className).toMatch(/line-clamp-2/)
    expect(value.textContent).toBe(long.value)
  })

  test('an empty Brand Brain and an unreadable one are different sentences', async () => {
    const user = userEvent.setup()
    open(LIBRARY, [])
    await user.click(screen.getByRole('button', { name: /will send/i }))
    const empty = screen.getByText(/nothing from your brand brain/i).textContent ?? ''
    expect(empty).toMatch(/fill it in/i)
    cleanup()

    const user2 = userEvent.setup()
    open(LIBRARY, null)
    await user2.click(screen.getByRole('button', { name: /will send/i }))
    const unread = screen.getByText(/could not read your brand brain/i).textContent ?? ''
    expect(unread).not.toMatch(/nothing from your brand brain/i)
    expect(screen.queryByText(/fill it in/i)).toBeNull()
  })

  test('brand colours render as swatches, never as oklch notation', async () => {
    const colours: BrandSignal = {
      field: 'colours',
      certainty: 'guessed',
      value: 'oklch(0.5663 0.16 262.1), oklch(0.98 0.01 90)',
    }
    const user = userEvent.setup()
    const { container } = open(LIBRARY, [colours])
    await user.click(screen.getByRole('button', { name: /will send/i }))

    expect(container.textContent).not.toMatch(/oklch\(/i)
    const signals = container.querySelector('[data-guide="studio-signals"]') as HTMLElement
    const swatches = signals.querySelectorAll('span[style*="background"]')
    expect(swatches).toHaveLength(2)
  })
})

describe('the rest of the composer', () => {
  test('shows the balance when it was read, and nothing at all when it was not', () => {
    open(LIBRARY, [], 1240)
    expect(screen.getByText(/credits left/i).textContent).toMatch(/1,240/)
    cleanup()

    open(LIBRARY, [], null)
    expect(screen.queryByText(/credits left/i)).toBeNull()
    expect(screen.queryByText(/\b0\b/)).toBeNull()
  })

  test('names the controls that are designed and not built, as text not buttons', () => {
    open()
    for (const title of ['Leave out', 'Same again', 'Follow how closely']) {
      expect(screen.getByText(title), title).toBeTruthy()
      expect(screen.queryByRole('button', { name: title }), title).toBeNull()
    }
    expect(screen.getByText(/nothing here changes what a press does today/i)).toBeTruthy()
  })

  test('does not name the prompt refiner as missing while the refiner is on screen', () => {
    open()
    const refiner = screen.getByRole('button', { name: /rewrite|refine|tidy/i })
    expect(refiner).toBeTruthy()
    const row = screen.getByText(/not built yet/i).parentElement as HTMLElement
    expect(row.textContent).not.toMatch(/tidy my words/i)
  })

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

  test('the quick-add tile is not a second door before anything is picked', () => {
    open(LIBRARY)
    expect(screen.queryByRole('group', { name: /how should sahoda approach it/i })).toBeNull()
    expect(screen.queryByLabelText(/add a picture to match/i)).toBeNull()
  })

  test('once a picture is picked, another can be added without reopening the panel', async () => {
    const user = userEvent.setup()
    const { container } = open(LIBRARY)
    await openMatch(user)
    const picker = container.querySelector('[data-guide="studio-references"]') as HTMLElement
    await user.click(within(picker).getAllByRole('button')[0]!)

    await openMatch(user)
    expect(screen.queryByRole('group', { name: /how should sahoda approach it/i })).toBeNull()
    const inComposer = screen.getByLabelText(/add a picture to match/i)
    expect(inComposer.getAttribute('accept')).toBe(uploadAccept())

    expect(screen.queryByLabelText(/add a picture from this device/i)).toBeNull()
    await openMatch(user)
    const inSettings = screen.getByLabelText(/add a picture from this device/i)
    expect(inComposer).not.toBe(inSettings)
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
  test('clicking a picked thumbnail opens a large preview of it', async () => {
    const user = userEvent.setup()
    const { container } = open()
    await pickReferences(user, container, [0]) // LIBRARY[0] = 'A shopfront'

    const strip = container.querySelector('[data-guide="studio-picked"]') as HTMLElement
    await user.click(within(strip).getByRole('button', { name: /open a shopfront large/i }))

    expect(screen.getByRole('button', { name: /zoomed to 100%/i })).toBeTruthy()
  })

  test('the X removes the named reference and renumbers the rest', async () => {
    const user = userEvent.setup()
    const { container } = open()
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

    expect(strip.querySelectorAll('img').length).toBe(1)
    expect(strip.querySelectorAll('[aria-label^="Stop matching"]')).toHaveLength(1)
    expect(
      within(strip).getByRole('button', { name: /open a shopfront large, picked 1 of 1/i }),
    ).toBeTruthy()
  })

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
 * `scrollHeight` is not implemented by jsdom's layout engine, so `Textarea`'s
 * own `fit()` always sees 0 unless a test supplies one. This stub answers
 * with a height proportional to the number of lines in the field's OWN
 * value.
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
  test('rests at three lines, not one', () => {
    open()
    const prompt = screen.getByLabelText(/what should the picture show/i)
    expect(prompt).toHaveAttribute('rows', '3')
  })

  test('grows past three lines as content is typed, then stops and scrolls', () => {
    const restore = stubScrollHeightByLineCount()
    try {
      open()
      const prompt = screen.getByLabelText(/what should the picture show/i) as HTMLTextAreaElement

      fireEvent.input(prompt, { target: { value: Array(5).fill('a line').join('\n') } })
      const grown = Number.parseFloat(prompt.style.height)
      expect(grown).toBeGreaterThan(3 * 18)
      expect(prompt.style.overflowY).toBe('hidden')

      fireEvent.input(prompt, { target: { value: Array(20).fill('a line').join('\n') } })
      const capped = Number.parseFloat(prompt.style.height)
      expect(capped).toBe(8 * 18)
      expect(prompt.style.overflowY).toBe('auto')
    } finally {
      restore()
    }
  })

  test('Enter inserts a newline rather than submitting', async () => {
    vi.mocked(queueGeneration).mockClear()
    const user = userEvent.setup()
    open()
    const prompt = screen.getByLabelText(/what should the picture show/i) as HTMLTextAreaElement
    await user.type(prompt, 'a shopfront{Enter}at dawn')

    expect(prompt.value).toBe('a shopfront\nat dawn')
    expect(queueGeneration).not.toHaveBeenCalled()
  })

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

  test('Ctrl+Enter does nothing while the prompt is empty', async () => {
    vi.mocked(queueGeneration).mockClear()
    const user = userEvent.setup()
    open()
    const prompt = screen.getByLabelText(/what should the picture show/i)
    await user.type(prompt, '{Control>}{Enter}{/Control}')

    expect(queueGeneration).not.toHaveBeenCalled()
  })
})

describe('starting from an existing generation, for the viewer to reuse', () => {
  /**
   * ── PASS 2 DEPENDS ON THIS ────────────────────────────────────────────
   * Not built by this pass (no viewer route, no remix toggle, no linking),
   * but the prop that lets a caller PREFILL every control has to actually
   * work, because the viewer is the second caller this extraction was done
   * for. This proves `initialValues` seeds the bar exactly as a picture's
   * own record would.
   */
  test('initialValues seeds every control, and a press then carries them', async () => {
    vi.mocked(queueGeneration).mockResolvedValue({
      ok: true,
      generationId: 'g1',
      balanceAfter: 5,
      made: 1,
      asked: 1,
    })
    const user = userEvent.setup()
    render(
      <Composer
        formats={generatableFormats()}
        library={{ status: 'ok', pictures: LIBRARY }}
        signals={[]}
        balance={null}
        initialValues={{
          wanted: 'a plate of samosas',
          mode: 'match',
          referenceAssetIds: ['a1'],
          count: 2,
          stamp: { enabled: false, anchor: 'top-left', sizeStep: 'large' },
        }}
      />,
    )

    expect(
      (screen.getByLabelText(/what should the picture show/i) as HTMLTextAreaElement).value,
    ).toBe('a plate of samosas')
    await user.click(screen.getByRole('button', { name: /generate image/i }))

    expect(queueGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        wanted: 'a plate of samosas',
        mode: 'match',
        referenceAssetIds: ['a1'],
        count: 2,
        stamp: { enabled: false, anchor: 'top-left', sizeStep: 'large' },
      }),
    )
  })

  test('onGenerated fires with the result before the router refreshes', async () => {
    vi.mocked(queueGeneration).mockResolvedValue({
      ok: true,
      generationId: 'g7',
      balanceAfter: 3,
      made: 1,
      asked: 1,
    })
    const onGenerated = vi.fn()
    const user = userEvent.setup()
    render(
      <Composer
        formats={generatableFormats()}
        library={{ status: 'ok', pictures: LIBRARY }}
        signals={[]}
        balance={null}
        onGenerated={onGenerated}
      />,
    )
    await user.type(screen.getByLabelText(/what should the picture show/i), 'a shopfront')
    await user.click(screen.getByRole('button', { name: /generate image/i }))

    await waitFor(() =>
      expect(onGenerated).toHaveBeenCalledWith(expect.objectContaining({ generationId: 'g7' })),
    )
  })

  test('extraControls renders inside the chip row', () => {
    const { container } = open(LIBRARY, [], null)
    render(
      <Composer
        formats={generatableFormats()}
        library={{ status: 'ok', pictures: LIBRARY }}
        signals={[]}
        balance={null}
        extraControls={<span data-testid="remix-slot">Remix this</span>}
      />,
      { container: document.body.appendChild(document.createElement('div')) },
    )
    expect(screen.getByTestId('remix-slot')).toBeTruthy()
    // The wall's own render, with no `extraControls`, carries none of it.
    expect(within(container).queryByTestId('remix-slot')).toBeNull()
  })
})
