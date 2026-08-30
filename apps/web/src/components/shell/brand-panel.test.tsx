import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { BrandPanel } from './brand-panel'

/**
 * The panel that hands the brand colour back to the person who owns it.
 *
 * It lives in its own module, and its own chunk, because `BrandMark` renders on
 * every route: inline, this markup put `/(app)/layout` over the js-budget and
 * failed the production build. The tests moved with it rather than being
 * rewritten, so the guarantees are the same ones, unchanged.
 *
 * Brand Skin took the most frequent colour in the logo. For a logo that is
 * mostly grey and white that is grey, so the product went washed out while the
 * blue anybody would have picked sat second. These guard the answer: a person
 * can choose, and choosing is what writes the theme.
 */

const saveWorkspaceTheme = vi.hoisted(() => vi.fn())
const uploadAsset = vi.hoisted(() => vi.fn())
const extractPalette = vi.hoisted(() => vi.fn())

vi.mock('@/app/actions/theme', () => ({ saveWorkspaceTheme }))
vi.mock('@/app/actions/assets', () => ({ uploadAsset }))
/* Loaded with `await import` inside the component, not at the top: it renders in
   the shell, so a top-level import is 9.8 kB on every page. `vi.mock` covers a
   dynamic import of the same specifier. */
vi.mock('@/lib/brand/color-extract', () => ({ extractPalette }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const onUseBrand = vi.fn()
const onToggleSkin = vi.fn()

/**
 * The panel is rendered by `BrandMark`, which owns the switch. Every render here
 * goes through this so a prop added there cannot leave these tests passing
 * against a shape the component no longer receives.
 */
function panel(props: Partial<React.ComponentProps<typeof BrandPanel>> = {}) {
  return (
    <BrandPanel
      logoUrl="https://example.test/logo.png"
      skinOn={false}
      hasTheme
      onToggleSkin={onToggleSkin}
      onUseBrand={onUseBrand}
      onClose={vi.fn()}
      {...props}
    />
  )
}

const GREY = 'oklch(0.8 0.01 250)'
const BLUE = 'oklch(0.5 0.18 250)'

beforeEach(() => {
  vi.clearAllMocks()
  saveWorkspaceTheme.mockResolvedValue({ ok: true })
  uploadAsset.mockResolvedValue({ ok: true })
  extractPalette.mockReturnValue([GREY, BLUE])
  // jsdom never fires load on an <img>, so the decode is resolved here.
  Object.defineProperty(globalThis.Image.prototype, 'src', {
    configurable: true,
    set(this: HTMLImageElement) {
      setTimeout(() => this.onload?.(new Event('load')), 0)
    },
  })
})

describe('the brand mark', () => {
  it('is a dialog naming what it is for', () => {
    render(panel())

    expect(screen.getByRole('dialog', { name: /brand colour/i })).toBeInTheDocument()
  })

  /**
   * THE ONE THE FOUNDER ASKED FOR. Choosing the second colour must make it the
   * primary, which is what `saveWorkspaceTheme`'s first element means.
   */
  it('makes the colour a person picks the primary one', async () => {
    render(panel())

    const swatches = await screen.findAllByRole('button', { name: /use this colour/i })
    expect(swatches).toHaveLength(2)
    await userEvent.click(swatches[1]!)

    expect(saveWorkspaceTheme).toHaveBeenCalledTimes(1)
    expect(saveWorkspaceTheme.mock.calls[0]![0][0]).toBe(BLUE)
  })

  /** The colours it did not pick stay available, in order, behind the new one. */
  it('keeps the rest of the palette after the chosen colour', async () => {
    render(panel())

    const swatches = await screen.findAllByRole('button', { name: /use this colour/i })
    await userEvent.click(swatches[1]!)

    expect(saveWorkspaceTheme.mock.calls[0]![0]).toEqual([BLUE, GREY])
  })

  /**
   * A logo whose colours cannot be read from here must not leave a dead panel.
   * Replacing it carries its own bytes and never needs the canvas to cooperate.
   */
  it('offers to replace the logo when its colours cannot be read', async () => {
    extractPalette.mockReturnValue([])
    render(panel())

    expect(await screen.findByText(/could not read the colours/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /replace logo/i })).toBeInTheDocument()
  })

  it('invites a logo when the workspace has none', async () => {
    render(panel({ logoUrl: null, hasTheme: false }))

    expect(screen.getByRole('button', { name: /add a logo/i })).toBeInTheDocument()
  })

  /**
   * ── THE WAY OUT, WHERE SOMEBODY LOOKING FOR IT WILL FIND IT ────────────────
   * Pressing the logo does this too. It is repeated here because a person who
   * opened the menu to fix an unreadable screen should not have to guess that
   * the way out is a button they already walked past, and because this is the
   * only place that can say which state they are in.
   */
  it('says which colours are on and offers the other', async () => {
    render(panel({ skinOn: true }))

    expect(screen.getByText(/your brand colours are on/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /use sahoda colours/i }))
    expect(onToggleSkin).toHaveBeenCalledTimes(1)
  })

  it('offers the brand when Sahoda colours are on', () => {
    render(panel({ skinOn: false }))

    expect(screen.getByText(/sahoda colours are on/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /use my colours/i })).toBeInTheDocument()
  })

  /** With no brand stored there is nothing to switch to, so nothing claims there is. */
  it('offers no switch when the workspace has no brand', () => {
    render(panel({ logoUrl: null, hasTheme: false }))

    expect(screen.queryByText(/colours are on/i)).toBeNull()
  })

  /**
   * CHOOSING A COLOUR IS ASKING FOR IT. Saving it against a switch the person
   * has not met would mean picking a colour and watching nothing happen.
   */
  it('applies the brand when a colour is chosen', async () => {
    render(panel())

    const swatches = await screen.findAllByRole('button', { name: /use this colour/i })
    await userEvent.click(swatches[1]!)

    expect(onUseBrand).toHaveBeenCalledTimes(1)
  })

  /**
   * ── THE SILENT FAILURE, WHICH IS WHY THIS BLOCK EXISTS ────────────────────
   * `replace()` was `await uploadAsset(form)` with the result discarded.
   * `uploadAsset` refuses a duplicate, an oversized file, unreadable bytes, a
   * storage failure and a missing workspace, and every one of those closed the
   * panel and refreshed as though it had worked.
   *
   * MEASURED on the founder's workspace: "Replace logo" appeared to do nothing,
   * repeatedly. The file was refused as a DUPLICATE against the copy already in
   * the library, and the refusal was thrown away here. A control whose whole job
   * is to change something visible must never fail quietly.
   */
  it('shows why the upload was refused, and does not close', async () => {
    const onClose = vi.fn()
    uploadAsset.mockResolvedValue({
      ok: false,
      message: 'You already have this file, named shopfront.png.',
    })
    render(panel({ onClose }))

    // The input is `sr-only` and carries no label on purpose: the visible
    // control is the button that clicks it. So it is addressed by type.
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })
    await userEvent.upload(input!, file)

    expect(await screen.findByRole('alert')).toHaveTextContent(/already have this file/i)
    expect(onClose, 'a refused upload must not look like a success').not.toHaveBeenCalled()
  })

  /** The same discipline on the other write in this panel. */
  it('shows why saving a colour was refused', async () => {
    const onClose = vi.fn()
    saveWorkspaceTheme.mockResolvedValue({ ok: false, message: 'That palette could not be read.' })
    render(panel({ onClose }))

    const swatches = await screen.findAllByRole('button', { name: /use this colour/i })
    await userEvent.click(swatches[0]!)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be read/i)
    expect(onClose).not.toHaveBeenCalled()
    expect(onUseBrand, 'nothing was saved, so nothing may be applied').not.toHaveBeenCalled()
  })

  it('spends nothing and writes nothing just by being opened', async () => {
    render(panel())
    await screen.findAllByRole('button', { name: /use this colour/i })

    expect(saveWorkspaceTheme).not.toHaveBeenCalled()
    expect(uploadAsset).not.toHaveBeenCalled()
  })
})
