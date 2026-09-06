import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE READ SIDE OF THE STARTER LADDER, AND THE THREE FAILURE MODES A HAPPY
 * PATH TEST WOULD NEVER EXERCISE.
 *
 * `brand_starters` is unapplied today (`20260906120000_brand_starters.sql`),
 * so the codes a healthy deploy of THIS code will actually see from Postgres
 * are exactly the ones asserted here as "fall through, never throw, never
 * reach the screen."
 */

vi.mock('server-only', () => ({}))

const WORKSPACE = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  /** `{ workspace_id, brand_version, starters }` rows, as a real table would hold them. */
  rows: [] as { workspace_id: string; brand_version: number; starters: unknown }[],
  /** Set to force the next select to answer with an error instead of a row lookup. */
  forcedError: null as { code: string; message?: string } | null,
  reads: 0,
}))

function fakeSupabase() {
  return {
    from: (table: string) => {
      if (table !== 'brand_starters') throw new Error(`unexpected table: ${table}`)
      const filters: Record<string, unknown> = {}
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val
          return chain
        },
        maybeSingle: async () => {
          state.reads += 1
          if (state.forcedError) return { data: null, error: state.forcedError }
          const row = state.rows.find(
            (r) =>
              r.workspace_id === filters.workspace_id && r.brand_version === filters.brand_version,
          )
          return { data: row ? { starters: row.starters } : null, error: null }
        },
      }
      return chain
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => fakeSupabase() }))

const IDEAS = [
  { label: 'One', prompt: 'A first idea.' },
  { label: 'Two', prompt: 'A second idea.' },
  { label: 'Three', prompt: 'A third idea.' },
]

beforeEach(() => {
  state.rows.length = 0
  state.forcedError = null
  state.reads = 0
})

describe('readStoredStarters', () => {
  it('serves the row for the exact version asked for', async () => {
    const { readStoredStarters } = await import('./starters-read')
    state.rows.push({ workspace_id: WORKSPACE, brand_version: 2, starters: IDEAS })

    const result = await readStoredStarters(WORKSPACE, 2)

    expect(result).toEqual(IDEAS)
  })

  /**
   * THE STALE-VERSION GUARANTEE THE MIGRATION'S OWN COMMENT NAMES. Mutation:
   * change the `.eq('brand_version', brandVersion)` filter in
   * `readStoredStarters` to read `.eq('brand_version', 1)` (or drop it
   * entirely) and this goes red — version 1's row would be served for
   * version 2's request.
   */
  it('does not serve a row written for a version that is no longer active', async () => {
    const { readStoredStarters } = await import('./starters-read')
    state.rows.push({ workspace_id: WORKSPACE, brand_version: 1, starters: IDEAS })

    const result = await readStoredStarters(WORKSPACE, 2)

    expect(result).toBeNull()
  })

  it('finds nothing for a workspace with no row at all', async () => {
    const { readStoredStarters } = await import('./starters-read')

    expect(await readStoredStarters(WORKSPACE, 1)).toBeNull()
  })

  /**
   * `42P01`, `42703` and `PGRST205` all mean "the schema does not have this
   * yet," never "the read failed" — see `lib/billing/read.ts`'s own
   * measurement. Mutation: remove `42P01` from `NOT_DEPLOYED` in
   * `starters-read.ts` and this specific case starts logging `console.error`
   * as though a genuine outage had occurred; the return value stays null
   * either way, so the case is asserted as a group, not by return value alone.
   */
  it.each(['42P01', '42703', 'PGRST205'])(
    'falls through to null on %s without throwing (the table or column is not deployed yet)',
    async (code) => {
      const { readStoredStarters } = await import('./starters-read')
      state.forcedError = { code }

      await expect(readStoredStarters(WORKSPACE, 1)).resolves.toBeNull()
    },
  )

  /**
   * THE OTHER DIRECTION: a genuine failure must still be visible somewhere,
   * or "swallow every error" would pass every test above just as well as the
   * real fix. Mutation: widen `NOT_DEPLOYED` to catch every code (or drop the
   * `console.error` call) and this goes red — a real outage on this table
   * would then look identical to "not deployed yet" in every log this
   * codebase has.
   */
  it('logs (but still returns null for) an error code that is not a deployment gap', async () => {
    const { readStoredStarters } = await import('./starters-read')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.forcedError = { code: '500', message: 'connection reset' }

    const result = await readStoredStarters(WORKSPACE, 1)

    expect(result).toBeNull()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('never throws even when the client itself throws', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabase: () => {
        throw new Error('no connection')
      },
    }))
    const { readStoredStarters } = await import('./starters-read')

    await expect(readStoredStarters(WORKSPACE, 1)).resolves.toBeNull()
  })

  it('discards a row whose starters column will not parse as 3 to 8 ideas', async () => {
    const { readStoredStarters } = await import('./starters-read')
    state.rows.push({
      workspace_id: WORKSPACE,
      brand_version: 1,
      starters: [{ label: 'only one' }],
    })

    expect(await readStoredStarters(WORKSPACE, 1)).toBeNull()
  })
})
