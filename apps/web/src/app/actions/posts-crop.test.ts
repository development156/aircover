import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `acceptCropForAsset` is an attach: it puts a cropped copy of a LIBRARY file on
 * a post. A file in the trash must not be attachable through it, for the same
 * reason `attachAssetToPost` refuses one — the person put it there to stop
 * using it, and the trash view says so.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const POST_ID = '11111111-1111-4111-8111-111111111111'
const ASSET_ID = '33333333-3333-4333-8333-333333333333'

const state = vi.hoisted(() => ({
  deletedAt: null as string | null,
  minted: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/posts/read', () => ({
  getPost: () => Promise.resolve({ id: POST_ID, channels: ['x'] }),
  listMedia: () => Promise.resolve([]),
  readVariantFormats: () => Promise.resolve({}),
}))
vi.mock('@/lib/assets/read', () => ({
  readAsset: () =>
    Promise.resolve({
      status: 'ok',
      asset: {
        asset: {
          id: ASSET_ID,
          storage_path: `${WORKSPACE}/library/shopfront.png`,
          mime: 'image/png',
          bytes: 400_000,
          width: 1600,
          height: 900,
          alt: null,
          deleted_at: state.deletedAt,
        },
        usage: [],
      },
    }),
}))
vi.mock('@/lib/media/mint', () => ({
  mintCroppedAttachment: (input: unknown) => {
    state.minted.push(input)
    return Promise.resolve({ ok: true, warnings: [] })
  },
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
// The direct-upload sibling in the same module pulls the whole upload path in;
// this file is about the library path only.
vi.mock('./assets', () => ({ uploadAsset: vi.fn() }))

const { acceptCropForAsset } = await import('./posts-crop')

beforeEach(() => {
  state.deletedAt = null
  state.minted = []
})

describe('acceptCropForAsset and the trash', () => {
  test('a live file is cropped onto the post (the control)', async () => {
    const result = await acceptCropForAsset(POST_ID, ASSET_ID, 0.5, 0.5)

    expect(result.ok).toBe(true)
    expect(state.minted).toHaveLength(1)
  })

  test('a trashed file is refused, pointing at Restore, and nothing is minted', async () => {
    state.deletedAt = '2026-09-01T00:00:00.000Z'

    const result = await acceptCropForAsset(POST_ID, ASSET_ID, 0.5, 0.5)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/restore/i)
    expect(state.minted).toEqual([])
  })
})
