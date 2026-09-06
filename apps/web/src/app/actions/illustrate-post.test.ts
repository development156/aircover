import { beforeEach, describe, expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  post: null as null | {
    id: string
    title: string | null
    body: string | null
    channels: string[]
  },
  queued: [] as unknown[],
  queueResult: { ok: true, generationId: 'g1', balanceAfter: 40, made: 1, asked: 1 } as unknown,
  image: { asset_id: 'bare', stamped_asset_id: 'stamped' } as unknown,
  attached: [] as Array<[string, string]>,
  attachResult: { ok: true, warnings: [] } as unknown,
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_1' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: 'ws1' } }),
}))
vi.mock('@/lib/posts/read', () => ({ getPost: () => Promise.resolve(state.post) }))
vi.mock('@/app/actions/studio', () => ({
  queueGeneration: (input: unknown) => {
    state.queued.push(input)
    return Promise.resolve(state.queueResult)
  },
}))
vi.mock('@/app/actions/assets', () => ({
  attachAssetToPost: (postId: string, assetId: string) => {
    state.attached.push([postId, assetId])
    return Promise.resolve(state.attachResult)
  },
}))
vi.mock('@/lib/posts/media-url', () => ({
  signMediaPreviews: (rows: Array<{ id: string }>) =>
    Promise.resolve(rows.map((row) => ({ id: row.id, url: `https://signed/${row.id}` }))),
}))
vi.mock('@/lib/posts/revalidate-surfaces', () => ({ revalidatePostSurfaces: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === 'studio_generation_images'
                ? state.image
                : { id: 'x', storage_path: 'ws1/x.png' },
          }),
      }
      return chain
    },
  }),
}))

import { illustratePost } from './illustrate-post'

beforeEach(() => {
  state.post = { id: 'p1', title: 'Monsoon menu', body: 'Hot chai', channels: ['x', 'gbp'] }
  state.queued = []
  state.queueResult = { ok: true, generationId: 'g1', balanceAfter: 40, made: 1, asked: 1 }
  state.image = { asset_id: 'bare', stamped_asset_id: 'stamped' }
  state.attached = []
  state.attachResult = { ok: true, warnings: [] }
})

describe('illustratePost', () => {
  test('chooses the settings, asks the Studio for one on-brand picture, and attaches the logo copy', async () => {
    const result = await illustratePost('p1')

    expect(state.queued).toEqual([
      expect.objectContaining({
        mode: 'on_brand',
        count: 1,
        referenceAssetIds: [],
        wanted: 'Monsoon menu. Hot chai',
      }),
    ])
    expect(state.attached).toEqual([['p1', 'stamped']])
    expect(result).toMatchObject({
      ok: true,
      assetId: 'stamped',
      creditsCharged: 6,
      balanceAfter: 40,
      attachRefused: false,
    })
    if (result.ok) expect(result.previewUrl).toBe('https://signed/stamped')
  })

  test('a draft with no words is refused before anything is asked for, so nothing is charged', async () => {
    state.post = { id: 'p1', title: null, body: '   ', channels: ['x'] }
    const result = await illustratePost('p1')
    expect(state.queued).toHaveLength(0)
    expect(result).toMatchObject({ ok: false, insufficient: false })
    if (!result.ok && !result.insufficient) expect(result.message).toMatch(/nothing was charged/i)
  })

  test('the Studio’s refusal is handed back as it is, unchanged', async () => {
    state.queueResult = { ok: false, insufficient: true, required: 6, available: 1, message: '' }
    const result = await illustratePost('p1')
    expect(result).toEqual(state.queueResult)
    expect(state.attached).toHaveLength(0)
  })

  test('a picture the draft refuses is still reported as made, in the library, with the reason', async () => {
    state.attachResult = { ok: false, message: 'X will not take a picture this size.' }
    const result = await illustratePost('p1')
    expect(result).toMatchObject({ ok: true, attachRefused: true })
    if (result.ok) expect(result.message).toMatch(/in your library.*X will not take/)
  })

  test('the bare picture is attached when no logo copy was placed', async () => {
    state.image = { asset_id: 'bare', stamped_asset_id: null }
    await illustratePost('p1')
    expect(state.attached).toEqual([['p1', 'bare']])
  })
})
