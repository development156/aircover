import { beforeEach, describe, expect, test, vi } from 'vitest'

import { fakeSupabase, freshState } from '@/lib/assets/fake-supabase.test-helper'

/**
 * Trashing and restoring, one file and many.
 *
 * ── IDEMPOTENT, AND THE COUNTS SAY SO ────────────────────────────────────────
 * A second press on "Move to trash" must not overwrite the first deletion time,
 * so the single trash filters `deleted_at is null` and treats zero rows as
 * "already there". The bulk trash does the same and COUNTS: nine asked, seven
 * moved, two already there. Undo then restores exactly the seven the call
 * moved, which is why `ids` rides out with the count: restoring the whole
 * selection would take out two files the person trashed earlier on purpose.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({
  supabase: null as unknown,
  readStatus: 'ok' as 'ok' | 'missing' | 'unreadable',
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/assets/read', () => ({
  readAsset: (id: string) =>
    Promise.resolve(
      state.readStatus === 'ok'
        ? {
            status: 'ok',
            asset: {
              asset: { id, deleted_at: null },
              usage: [
                {
                  postId: 'p1',
                  postTitle: 'Diwali',
                  postStatus: 'scheduled',
                  variantStatuses: [],
                },
              ],
              thumbPath: null,
            },
          }
        : { status: state.readStatus },
    ),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => state.supabase }))

const { trashAsset, trashAssets, restoreAsset, restoreAssets } = await import('./assets')

let fake = freshState()

beforeEach(() => {
  fake = freshState()
  state.supabase = fakeSupabase(fake)
  state.readStatus = 'ok'
})

const filters = () => fake.calls.filter((call) => call.method === 'is').map((call) => call.args)

describe('trashAsset', () => {
  test('moves a live file and says which posts keep it', async () => {
    fake.answers.assets = [{ data: [{ id: 'a' }] }]

    const result = await trashAsset('a')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.stillUsedMessage).toMatch(/still/i)
    // The idempotency filter is on the WRITE, not only the read.
    expect(filters()).toContainEqual(['deleted_at', null])
  })

  test('a second press is a success that touched nothing, and claims nothing', async () => {
    fake.answers.assets = [{ data: [] }]

    const result = await trashAsset('a')

    expect(result).toEqual({ ok: true, stillUsedMessage: null })
  })

  test('an unreadable usage costs the sentence, never the act', async () => {
    state.readStatus = 'unreadable'
    fake.answers.assets = [{ data: [{ id: 'a' }] }]

    const result = await trashAsset('a')

    expect(result).toEqual({ ok: true, stillUsedMessage: null })
  })

  test('a file that is not in the library is refused', async () => {
    state.readStatus = 'missing'

    const result = await trashAsset('a')

    expect(result.ok).toBe(false)
    expect(fake.calls.filter((call) => call.method === 'update')).toEqual([])
  })
})

describe('trashAssets', () => {
  test('counts what the SERVER moved and hands back exactly those ids', async () => {
    // Three asked; the database moved two, so one was already in the trash.
    fake.answers.assets = [{ data: [{ id: 'a' }, { id: 'c' }] }]

    const result = await trashAssets(['a', 'b', 'c'])

    expect(result).toEqual({ ok: true, trashed: 2, alreadyTrashed: 1, ids: ['a', 'c'] })
    expect(filters()).toContainEqual(['deleted_at', null])
  })

  test('deduplicates the request before counting', async () => {
    fake.answers.assets = [{ data: [{ id: 'a' }] }]

    const result = await trashAssets(['a', 'a', ''])

    expect(result).toEqual({ ok: true, trashed: 1, alreadyTrashed: 0, ids: ['a'] })
  })

  test('an empty selection touches nothing', async () => {
    const result = await trashAssets([])

    expect(result).toEqual({ ok: true, trashed: 0, alreadyTrashed: 0, ids: [] })
    expect(fake.calls).toEqual([])
  })
})

describe('restoreAsset', () => {
  test('a file deleted for good cannot come back, and says so rather than "try again"', async () => {
    fake.answers.assets = [{ data: [] }]

    const result = await restoreAsset('gone')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/for good/i)
    expect(result.message).not.toMatch(/try again/i)
  })

  test('a restored file is a plain success', async () => {
    fake.answers.assets = [{ data: [{ id: 'a' }] }]

    expect(await restoreAsset('a')).toEqual({ ok: true })
  })
})

describe('restoreAssets', () => {
  test('hands back exactly the ids the database put back', async () => {
    fake.answers.assets = [{ data: [{ id: 'a' }] }]

    const result = await restoreAssets(['a', 'gone'])

    expect(result).toEqual({ ok: true, trashed: 1, alreadyTrashed: 1, ids: ['a'] })
  })
})
