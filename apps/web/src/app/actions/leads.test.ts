import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * THE FOUR WRITES BEHIND /leads, WHICH HAD NEVER BEEN TESTED AT ALL.
 *
 * ── THE TWO CLAIMS THAT ARE NEW ──────────────────────────────────────────────
 *  1. A write that changed NOTHING is not a success. PostgREST answers an update
 *     matching no row with `{ error: null }`, so a lead that had been deleted,
 *     or that belongs to a workspace this board is no longer looking at, came
 *     back `{ok: true}` and the card redrew itself in a stage it never reached.
 *  2. `read_at` is the FIRST look and is never overwritten. Every stage move
 *     used to stamp it with `now()`, so the one figure that could say "nobody
 *     has opened this" could never be older than the last click.
 *
 * ── AND THE ONES THAT WERE ALREADY TRUE ──────────────────────────────────────
 * The membership gate, the `qualified` refusal and the length caps all behaved
 * correctly before this file existed; there is no honest red-before for them.
 * They are here because an untested guard is a guard nobody is watching.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const LEAD = '11111111-1111-4111-8111-111111111111'

interface UpdateCall {
  values: Record<string, unknown>
  filters: Array<{ column: string; value: unknown }>
  /** `.is(column, value)` — the "only if it is still null" filter. */
  nulls: Array<{ column: string; value: unknown }>
  selected: string | null
}

type Result = { data: unknown; error: { message?: string } | null }

const state = vi.hoisted(() => ({
  userId: 'user_abc' as string | null,
  workspace: { ok: true, id: '' } as { ok: boolean; id: string; message?: string },
  updates: [] as UpdateCall[],
  /** One result per update, in order. Anything past the end is one changed row. */
  results: [] as Result[],
  rpc: { data: null as unknown, error: null as { message?: string } | null },
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  revalidated: [] as string[],
}))

vi.mock('server-only', () => ({}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path)
  },
}))

vi.mock('@/lib/observability/report', () => ({ reportServerError: () => {} }))

vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () =>
    Promise.resolve(
      state.workspace.ok
        ? { ok: true, workspace: { id: state.workspace.id, name: 'W', slug: 'w', timezone: null } }
        : { ok: false, message: state.workspace.message },
    ),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      update(values: Record<string, unknown>) {
        const call: UpdateCall = { values, filters: [], nulls: [], selected: null }
        const index = state.updates.push(call) - 1
        const result = (): Result => state.results[index] ?? { data: [{ id: LEAD }], error: null }
        const builder: Record<string, unknown> = {
          eq: (column: string, value: unknown) => {
            call.filters.push({ column, value })
            return builder
          },
          is: (column: string, value: unknown) => {
            call.nulls.push({ column, value })
            return builder
          },
          select: (columns: string) => {
            call.selected = columns
            return builder
          },
          then: (resolve: (value: Result) => unknown) => resolve(result()),
        }
        return builder
      },
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args })
      return Promise.resolve(state.rpc)
    },
  }),
}))

const { setLeadStatus, updateLeadContact, promoteThreadToLead } = await import('./leads')

const EDIT = { name: 'Priya', email: 'priya@example.com', phone: '+91 98765 43210' }

beforeEach(() => {
  state.userId = 'user_abc'
  state.workspace = { ok: true, id: WORKSPACE }
  state.updates = []
  state.results = []
  state.rpc = { data: { ok: true, id: LEAD, existing: false }, error: null }
  state.rpcCalls = []
  state.revalidated = []
})

describe('who may write at all', () => {
  test('a signed-out caller moves nothing', async () => {
    state.userId = null

    const result = await setLeadStatus(LEAD, 'contacted')
    expect(result.ok).toBe(false)
    expect(state.updates).toEqual([])
  })

  test('a signed-out caller edits nothing', async () => {
    state.userId = null

    expect((await updateLeadContact(LEAD, EDIT)).ok).toBe(false)
    expect(state.updates).toEqual([])
  })

  test('no workspace refuses with the workspace’s own sentence, and writes nothing', async () => {
    state.workspace = { ok: false, id: '', message: 'Create a workspace first.' }

    const result = await setLeadStatus(LEAD, 'contacted')
    expect(result).toEqual({ ok: false, message: 'Create a workspace first.' })
    expect(state.updates).toEqual([])
  })

  test('every write is filtered to the active workspace as well as the id', async () => {
    // A correctness filter, not the boundary — RLS is that. But a board holding
    // ids from before a workspace switch must not reach across.
    await setLeadStatus(LEAD, 'contacted')
    expect(state.updates[0]!.filters).toEqual([
      { column: 'id', value: LEAD },
      { column: 'workspace_id', value: WORKSPACE },
    ])
  })
})

