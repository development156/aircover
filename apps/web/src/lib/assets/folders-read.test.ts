import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `readFolderTree` — the three-way read, and the drop-and-count.
 *
 * ── WHAT THESE ASSERT ────────────────────────────────────────────────────────
 * The CLAIM, never the wording. Two claims in particular:
 *
 *  1. A read that FAILED comes back `unreadable`. It never comes back as an
 *     empty tree, because an empty tree is a statement about the customer's
 *     library and a failed read is a statement about us. The sidebar draws a
 *     count under every folder name, so a zero from a timeout is the most
 *     convincing wrong number this screen can show.
 *
 *  2. A smart folder whose saved question will not parse is DROPPED and COUNTED.
 *     Defaulting it would answer a different question under the name the person
 *     gave the old one; repairing it is the same defect wearing helpfulness. The
 *     count is what lets the screen say one folder could not be read, and the
 *     other folders must still come back — one bad row costs one folder.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const FOLDER_A = '11111111-1111-4111-8111-111111111111'
const FOLDER_B = '33333333-3333-4333-8333-333333333333'
const SMART_GOOD = '44444444-4444-4444-8444-444444444444'
const SMART_BAD = '55555555-5555-4555-8555-555555555555'
const ASSET_ONE = '66666666-6666-4666-8666-666666666666'
const ASSET_TWO = '77777777-7777-4777-8777-777777777777'

type Result = { data: unknown; error: { code?: string; message?: string } | null }

const state = vi.hoisted(() => ({
  workspace: 'ok' as 'ok' | 'none' | 'unreadable',
  /** One result per table, keyed by table name. */
  results: {} as Record<string, Result>,
  /** Which tables were queried, and with which `.eq()` filters. */
  calls: [] as { table: string; filters: { column: string; value: unknown }[] }[],
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () =>
    Promise.resolve(
      state.workspace === 'ok'
        ? { status: 'ok', workspace: { id: WORKSPACE, name: 'W', slug: 'w' } }
        : { status: state.workspace },
    ),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      const record = { table, filters: [] as { column: string; value: unknown }[] }
      state.calls.push(record)
      const result = () => state.results[table] ?? { data: [], error: null }
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: (column: string, value: unknown) => {
          record.filters.push({ column, value })
          return builder
        },
        then: (resolve: (value: Result) => unknown) => resolve(result()),
      }
      return builder
    },
  }),
}))

const { readFolderTree } = await import('./folders-read')

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

function smartRow(id: string, name: string, query: unknown) {
  return {
    id,
    workspace_id: WORKSPACE,
    name,
    query,
    created_by: 'user_abc',
    created_at: '2026-08-26T10:00:00.000Z',
    updated_at: '2026-08-26T10:00:00.000Z',
  }
}

const GOOD_QUERY = { mode: 'all', rules: [{ field: 'kind', is: 'image' }] }

beforeEach(() => {
  state.workspace = 'ok'
  state.calls = []
  state.results = {
    asset_folders: {
      data: [folderRow(FOLDER_A, 'Diwali'), folderRow(FOLDER_B, 'Storefront')],
      error: null,
    },
    asset_smart_folders: { data: [smartRow(SMART_GOOD, 'Photos', GOOD_QUERY)], error: null },
    asset_folder_items: {
      data: [
        { folder_id: FOLDER_A, asset_id: ASSET_ONE },
        { folder_id: FOLDER_A, asset_id: ASSET_TWO },
        { folder_id: FOLDER_B, asset_id: ASSET_ONE },
      ],
      error: null,
    },
  }
})

