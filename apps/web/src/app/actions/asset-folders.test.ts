import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The folder actions, and the refusals that have to be sentences.
 *
 * ── WHAT EACH TEST ASSERTS ───────────────────────────────────────────────────
 * The OUTCOME SHAPE and the COUNTS, never the wording. Every message below can
 * be rewritten without touching a line of this file; every `reason`, `existingId`
 * and number cannot.
 *
 * Four of these exist because of a specific way the feature can be wrong while
 * looking right:
 *
 *  the root duplicate   `parent_id` is null at the root, `= null` is never true
 *                       in SQL, and two nulls are not equal to each other — so a
 *                       naive unique index and an `.eq('parent_id', null)` both
 *                       miss it, and "Diwali" and "diwali" both land at the top
 *                       level. This is the case the whole `.is()` branch exists
 *                       for.
 *  into-own-child       the drag that has to be refused before the drop
 *                       animation finishes, with a named reason.
 *  needs-confirm        the two counts are what the person is deciding on, and
 *                       nothing may be written while they are being asked.
 *  the partial overlap  filing nine where two were already there must not report
 *                       nine, because the person counts the tiles.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const PARENT = '11111111-1111-4111-8111-111111111111'
const SIBLING = '33333333-3333-4333-8333-333333333333'
const CHILD = '44444444-4444-4444-8444-444444444444'
const ASSET = (n: number) => `5555555${n}-5555-4555-8555-555555555555`

type Result = { data: unknown; error: { code?: string; message?: string } | null }
type Filter = { column: string; value: unknown; kind: 'eq' | 'is' | 'in' }
interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  filters: Filter[]
  payload?: unknown
}

const state = vi.hoisted(() => ({
  /** Queued results per `table:op`. The last entry repeats once the queue drains. */
  results: {} as Record<
    string,
    { data: unknown; error: { code?: string; message?: string } | null }[]
  >,
  calls: [] as {
    table: string
    op: string
    filters: { column: string; value: unknown; kind: string }[]
    payload?: unknown
  }[],
}))

/**
 * The fixture rows a query would actually return, so a filter this mock records
 * is also a filter this mock APPLIES.
 *
 * ── AND WHY `eq(column, null)` MATCHES NOTHING HERE ──────────────────────────
 * Because `= null` matches nothing in SQL, and that is the entire defect the root
 * duplicate check exists to survive. A mock that answered `.eq('parent_id', null)`
 * with the root rows would certify the naive query as working, and the guard that
 * looks the most convincing would be testing nothing at all.
 */
function matches(filters: readonly { column: string; value: unknown; kind: string }[]) {
  return (row: unknown): boolean =>
    filters.every((filter) => {
      const cell = (row as Record<string, unknown>)[filter.column]
      if (cell === undefined) return true
      if (filter.kind === 'in') return (filter.value as unknown[]).includes(cell)
      if (filter.kind === 'eq' && filter.value === null) return false
      return cell === filter.value
    })
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      const record = { table, op: 'select', filters: [] as Filter[] } as Call
      state.calls.push(record)
      const result = (): Result => {
        const queue = state.results[`${record.table}:${record.op}`]
        if (!queue || queue.length === 0) return { data: [], error: null }
        const next = queue.length === 1 ? queue[0] : queue.shift()
        const answer = next ?? { data: [], error: null }
        if (answer.error !== null || !Array.isArray(answer.data)) return answer
        return { data: answer.data.filter(matches(record.filters)), error: null }
      }
      const filter = (kind: Filter['kind']) => (column: string, value: unknown) => {
        record.filters.push({ column, value, kind })
        return builder
      }
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: filter('eq'),
        is: filter('is'),
        in: filter('in'),
        insert: (payload: unknown) => {
          record.op = 'insert'
          record.payload = payload
          return builder
        },
        upsert: (payload: unknown) => {
          record.op = 'upsert'
          record.payload = payload
          return builder
        },
        update: (payload: unknown) => {
          record.op = 'update'
          record.payload = payload
          return builder
        },
        delete: () => {
          record.op = 'delete'
          return builder
        },
        single: () => Promise.resolve(result()),
        maybeSingle: () => Promise.resolve(result()),
        then: (resolve: (value: Result) => unknown) => resolve(result()),
      }
      return builder
    },
  }),
}))

