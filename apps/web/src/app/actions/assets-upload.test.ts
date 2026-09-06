import sharp from 'sharp'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { fakeSupabase, freshState } from '@/lib/assets/fake-supabase.test-helper'

/**
 * `uploadAsset` — every way it refuses, and the one way it must NOT.
 *
 * The refusals are pinned by what they leave behind: a refused duplicate
 * uploads nothing, a full workspace reads no bytes, a non-image writes no row,
 * and a row that failed to insert takes its object with it. The last case is
 * the one this file is really for: a thumbnail that fails must cost the tile
 * its small copy and nothing else, because by then the photo is stored and its
 * row is written, and a person who lost an upload to a thumbnail would have
 * lost the thing for the sake of a convenience.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({
  supabase: null as unknown,
  quotaRefusal: null as string | null,
  thumb: { ok: true, minted: true } as { ok: boolean; minted?: boolean; message?: string },
  thumbThrows: false,
  thumbCalls: 0,
  reported: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/storage/usage', () => ({
  readStorageUsage: () => Promise.resolve(null),
  storageRefusal: () => state.quotaRefusal,
}))
vi.mock('@/lib/media/thumb', () => ({
  mintThumbnail: () => {
    state.thumbCalls += 1
    if (state.thumbThrows) return Promise.reject(new Error('sharp exploded'))
    return Promise.resolve(state.thumb)
  },
}))
vi.mock('@/lib/observability/report', () => ({
  reportServerError: (error: unknown) => state.reported.push(error),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => state.supabase,
}))

const { uploadAsset } = await import('./assets')

async function png(width = 1200, height = 800): Promise<Uint8Array> {
  const out = await sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .png()
    .toBuffer()
  return new Uint8Array(out)
}

function form(bytes: Uint8Array, name = 'shopfront.png'): FormData {
  const data = new FormData()
  data.append('file', new File([bytes as BlobPart], name, { type: 'image/png' }))
  return data
}

const row = (over: Record<string, unknown> = {}) => ({
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: WORKSPACE,
  storage_path: `${WORKSPACE}/assets/33333333-3333-4333-8333-333333333333.png`,
  kind: 'image',
  mime: 'image/png',
  bytes: 1000,
  width: 1200,
  height: 800,
  alt: null,
  title: 'shopfront.png',
  created_by: 'user_abc',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  deleted_at: null,
  ...over,
})

let fake = freshState()

beforeEach(() => {
  fake = freshState()
  state.supabase = fakeSupabase(fake)
  state.quotaRefusal = null
  state.thumb = { ok: true, minted: true }
  state.thumbThrows = false
  state.thumbCalls = 0
  state.reported = []
  // First call on `assets` is the duplicate check (no match); second is the insert.
  fake.answers.assets = [{ data: null }, { data: row() }]
})

describe('uploadAsset refuses', () => {
  test('a LIVE duplicate, by its name, and uploads nothing', async () => {
    fake.answers.assets = [{ data: { title: 'menu-board.png', deleted_at: null } }]

    const result = await uploadAsset(form(await png()))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('menu-board.png')
    expect(result.message).not.toMatch(/trash/i)
    expect(fake.storage.uploads).toEqual([])
  })

  test('a TRASHED duplicate, pointing at the trash, and uploads nothing', async () => {
    fake.answers.assets = [
      { data: { title: 'menu-board.png', deleted_at: '2026-08-30T00:00:00.000Z' } },
    ]

    const result = await uploadAsset(form(await png()))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/trash/i)
    expect(fake.storage.uploads).toEqual([])
  })

  test('a full workspace, before the bytes are read', async () => {
    state.quotaRefusal = 'Your workspace is out of room.'

    const result = await uploadAsset(form(await png()))

    expect(result).toEqual({ ok: false, message: 'Your workspace is out of room.' })
    // Nothing touched the database or the bucket: the refusal came first.
    expect(fake.calls).toEqual([])
    expect(fake.storage.uploads).toEqual([])
  })

  test('bytes that are not an image, writing no row', async () => {
    const result = await uploadAsset(form(new TextEncoder().encode('not a photo at all')))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/not an image type/i)
    expect(fake.storage.uploads).toEqual([])
    expect(fake.calls.filter((call) => call.method === 'insert')).toEqual([])
  })
})

describe('uploadAsset and the row', () => {
  test('a failed insert removes the object it had already uploaded', async () => {
    fake.answers.assets = [
      { data: null },
      { data: null, error: { code: 'XX000', message: 'boom' } },
    ]

    const result = await uploadAsset(form(await png()))

    expect(result.ok).toBe(false)
    expect(fake.storage.uploads).toHaveLength(1)
    const uploaded = fake.storage.uploads[0]?.path
    expect(fake.storage.removed).toEqual([[uploaded]])
  })

  test('a thumbnail that fails to mint is reported, and the upload still succeeds', async () => {
    state.thumb = { ok: false, message: 'The thumbnail did not encode.' }

    const result = await uploadAsset(form(await png()))

    expect(result.ok).toBe(true)
    expect(state.thumbCalls).toBe(1)
    expect(state.reported).toHaveLength(1)
    // The original is NOT swept: only a failed ROW takes the object with it.
    expect(fake.storage.removed).toEqual([])
  })

  test('a thumbnail minter that THROWS is caught, and the upload still succeeds', async () => {
    state.thumbThrows = true

    const result = await uploadAsset(form(await png()))

    expect(result.ok).toBe(true)
    expect(state.reported).toHaveLength(1)
  })

  test('the success arm carries the row and the channels that will not take it', async () => {
    const result = await uploadAsset(form(await png()))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.asset.id).toBe('33333333-3333-4333-8333-333333333333')
    expect(Array.isArray(result.unusable)).toBe(true)
  })
})
