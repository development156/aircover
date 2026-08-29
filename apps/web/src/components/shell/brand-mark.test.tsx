import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { BrandMark } from './brand-mark'

/**
 * The control that hands the brand colour back to the person who owns it.
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
vi.mock('@/lib/brand/color-extract', () => ({ extractPalette }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

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
  it('shows the workspace logo when there is one', () => {
    render(<BrandMark logoUrl="https://example.test/logo.png" primary={GREY} />)

    expect(screen.getByRole('button', { name: /your brand/i })).toBeInTheDocument()
    expect(document.querySelector('img')).not.toBeNull()
  })

  /** No logo is not a blank space: the chip shows the colour in use. */
  it('shows a colour chip when there is no logo', () => {
    render(<BrandMark logoUrl={null} primary={BLUE} />)

    expect(screen.getByRole('button', { name: /your brand/i })).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('opens the brand panel when pressed', async () => {
    render(<BrandMark logoUrl="https://example.test/logo.png" primary={GREY} />)

    await userEvent.click(screen.getByRole('button', { name: /your brand/i }))

    expect(screen.getByRole('dialog', { name: /brand colour/i })).toBeInTheDocument()
  })

  /**
   * THE ONE THE FOUNDER ASKED FOR. Choosing the second colour must make it the
   * primary, which is what `saveWorkspaceTheme`'s first element means.
   */
  it('makes the colour a person picks the primary one', async () => {
    render(<BrandMark logoUrl="https://example.test/logo.png" primary={GREY} />)
    await userEvent.click(screen.getByRole('button', { name: /your brand/i }))

    const swatches = await screen.findAllByRole('button', { name: /use this colour/i })
    expect(swatches).toHaveLength(2)
    await userEvent.click(swatches[1]!)

    expect(saveWorkspaceTheme).toHaveBeenCalledTimes(1)
    expect(saveWorkspaceTheme.mock.calls[0]![0][0]).toBe(BLUE)
  })

  /** The colours it did not pick stay available, in order, behind the new one. */
  it('keeps the rest of the palette after the chosen colour', async () => {
    render(<BrandMark logoUrl="https://example.test/logo.png" primary={GREY} />)
    await userEvent.click(screen.getByRole('button', { name: /your brand/i }))

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
    render(<BrandMark logoUrl="https://example.test/logo.png" primary={GREY} />)

    await userEvent.click(screen.getByRole('button', { name: /your brand/i }))

    expect(await screen.findByText(/could not read the colours/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /replace logo/i })).toBeInTheDocument()
  })

  it('invites a logo when the workspace has none', async () => {
    render(<BrandMark logoUrl={null} primary={null} />)
    await userEvent.click(screen.getByRole('button', { name: /your brand/i }))

    expect(screen.getByRole('button', { name: /add a logo/i })).toBeInTheDocument()
  })

  it('spends nothing and writes nothing just by opening', async () => {
    render(<BrandMark logoUrl="https://example.test/logo.png" primary={GREY} />)
    await userEvent.click(screen.getByRole('button', { name: /your brand/i }))

    expect(saveWorkspaceTheme).not.toHaveBeenCalled()
    expect(uploadAsset).not.toHaveBeenCalled()
  })
})