const { createFolder, deleteFolder, moveFolder, renameFolder } = await import('./asset-folders')
const { fileAssets, unfileAssets } = await import('./asset-folder-items')
const { createSmartFolder } = await import('./asset-smart-folders')

function folderRow(id: string, name: string, parentId: string | null = null) {
  return {
    id,
    workspace_id: WORKSPACE,
    parent_id: parentId,
    name,
    created_by: 'user_abc',
    created_at: '2026-08-26T10:00:00.000Z',
    updated_at: '2026-08-26T10:00:00.000Z',
  }
}

const opsOn = (table: string) => state.calls.filter((c) => c.table === table).map((c) => c.op)
const tablesTouched = () => [...new Set(state.calls.map((c) => c.table))]

beforeEach(() => {
  state.calls = []
  state.results = {}
})

describe('createFolder names the collision instead of reporting a SQLSTATE', () => {
  test('a sibling differing only in case comes back as duplicate with its id', async () => {
    state.results['asset_folders:select'] = [
      { data: [folderRow(SIBLING, 'Diwali', PARENT)], error: null },
    ]

    const result = await createFolder('diwali', PARENT)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('duplicate')
    if (result.reason !== 'duplicate') return
    // The ID is the whole reason `duplicate` is its own outcome: it is what lets
    // the screen offer "open it" instead of a retype that will be refused again.
    expect(result.existingId).toBe(SIBLING)
    expect(opsOn('asset_folders')).not.toContain('insert')
  })

  test('spacing is not identity either', async () => {
    state.results['asset_folders:select'] = [
      { data: [folderRow(SIBLING, 'Diwali 2026', PARENT)], error: null },
    ]

    const result = await createFolder('Diwali   2026', PARENT)

    expect(result.ok).toBe(false)
    if (result.ok || result.reason !== 'duplicate') return
    expect(result.existingId).toBe(SIBLING)
  })

  test('AT THE ROOT the case-insensitive duplicate is caught too', async () => {
    // The case a naive unique constraint misses outright, because two nulls are
    // not equal to each other, and the case an `.eq('parent_id', null)` sibling
    // read misses because `= null` is never true. Both failures look identical
    // from the outside: a second "diwali" at the top level.
    state.results['asset_folders:select'] = [
      { data: [folderRow(SIBLING, 'Diwali', null)], error: null },
    ]

    const result = await createFolder('DIWALI', null)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('duplicate')
    if (result.reason !== 'duplicate') return
    expect(result.existingId).toBe(SIBLING)
    expect(opsOn('asset_folders')).not.toContain('insert')
  })

  test('the root sibling read uses IS NULL and not = NULL', async () => {
    // Asserted on the QUERY, because the outcome above would also be produced by
    // a read that happened to return the row for the wrong reason.
    await createFolder('Anything', null)

    const read = state.calls.find((c) => c.table === 'asset_folders' && c.op === 'select')
    expect(read?.filters).toEqual(
      expect.arrayContaining([{ column: 'parent_id', value: null, kind: 'is' }]),
    )
  })

  test('a name that is only spaces is invalid, not an invisible folder', async () => {
    const result = await createFolder('   ', null)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid')
    expect(state.calls).toEqual([])
  })

  test('a unique violation racing the read still comes back as duplicate', async () => {
    // Two tabs. The sibling read said the name was free; by the time the insert
    // ran it was not. The folder the person wanted EXISTS, so a generic failure
    // would send them into a retry loop against a folder that is already there.
    state.results['asset_folders:select'] = [
      { data: [], error: null },
      { data: [folderRow(SIBLING, 'Diwali', PARENT)], error: null },
    ]
    state.results['asset_folders:insert'] = [{ data: null, error: { code: '23505' } }]

    const result = await createFolder('Diwali', PARENT)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('duplicate')
    if (result.reason !== 'duplicate') return
    expect(result.existingId).toBe(SIBLING)
  })

  test('a race whose re-read also fails is failed, never a duplicate with no id', async () => {
    state.results['asset_folders:select'] = [
      { data: [], error: null },
      { data: null, error: { code: '57014' } },
    ]
    state.results['asset_folders:insert'] = [{ data: null, error: { code: '23505' } }]

    const result = await createFolder('Diwali', PARENT)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('failed')
  })

  test('a free name is created', async () => {
    // The control. A function that refused everything would pass every test above.
    state.results['asset_folders:select'] = [{ data: [], error: null }]
    state.results['asset_folders:insert'] = [
      { data: folderRow(CHILD, 'Diwali', PARENT), error: null },
    ]

    const result = await createFolder('Diwali', PARENT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.folder.id).toBe(CHILD)
  })
})

