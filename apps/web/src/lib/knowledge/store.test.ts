import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE LIBRARY READ IS BOUNDED, AND SAYS SO WHEN IT IS.
 *
 * `readLibrary` had no `.limit()`: a large library ran a full scan and rendered
 * every row on one page. It now caps at `LIST_LIMIT` and returns
 * `truncated: boolean` — never a fabricated count of the hidden rows, only the
 * bounded fact that some are hidden, following `campaigns/read.ts`. The page
 * turns that flag into one honest sentence so a capped list is not read as a
 * total.
 *
 * MUTATION: make `truncated` a constant `false` and the LIST_LIMIT+1 case below
 * reds while the page silently presents a capped count as the whole library.
 */

const readActiveWorkspace = vi.fn()
vi.mock('@/lib/workspaces', () => ({ readActiveWorkspace: () => readActiveWorkspace() }))

/** What `from('knowledge_documents').select(...)` answers with. */
let answer: { data: unknown; error: unknown } = { data: [], error: null }

function chain() {
  const b: Record<string, unknown> = {}
  const self = () => b
  for (const k of ['select', 'eq', 'order', 'limit']) b[k] = self
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(answer).then(res, rej)
  return b
}
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({ from: () => chain() }),
}))

const { readLibrary, LIST_LIMIT } = await import('./store')

const WS = '11111111-1111-4111-8111-111111111111'

/** A document row shaped enough for `withShownStatus` (it reads status + updated_at). */
const docs = (n: number): Array<Record<string, unknown>> =>
  Array.from({ length: n }, (_, i) => ({
    id: `d${i}`,
    status: 'indexed',
    updated_at: '2026-09-05T00:00:00Z',
  }))

beforeEach(() => {
  vi.clearAllMocks()
  answer = { data: [], error: null }
  readActiveWorkspace.mockResolvedValue({ status: 'ok', workspace: { id: WS } })
})

describe('readLibrary bounds the read and reports truncation', () => {
  it('reads LIST_LIMIT rows and flags truncated when the cap is hit', async () => {
    // What Postgres returns for `.limit(LIST_LIMIT)` when LIST_LIMIT+1 exist:
    // exactly LIST_LIMIT rows. The read cannot see the extra one and must say so.
    answer = { data: docs(LIST_LIMIT), error: null }

    const read = await readLibrary()

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.documents).toHaveLength(LIST_LIMIT)
    expect(read.truncated).toBe(true)
  })

  it('does not flag truncation when the library fits under the cap', async () => {
    answer = { data: docs(LIST_LIMIT - 1), error: null }

    const read = await readLibrary()

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.documents).toHaveLength(LIST_LIMIT - 1)
    expect(read.truncated).toBe(false)
  })

  it('a refused read is unreadable, never an empty or truncated library', async () => {
    answer = { data: null, error: { code: '57014', message: 'canceling statement' } }
    expect((await readLibrary()).status).toBe('unreadable')
  })

  it('no rows is empty, not truncated', async () => {
    answer = { data: [], error: null }
    expect((await readLibrary()).status).toBe('empty')
  })
})
