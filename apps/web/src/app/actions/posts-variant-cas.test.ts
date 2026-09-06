import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `saveVariant` — the two paths, and the line between them.
 *
 * ── WHAT MAKES THIS WORTH A FILE OF ITS OWN ──────────────────────────────────
 * This code has to be correct against TWO databases at once: the one production
 * runs today, which has no `version` column, and the one it becomes when the
 * founder applies 20260819000000. The migration is not this run's to apply, so
 * the "before" path is not a legacy branch to be tidied away later — it is the
 * live one, and it must stay byte-for-byte what it was.
 *
 * So the property under test is not "the compare-and-set works". It is:
 *
 *   · with no expected version, NOTHING new happens — the upsert runs, the RPC is
 *     never called, and no save can be reported as a clash;
 *   · with one, the RPC runs INSTEAD of the upsert, never as well as it;
 *   · an empty result is a clash and is reported with the stored text, and the
 *     write that was refused is not reported as having landed.
 *
 * The first of those is the one that decays silently. If the routing ever
 * inverted, every save in production would call a function that is not there and
 * the editor would stop saving — which is why the assertion is on the CALL, not
 * on the returned message.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const POST_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  /** Every `.rpc()` the action made. Empty is the assertion for the legacy path. */
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  /** Every `.upsert()` the action made. */
  upserts: [] as Record<string, unknown>[],
  /** What the RPC answers with. `[]` is the compare-and-set refusing. */
  rpcRows: [] as unknown[],
  rpcError: null as { code: string; message: string } | null,
  /** What the follow-up read finds, for building the refusal. */
  storedRow: null as Record<string, unknown> | null,
  storedError: null as { code: string } | null,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WORKSPACE }),
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args })
      return Promise.resolve({ data: state.rpcRows, error: state.rpcError })
    },
    from: () => ({
      upsert: (row: Record<string, unknown>) => {
        state.upserts.push(row)
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: 'v1', updated_at: '2026-08-19T00:00:00Z' },
                error: null,
              }),
          }),
        }
      },
      // The follow-up read that fills in the refusal. Chainable `.eq()` because
      // the real one filters on post, workspace and channel.
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: () => Promise.resolve({ data: state.storedRow, error: state.storedError }),
        }
        return chain
      },
    }),
  }),
}))

const { saveVariant } = await import('./posts')

beforeEach(() => {
  state.rpcCalls = []
  state.upserts = []
  state.rpcRows = []
  state.rpcError = null
  state.storedRow = null
  state.storedError = null
})

describe('before the migration — no expected version is supplied', () => {
  test('saves through the upsert and never reaches the compare-and-set', async () => {
    const result = await saveVariant(POST_ID, 'instagram', 'the only draft', {})

    expect(result.ok).toBe(true)
    // THE ASSERTION THAT MATTERS. Not "it returned ok" — a call to a function
    // that does not exist would also be visible only as a failure much later.
    expect(state.rpcCalls).toEqual([])
    expect(state.upserts).toHaveLength(1)
    expect(state.upserts[0]).toMatchObject({ post_id: POST_ID, channel: 'instagram' })
  })

  test('cannot report a clash, because nothing can detect one', async () => {
    // Even with the database primed to refuse, this path never asks it to compare.
    state.rpcRows = []
    state.storedRow = { body: 'someone else', version: 4 }

    const result = await saveVariant(POST_ID, 'instagram', 'mine', {})

    expect(result.ok).toBe(true)
    // RETARGETED: `result.ok === false && result.conflict` is `false && …`
    // whenever the save succeeds, so it evaluated to `false` — and passed —
    // for ANY conflict shape, including one silently attached to a success
    // result. Assert the actual claim: a success result carries no
    // `conflict` key at all, on this path there is nothing to compare against.
    expect('conflict' in result).toBe(false)
  })
})

