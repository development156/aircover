import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { toChannelSet } from '@sahoda/shared'

import { MEDIA_UPLOAD_CAP_BYTES, MEDIA_UPLOAD_TOO_LARGE } from '@/lib/posts/media-constants'

/**
 * The composer's direct upload has the same shape as the library's, and the
 * same two holes: a file over the platform's body limit is answered 413 before
 * the action runs, and a thrown action inside the transition takes the screen.
 */

const attachMedia = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/app/actions/posts-media', () => ({
  attachMedia: (...args: unknown[]) => attachMedia(...args),
}))
vi.mock('@/app/actions/posts-crop', () => ({ acceptCropForUpload: vi.fn() }))

const { MediaAttach } = await import('./media-attach')

const POST_ID = '11111111-1111-4111-8111-111111111111'

function photo(name: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' })
}

function picker(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MediaAttach guards the transport', () => {
  test('an oversize file is refused before the action is called', async () => {
    const user = userEvent.setup()
    render(<MediaAttach postId={POST_ID} channels={toChannelSet(['x'])} />)

    await user.upload(picker(), photo('huge.png', MEDIA_UPLOAD_CAP_BYTES + 1))

    expect(attachMedia).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(MEDIA_UPLOAD_TOO_LARGE)
  })

  test('a thrown action becomes a refusal naming the file', async () => {
    const user = userEvent.setup()
    attachMedia.mockRejectedValue(new Error('An unexpected response was received from the server'))
    render(<MediaAttach postId={POST_ID} channels={toChannelSet(['x'])} />)

    await user.upload(picker(), photo('shopfront.png', 1_000))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not add shopfront\.png/i)
    expect(refresh).not.toHaveBeenCalled()
    expect(picker()).not.toBeDisabled()
  })
})