describe('renameFolder', () => {
  test('renaming a folder to its own name in another case is allowed', async () => {
    state.results['asset_folders:select'] = [
      { data: [folderRow(CHILD, 'diwali', PARENT)], error: null },
    ]
    state.results['asset_folders:update'] = [
      { data: folderRow(CHILD, 'Diwali', PARENT), error: null },
    ]

    const result = await renameFolder(CHILD, 'Diwali')

    expect(result.ok).toBe(true)
  })

  test('a folder that is not there is missing, not failed', async () => {
    state.results['asset_folders:select'] = [{ data: [], error: null }]

    const result = await renameFolder(CHILD, 'Diwali')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('missing')
    expect(opsOn('asset_folders')).not.toContain('update')
  })
})

describe('moveFolder refuses the cycle before it writes', () => {
  test('moving a folder into its own descendant is refused with a named reason', async () => {
    state.results['asset_folders:select'] = [
      {
        data: [folderRow(PARENT, 'Campaigns', null), folderRow(CHILD, 'Diwali', PARENT)],
        error: null,
      },
    ]

    const result = await moveFolder(PARENT, CHILD)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('refused')
    if (result.reason !== 'refused') return
    // The decision, carried through. The screen behaves differently for a cycle,
    // a depth limit and a folder that has gone.
    expect(result.decision.reason).toBe('into-own-child')
    // The SQL trigger is the real gate; this one exists so nothing is attempted.
    expect(opsOn('asset_folders')).not.toContain('update')
  })

  test('moving a folder into itself is refused with into-itself', async () => {
    state.results['asset_folders:select'] = [
      { data: [folderRow(PARENT, 'Campaigns', null)], error: null },
    ]

    const result = await moveFolder(PARENT, PARENT)

    expect(result.ok).toBe(false)
    if (result.ok || result.reason !== 'refused') return
    expect(result.decision.reason).toBe('into-itself')
  })

  test('a legitimate move is written', async () => {
    // The control, and it also proves the refusals above are about the SHAPE of
    // the move and not about the mock refusing every update.
    state.results['asset_folders:select'] = [
      {
        data: [folderRow(PARENT, 'Campaigns', null), folderRow(CHILD, 'Diwali', null)],
        error: null,
      },
    ]
    state.results['asset_folders:update'] = [{ data: null, error: null }]

    const result = await moveFolder(CHILD, PARENT)

    expect(result.ok).toBe(true)
    expect(opsOn('asset_folders')).toContain('update')
  })
})

