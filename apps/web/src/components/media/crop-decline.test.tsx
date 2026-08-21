import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { toChannelSet } from '@sahoda/shared'

const attachMedia = vi.fn()
const acceptCropForUpload = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/actions/posts-media', () => ({
  attachMedia: (...a: unknown[]) => attachMedia(...a),
}))
vi.mock('@/app/actions/posts-crop', () => ({
  acceptCropForUpload: (...a: unknown[]) => acceptCropForUpload(...a),
}))

import { MediaAttach } from '@/components/posts/media-attach'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE REFUSAL STILL FIRES WHEN THE OFFER IS DECLINED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is a behaviour change on the publish path, so the thing that has to be
 * proven is the thing that did NOT change. Before this lane, a wrong-shaped
 * photo was refused: a red sentence, no attachment, nothing in storage. After
 * it, the same refusal appears and an offer sits beside it. Declining must leave
 * a writer looking at exactly the screen they saw before — not a softened one,
 * not a dismissed one, and above all not an attached photo.
 *
 * Three separate claims, because a single "it still says no" would pass on a
 * build that had quietly attached the file anyway:
 *
 *   1. the refusal sentence is on screen the moment the file is refused
 *   2. it is STILL on screen after the crop dialog is opened and dismissed
 *   3. no accept action was called — the write path was never entered
 *
 * `jsdom` has no `<dialog>` layout and no `createObjectURL`, so both are
 * stubbed. Neither is what is under test: the assertions are about which
 * sentences exist and which function was called.
 */

const REFUSAL = 'Check this file — no channel on this post can use it.'

const OFFER = {
  previewUrl: null,
  assetId: null,
  original: { width: 1080, height: 1920, mime: 'image/jpeg', bytes: 900_000 },
  size: { width: 1080, height: 1440 },
  focal: { x: 0.5, y: 0.42 },
  outputMime: 'image/jpeg',
  outcomes: [
    {
      channel: 'instagram' as const,
      format: null,
      width: 1080,
      height: 1440,
      note: 'Needs inside the 0.75–1.91 shape range, at least 320×320.',
      fixed: true,
    },
  ],
}

beforeEach(() => {
  attachMedia.mockReset()
  acceptCropForUpload.mockReset()
  // `<dialog>` is not implemented in jsdom; the component only ever calls these.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, writable: true })
})

async function pickARefusedFile() {
  const user = userEvent.setup()
  render(<MediaAttach postId="p1" channels={toChannelSet(['instagram'])} />)
  const input = screen.getByLabelText(/add media/i, { selector: 'input' })
  await user.upload(
    input,
    new File([new Uint8Array([1, 2, 3])], 'tall.jpg', { type: 'image/jpeg' }),
  )
  return user
}

describe('declining a crop leaves the refusal exactly as it was', () => {
  test('the refusal is shown, and an offer sits beside it rather than replacing it', async () => {
    attachMedia.mockResolvedValue({
      ok: false,
      message: REFUSAL,
      rejections: [
        {
          channel: 'instagram',
          violations: [{ code: 'MEDIA_ASPECT', message: 'instagram feed photos must be…' }],
        },
      ],
      offer: OFFER,
    })

    await pickARefusedFile()

    await waitFor(() => expect(screen.getByText(REFUSAL)).toBeInTheDocument())
    // The offer is an ADDITION. Both are on screen at once.
    expect(screen.getByRole('button', { name: /show the crop/i })).toBeInTheDocument()
  })

  test('dismissing the dialog keeps the refusal and calls NOTHING', async () => {
    attachMedia.mockResolvedValue({ ok: false, message: REFUSAL, rejections: [], offer: OFFER })

    const user = await pickARefusedFile()
    await waitFor(() => expect(screen.getByText(REFUSAL)).toBeInTheDocument())

    // The dialog opens on its own when an offer arrives; close it the way a
    // person declining would.
    await user.click(await screen.findByRole('button', { name: /keep it as it is/i }))

    // 1 · the refusal did not soften, move or disappear
    expect(screen.getByText(REFUSAL)).toBeInTheDocument()
    // 2 · the write path was never entered
    expect(acceptCropForUpload).not.toHaveBeenCalled()
    // 3 · and the attach was not retried behind the scenes
    expect(attachMedia).toHaveBeenCalledTimes(1)
  })

  test('the refusal survives re-opening and dismissing the offer again', async () => {
    attachMedia.mockResolvedValue({ ok: false, message: REFUSAL, rejections: [], offer: OFFER })

    const user = await pickARefusedFile()
    await waitFor(() => expect(screen.getByText(REFUSAL)).toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: /keep it as it is/i }))
    await user.click(screen.getByRole('button', { name: /show the crop/i }))
    await user.click(await screen.findByRole('button', { name: /keep it as it is/i }))

    expect(screen.getByText(REFUSAL)).toBeInTheDocument()
    expect(acceptCropForUpload).not.toHaveBeenCalled()
  })

  test('a refusal with NO offer says why, and shows no crop button at all', async () => {
    attachMedia.mockResolvedValue({
      ok: false,
      message: REFUSAL,
      rejections: [],
      noOffer: 'below_floor',
    })

    await pickARefusedFile()

    await waitFor(() => expect(screen.getByText(REFUSAL)).toBeInTheDocument())
    expect(screen.getByText(/cropping can only make a photo smaller/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show the crop/i })).not.toBeInTheDocument()
  })

  test('accepting IS what calls the write path, with the focal point it was shown', async () => {
    // The other half of the claim: declining calls nothing BECAUSE accepting is
    // the only thing that calls anything. Without this, a build where the accept
    // button was also inert would pass every test above.
    attachMedia.mockResolvedValue({ ok: false, message: REFUSAL, rejections: [], offer: OFFER })
    acceptCropForUpload.mockResolvedValue({ ok: true, warnings: [], message: 'Cropped.' })

    const user = await pickARefusedFile()
    await waitFor(() => expect(screen.getByText(REFUSAL)).toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: /use this crop/i }))

    await waitFor(() => expect(acceptCropForUpload).toHaveBeenCalledTimes(1))
    const call = acceptCropForUpload.mock.calls[0] as unknown[]
    expect(call[0]).toBe('p1')
    // The suggested focal point, not a centre the dialog invented.
    expect(call[2]).toBeCloseTo(0.5)
    expect(call[3]).toBeCloseTo(0.42)
  })
})
