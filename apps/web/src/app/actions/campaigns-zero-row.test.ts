import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * ZERO ROWS IS A REFUSAL, NOT A SUCCESS.
 *
 * A PostgREST `update` or `delete` that matches no rows returns **no error** —
 * an RLS denial and a stale id both arrive looking exactly like a clean write.
 * `connections.ts` names this ("the deletePost lesson") and guards it with
 * `.select(...)`; five sites across campaigns and inbox did not, and answered
 * `{ ok: true }` — one of them `changed: 1` as a literal, for a delete that
 * removed nothing.
 *
 * What that costs a customer: the screen says the post was taken out of the
 * campaign, or the campaign was deleted, or the conversation was resolved. They
 * navigate away. Nothing happened. The next person to look sees the old state
 * and no record that anyone tried.
 *
 * Every test here drives the ZERO-ROW case, which is the one that used to pass
 * while being wrong. The happy path is asserted alongside so a fix that simply
 * refuses everything cannot be mistaken for a fix.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const CAMPAIGN_ID = '33333333-3333-4333-8333-333333333333'
const POST_ID = '44444444-4444-4444-8444-444444444444'
const THREAD_ID = '55555555-5555-4555-8555-555555555555'

const state = vi.hoisted(() => ({
  userId: 'user_abc' as string | null,
  /** What the final `.select(...)` resolves to. `[]` is the zero-row case. */
  rows: [] as Array<Record<string, string>>,
  error: null as { code: string; message: string } | null,
  selects: [] as string[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WS_ID }),
  readActiveWorkspace: () => Promise.resolve({ status: 'ok' as const, workspace: { id: WS_ID } }),
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WS_ID } }),
}))

/**
 * A chain that is thenable at every link. `.select()` is what resolves — so a
 * call site that FORGETS `.select()` never resolves to rows at all, and the
 * mutation-shaped assertions below cannot be satisfied by accident.
 */
vi.mock('@/lib/supabase/server', () => {
  const chain = (): Record<string, unknown> => {
    const self: Record<string, unknown> = {
      eq: () => self,
      in: () => self,
      match: () => self,
      select: (cols: string) => {
        state.selects.push(cols)
        const res = Promise.resolve({ data: state.error ? null : state.rows, error: state.error })
        /*
         * `maybeSingle()` resolves to a ROW OR NULL, never to the array.
         *
         * It used to hand back the same array-shaped result, and an EMPTY ARRAY
         * IS TRUTHY — so a call site guarding `if (!data)` read zero rows as a
         * success and every assertion in this file failed against a correct
         * implementation. The mock has to answer the way PostgREST does or it is
         * testing itself. (Found at integration: the sibling lane fixed these
         * same five sites with `.maybeSingle()` rather than a length check, and
         * `campaign_posts` has `unique (campaign_id, post_id)`, so one row is
         * the most that can come back.)
         */
        const one = Promise.resolve({
          data: state.error ? null : (state.rows[0] ?? null),
          error: state.error,
        })
        return Object.assign(res, { maybeSingle: () => one, single: () => one })
      },
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: state.error ? null : state.rows, error: state.error }),
    }
    return self
  }
  return {
    createServerSupabase: () => ({
      from: () => ({ update: () => chain(), delete: () => chain(), insert: () => chain() }),
    }),
  }
})

const { removePostFromCampaign, deleteCampaign, setCampaignStatus, updateCampaign } =
  await import('./campaigns')
const { setThreadStatus } = await import('./inbox')

beforeEach(() => {
  state.userId = 'user_abc'
  state.rows = []
  state.error = null
  state.selects = []
})

const ok = (r: { ok: boolean }) => r.ok

describe('a write that matched nothing is reported as a refusal', () => {
  test('removePostFromCampaign refuses, and never claims changed: 1', async () => {
    const refused = await removePostFromCampaign(CAMPAIGN_ID, POST_ID)
    expect(ok(refused)).toBe(false)
    expect(refused).not.toHaveProperty('changed', 1)

    state.rows = [{ post_id: POST_ID }]
    const done = await removePostFromCampaign(CAMPAIGN_ID, POST_ID)
    expect(done).toEqual({ ok: true, changed: 1 })
  })

  test('deleteCampaign refuses when no campaign row matched', async () => {
    expect(ok(await deleteCampaign(CAMPAIGN_ID))).toBe(false)

    state.rows = [{ id: CAMPAIGN_ID }]
    expect(ok(await deleteCampaign(CAMPAIGN_ID))).toBe(true)
  })

  test('setCampaignStatus refuses when no campaign row matched', async () => {
    expect(ok(await setCampaignStatus(CAMPAIGN_ID, 'active'))).toBe(false)

    state.rows = [{ id: CAMPAIGN_ID }]
    expect(ok(await setCampaignStatus(CAMPAIGN_ID, 'active'))).toBe(true)
  })

  test('updateCampaign refuses when no campaign row matched', async () => {
    const form = new FormData()
    form.set('name', 'Diwali push')
    expect(ok(await updateCampaign(CAMPAIGN_ID, form))).toBe(false)

    state.rows = [{ id: CAMPAIGN_ID }]
    expect(ok(await updateCampaign(CAMPAIGN_ID, form))).toBe(true)
  })

  test('setThreadStatus refuses when no thread row matched', async () => {
    expect(ok(await setThreadStatus(THREAD_ID, 'resolved'))).toBe(false)

    state.rows = [{ id: THREAD_ID }]
    expect(ok(await setThreadStatus(THREAD_ID, 'resolved'))).toBe(true)
  })

  test('each one asks the database which rows it changed', async () => {
    // The guard IS `.select(...)`: without it there is nothing to count and the
    // zero-row case is unobservable, so this asserts the mechanism rather than
    // the wording. Driven inside one test because `selects` resets per test.
    state.rows = [{ id: CAMPAIGN_ID, post_id: POST_ID }]
    const form = new FormData()
    form.set('name', 'Diwali push')

    await removePostFromCampaign(CAMPAIGN_ID, POST_ID)
    await deleteCampaign(CAMPAIGN_ID)
    await setCampaignStatus(CAMPAIGN_ID, 'active')
    await updateCampaign(CAMPAIGN_ID, form)
    await setThreadStatus(THREAD_ID, 'resolved')

    expect(state.selects).toHaveLength(5)
  })
})