describe('deleteFolder asks before it deletes, with the two real counts', () => {
  test('a non-empty folder without confirmation needs confirming and writes nothing', async () => {
    state.results['asset_folders:select'] = [
      {
        data: [folderRow(PARENT, 'Campaigns', null), folderRow(CHILD, 'Diwali', PARENT)],
        error: null,
      },
    ]
    // Three membership rows across the folder and its one sub-folder.
    state.results['asset_folder_items:select'] = [
      {
        data: [
          { folder_id: PARENT, asset_id: ASSET(1) },
          { folder_id: CHILD, asset_id: ASSET(2) },
          { folder_id: CHILD, asset_id: ASSET(3) },
        ],
        error: null,
      },
    ]

    const result = await deleteFolder(PARENT)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('needs-confirm')
    if (result.reason !== 'needs-confirm') return
    // Both counts, measured. The sub-folder's rows are included because the
    // sub-folder goes too — counting only the folder itself would say "1 file"
    // over a branch holding three.
    expect(result.files).toBe(3)
    expect(result.subfolders).toBe(1)
    // NOTHING WAS WRITTEN. A confirmation that has already deleted the thing is
    // not a confirmation.
    expect(state.calls.some((c) => c.op === 'delete')).toBe(false)
  })

  test('an empty folder goes without a confirmation', async () => {
    state.results['asset_folders:select'] = [
      { data: [folderRow(PARENT, 'Campaigns', null)], error: null },
    ]
    state.results['asset_folder_items:select'] = [{ data: [], error: null }]

    const result = await deleteFolder(PARENT)

    expect(result.ok).toBe(true)
    expect(opsOn('asset_folders')).toContain('delete')
  })

  test('confirmed, the same non-empty folder is deleted', async () => {
    state.results['asset_folders:select'] = [
      {
        data: [folderRow(PARENT, 'Campaigns', null), folderRow(CHILD, 'Diwali', PARENT)],
        error: null,
      },
    ]
    state.results['asset_folder_items:select'] = [
      { data: [{ folder_id: PARENT, asset_id: ASSET(1) }], error: null },
    ]

    const result = await deleteFolder(PARENT, true)

    expect(result.ok).toBe(true)
    // And still only `asset_folders` — the sub-folders and membership rows go by
    // cascade inside one transaction, and `assets` is never touched.
    expect(tablesTouched()).toEqual(['asset_folders', 'asset_folder_items'])
    expect(tablesTouched()).not.toContain('assets')
  })

  test('an unreadable count refuses rather than asking about a number nobody read', async () => {
    state.results['asset_folders:select'] = [
      { data: [folderRow(PARENT, 'Campaigns', null)], error: null },
    ]
    state.results['asset_folder_items:select'] = [{ data: null, error: { code: '57014' } }]

    const result = await deleteFolder(PARENT)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('failed')
    expect(state.calls.some((c) => c.op === 'delete')).toBe(false)
  })
})

describe('fileAssets counts what it added apart from what was already there', () => {
  test('a partial overlap splits the two numbers correctly', async () => {
    // Four asked for, two already filed here: PostgREST returns only the rows it
    // actually inserted. "4 added" would send the person looking for four new
    // tiles and finding two.
    state.results['asset_folder_items:upsert'] = [
      { data: [{ asset_id: ASSET(3) }, { asset_id: ASSET(4) }], error: null },
    ]

    const result = await fileAssets(PARENT, [ASSET(1), ASSET(2), ASSET(3), ASSET(4)])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.added).toBe(2)
    expect(result.alreadyThere).toBe(2)
  })

  test('a complete overlap is a success with nothing added', async () => {
    state.results['asset_folder_items:upsert'] = [{ data: [], error: null }]

    const result = await fileAssets(PARENT, [ASSET(1), ASSET(2)])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // `alreadyThere` is a SUCCESS, not a failure, which is why it is on this arm.
    expect(result).toEqual({ ok: true, added: 0, alreadyThere: 2 })
  })

  test('duplicates in the request are counted once', async () => {
    state.results['asset_folder_items:upsert'] = [{ data: [{ asset_id: ASSET(1) }], error: null }]

    const result = await fileAssets(PARENT, [ASSET(1), ASSET(1)])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Otherwise the same file selected twice reports "1 added, 1 already there".
    expect(result).toEqual({ ok: true, added: 1, alreadyThere: 0 })
  })

  test('a folder that has gone is missing, so the remedy is a reload', async () => {
    state.results['asset_folder_items:upsert'] = [{ data: null, error: { code: '23503' } }]

    const result = await fileAssets(PARENT, [ASSET(1)])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('missing')
  })

  test('past the cap it refuses instead of half-filing', async () => {
    const many = Array.from(
      { length: 201 },
      (_, i) => `6666666${(i % 10).toString()}-6666-4666-8666-${i.toString().padStart(12, '0')}`,
    )

    const result = await fileAssets(PARENT, many)

    expect(result.ok).toBe(false)
    expect(state.calls).toEqual([])
  })
})

