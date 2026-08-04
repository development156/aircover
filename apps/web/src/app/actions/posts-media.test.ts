import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `attachMedia` / `detachMedia`.
 *
 * The property under test is that validation runs on the FILE, not on what the
 * browser said about it, and that a refused file leaves nothing behind. A direct
 * browser→storage upload would make `validateMedia`'s mime/bytes/dimension checks
 * validate a claim rather than a file, which is why the bytes come through here.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const POST_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  post: null as { id: string; channels: string[] } | null,
  existingMedia: [] as unknown[],
  uploads: [] as { path: string; contentType: string | undefined }[],
  removed: [] as string[],
  inserted: [] as Record<string, unknown>[],
  insertError: null as { code: string } | null,
  uploadError: null as { message: string } | null,
  deleted: null as { storage_path: string } | null,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WORKSPACE }),
}))
vi.mock('@/lib/posts/read', () => ({
  getPost: () => Promise.resolve(state.post),
  listMedia: () => Promise.resolve(state.existingMedia),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    storage: {
      from: () => ({
        upload: (path: string, _bytes: unknown, opts?: { contentType?: string }) => {
          if (state.uploadError) return Promise.resolve({ error: state.uploadError })
          state.uploads.push({ path, contentType: opts?.contentType })
          return Promise.resolve({ error: null })
        },
        remove: (paths: string[]) => {
          state.removed.push(...paths)
          return Promise.resolve({ error: null })
        },
      }),
    },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        state.inserted.push(row)
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                state.insertError
                  ? { data: null, error: state.insertError }
                  : { data: { ...storedRow(), ...row }, error: null },
              ),
          }),
        }
      },
      delete: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: () => Promise.resolve({ data: state.deleted, error: null }),
          }),
        }),
      }),
    }),
  }),
}))

const { attachMedia, detachMedia } = await import('./posts-media')

function storedRow() {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    workspace_id: WORKSPACE,
    post_id: POST_ID,
    storage_path: 'x',
    mime: 'image/png',
    bytes: 1,
    width: 1,
    height: 1,
    alt: null,
    meta: null,
    created_at: '2026-07-19T00:00:00.000Z',
    updated_at: '2026-07-19T00:00:00.000Z',
  }
}

/** A real 300x300 PNG header — enough bytes for the sniffer to read IHDR. */
function pngBytes(width = 300, height = 300): Uint8Array {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  // IHDR chunk: length 13, type 'IHDR', then width/height big-endian u32.
  b.set([0x00, 0x00, 0x00, 0x0d], 8)
  b.set([0x49, 0x48, 0x44, 0x52], 12)
  new DataView(b.buffer).setUint32(16, width)
  new DataView(b.buffer).setUint32(20, height)
  return b
}

/** A GIF89a header — a type GBP and LinkedIn do not accept. */
function gifBytes(width = 400, height = 400): Uint8Array {
  const b = new Uint8Array(13)
  b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0) // 'GIF89a'
  const view = new DataView(b.buffer)
  view.setUint16(6, width, true) // little-endian
  view.setUint16(8, height, true)
  return b
}

function fileFrom(bytes: Uint8Array, name: string, claimedType: string): File {
  return new File([bytes as unknown as BlobPart], name, { type: claimedType })
}

function formWith(file: File): FormData {
  const fd = new FormData()
  fd.set('file', file)
  return fd
}

beforeEach(() => {
  state.post = { id: POST_ID, channels: ['x'] }
  state.existingMedia = []
  state.uploads = []
  state.removed = []
  state.inserted = []
  state.insertError = null
  state.uploadError = null
  state.deleted = { storage_path: `${WORKSPACE}/${POST_ID}/obj.png` }
})