describe('a write that changed nothing', () => {
  test('a foreign or deleted lead is refused, not reported as moved', async () => {
    state.results = [{ data: [], error: null }]

    const result = await setLeadStatus(LEAD, 'contacted')
    expect(result).toEqual({ ok: false, message: 'This lead is no longer here. Reload the board.' })
    expect(state.revalidated).toEqual([])
  })

  test('the same is true of an edit', async () => {
    state.results = [{ data: [], error: null }]

    const result = await updateLeadContact(LEAD, EDIT)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/no longer here/i)
  })

  test('the row count is what decides, so the update asks for it', async () => {
    await setLeadStatus(LEAD, 'contacted')
    expect(state.updates[0]!.selected).toBe('id')
  })

  test('a real error still says try again, not that the lead is gone', async () => {
    // Two different failures with two different remedies. A reload cannot fix a
    // database that is down, and it is the only thing that fixes a stale board.
    state.results = [{ data: null, error: { message: 'boom' } }]

    const result = await setLeadStatus(LEAD, 'contacted')
    expect(result.message).toMatch(/try again/i)
    expect(result.message).not.toMatch(/no longer here/i)
  })
})

describe('read_at is the first look', () => {
  test('a move never overwrites it — the stamp is a separate, guarded write', async () => {
    await setLeadStatus(LEAD, 'contacted')

    // The status update must not carry `read_at` at all. If it did, every move
    // would rewrite the moment the enquiry was first opened.
    expect(state.updates[0]!.values).toEqual({ status: 'contacted' })

    const stamp = state.updates[1]!
    expect(Object.keys(stamp.values)).toEqual(['read_at'])
    expect(stamp.nulls).toEqual([{ column: 'read_at', value: null }])
  })

  test('an already-read lead is still moved, even though the stamp changes nothing', async () => {
    // The stamp's zero rows are the NORMAL case. Treating them the way the
    // status update's zero rows are treated would refuse every second move.
    state.results = [
      { data: [{ id: LEAD }], error: null },
      { data: [], error: null },
    ]

    expect(await setLeadStatus(LEAD, 'contacted')).toEqual({ ok: true })
    expect(state.revalidated).toContain('/leads')
  })

  test('an edit does not touch read_at at all', async () => {
    await updateLeadContact(LEAD, EDIT)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]!.values).not.toHaveProperty('read_at')
  })
})

describe('which stages a lead may be moved into', () => {
  test('refuses `qualified`, which is legal in the column and on no board column', async () => {
    const result = await setLeadStatus(LEAD, 'qualified')
    expect(result).toEqual({ ok: false, message: 'That is not a stage a lead can be in.' })
    expect(state.updates).toEqual([])
  })

  test('refuses a value the column does not allow either', async () => {
    expect((await setLeadStatus(LEAD, 'browsing')).ok).toBe(false)
    expect(state.updates).toEqual([])
  })

  test('accepts each of the four the board shows', async () => {
    for (const status of ['new', 'contacted', 'won', 'lost']) {
      state.updates = []
      expect(await setLeadStatus(LEAD, status)).toEqual({ ok: true })
      expect(state.updates[0]!.values).toEqual({ status })
    }
  })
})

describe('correcting the details', () => {
  test('a blank field writes NULL, because clearing one is a real edit', async () => {
    await updateLeadContact(LEAD, { name: 'Priya', email: '  ', phone: '' })
    expect(state.updates[0]!.values).toEqual({ name: 'Priya', email: null, phone: null })
  })

  test('caps each field before it reaches the column', async () => {
    // `text` columns. A pasted document would otherwise be stored and then
    // rendered back into every card on the board.
    await updateLeadContact(LEAD, {
      name: 'n'.repeat(500),
      email: `${'e'.repeat(400)}@example.com`,
      phone: '9'.repeat(90),
    })
    const values = state.updates[0]!.values as Record<string, string>
    expect(values.name).toHaveLength(200)
    expect(values.email).toHaveLength(320)
    expect(values.phone).toHaveLength(40)
  })

  test('revalidates the board so the next render is the saved row', async () => {
    await updateLeadContact(LEAD, EDIT)
    expect(state.revalidated).toEqual(['/leads'])
  })
})

describe('promoting a conversation', () => {
  test('refuses a conversation with no id rather than writing a leadless lead', async () => {
    const result = await promoteThreadToLead({
      conversationRef: '   ',
      channel: 'instagram',
      authorName: null,
      authorHandle: null,
      message: null,
    })
    expect(result.ok).toBe(false)
    expect(state.rpcCalls).toEqual([])
  })

  test('names the workspace the function will check, never one from the screen', async () => {
    await promoteThreadToLead({
      conversationRef: 'zc-9',
      channel: 'instagram',
      authorName: 'Priya',
      authorHandle: null,
      message: 'hello',
    })
    expect(state.rpcCalls[0]!.name).toBe('lead_from_conversation')
    expect(state.rpcCalls[0]!.args.p_workspace_id).toBe(WORKSPACE)
  })

  test('a second press is not an error and says the lead already existed', async () => {
    state.rpc = { data: { ok: true, id: LEAD, existing: true }, error: null }

    const result = await promoteThreadToLead({
      conversationRef: 'zc-9',
      channel: 'instagram',
      authorName: null,
      authorHandle: null,
      message: null,
    })
    expect(result).toMatchObject({ ok: true, leadId: LEAD, existing: true })
  })

  test('a refusal never tells the caller whose conversation it was', async () => {
    state.rpc = { data: { ok: false, reason: 'not_a_member' }, error: null }

    const result = await promoteThreadToLead({
      conversationRef: 'zc-9',
      channel: 'instagram',
      authorName: null,
      authorHandle: null,
      message: null,
    })
    expect(result.ok).toBe(false)
    expect(result.message).not.toMatch(/member|workspace/i)
  })
})