describe('unfileAssets removes a membership row and nothing else', () => {
  test('it deletes only from asset_folder_items and never targets assets', async () => {
    state.results['asset_folder_items:delete'] = [
      { data: [{ asset_id: ASSET(1) }, { asset_id: ASSET(2) }], error: null },
    ]

    const result = await unfileAssets(PARENT, [ASSET(1), ASSET(2)])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // A count of ROWS. It is never a count of files deleted, and nothing on this
    // path can delete a file.
    expect(result.removed).toBe(2)
    // THE CLAIM: one table, and it is not `assets`. A stray read or write against
    // `assets` here is how "Remove from folder" becomes destructive.
    expect(tablesTouched()).toEqual(['asset_folder_items'])
    expect(tablesTouched()).not.toContain('assets')
    const del = state.calls.find((c) => c.op === 'delete')
    expect(del?.table).toBe('asset_folder_items')
    // Scoped to the workspace as well as RLS, and to this one folder.
    expect(del?.filters).toEqual(
      expect.arrayContaining([
        { column: 'workspace_id', value: WORKSPACE, kind: 'eq' },
        { column: 'folder_id', value: PARENT, kind: 'eq' },
      ]),
    )
  })

  test('nothing selected touches no table at all', async () => {
    const result = await unfileAssets(PARENT, [])

    expect(result).toEqual({ ok: true, removed: 0 })
    expect(state.calls).toEqual([])
  })
})

describe('a smart folder never stores a question it could not parse', () => {
  test('an unparseable query is invalid and nothing is written', async () => {
    const result = await createSmartFolder('Big photos', { mode: 'all', rules: [] })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid')
    // The jsonb column would have taken it, and `readFolderTree` would then drop
    // the folder forever. This is the only place that can be prevented.
    expect(state.calls).toEqual([])
  })

  test('a rule naming a field that does not exist is invalid', async () => {
    const result = await createSmartFolder('Red ones', {
      mode: 'any',
      rules: [{ field: 'colour', is: 'red' }],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid')
    expect(state.calls).toEqual([])
  })

  test('a valid query is stored PARSED, not as it arrived', async () => {
    state.results['asset_smart_folders:select'] = [{ data: [], error: null }]
    state.results['asset_smart_folders:insert'] = [
      {
        data: {
          id: CHILD,
          workspace_id: WORKSPACE,
          name: 'Photos',
          query: { mode: 'all', rules: [{ field: 'kind', is: 'image' }] },
          created_by: 'user_abc',
          created_at: '2026-08-26T10:00:00.000Z',
          updated_at: '2026-08-26T10:00:00.000Z',
        },
        error: null,
      },
    ]

    const result = await createSmartFolder('Photos', {
      mode: 'all',
      rules: [{ field: 'kind', is: 'image' }],
      // Junk alongside a valid rule set. What is stored is the parse output, so
      // this does not reach the column.
      somethingElse: true,
    })

    expect(result.ok).toBe(true)
    const insert = state.calls.find((c) => c.op === 'insert')
    expect((insert?.payload as { query: unknown }).query).toEqual({
      mode: 'all',
      rules: [{ field: 'kind', is: 'image' }],
    })
  })
})
