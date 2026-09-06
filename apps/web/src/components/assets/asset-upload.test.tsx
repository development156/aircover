import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { MEDIA_UPLOAD_CAP_BYTES, MEDIA_UPLOAD_TOO_LARGE } from '@/lib/posts/media-constants'

/**
 * Two ways an upload used to take the whole /assets screen down.
 *
 * MEASURED 2026-09-06 on the preview: a 5.7 MB PNG was posted to the
 * `uploadAsset` server action, Vercel answered 413 before the action ran
 * (`bodySizeLimit: '4mb'`), `await uploadAsset(formData)` threw inside the
 * transition, and the route fell to the error boundary. The server's own
 * size check never executed, so the sentence it holds was never read.
 */

const uploadAsset = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/app/actions/assets', () => ({
  uploadAsset: (...args: unknown[]) => uploadAsset(...args),
}))

const { AssetUpload } = await import('./asset-upload')

function photo(name: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' })
}

function picker(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('an oversize file never reaches the action', () => {
  test('is refused on the client with the SAME sentence the server uses', async () => {
    const user = userEvent.setup()
    render(<AssetUpload />)

    await user.upload(picker(), photo('huge.png', MEDIA_UPLOAD_CAP_BYTES + 1))

    expect(uploadAsset).not.toHaveBeenCalled()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('huge.png')
    expect(alert).toHaveTextContent(MEDIA_UPLOAD_TOO_LARGE)
    expect(refresh).not.toHaveBeenCalled()
  })

  test('a file exactly at the cap is still sent', async () => {
    const user = userEvent.setup()
    uploadAsset.mockResolvedValue({ ok: true, unusable: [] })
    render(<AssetUpload />)

    await user.upload(picker(), photo('fits.png', MEDIA_UPLOAD_CAP_BYTES))

    expect(await screen.findByText(/Added 1 photo\./)).toBeInTheDocument()
    expect(uploadAsset).toHaveBeenCalledTimes(1)
  })
})

describe('a transport failure is one refused row, not a crashed screen', () => {
  test('a thrown action names the file and keeps the screen', async () => {
    const user = userEvent.setup()
    uploadAsset.mockRejectedValue(new Error('An unexpected response was received from the server'))
    render(<AssetUpload />)

    await user.upload(picker(), photo('shopfront.png', 1_000))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('shopfront.png')
    expect(alert).toHaveTextContent(/could not add shopfront\.png/i)
    // The control is usable again: nothing is stuck pending.
    expect(picker()).not.toBeDisabled()
  })

  test('files added before the failure still refresh the library', async () => {
    const user = userEvent.setup()
    uploadAsset
      .mockResolvedValueOnce({ ok: true, unusable: [] })
      .mockRejectedValueOnce(new Error('An unexpected response was received from the server'))
    render(<AssetUpload />)

    await user.upload(picker(), [photo('one.png', 1_000), photo('two.png', 1_000)])

    expect(await screen.findByText(/Added 1 photo\./)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('two.png')
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