describe('attachMedia', () => {
  test('attaches a valid image', async () => {
    const result = await attachMedia(POST_ID, formWith(fileFrom(pngBytes(), 'a.png', 'image/png')))

    expect(result.ok).toBe(true)
    expect(state.uploads).toHaveLength(1)
    expect(state.inserted).toHaveLength(1)
  })

  test('records the mime the BYTES say, not the one the browser claimed', async () => {
    // A PNG announced as a jpeg. Trusting `File.type` would store 'image/jpeg'
    // and every later validateMedia call would reason about the wrong format.
    await attachMedia(POST_ID, formWith(fileFrom(pngBytes(), 'lie.jpg', 'image/jpeg')))

    expect(state.inserted[0]?.mime).toBe('image/png')
    expect(state.uploads[0]?.contentType).toBe('image/png')
  })

  test('judges the file against the channel rules using its REAL type', async () => {
    // The discriminating case. GBP accepts only jpeg/png. This file IS a gif but
    // announces itself as png. If the accept/reject decision were fed
    // `File.type`, the claim would let it through and the rule would be theatre;
    // fed the sniffed type, GBP refuses it and nothing is stored.
    state.post = { id: POST_ID, channels: ['gbp'] }

    const result = await attachMedia(
      POST_ID,
      formWith(fileFrom(gifBytes(400, 400), 'lie.png', 'image/png')),
    )

    expect(result.ok).toBe(false)
    expect(state.uploads).toEqual([])
    expect(state.inserted).toEqual([])
  })

  test('names the stored object by the real type, not the claimed one', async () => {
    // A wrong extension makes the object unrecoverable by type later.
    await attachMedia(POST_ID, formWith(fileFrom(pngBytes(), 'lie.jpg', 'image/jpeg')))

    expect(state.uploads[0]?.path.endsWith('.png')).toBe(true)
  })

  test('records the dimensions the bytes say', async () => {
    await attachMedia(POST_ID, formWith(fileFrom(pngBytes(640, 480), 'a.png', 'image/png')))

    expect(state.inserted[0]?.width).toBe(640)
    expect(state.inserted[0]?.height).toBe(480)
  })

  test('stores under the workspace prefix the storage policy requires', async () => {
    await attachMedia(POST_ID, formWith(fileFrom(pngBytes(), 'a.png', 'image/png')))

    // The bucket policy checks (storage.foldername(name))[1] against membership.
    expect(state.uploads[0]?.path.startsWith(`${WORKSPACE}/`)).toBe(true)
    expect(state.uploads[0]?.path).not.toContain('..')
  })

  test('refuses a file it cannot identify, and uploads nothing', async () => {
    const notAnImage = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) // '%PDF-'

    const result = await attachMedia(
      POST_ID,
      formWith(fileFrom(notAnImage, 'doc.png', 'image/png')),
    )

    expect(result.ok).toBe(false)
    expect(state.uploads).toEqual([])
    expect(state.inserted).toEqual([])
  })

  test('refuses an empty submission', async () => {
    const result = await attachMedia(POST_ID, new FormData())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/pick an image/i)
    expect(state.uploads).toEqual([])
  })

  test('refuses a file no channel can accept, before touching storage', async () => {
    // gbp requires 250x250; a 4x4 png is under it. With gbp the only channel,
    // nothing on this post can use the file.
    state.post = { id: POST_ID, channels: ['gbp'] }

    const result = await attachMedia(
      POST_ID,
      formWith(fileFrom(pngBytes(4, 4), 'a.png', 'image/png')),
    )

    expect(result.ok).toBe(false)
    expect(state.uploads).toEqual([])
    expect(state.inserted).toEqual([])
  })

  test('attaches with warnings when only some channels object', async () => {
    // 100x100 clears x (minW 4) and fails gbp (minW 250) — the writer may still
    // want it, so this is an attach with a warning, not a refusal.
    state.post = { id: POST_ID, channels: ['x', 'gbp'] }

    const result = await attachMedia(
      POST_ID,
      formWith(fileFrom(pngBytes(100, 100), 'a.png', 'image/png')),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings.map((w) => w.channel)).toContain('gbp')
    expect(state.uploads).toHaveLength(1)
  })

  test('leaves no orphan object when the row insert fails', async () => {
    state.insertError = { code: 'XX000' }

    const result = await attachMedia(POST_ID, formWith(fileFrom(pngBytes(), 'a.png', 'image/png')))

    expect(result.ok).toBe(false)
    // Uploaded, then cleaned up — a file with no row is invisible and
    // undeletable from the UI.
    expect(state.uploads).toHaveLength(1)
    expect(state.removed).toEqual([state.uploads[0]?.path])
  })

  test('does not insert a row when the upload fails', async () => {
    state.uploadError = { message: 'network' }

    const result = await attachMedia(POST_ID, formWith(fileFrom(pngBytes(), 'a.png', 'image/png')))

    expect(result.ok).toBe(false)
    expect(state.inserted).toEqual([])
  })

  test('refuses a post the caller cannot reach, without reading the file', async () => {
    state.post = null

    const result = await attachMedia(POST_ID, formWith(fileFrom(pngBytes(), 'a.png', 'image/png')))

    expect(result.ok).toBe(false)
    expect(state.uploads).toEqual([])
  })

  test('never leaks storage or database internals to the user', async () => {
    state.uploadError = { message: 'bucket "media" 403 at /storage/v1/object/...' }

    const result = await attachMedia(POST_ID, formWith(fileFrom(pngBytes(), 'a.png', 'image/png')))

    expect(result.ok).toBe(false)
    if (result.ok) return
    for (const leak of ['bucket', '403', 'storage/v1', 'media']) {
      expect(result.message.toLowerCase()).not.toContain(leak.toLowerCase())
    }
  })
})

describe('detachMedia', () => {
  test('removes the row and then the object', async () => {
    const result = await detachMedia('33333333-3333-4333-8333-333333333333')

    expect(result).toEqual({ ok: true })
    expect(state.removed).toEqual([`${WORKSPACE}/${POST_ID}/obj.png`])
  })

  test('fails honestly when the row was already gone', async () => {
    state.deleted = null

    const result = await detachMedia('33333333-3333-4333-8333-333333333333')

    expect(result.ok).toBe(false)
    // No object removal attempted — we never learned which object it was.
    expect(state.removed).toEqual([])
  })
})
