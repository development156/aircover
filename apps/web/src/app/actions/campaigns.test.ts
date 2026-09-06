import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * A NULL ERROR ON AN UPDATE OR DELETE DOES NOT MEAN THE WRITE HAPPENED.
 *
 * ── THE CLASS, AND WHY CAMPAIGNS WAS THE ONE THAT STILL HAD IT ───────────────
 * PostgREST reports an UPDATE or DELETE that matched ZERO ROWS as a success with
 * a null error. Under RLS a row the caller cannot see IS zero rows, so a denied
 * write and a completed one are indistinguishable from the response. The repo
 * already knows this and says so, at length, in five places:
 *
 *   posts.ts       deletePost        `.select('id').maybeSingle()` then `if (!data)`
 *   posts.ts       setVariantFormat  same
 *   posts-media.ts detachMedia       same
 *   templates.ts   deleteTemplate    same
 *   workspace.ts   renameWorkspace   "`.select()` is not decorative"
 *   theme.ts       supersede         asserts the postcondition with a second read
 *   approvals.ts   approvePosts      `.select('id')`, and COUNTS the rows back
 *
 * `campaigns.ts` was written to the older shape and never revisited: four of its
 * five mutations read `const { error } = await …` and report success on a null
 * error. That is the sibling-shape defect — a class closed at six doors while a
 * seventh stayed open — and it produces four false claims a user can see:
 *
 *   setCampaignStatus       toast "Moved to Running", and the stage on screen does
 *                           not move (`campaign-status.tsx:52` then `refresh()`)
 *   deleteCampaign          toast "Campaign deleted", then a push to /campaigns
 *                           where the campaign is still listed
 *   updateCampaign          the form reports saved over an unchanged row
 *   removePostFromCampaign  toast "Removed from the campaign", the post is still
 *                           in it — AND it returns a hardcoded `changed: 1`,
 *                           which is an invented number, not a measured one
 *
 * ── HOW THE MOCK MODELS POSTGREST, AND WHY THAT MATTERS ─────────────────────
 * The fake below returns `data: null` unless the chain actually called
 * `.select()`. That is not a convenience — it is the whole mechanism. Without
 * `Prefer: return=representation` PostgREST sends no body back, so an action
 * that does not ask CANNOT distinguish one row from none however carefully it
 * checks. A mock that handed back rows to a chain that never selected would let
 * a broken action pass.
 */

const WS = { id: '33333333-3333-4333-8333-333333333333', name: 'W', slug: 'w' }
const CAMPAIGN_ID = '44444444-4444-4444-8444-444444444444'
const POST_ID = '55555555-5555-4555-8555-555555555555'

interface Chain {
  table: string
  op: 'update' | 'delete' | 'insert' | 'upsert'
  selected: boolean
  eqs: Array<[string, unknown]>
}

const state = vi.hoisted(() => ({
  /** How many rows the write matches at the server. 0 = RLS denied, or gone. */
  rowsMatched: 1,
  /** Every mutation chain the action built, in order. */
  chains: [] as Array<{
    table: string
    op: string
    selected: boolean
    eqs: Array<[string, unknown]>
  }>,
  workspace: { id: '33333333-3333-4333-8333-333333333333', name: 'W', slug: 'w' } as {
    id: string
    name: string
    slug: string
  } | null,
  userId: 'user_camp' as string | null,
}))

vi.mock('server-only', () => ({}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: async () =>
    state.workspace
      ? { ok: true as const, workspace: state.workspace }
      : { ok: false as const, message: 'Create a workspace first.' },
}))

/** The row a matched write hands back, shaped like `campaigns` / `campaign_posts`. */
function matchedRow(table: string): Record<string, unknown> {
  return table === 'campaigns' ? { id: CAMPAIGN_ID } : { id: 'cp_1' }
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      const make = (op: Chain['op']) => {
        const chain: {
          table: string
          op: string
          selected: boolean
          eqs: Array<[string, unknown]>
        } = { table, op, selected: false, eqs: [] }
        state.chains.push(chain)

        /** What PostgREST would send back for this chain, as it stands. */
        const settle = (single: boolean) => {
          // No `.select()` → no representation, whatever the server did.
          if (!chain.selected) return Promise.resolve({ data: null, error: null })
          const rows = Array.from({ length: state.rowsMatched }, () => matchedRow(table))
          return Promise.resolve({
            data: single ? (rows[0] ?? null) : rows,
            error: null,
          })
        }

        const builder: Record<string, unknown> = {}
        builder.eq = (col: string, value: unknown) => {
          chain.eqs.push([col, value])
          return builder
        }
        builder.in = () => builder
        builder.select = () => {
          chain.selected = true
          return builder
        }
        builder.single = () => settle(true)
        builder.maybeSingle = () => settle(true)
        // Awaiting the chain itself, with no `.maybeSingle()`.
        builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          settle(false).then(resolve, reject)
        return builder
      }
      return {
        update: () => make('update'),
        delete: () => make('delete'),
        insert: () => make('insert'),
        upsert: () => make('upsert'),
      }
    },
  }),
}))

