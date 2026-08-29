import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { blankDocument, slotKeysOf, templateById, type StudioDesign } from '@sahoda/shared'

import { DesignEditor } from '@/components/studio/design-editor'
import { studioPalette } from '@/lib/studio/palette'

/**
 * THE EDITOR ITSELF, WHICH HAD NO TEST AND ONE PIECE WITH NO GUARD ANYWHERE.
 *
 * Its rules mostly live in tested modules: `document.ts` decides what a slide
 * can be, `copy-title.ts` names a duplicate, `autosave.ts` decides what is
 * owed. What lives ONLY here, and what this file is for, is the arithmetic
 * between them and the screen.
 *
 * ── THE CLAMP IS BELT AND BRACES, AND NEITHER HALF IS OBSERVABLE ALONE ──────
 * This pull request's description called the `activeIndex` clamp "the one piece
 * with no guard". Writing the guard MEASURED something more precise, and it is
 * worth recording because it changes what the test below is worth:
 *
 *   clamp removed, `setPageAt` in `removeSlide` kept    8 passed
 *   `setPageAt` removed, clamp kept                     8 passed
 *   BOTH removed                                        1 failed
 *
 * So the two protect each other. `removeSlide` moves the view to the slide
 * before the one it deleted, which means `pageAt` is never actually left past
 * the end, which means the clamp has no reachable trigger today. The test below
 * therefore guards the PAIR and not the clamp, and saying otherwise would be
 * claiming a guard that does not exist.
 *
 * Both stay. The failure they prevent is an editor reading `undefined` for the
 * current page and rendering "this design uses a layout Sahoda no longer
 * offers" over a design that is perfectly fine, which a person reads as their
 * work being gone. Keeping the cheaper of two redundant defences would be
 * trading a real safety margin for one line.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}))

const saveDesign = vi.fn()
vi.mock('@/app/actions/studio', () => ({
  saveDesign: (...args: unknown[]) => saveDesign(...args),
  deleteDesign: vi.fn(),
  designPhoto: vi.fn(),
  duplicateDesign: vi.fn(),
  exportDesign: vi.fn(),
  exportDesignPages: vi.fn(),
  setDesignTemplate: vi.fn(),
}))

const TEMPLATE = 'statement'
const template = templateById(TEMPLATE)!

function design(pages: number): StudioDesign {
  const keys = slotKeysOf(template)
  let doc = blankDocument(TEMPLATE, keys)
  for (let i = 1; i < pages; i += 1) {
    doc = { ...doc, pages: [...doc.pages, doc.pages[0]!] }
  }
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    title: 'A poster',
    preset_id: template.presetId,
    doc,
    is_template: false,
    created_by: null,
    created_at: '2026-08-29T00:00:00.000Z',
    updated_at: '2026-08-29T00:00:00.000Z',
  }
}

function open(pages: number) {
  return render(
    <DesignEditor
      design={design(pages)}
      palette={studioPalette(null).palette}
      photos={{ status: 'ok', photos: [] }}
    />,
  )
}

/** The panel shown when the editor cannot resolve a layout, preset or page. */
const CANNOT_OPEN = /layout or size Sahoda no longer offers/i

beforeEach(() => {
  saveDesign.mockReset()
  saveDesign.mockResolvedValue({ ok: true, design: design(1) })
})
afterEach(cleanup)

describe('DesignEditor', () => {
  test('a design opens rather than claiming its layout is gone', () => {
    open(1)
    expect(screen.queryByText(CANNOT_OPEN)).toBeNull()
    expect(screen.getByRole('heading', { name: 'What it says' })).toBeTruthy()
  })

  /**
   * Removing the LAST slide: `pageAt` is 1 and the array becomes length 1. Red
   * only when BOTH the clamp and `removeSlide`'s `setPageAt` are gone, per the
   * measurement in this file's header.
   */
  test('removing the last slide does not report the design as unopenable', async () => {
    const user = userEvent.setup()
    open(2)

    await user.click(screen.getAllByRole('button', { name: '2' })[0]!)
    await user.click(screen.getByRole('button', { name: /remove this slide/i }))

    expect(screen.queryByText(CANNOT_OPEN)).toBeNull()
    expect(screen.queryByRole('button', { name: '2' })).toBeNull()
  })

  test('a single slide offers no way to remove it, because a design needs one', () => {
    open(1)
    expect(screen.queryByRole('button', { name: /remove this slide/i })).toBeNull()
  })

  /**
   * Disabled at the ends rather than hidden, so the pair does not move around
   * under a finger. Both directions, because only checking one would pass for a
   * component that disabled everything.
   */
  test('move is refused at each end and offered in the middle', async () => {
    const user = userEvent.setup()
    open(3)

    const left = () => screen.getByRole('button', { name: /move left/i }) as HTMLButtonElement
    const right = () => screen.getByRole('button', { name: /move right/i }) as HTMLButtonElement

    expect(left().disabled).toBe(true)
    expect(right().disabled).toBe(false)

    await user.click(screen.getAllByRole('button', { name: '2' })[0]!)
    expect(left().disabled).toBe(false)
    expect(right().disabled).toBe(false)

    await user.click(screen.getAllByRole('button', { name: '3' })[0]!)
    expect(left().disabled).toBe(false)
    expect(right().disabled).toBe(true)
  })

  test('a move says where the slide went, for somebody not watching the strip', async () => {
    const user = userEvent.setup()
    open(3)
    await user.click(screen.getByRole('button', { name: /move right/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/slide 2 of 3/i)
  })

  /**
   * Deleting is permanent and has no trash, so the first press only arms it.
   * The sentence a person reads before the second press is the whole point.
   */
  test('delete asks once, and the question can be answered no', async () => {
    const user = userEvent.setup()
    open(1)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/no trash/i)
    expect(screen.getByRole('button', { name: /press again/i })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /keep it/i }))
    expect(screen.queryByRole('button', { name: /press again/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  /**
   * MEASURED: `TitleSchema` refuses an empty name, and the server's answer for
   * it names nothing the person can act on. With an autosave that answer would
   * arrive at every pause in typing, so the editor stops before sending.
   */
  test('emptying the name says which box, and sends nothing', async () => {
    const user = userEvent.setup()
    open(1)

    const name = screen.getByDisplayValue('A poster')
    await user.clear(name)

    expect(screen.getByRole('status')).toHaveTextContent(/name/i)
    await waitFor(() => expect(saveDesign).not.toHaveBeenCalled())
    expect(
      (screen.getByRole('button', { name: /save design/i }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  test('a carousel offers to add every slide, and a single design does not', () => {
    const one = open(1)
    expect(screen.queryByRole('button', { name: /add all/i })).toBeNull()
    one.unmount()

    open(3)
    expect(within(screen.getByRole('button', { name: /add all/i })).getByText('3')).toBeTruthy()
  })
})