describe('a failed read is never an empty tree', () => {
  test('a failed folder read is unreadable, not zero folders', async () => {
    state.results.asset_folders = { data: null, error: { code: '57014', message: 'canceling' } }

    const read = await readFolderTree()

    expect(read.status).toBe('unreadable')
    // The claim, spelled out: there is no `folders` on this arm at all, so no
    // caller can read a length off it and print "0 folders".
    expect((read as { folders?: unknown }).folders).toBeUndefined()
  })

  test('a failed membership read is unreadable even when the folders came back', async () => {
    // The nastiest half. The tree would draw perfectly with 0 under every name.
    state.results.asset_folder_items = {
      data: null,
      error: { code: '57014', message: 'canceling' },
    }

    const read = await readFolderTree()

    expect(read.status).toBe('unreadable')
  })

  test('a failed smart-folder read is unreadable, not "you have no saved searches"', async () => {
    state.results.asset_smart_folders = { data: null, error: { code: '42501', message: 'denied' } }

    const read = await readFolderTree()

    expect(read.status).toBe('unreadable')
  })

  test('no workspace is its own answer and not unreadable', async () => {
    // The other half. Collapsing these two would offer "create a workspace" to
    // somebody who has one, which is a remedy that cannot work.
    state.workspace = 'none'

    expect((await readFolderTree()).status).toBe('no-workspace')

    state.workspace = 'unreadable'

    expect((await readFolderTree()).status).toBe('unreadable')
  })
})

describe('a smart folder with an unreadable question is dropped and counted', () => {
  test('the corrupt one is gone, the good one stays, and the count says one', async () => {
    // `rules: []` parses as jsonb and fails `SmartQuerySchema.min(1)`. This is
    // exactly what a hand-edited or half-migrated row looks like.
    state.results.asset_smart_folders = {
      data: [
        smartRow(SMART_GOOD, 'Photos', GOOD_QUERY),
        smartRow(SMART_BAD, 'Big files', { mode: 'all', rules: [] }),
      ],
      error: null,
    }

    const read = await readFolderTree()

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.smart.map((folder) => folder.id)).toEqual([SMART_GOOD])
    // COUNTED, not silent. Without this number the screen can only draw one
    // folder where the person saved two and say nothing about the difference.
    expect(read.droppedSmart).toBe(1)
    // One bad row costs one folder and nothing else.
    expect(read.folders).toHaveLength(2)
  })

  test('a rule naming a field that does not exist is dropped, not coerced', async () => {
    state.results.asset_smart_folders = {
      data: [
        smartRow(SMART_BAD, 'Invented', { mode: 'all', rules: [{ field: 'colour', is: 'red' }] }),
      ],
      error: null,
    }

    const read = await readFolderTree()

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.smart).toEqual([])
    expect(read.droppedSmart).toBe(1)
  })

  test('a malformed folder row costs one folder and is counted too', async () => {
    state.results.asset_folders = {
      data: [folderRow(FOLDER_A, 'Diwali'), { id: 'not-a-uuid', name: 'Broken' }],
      error: null,
    }

    const read = await readFolderTree()

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.folders.map((folder) => folder.id)).toEqual([FOLDER_A])
    expect(read.droppedFolders).toBe(1)
  })

  test('nothing wrong reports nothing dropped', async () => {
    // The control. A counter that always reads 1 would satisfy every test above.
    const read = await readFolderTree()

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.droppedSmart).toBe(0)
    expect(read.droppedFolders).toBe(0)
  })
})

describe('the counts are measured from the membership rows', () => {
  test('itemsByFolder counts rows, and itemsByAsset lists every folder a file is in', async () => {
    const read = await readFolderTree()

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.itemsByFolder.get(FOLDER_A)).toBe(2)
    expect(read.itemsByFolder.get(FOLDER_B)).toBe(1)
    // A file in two folders is the point of the membership table.
    expect(read.itemsByAsset.get(ASSET_ONE)).toEqual([FOLDER_A, FOLDER_B])
  })

  test('every read is scoped to the active workspace as well as RLS', async () => {
    await readFolderTree()

    const scoped = (table: string) =>
      state.calls
        .filter((call) => call.table === table)
        .every((call) =>
          call.filters.some((f) => f.column === 'workspace_id' && f.value === WORKSPACE),
        )

    expect(state.calls.map((call) => call.table).sort()).toEqual([
      'asset_folder_items',
      'asset_folders',
      'asset_smart_folders',
    ])
    expect(scoped('asset_folders')).toBe(true)
    expect(scoped('asset_smart_folders')).toBe(true)
    expect(scoped('asset_folder_items')).toBe(true)
  })
})
