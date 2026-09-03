import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import { PictureViewer } from '@/components/studio/picture-viewer'
import type { CanvasPicture } from '@/lib/studio/canvas'

/**
 * JUDGING A PICTURE, WHICH IS WHAT THIS SCREEN IS FOR.
 *
 * A story is 1080 by 1920 and lands here a few hundred pixels tall. That is
 * enough to see that a picture arrived and not enough to see that a hand has six
 * fingers, which is the decision somebody opened this to make.
 */

beforeAll(() => {
  // `<dialog>` is not implemented in jsdom and `Modal` only ever calls these
  // two. The same stub `shortcut-sheet.test.tsx` uses, for the same reason.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
  // Pointer capture is likewise absent, and a viewer that only pans where it
  // exists is not what these tests are about.
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/app/actions/studio', () => ({ startPostFromPicture: vi.fn() }))

afterEach(cleanup)

const PICTURE: CanvasPicture = {
  imageId: 'p1',
  assetId: 'asset-1',
  url: 'https://example.test/1.png',
  width: 1080,
  height: 1920,
  prompt: 'the shopfront at dawn',
  formatId: 'story',
  mime: 'image/png',
  mode: 'on_brand',
  referenceAssetIds: [],
  stampedUrl: null,
  stampOutcome: null,
  madeAgo: null,
}

const open = (picture: CanvasPicture | null = PICTURE) =>
  render(<PictureViewer picture={picture} onClose={vi.fn()} />)

describe('looking closer', () => {
  test('starts showing the whole picture', () => {
    open()
    expect(screen.getByRole('button', { name: /zoomed to 100%/i })).toBeTruthy()
  })

  test('zooming in changes what is shown, and says so', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: /look closer/i }))
    expect(screen.getByRole('button', { name: /zoomed to 125%/i })).toBeTruthy()
  })

  /**
   * THE ONE THAT MATTERS. Somebody zoomed into the corner of their own picture
   * with no way back is worse off than with no zoom at all, so the way back is
   * always on the screen and its label says what pressing it DOES rather than
   * only where they are.
   */
  test('the way back to the whole picture is always offered, and named as an action', async () => {
    const user = userEvent.setup()
    open()
    const closer = screen.getByRole('button', { name: /look closer/i })
    await user.click(closer)
    await user.click(closer)

    const back = screen.getByRole('button', { name: /fit the whole picture again/i })
    await user.click(back)
    expect(screen.getByRole('button', { name: /zoomed to 100%/i })).toBeTruthy()
  })

  test('it cannot be zoomed out past the whole picture', async () => {
    const user = userEvent.setup()
    open()
    const out = screen.getByRole('button', { name: /show less of the picture/i })
    expect(out).toHaveAttribute('aria-disabled', 'true')
    await user.click(out)
    expect(screen.getByRole('button', { name: /zoomed to 100%/i })).toBeTruthy()
  })

  /**
   * Dragging is offered only once there IS somewhere to drag to. Saying it at
   * the fit would be an instruction that does nothing when followed.
   */
  test('dragging is mentioned only when there is somewhere to drag to', async () => {
    const user = userEvent.setup()
    open()
    expect(screen.queryByText(/drag the picture/i)).toBeNull()
    await user.click(screen.getByRole('button', { name: /look closer/i }))
    expect(screen.getByText(/drag the picture/i)).toBeTruthy()
  })

  test('opening a different picture starts from the whole picture again', async () => {
    const user = userEvent.setup()
    const { rerender } = open()
    await user.click(screen.getByRole('button', { name: /look closer/i }))
    expect(screen.getByRole('button', { name: /zoomed to 125%/i })).toBeTruthy()

    rerender(<PictureViewer picture={{ ...PICTURE, imageId: 'p2' }} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /zoomed to 100%/i })).toBeTruthy()
  })
})

describe('keeping the picture', () => {
  test('saving is offered by name', () => {
    open()
    expect(screen.getByRole('button', { name: /save to your computer/i })).toBeTruthy()
  })

  test('the size it was made at is stated, for judging it against a channel', () => {
    open()
    expect(document.body.textContent).toMatch(/1080/)
    expect(document.body.textContent).toMatch(/1920/)
  })
})
