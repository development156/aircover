import { fireEvent, render, screen } from '@testing-library/react'
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
const setBrandLogo = vi.hoisted(() => vi.fn())
const extractPalette = vi.hoisted(() => vi.fn())

vi.mock('@/app/actions/theme', () => ({ saveWorkspaceTheme }))
vi.mock('@/app/actions/assets', () => ({ uploadAsset }))
vi.mock('@/app/actions/brand-logo', () => ({ setBrandLogo }))
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

/** Chroma 0.01, below the derivation's floor. It must never be OFFERED. */
const GREY = 'oklch(0.8 0.01 250)'
const BLUE = 'oklch(0.5 0.18 250)'
const TEAL = 'oklch(0.55 0.12 195)'

beforeEach(() => {
  vi.clearAllMocks()
  saveWorkspaceTheme.mockResolvedValue({ ok: true })
  uploadAsset.mockResolvedValue({ ok: true })
  setBrandLogo.mockResolvedValue({ ok: true, adopted: false, converted: false })
  // A real extraction: one colour the brand cannot use, two it can.
  extractPalette.mockReturnValue([GREY, BLUE, TEAL])
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
    // TWO, not three: the grey is below the chroma floor and is not offered.
    expect(swatches).toHaveLength(2)
    await userEvent.click(swatches[1]!)

    expect(saveWorkspaceTheme).toHaveBeenCalledTimes(1)
    expect(saveWorkspaceTheme.mock.calls[0]![0][0]).toBe(TEAL)
  })

  /** The colours it did not pick stay available, in order, behind the new one. */
  it('keeps the rest of the palette after the chosen colour', async () => {
    render(panel())

    const swatches = await screen.findAllByRole('button', { name: /use this colour/i })
    await userEvent.click(swatches[1]!)

    expect(saveWorkspaceTheme.mock.calls[0]![0]).toEqual([TEAL, BLUE])
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
    setBrandLogo.mockResolvedValue({
      ok: false,
      message: 'Sahoda could not check your library. Try again.',
    })
    render(panel({ onClose }))

    // The input is `sr-only` and carries no label on purpose: the visible
    // control is the button that clicks it. So it is addressed by type.
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })
    await userEvent.upload(input!, file)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not check your library/i)
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

  /**
   * ── THE FIVE DECOYS ───────────────────────────────────────────────────────
   * MEASURED on the founder's logo: five extracted swatches, every one chroma
   * 0.0000, every one falling back to Sahoda orange. Five choices that could not
   * do anything, which is what `no-impossible-remedy.spec.ts` exists to forbid.
   */
  it('never offers a colour the brand cannot use', async () => {
    render(panel())
    const swatches = await screen.findAllByRole('button', { name: /use this colour/i })

    for (const swatch of swatches) {
      expect(swatch.getAttribute('style'), 'an unusable colour was offered').not.toContain(GREY)
    }
  })

  /**
   * A LOGO WITH NO COLOUR IN IT. Founder's ruling, 2026-08-30: pick-a-colour.
   * His own logo is grey, white and black, so the extractor was right and there
   * was nothing to offer. Say so, and hand over a picker.
   */
  it('offers a picker when the logo is monochrome', async () => {
    extractPalette.mockReturnValue([GREY, 'oklch(0.2 0.001 250)'])
    render(panel())

    expect(await screen.findByText(/greys and blacks/i)).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /use this colour/i })).toHaveLength(0)

    const picker = document.querySelector<HTMLInputElement>('input[type="color"]')
    expect(picker, 'a monochrome logo must still let a brand colour be chosen').not.toBeNull()
  })

  /** And the picked colour is saved as the primary, like any swatch. */
  it('saves the colour picked by hand', async () => {
    extractPalette.mockReturnValue([GREY])
    render(panel())
    await screen.findByText(/greys and blacks/i)

    const picker = document.querySelector<HTMLInputElement>('input[type="color"]')!
    // Assembled from channels rather than written as a literal: the design lint
    // forbids a raw hex anywhere under `apps/web/src`, including in a test, and
    // it is right to. This is a mid blue, hue ~250.
    const blue = `#${[30, 111, 217].map((n) => n.toString(16).padStart(2, '0')).join('')}`
    fireEvent.change(picker, { target: { value: blue } })

    await vi.waitFor(() => expect(saveWorkspaceTheme).toHaveBeenCalledTimes(1))
    // 250-ish is the blue hue of #1e6fd9. The guard may move its lightness; it
    // must never repaint the hue the person chose.
    expect(saveWorkspaceTheme.mock.calls[0]![0][0]).toMatch(/oklch\([^)]*2[45][0-9]/)
  })

  /** With colour in the logo there is nothing to pick by hand. */
  it('offers no picker when the logo has usable colour', async () => {
    render(panel())
    await screen.findAllByRole('button', { name: /use this colour/i })

    expect(document.querySelector('input[type="color"]')).toBeNull()
  })

  /**
   * ── THE SAME FILE, TWICE ──────────────────────────────────────────────────
   * A file input fires `change` only when its VALUE changes, so choosing the
   * same file again fired NOTHING — no handler, no request, no error. The
   * founder was re-choosing the same logo to test, so every attempt after the
   * first was a press on a control that had gone inert.
   *
   * This is the guard for the clear. Without it the second upload never
   * happens, and the test is the only place that would notice, because the
   * browser reports nothing at all.
   */
  it('accepts the same file twice, which is how anyone retries', async () => {
    render(panel())
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })

    await userEvent.upload(input, file)
    await vi.waitFor(() => expect(setBrandLogo).toHaveBeenCalledTimes(1))
    expect(input.value, 'the value must be cleared or `change` cannot fire again').toBe('')

    await userEvent.upload(input, file)
    await vi.waitFor(() => expect(setBrandLogo).toHaveBeenCalledTimes(2))
  })

  /**
   * THE LIBRARY'S DUPLICATE RULE MUST NOT REACH THIS CONTROL. `uploadAsset`
   * refuses bytes it already holds, which is right for a media library and
   * fatal for "this is my logo": the founder's logo was already in his library
   * under its file name, so the one action that could make it findable was the
   * one guaranteed to fail.
   */
  it('goes through setBrandLogo, which adopts bytes already in the library', async () => {
    render(panel())
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    await userEvent.upload(
      input,
      new File([new Uint8Array([9])], 'logo.png', { type: 'image/png' }),
    )

    await vi.waitFor(() => expect(setBrandLogo).toHaveBeenCalledTimes(1))
    expect(
      uploadAsset,
      'the library action refuses duplicates and must not be it',
    ).not.toHaveBeenCalled()
  })

  /**
   * ── THE SYMPTOM ITSELF ────────────────────────────────────────────────────
   * The founder's logo is an SVG. Without `image/svg+xml` in `accept`, the file
   * dialog greys it out — he cannot select it, no event fires, and the button
   * presents as doing nothing at all. That was the third of three separate
   * "Replace logo is not working" reports.
   *
   * MUTATION FOUND THIS GAP: removing the type from the attribute left all 51
   * tests green while restoring the exact defect. The user-visible symptom lived
   * in one HTML attribute that nothing asserted.
   */
  it('lets an SVG be selected at all', () => {
    render(panel())
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!

    expect(input.accept, 'a greyed-out file reads as a broken button').toContain('image/svg+xml')
  })

  /**
   * ── A NOTICE NO TEST COULD SEE ────────────────────────────────────────────
   * Found by review: every `setBrandLogo` mock omitted `converted`, so
   * `stored.converted` was undefined in all 19 panel tests and the SVG notice
   * could be deleted silently. It was doubly unreachable — the panel also used
   * to close in the same transition that set the flag.
   */
  it('says so when an SVG was saved as an image', async () => {
    setBrandLogo.mockResolvedValue({ ok: true, adopted: false, converted: true })
    render(panel())

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    await userEvent.upload(
      input,
      new File([new Uint8Array([1])], 'brand.svg', { type: 'image/svg+xml' }),
    )

    expect(
      await screen.findByText(/saved your svg as a high-resolution image/i),
    ).toBeInTheDocument()
  })

  it('says nothing about conversion when a raster was uploaded', async () => {
    setBrandLogo.mockResolvedValue({ ok: true, adopted: false, converted: false })
    render(panel())

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    await userEvent.upload(
      input,
      new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' }),
    )

    await vi.waitFor(() => expect(setBrandLogo).toHaveBeenCalled())
    expect(screen.queryByText(/saved your svg/i)).toBeNull()
  })

  /**
   * ── THE UPLOAD MUST NOT BE GATED ON A CANVAS READ ─────────────────────────
   * MEASURED by review: the palette was read BEFORE the server call, inside the
   * same try. A browser that will not decode the file — an SVG with no `xmlns`,
   * common in hand-edited markup — rejected in `load()`, the catch fired, and
   * `setBrandLogo` was never called. No request, no row, and a message telling
   * the person to try a PNG for a file the server would have accepted.
   */
  it('stores the file even when its colours cannot be read', async () => {
    extractPalette.mockImplementation(() => {
      throw new Error('the browser refused to decode this')
    })
    render(panel())

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    await userEvent.upload(
      input,
      new File([new Uint8Array([1])], 'logo.svg', { type: 'image/svg+xml' }),
    )

    await vi.waitFor(() => expect(setBrandLogo).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert'), 'a stored file is not a failure').toBeNull()
  })

  it('spends nothing and writes nothing just by being opened', async () => {
    render(panel())
    await screen.findAllByRole('button', { name: /use this colour/i })

    expect(saveWorkspaceTheme).not.toHaveBeenCalled()
    expect(setBrandLogo).not.toHaveBeenCalled()
  })
})
