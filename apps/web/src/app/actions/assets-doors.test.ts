import { beforeEach, describe, expect, test, vi } from 'vitest'

import { fakeSupabase, freshState } from '@/lib/assets/fake-supabase.test-helper'

/**
 * The two doors out of the library.
 *
 * A download is a signed link that SAVES (the `download` option sets the
 * disposition) under the photo's own name, never its storage uuid. Writing a
 * post creates first and attaches best-effort: a refused attach is carried out
 * as a fact about the post, not turned into a refusal of the post.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({
  supabase: null as unknown,
  asset: null as Record<string, unknown> | null,
  created: { ok: true, postId: 'post-1', updatedAt: 'x' } as Record<string, unknown>,
  attach: { ok: true, warnings: [] } as Record<string, unknown>,
  attachCalls: [] as unknown[],
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/assets/read', () => ({
  readAsset: () =>
    Promise.resolve(
      state.asset === null
        ? { status: 'missing' }
        : { status: 'ok', asset: { asset: state.asset, usage: [], thumbPath: null } },
    ),
}))
vi.mock('@/app/actions/posts', () => ({ createPost: () => Promise.resolve(state.created) }))
vi.mock('@/app/actions/assets', () => ({
  attachAssetToPost: (...args: unknown[]) => {
    state.attachCalls.push(args)
    return Promise.resolve(state.attach)
  },
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => state.supabase }))

const { downloadAssetUrl, writePostWithAsset } = await import('./assets-doors')

let fake = freshState()

beforeEach(() => {
  fake = freshState()
  state.supabase = fakeSupabase(fake)
  fake.storage.signedUrl = 'https://signed.example/photo?download=shopfront.png'
  state.asset = {
    id: 'a',
    storage_path: `${WORKSPACE}/assets/a.png`,
    title: 'shopfront',
    mime: 'image/png',
  }
  state.created = { ok: true, postId: 'post-1', updatedAt: 'x' }
  state.attach = { ok: true, warnings: [] }
  state.attachCalls = []
})

describe('downloadAssetUrl', () => {
  test('signs the ORIGINAL with a download name built from the title and type', async () => {
    const result = await downloadAssetUrl('a')

    expect(result.ok).toBe(true)
    expect(fake.storage.signed).toEqual([
      { path: `${WORKSPACE}/assets/a.png`, options: { download: 'shopfront.png' } },
    ])
  })

  test('keeps a title that already has an extension', async () => {
    state.asset = { ...state.asset, title: 'menu-board.jpg' }

    await downloadAssetUrl('a')

    expect(fake.storage.signed[0]?.options).toEqual({ download: 'menu-board.jpg' })
  })

  test('a file that is not in the library is refused, and nothing is signed', async () => {
    state.asset = null

    const result = await downloadAssetUrl('a')

    expect(result.ok).toBe(false)
    expect(fake.storage.signed).toEqual([])
  })
})

describe('writePostWithAsset', () => {
  test('creates the post, then attaches, and reports both', async () => {
    const result = await writePostWithAsset('a')

    expect(result).toEqual({ ok: true, postId: 'post-1', attached: true, message: null })
    expect(state.attachCalls).toEqual([['post-1', 'a']])
  })

  test('a refused attach still opens the post, carrying the refusal as a sentence', async () => {
    state.attach = { ok: false, message: 'Pick a channel first.' }

    const result = await writePostWithAsset('a')

    expect(result).toEqual({
      ok: true,
      postId: 'post-1',
      attached: false,
      message: 'Pick a channel first.',
    })
  })

  test('a post that could not be made is a refusal, and nothing is attached', async () => {
    state.created = { ok: false, message: 'Could not create this post. Try again.' }

    const result = await writePostWithAsset('a')

    expect(result.ok).toBe(false)
    expect(state.attachCalls).toEqual([])
  })
})
