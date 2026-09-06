import sharp from 'sharp'
import { beforeEach, describe, expect, test } from 'vitest'

import { THUMB_WIDTH, mintThumbnail, renderThumb, thumbObjectPath } from './thumb'

/**
 * The 480 px WebP the grid loads instead of the original.
 *
 * ── WHAT IS PINNED ───────────────────────────────────────────────────────────
 * The width, the container, the path rule the database CHECK enforces, and the
 * two promises the upload path relies on: minting is idempotent (the unique on
 * `(asset_id, recipe)` is treated as "already there", never as a failure) and
 * a failure to mint is REPORTED, never thrown, because the upload has already
 * succeeded by the time this runs and a thumbnail is not worth losing it over.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const ASSET = '33333333-3333-4333-8333-333333333333'

async function png(width: number, height: number): Promise<Uint8Array> {
  const out = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .png()
    .toBuffer()
  return new Uint8Array(out)
}

describe('renderThumb', () => {
  test('a wide original becomes a WebP no wider than THUMB_WIDTH, keeping its shape', async () => {
    const result = await renderThumb(await png(1600, 900))

    expect(result).not.toBeNull()
    if (result === null) return
    expect(result.mime).toBe('image/webp')
    expect(result.width).toBe(THUMB_WIDTH)
    // 1600:900 at 480 wide is 270 high. A stretched thumbnail would mislead the
    // person about what the photo is.
    expect(result.height).toBe(270)
    // Sniffed from the bytes, not reported by the encoder: the container is real.
    const meta = await sharp(result.bytes).metadata()
    expect(meta.format).toBe('webp')
  })

  test('bytes that are not an image give null, not a throw', async () => {
    expect(await renderThumb(new Uint8Array([1, 2, 3, 4]))).toBeNull()
  })
})

describe('thumbObjectPath', () => {
  test('sits under the derivatives prefix the database CHECK requires', () => {
    const path = thumbObjectPath({ workspaceId: WORKSPACE, assetId: ASSET })
    expect(path).toBe(`${WORKSPACE}/derivatives/${ASSET}/thumb.webp`)
    expect(path.startsWith(`${WORKSPACE}/derivatives/`)).toBe(true)
  })
})

const calls = {
  uploads: [] as { path: string; contentType: string | undefined }[],
  inserts: [] as Record<string, unknown>[],
  insertError: null as { code: string; message: string } | null,
  uploadError: null as { message: string } | null,
}

describe('mintThumbnail', () => {
  function fakeSupabase() {
    return {
      storage: {
        from: () => ({
          upload: (path: string, _bytes: Uint8Array, options?: { contentType?: string }) => {
            calls.uploads.push({ path, contentType: options?.contentType })
            return Promise.resolve({ error: calls.uploadError })
          },
        }),
      },
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          calls.inserts.push(row)
          return Promise.resolve({ error: calls.insertError })
        },
      }),
    } as never
  }

  beforeEach(() => {
    calls.uploads = []
    calls.inserts = []
    calls.insertError = null
    calls.uploadError = null
  })

  test('uploads under the thumb path and writes a derivative row with the thumb recipe', async () => {
    const result = await mintThumbnail(fakeSupabase(), {
      workspaceId: WORKSPACE,
      assetId: ASSET,
      userId: 'user_abc',
      bytes: await png(1600, 900),
      width: 1600,
      height: 900,
    })

    expect(result).toEqual({ ok: true, minted: true })
    expect(calls.uploads).toEqual([
      { path: `${WORKSPACE}/derivatives/${ASSET}/thumb.webp`, contentType: 'image/webp' },
    ])
    expect(calls.inserts).toHaveLength(1)
    const row = calls.inserts[0] as Record<string, unknown>
    expect(row.recipe).toBe('thumb')
    expect(row.asset_id).toBe(ASSET)
    expect(row.workspace_id).toBe(WORKSPACE)
    expect(row.mime).toBe('image/webp')
    expect(row.width).toBe(THUMB_WIDTH)
    // The "crop" is the whole original: nothing was cut, only scaled.
    expect(row.crop_w).toBe(1600)
    expect(row.crop_h).toBe(900)
  })

  test('an original no wider than the thumbnail is left alone', async () => {
    // A 480 px original IS its own thumbnail. Minting a copy would be storage
    // spent on a file no smaller than the one it stands in for.
    const result = await mintThumbnail(fakeSupabase(), {
      workspaceId: WORKSPACE,
      assetId: ASSET,
      userId: 'user_abc',
      bytes: await png(400, 300),
      width: 400,
      height: 300,
    })

    expect(result).toEqual({ ok: true, minted: false })
    expect(calls.uploads).toEqual([])
    expect(calls.inserts).toEqual([])
  })

  test('a row that already exists is a success, not a failure', async () => {
    calls.insertError = { code: '23505', message: 'duplicate key' }

    const result = await mintThumbnail(fakeSupabase(), {
      workspaceId: WORKSPACE,
      assetId: ASSET,
      userId: 'user_abc',
      bytes: await png(1600, 900),
      width: 1600,
      height: 900,
    })

    expect(result).toEqual({ ok: true, minted: false })
  })

  test('a storage failure is reported, never thrown', async () => {
    calls.uploadError = { message: 'bucket unavailable' }

    const result = await mintThumbnail(fakeSupabase(), {
      workspaceId: WORKSPACE,
      assetId: ASSET,
      userId: 'user_abc',
      bytes: await png(1600, 900),
      width: 1600,
      height: 900,
    })

    expect(result.ok).toBe(false)
    expect(calls.inserts).toEqual([])
  })
})