import {
  deleteCampaign,
  removePostFromCampaign,
  setCampaignStatus,
  updateCampaign,
} from '@/app/actions/campaigns'
import { revalidatePath } from 'next/cache'

function editForm(): FormData {
  const form = new FormData()
  form.set('name', 'Diwali')
  form.set('objective', '')
  form.set('starts_at', '')
  form.set('ends_at', '')
  return form
}

beforeEach(() => {
  state.rowsMatched = 1
  state.chains = []
  state.workspace = WS
  state.userId = 'user_camp'
  vi.mocked(revalidatePath).mockClear()
})

/**
 * Every mutation in the file, with the call that drives it and the sentence the
 * screen puts on `ok: true`. The sentence is quoted from the component so a
 * reader can see what the false claim actually IS, rather than being told there
 * is one.
 */
const MUTATIONS = [
  {
    name: 'updateCampaign',
    run: () => updateCampaign(CAMPAIGN_ID, editForm()),
    claim: 'the edit form reports the campaign saved',
  },
  {
    name: 'setCampaignStatus',
    run: () => setCampaignStatus(CAMPAIGN_ID, 'active'),
    claim: 'toast "Moved to Running" — over a stage that did not move',
  },
  {
    name: 'removePostFromCampaign',
    run: () => removePostFromCampaign(CAMPAIGN_ID, POST_ID),
    claim: 'toast "Removed from the campaign — the post is still in Posts"',
  },
  {
    name: 'deleteCampaign',
    run: () => deleteCampaign(CAMPAIGN_ID),
    claim: 'toast "Campaign deleted", then a push to a list still showing it',
  },
] as const

describe.each(MUTATIONS)('$name', ({ run, claim }) => {
  test('a write that matched no row is not reported as done', async () => {
    state.rowsMatched = 0

    const result = await run()

    // THE WHOLE CLAIM. `ok: true` here is: <claim>.
    expect(result.ok, `zero rows written, yet ${claim}`).toBe(false)
  })

  test('a write that matched its row still succeeds', async () => {
    state.rowsMatched = 1

    // The other half. A refusal that fires on the happy path too is not a guard,
    // it is an outage — and it would pass the test above on its own.
    await expect(run()).resolves.toMatchObject({ ok: true })
  })

  test('the write asks the server for its rows back', async () => {
    await run()

    const mutations = state.chains.filter((c) => c.op === 'update' || c.op === 'delete')
    expect(mutations.length).toBeGreaterThan(0)
    // Structural, and deliberately separate from the behavioural pair above: an
    // action could satisfy those by guessing, and this is the only thing that
    // says the answer came from the database.
    for (const chain of mutations) {
      expect(chain.selected, `${chain.op} on ${chain.table} never called .select()`).toBe(true)
    }
  })
})

describe('removePostFromCampaign counts rows rather than asserting one', () => {
  test('a removal that matched nothing never reports one row changed', async () => {
    state.rowsMatched = 0

    const result = await removePostFromCampaign(CAMPAIGN_ID, POST_ID)

    // RETARGETED: `if (result.ok) … else expect(result.ok).toBe(false)` is a
    // tautology — the `else` branch runs only when `result.ok` is already
    // `false`, so `expect(result.ok).toBe(false)` there can never fail. It
    // also let the code claim EITHER shape (a truthful `changed: 0` or a
    // refusal) when in fact `removePostFromCampaign` always refuses a
    // zero-row match via `PGRST116` — it never returns `ok: true` here. Pin
    // the one behavior the code actually has: a refusal, with its sentence,
    // and no screen re-read for a write that did not land.
    expect(result).toEqual({
      ok: false,
      message: "You don't have access to this campaign.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  test('a removal that matched its row reports exactly one', async () => {
    state.rowsMatched = 1

    await expect(removePostFromCampaign(CAMPAIGN_ID, POST_ID)).resolves.toEqual({
      ok: true,
      changed: 1,
    })
  })
})
