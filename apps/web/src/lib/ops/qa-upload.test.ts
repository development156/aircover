import { describe, expect, it, vi } from 'vitest'

import { uploadQaArtifact, type UploadDeps } from './qa-upload'

const PNG = { size: 2048, type: 'image/png' }
const blob = new Blob(['x'])

function deps(over: Partial<UploadDeps> = {}) {
  const calls: string[] = []
  const base: UploadDeps = {
    sign: async () => {
      calls.push('sign')
      return {
        ok: true,
        path: 'qa/run-1/a.png',
        signedUrl: 'https://storage/sign?token=t',
        token: 't',
      }
    },
    put: async () => {
      calls.push('put')
      return { ok: true }
    },
    record: async () => {
      calls.push('record')
      return { ok: true }
    },
  }
  return { deps: { ...base, ...over }, calls }
}

describe('attaching a screenshot', () => {
  it('checks, signs, uploads, then records — in that order', async () => {
    const { deps: d, calls } = deps()

    const result = await uploadQaArtifact('run-1', PNG, blob, d)

    expect(result).toEqual({ ok: true })
    expect(calls).toEqual(['sign', 'put', 'record'])
  })

  it('NEVER records a row when the upload fails', async () => {
    // The property that matters. An artifact row written before the bytes land
    // is a thumbnail that 404s forever, in the one table whose job is to be
    // evidence. Asserted on the outcome — record was not called — rather than
    // on the message.
    const record = vi.fn(async () => ({ ok: true as const }))
    const { deps: d } = deps({
      put: async () => ({ ok: false, message: 'That screenshot did not upload.' }),
      record,
    })

    const result = await uploadQaArtifact('run-1', PNG, blob, d)

    expect(result).toMatchObject({ ok: false })
    expect(record).not.toHaveBeenCalled()
  })

  it('does not upload anything the check refuses', async () => {
    const sign = vi.fn()
    const put = vi.fn()
    const { deps: d } = deps({ sign: sign as never, put: put as never })

    const result = await uploadQaArtifact('run-1', { size: 20e6, type: 'image/png' }, blob, d)

    expect(result).toMatchObject({ ok: false })
    expect(sign).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })

  it('does not upload a type the bucket would reject anyway', async () => {
    const sign = vi.fn()
    const { deps: d } = deps({ sign: sign as never })

    const result = await uploadQaArtifact('run-1', { size: 10, type: 'application/pdf' }, blob, d)

    expect(result).toMatchObject({ ok: false })
    expect(sign).not.toHaveBeenCalled()
  })

  it('stops at a refused signature without uploading', async () => {
    const put = vi.fn()
    const { deps: d } = deps({
      sign: async () => ({ ok: false, message: 'This run is already finished.' }),
      put: put as never,
    })

    const result = await uploadQaArtifact('run-1', PNG, blob, d)

    expect(result).toEqual({ ok: false, message: 'This run is already finished.' })
    expect(put).not.toHaveBeenCalled()
  })

  it('reports the recording failure rather than claiming success', async () => {
    const { deps: d } = deps({
      record: async () => ({ ok: false, message: 'That was not saved.' }),
    })

    expect(await uploadQaArtifact('run-1', PNG, blob, d)).toEqual({
      ok: false,
      message: 'That was not saved.',
    })
  })

  it('passes the mime it derived, not the one it was handed', async () => {
    const sign = vi.fn(async () => ({
      ok: true as const,
      path: 'qa/run-1/a.jpg',
      signedUrl: 'u',
      token: 't',
    }))
    const record = vi.fn(async () => ({ ok: true as const }))
    const { deps: d } = deps({ sign, record })

    await uploadQaArtifact('run-1', { size: 99, type: 'image/jpeg' }, blob, d)

    expect(sign).toHaveBeenCalledWith({ runId: 'run-1', mime: 'image/jpeg', bytes: 99 })
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', bytes: 99, mime: 'image/jpeg', caption: null }),
    )
  })
})
