import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `emptyTrash` — and the flag it was throwing away.
 *
 * ── THE DEFECT THIS FILE EXISTS FOR ──────────────────────────────────────────
 * `readTrashedAssets` reads at most `ASSET_LIST_LIMIT` (200) rows and hands back
 * `capped: true` when it stopped at that ceiling rather than at the end of the
 * trash. `emptyTrash` walked the 200 rows it was handed, deleted them, and
 * returned `{ ok: true, deleted, kept }` — dropping `capped` on the floor.
 *
 * A person with 500 files in the trash therefore pressed "Delete them for good",
 * lost 200, and read "Deleted 200 files for good." with no mention of the 300
 * still sitting there. Nothing failed, nothing was logged, and the sentence was
 * a confident claim that the trash was now clear.
 *
 * ── WHY THE COPY TEST WAS NOT ENOUGH ─────────────────────────────────────────
 * `packages/shared/src/assets/trash.test.ts` covers the SENTENCE. It cannot
 * catch this, because the sentence was never wrong about the input it was given
 * — the input was wrong. The break is in the wiring between the read and the
 * copy, so the guard has to run the action.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({
  /** What `readTrashedAssets` hands back. */
  trash: {
    status: 'ok' as 'ok' | 'unreadable' | 'no-workspace',
    assets: [] as { asset: { id: string }; usage: unknown[] }[],
    capped: false,
  },
  /** Every asset id the delete RPC was actually asked to remove. */
  deleted: [] as string[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WORKSPACE }),
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/assets/read', () => ({
  readTrashedAssets: () => Promise.resolve(state.trash),
  // Every file is deletable and on no post, so the delete gate lets all of them
  // through. The refusal arm has its own coverage; this file is about the count.
  readAsset: (id: string) => Promise.resolve({ status: 'ok', asset: { asset: { id }, usage: [] } }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: (_fn: string, args: { p_asset_id: string }) => {
      state.deleted.push(args.p_asset_id)
      // `null` storage path: the row went, there are no bytes to chase.
      return Promise.resolve({ data: null, error: null })
    },
    storage: { from: () => ({ remove: () => Promise.resolve({ error: null }) }) },
  }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

const { emptyTrash } = await import('./assets')

const files = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ asset: { id: `asset-${i}` }, usage: [] }))

beforeEach(() => {
  state.trash = { status: 'ok', assets: files(3), capped: false }
  state.deleted = []
})

describe('emptyTrash reports what it could not reach', () => {
  test('a trash that fitted in one pass says nothing extra', () => {
    // The ordinary case, and the one that must NOT gain a warning.
    return emptyTrash().then((result) => {
      expect(result).toEqual({ ok: true, deleted: 3, kept: 0, more: false })
    })
  })

  /**
   * THE ONE THAT MATTERS. The read hit its ceiling, so the trash is not empty
   * and the screen must not imply that it is.
   */
  test('a trash bigger than one pass carries the flag out of the action', async () => {
    state.trash = { status: 'ok', assets: files(200), capped: true }

    const result = await emptyTrash()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.deleted).toBe(200)
    expect(result.more).toBe(true)
  })

  test('the flag is the READ’s answer, not a count the action guessed', async () => {
    // 200 files with `capped` false is a trash that happened to hold exactly the
    // limit and ended there. Inferring "more" from the count alone would invent
    // a sentence for a trash that really is empty now.
    state.trash = { status: 'ok', assets: files(200), capped: false }

    const result = await emptyTrash()

    expect(result.ok && result.more).toBe(false)
  })

  test('every file it was handed is actually put through the delete', async () => {
    state.trash = { status: 'ok', assets: files(200), capped: true }

    await emptyTrash()

    expect(state.deleted).toHaveLength(200)
  })

  /**
   * An unreadable trash is not an empty one. Deleting nothing and reporting
   * success would tell a person their trash is clear when it may be full, which
   * is the same claim this file exists to stop, arriving by a different door.
   */
  test('a trash that could not be read is a refusal, not a quiet success', async () => {
    state.trash = { status: 'unreadable', assets: [], capped: false }

    const result = await emptyTrash()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/could not read/i)
    expect(state.deleted).toHaveLength(0)
  })
})
