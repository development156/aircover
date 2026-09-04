import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * DELETING A WEBSITE, WHICH NOTHING COULD DO.
 *
 * ── WHAT THIS GUARDS ─────────────────────────────────────────────────────────
 * The dangerous half of a delete is not the deletion. It is reporting one that
 * did not happen. PostgREST does NOT treat a delete matching zero rows as an
 * error, so `.select()` and the `!data` branch are the whole difference between
 * "your website is gone" and a screen that still shows it.
 *
 * The second property is that a refusal must not leak. "Not yours" and "already
 * gone" go through the same sentence on purpose: told apart, this action becomes
 * a way to ask whether any given site id exists.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const SITE = '33333333-3333-4333-8333-333333333333'

const state = vi.hoisted(() => ({
  /** The row the delete returns, or null for "nothing matched". */
  deleted: null as { id: string } | null,
  error: null as { code: string; message?: string } | null,
  /** Every table a delete was issued against, with the id filter. */
  deletes: [] as { table: string; id: unknown }[],
  workspace: { ok: true, message: '' },
  revalidated: [] as string[],
}))

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path)
  },
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () =>
    Promise.resolve(
      state.workspace.ok
        ? { ok: true, workspace: { id: WORKSPACE } }
        : { ok: false, message: state.workspace.message },
    ),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      const record = { table, id: undefined as unknown }
      return {
        delete() {
          state.deletes.push(record)
          return this
        },
        eq(_column: string, value: unknown) {
          record.id = value
          return this
        },
        select() {
          return this
        },
        maybeSingle: () => Promise.resolve({ data: state.deleted, error: state.error }),
      }
    },
  }),
}))

const { deleteSite } = await import('./site-delete')

beforeEach(() => {
  state.deleted = { id: SITE }
  state.error = null
  state.deletes = []
  state.workspace = { ok: true, message: '' }
  state.revalidated = []
})

describe('deleteSite', () => {
  test('deletes the site it was asked for, and only the sites table', async () => {
    const result = await deleteSite(SITE)

    expect(result).toEqual({ ok: true })
    expect(state.deletes).toEqual([{ table: 'sites', id: SITE }])
  })

  /**
   * THE ONE THAT MATTERS. Without `.select()` and this branch, a delete that
   * matched nothing comes back with no error, and the screen says the website is
   * gone while it is still there.
   */
  test('a delete that matched nothing is a refusal, never a quiet success', async () => {
    state.deleted = null

    const result = await deleteSite(SITE)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message.length).toBeGreaterThan(0)
    expect(state.revalidated).toEqual([])
  })

  /**
   * A site belonging to somebody else is filtered out by RLS and arrives here
   * exactly as "already gone" does. The two must stay indistinguishable, or this
   * action answers "does this id exist?" for any id somebody types.
   */
  test('a site that is not yours reads the same as one already gone', async () => {
    state.deleted = null
    const notMine = await deleteSite('11111111-1111-4111-8111-111111111111')

    state.deleted = null
    const alreadyGone = await deleteSite(SITE)

    expect(notMine.ok).toBe(false)
    expect(alreadyGone.ok).toBe(false)
    if (notMine.ok || alreadyGone.ok) return
    expect(notMine.message).toBe(alreadyGone.message)
  })

  test('a database error is reported as a failure, not as a deletion', async () => {
    state.error = { code: '42501', message: 'permission denied' }

    const result = await deleteSite(SITE)

    expect(result.ok).toBe(false)
    expect(state.revalidated).toEqual([])
  })

  test('refuses before touching anything when there is no workspace to write to', async () => {
    state.workspace = { ok: false, message: 'Create a workspace first.' }

    const result = await deleteSite(SITE)

    expect(result).toEqual({ ok: false, message: 'Create a workspace first.' })
    expect(state.deletes).toEqual([])
  })

  /**
   * The plan screen counts sites against the allowance. Freeing a slot and not
   * refreshing that count leaves somebody looking at "you have used your one
   * website" immediately after deleting their one website.
   */
  test('refreshes the plan screen too, because the allowance just changed', async () => {
    await deleteSite(SITE)

    expect(state.revalidated).toContain('/sites')
    expect(state.revalidated).toContain('/billing')
  })
})
