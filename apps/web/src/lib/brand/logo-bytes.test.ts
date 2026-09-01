import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Reading the workspace's logo as bytes, and measuring it.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * The wiring between sharp and the measurement is the part that fails silently.
 * `logoFactsFromRaw` reads a flat buffer at a stride of `channels` bytes per
 * pixel, so a reader that assumes four channels does not throw on a JPEG, it
 * walks the pixels at the wrong offset and returns a confident, wrong trim box
 * that the stamping step would then place a logo against. So the fixtures here
 * are real encoded images built by sharp, the facts are genuinely computed, and
 * the trim box is asserted EXACTLY: a fixture whose ink sits at a known
 * rectangle proves the stride, where `expect.any(Object)` would prove nothing.
 *
 * ── WHY REACT'S `cache` IS MOCKED ───────────────────────────────────────────
 * React's `cache()` is request-scoped and vitest has no request, so the real one
 * is a pass-through here and memoisation could not be observed at all. The mock
 * below is a per-argument memo, which is what `cache` does inside a request, and
 * it makes the guard sensitive: with the `cache()` wrapper removed from
 * `readBrandLogoBytes` the mock is never called and two reads download twice.
 */

const state = vi.hoisted(() => ({
  /**
   * The `workspaces.logo_asset_id` read, and the `assets` row `readBrandLogo`
   * itself loads. One row serves both of its paths: the pointer read (which asks
   * for `deleted_at`) and the title-match fallback.
   */
  workspaceRow: null as Record<string, unknown> | null,
  logoRow: null as Record<string, unknown> | null,
  /** The `assets` row this reader loads for the id `readBrandLogo` named. */
  assetRow: null as Record<string, unknown> | null,
  assetError: null as { code: string } | null,
  /** What storage answers. `null` bytes means the download failed. */
  fileBytes: null as Uint8Array | null,
  downloads: 0,
}))

vi.mock('server-only', () => ({}))

/** A memoising `cache`, standing in for the request-scoped real one. */
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    cache: <A extends unknown[], T>(fn: (...args: A) => T) => {
      const memo = new Map<string, T>()
      return (...args: A): T => {
        const key = JSON.stringify(args)
        if (!memo.has(key)) memo.set(key, fn(...args))
        return memo.get(key) as T
      }
    },
  }
})

vi.mock('@/lib/posts/media-url', () => ({
  signMediaPreviews: (rows: { id: string }[]) =>
    Promise.resolve(rows.map((row) => ({ id: row.id, url: 'https://signed.test/logo.png' }))),
}))

vi.mock('@/lib/supabase/server', () => {
  const chainFor = (table: string) => {
    let columns = ''
    const chain: Record<string, unknown> = {
      select: (cols: string) => {
        columns = cols
        return chain
      },
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => {
        if (table === 'workspaces') {
          return Promise.resolve({ data: state.workspaceRow, error: null })
        }
        // This reader's own read is the only one that asks for `bytes`.
        return columns.includes('bytes')
          ? Promise.resolve({ data: state.assetRow, error: state.assetError })
          : Promise.resolve({ data: state.logoRow, error: null })
      },
    }
    return chain
  }

  return {
    createServerSupabase: () => ({
      from: (table: string) => chainFor(table),
      storage: {
        from: () => ({
          download: (_path: string) => {
            state.downloads += 1
            if (state.fileBytes === null) {
              return Promise.resolve({ data: null, error: { message: 'not found' } })
            }
            const bytes = state.fileBytes
            return Promise.resolve({
              data: { arrayBuffer: () => Promise.resolve(bytes.slice().buffer) },
              error: null,
            })
          },
        }),
      },
    }),
  }
})

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

/**
 * A knockout PNG: 20x10, fully transparent, with an opaque red 4x4 block whose
 * top-left corner is at (4, 2). Every fact below is a consequence of those
 * numbers, which is what makes the assertions checkable by hand.
 */