describe('after the migration — an expected version is supplied', () => {
  test('creates through the compare-and-set when the channel has no copy yet', async () => {
    state.rpcRows = [{ id: 'v1', updated_at: '2026-08-19T00:00:00Z', version: 1 }]

    const result = await saveVariant(POST_ID, 'instagram', 'the first draft', {}, null)

    expect(result).toMatchObject({ ok: true, version: 1 })
    expect(state.upserts).toEqual([])
    expect(state.rpcCalls).toHaveLength(1)
    expect(state.rpcCalls[0]?.fn).toBe('save_post_variant')
    // `null` and a number mean different things to the function, so the null has
    // to survive the trip rather than being coalesced into an absent argument.
    expect(state.rpcCalls[0]?.args).toMatchObject({
      p_post_id: POST_ID,
      p_workspace_id: WORKSPACE,
      p_channel: 'instagram',
      p_expected_version: null,
    })
  })

  test('sends the version it was given, and reports the new one back', async () => {
    state.rpcRows = [{ id: 'v1', updated_at: '2026-08-19T01:00:00Z', version: 5 }]

    const result = await saveVariant(POST_ID, 'x', 'edited', {}, 4)

    expect(state.rpcCalls[0]?.args.p_expected_version).toBe(4)
    // Without this the client would keep sending 4 and every save after the first
    // would be refused — a conflict notice that never clears.
    expect(result).toMatchObject({ ok: true, version: 5 })
  })

  test('reports a clash with the stored text when the function returns nothing', async () => {
    state.rpcRows = []
    state.storedRow = { body: 'TAB B wrote this second.', version: 7 }

    const result = await saveVariant(POST_ID, 'instagram', 'TAB A, unaware of B.', {}, 6)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.conflict).toEqual({
      channel: 'instagram',
      theirs: 'TAB B wrote this second.',
      // The version the row is ACTUALLY at, not the one that was sent. Sending 6
      // again would be refused forever.
      version: 7,
    })
  })

  test('never reports a refused write as saved', async () => {
    state.rpcRows = []
    state.storedRow = { body: 'theirs', version: 2 }

    const result = await saveVariant(POST_ID, 'instagram', 'mine', {}, 1)

    // The row was not updated. `ok: true` here would clear the editor's `dirty`
    // flag and label unsaved work as saved — the second way to lose it.
    expect(result.ok).toBe(false)
    // RETARGETED: a bare `.ok` check passes identically whether cas-save.ts
    // returned the refusal on purpose or `casSaveVariant` threw and the outer
    // catch in `saveVariant` produced its OWN generic message. Assert the
    // actual sentence conflictFor() returns, and the conflict it carries, and
    // that the removed upsert safety net still never fires on this path.
    expect(result.ok === false && result.message).toMatch(/your text is still here/i)
    expect(result.ok === false && result.conflict).toEqual({
      channel: 'instagram',
      theirs: 'theirs',
      version: 2,
    })
    expect(state.upserts).toEqual([])
  })

  test('still refuses honestly when the follow-up read cannot say what is stored', async () => {
    state.rpcRows = []
    state.storedError = { code: 'PGRST301' }

    const result = await saveVariant(POST_ID, 'instagram', 'mine', {}, 1)

    expect(result.ok).toBe(false)
    // No notice: it would show an empty box as "the saved version" and ask
    // someone to choose between their words and nothing.
    expect(result.ok === false && result.conflict).toBeUndefined()
    expect(result.ok === false && result.message).toContain('Your text is still here')
  })

  test('reports a failed call as a failed save, and does not fall back', async () => {
    // The removed safety net, asserted as removed. A silent fall-through to the
    // upsert here would turn every genuine failure into a last-write-wins save
    // that looks like a success — the exact defect this change exists to remove.
    state.rpcError = { code: '42883', message: 'function save_post_variant does not exist' }

    const result = await saveVariant(POST_ID, 'instagram', 'mine', {}, 1)

    expect(result.ok).toBe(false)
    expect(state.upserts).toEqual([])
  })
})