async function transparentLogoPng(): Promise<Uint8Array> {
  const width = 20
  const height = 10
  const raw = Buffer.alloc(width * height * 4, 0)
  for (let y = 2; y <= 5; y += 1) {
    for (let x = 4; x <= 7; x += 1) {
      const offset = (y * width + x) * 4
      raw[offset] = 255
      raw[offset + 3] = 255
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer()
  return new Uint8Array(png)
}

/**
 * A JPEG: 32x16, white, with a black 8x8 block at (8, 8). JPEG carries no alpha,
 * so this decodes to THREE channels, which is the whole point of the fixture.
 * The block is aligned to the 8-pixel DCT grid and encoded without chroma
 * subsampling so the surrounding blocks stay flat white and the trim box is the
 * block itself rather than the block plus its ringing.
 */
async function opaqueLogoJpeg(): Promise<Uint8Array> {
  const width = 32
  const height = 16
  const raw = Buffer.alloc(width * height * 3, 255)
  for (let y = 8; y <= 15; y += 1) {
    for (let x = 8; x <= 15; x += 1) {
      const offset = (y * width + x) * 3
      raw[offset] = 0
      raw[offset + 1] = 0
      raw[offset + 2] = 0
    }
  }
  const jpeg = await sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
    .toBuffer()
  return new Uint8Array(jpeg)
}

/** `cache()` memoises for the life of the module, so each test is a fresh one. */
async function read() {
  const mod = await import('./logo-bytes')
  return mod.readBrandLogoBytes(WORKSPACE)
}

beforeEach(async () => {
  state.workspaceRow = { logo_asset_id: 'asset-logo' }
  state.logoRow = {
    id: 'asset-logo',
    storage_path: `${WORKSPACE}/library/logo.png`,
    deleted_at: null,
  }
  state.assetRow = {
    id: 'asset-logo',
    storage_path: `${WORKSPACE}/library/logo.png`,
    bytes: 400,
  }
  state.assetError = null
  state.fileBytes = await transparentLogoPng()
  state.downloads = 0
  vi.resetModules()
})

describe('readBrandLogoBytes', () => {
  it('returns the stored bytes and the facts the fixture actually contains', async () => {
    const result = await read()

    expect(result?.assetId).toBe('asset-logo')
    expect(result?.bytes).toEqual(state.fileBytes)
    expect(result?.facts).toEqual({
      hasAlpha: true,
      transparentBackground: true,
      // The red block, exactly where the fixture drew it.
      trim: { x: 4, y: 2, width: 4, height: 4 },
      inkPolarity: 'dark',
      shapeClass: 'square',
    })
  })

  /**
   * ── THE CHANNEL COUNT COMES FROM SHARP ────────────────────────────────────
   * A JPEG decodes to three channels. A reader that hardcodes four reads this
   * buffer at the wrong stride: `logoFactsFromRaw` refuses the length outright,
   * and the whole logo is lost. This is the test that catches it.
   */
  it('measures a three-channel JPEG logo correctly', async () => {
    state.fileBytes = await opaqueLogoJpeg()
    state.assetRow = {
      id: 'asset-logo',
      storage_path: `${WORKSPACE}/library/logo.jpg`,
      bytes: 900,
    }

    const result = await read()

    expect(result?.facts).toEqual({
      hasAlpha: false,
      transparentBackground: false,
      trim: { x: 8, y: 8, width: 8, height: 8 },
      inkPolarity: 'dark',
      shapeClass: 'square',
    })
  })

  /** No logo is an answer. The caller loses the stamp and keeps the picture. */
  it('answers null when the workspace has no logo', async () => {
    state.workspaceRow = { logo_asset_id: null }
    state.logoRow = null

    expect(await read()).toBeNull()
    expect(state.downloads, 'nothing to download when there is no logo').toBe(0)
  })

  it('answers null when the asset row will not load', async () => {
    state.assetRow = null
    state.assetError = { code: '08006' }

    expect(await read()).toBeNull()
  })

  it('answers null when the download fails', async () => {
    state.fileBytes = null

    expect(await read()).toBeNull()
  })

  /** Bytes sharp cannot decode are an answer too, not a thrown generation. */
  it('answers null on bytes that are not an image', async () => {
    state.fileBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])

    expect(await read()).toBeNull()
  })

  /** A file bigger than the library would ever accept is refused, not decoded. */
  it('refuses a logo over the upload cap without downloading it', async () => {
    const { MEDIA_UPLOAD_CAP_BYTES } = await import('@/lib/posts/media-constants')
    state.assetRow = {
      id: 'asset-logo',
      storage_path: `${WORKSPACE}/library/logo.png`,
      bytes: MEDIA_UPLOAD_CAP_BYTES + 1,
    }

    expect(await read()).toBeNull()
    expect(state.downloads, 'an oversize logo is refused before any transfer').toBe(0)
  })

  /**
   * ── ONE READ PER REQUEST ──────────────────────────────────────────────────
   * A generation producing four pictures asks four times. Downloading and
   * decoding the same logo four times for one identical answer is the cost this
   * wrapper exists to remove.
   */
  it('downloads once when read twice in the same request', async () => {
    const mod = await import('./logo-bytes')

    const first = await mod.readBrandLogoBytes(WORKSPACE)
    const second = await mod.readBrandLogoBytes(WORKSPACE)

    expect(first).not.toBeNull()
    expect(second).toEqual(first)
    expect(state.downloads, 'the logo must be downloaded once per request').toBe(1)
  })
})
