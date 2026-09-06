import { IMAGE_PROMPT_MAX_CHARS } from '@sahoda/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * "LEAVE OUT" AND "FOLLOW HOW CLOSELY": PROMPT-LEVEL, NEVER A REWRITE OF THE
 * CUSTOMER'S OWN WORDS.
 *
 * `prompt_given` is what the customer typed, unedited. `prompt_sent` is what
 * actually reached the model: the customer's words plus the mode's own
 * direction, brand context, and now the exclusion clause and the follow-how-
 * closely direction when either is given. This file asserts that separation
 * holds, and that a request too long to send once everything is added
 * together is refused honestly, before anything is held or written.
 *
 * The harness below is `studio-charge.test.ts`'s own: a chainable Supabase
 * stand-in that logs every write, and a `withCredits` that models the one
 * property the real wrapper guarantees — a throw in the callback releases
 * the hold.
 */

const auth = vi.fn(async () => ({ userId: 'user_1' }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => auth() }))

const workspaceForWrite = vi.fn(async () => ({ ok: true as const, workspace: { id: WS } }))
vi.mock('@/lib/workspaces', () => ({ workspaceForWrite: () => workspaceForWrite() }))

const runImage = vi.fn()
vi.mock('@sahoda/mesh', () => ({ createMesh: () => ({ runImage }) }))

const withCredits = vi.fn()
vi.mock('@sahoda/billing', () => ({
  createWithCredits: () => withCredits,
  createPgLedgerPort: () => ({}),
  loadBillingEnv: () => ({ databaseUrl: 'postgres://unused' }),
}))

const signMediaPreviews = vi.fn()
vi.mock('@/lib/posts/media-url', () => ({
  signMediaPreviews: (r: unknown) => signMediaPreviews(r),
}))

const sniffImage = vi.fn()
vi.mock('@/lib/posts/sniff-image', () => ({ sniffImage: (b: unknown) => sniffImage(b) }))

vi.mock('@/lib/studio/brand-signals', () => ({ brandSignalsFor: async () => [] }))
vi.mock('@/lib/actions/revalidate-balance', () => ({ revalidateBalance: () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: () => {} }))
vi.mock('@/app/actions/assets', () => ({ attachAssetToPost: vi.fn() }))
vi.mock('@/app/actions/posts', () => ({ createPost: vi.fn() }))

interface Write {
  table: string
  op: 'insert' | 'update' | 'delete'
  row?: Record<string, unknown>
}

let writes: Write[] = []
let assetRows: { id: string; storage_path: string }[] = []

function result(table: string, op: string): { data: unknown; error: unknown } {
  if (table === 'studio_generations' && op === 'insert')
    return { data: { id: 'gen_1' }, error: null }
  if (table === 'assets' && op === 'select') return { data: assetRows, error: null }
  return { data: null, error: null }
}

function chain(table: string, op: string) {
  const b: Record<string, unknown> = {}
  const self = () => b
  for (const k of ['select', 'eq', 'in', 'order', 'limit']) b[k] = self
  b.single = () => Promise.resolve(result(table, op))
  b.maybeSingle = () => Promise.resolve(result(table, op))
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result(table, op)).then(res, rej)
  return b
}

function fakeSupabase() {
  return {
    from(table: string) {
      return {
        select: () => chain(table, 'select'),
        insert: (row: Record<string, unknown>) => {
          writes.push({ table, op: 'insert', row })
          return chain(table, 'insert')
        },
        update: (row: Record<string, unknown>) => {
          writes.push({ table, op: 'update', row })
          return chain(table, 'update')
        },
        delete: () => {
          writes.push({ table, op: 'delete' })
          return chain(table, 'delete')
        },
      }
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => {},
      }),
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => fakeSupabase() }))

const { queueGeneration } = await import('./studio')

const WS = '11111111-1111-4111-8111-111111111111'
const REF = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  writes = []
  assetRows = []
  vi.clearAllMocks()

  auth.mockResolvedValue({ userId: 'user_1' })
  workspaceForWrite.mockResolvedValue({ ok: true as const, workspace: { id: WS } })
  signMediaPreviews.mockResolvedValue([{ id: REF, url: 'https://example.test/ref.png' }])
  sniffImage.mockReturnValue({
    ok: true,
    image: { mime: 'image/png', width: 1080, height: 1080 },
  })
  runImage.mockResolvedValue({
    ok: true,
    data: { base64: 'iVBORw0KGgoAAAANSUhEUg==', mime: 'image/png', providerCostUsd: 0.003 },
    usage: {},
  })
  withCredits.mockImplementation(
    async (
      _opts: unknown,
      cb: (ctx: { actionType: string; creditsCharged: number }) => Promise<void>,
    ) => {
      try {
        await cb({ actionType: 'image_generate', creditsCharged: 6 })
      } catch {
        return { ok: false as const, error: { code: 'CALLBACK_THREW' } }
      }
      return { ok: true as const, data: { balanceAfter: 100 } }
    },
  )
})

const ask = (over: Record<string, unknown> = {}) =>
  queueGeneration({
    mode: 'explore',
    wanted: 'a bowl of chai on a wooden counter',
    formatId: 'square',
    referenceAssetIds: [],
    count: 1,
    ...over,
  })

const sentPrompt = () => (runImage.mock.calls[0]?.[0] as { prompt: string } | undefined)?.prompt
const generationRow = () =>
  writes.find((w) => w.table === 'studio_generations' && w.op === 'insert')?.row

describe('what to leave out reaches the model, and never the record of what was typed', () => {
  /**
   * MUTATION: append `excludeText` to `wanted` before it reaches
   * `conditionPrompt` and this goes red — `prompt_given` would carry the
   * clause too.
   */
  it('lands in prompt_sent, and prompt_given stays exactly what was typed', async () => {
    const out = await ask({ excludeText: 'no people' })

    expect(out.ok).toBe(true)
    const row = generationRow()
    expect(row?.prompt_given).toBe('a bowl of chai on a wooden counter')
    expect(row?.prompt_sent).toContain('no people')
    expect(sentPrompt()).toContain('no people')
  })

  it('absent means nothing is excluded', async () => {
    await ask()
    expect(generationRow()?.prompt_sent).not.toMatch(/avoid including/i)
  })
})

describe('follow how closely is dropped without a reference, never sent by accident', () => {
  /**
   * MUTATION: delete the `referenceAssetIds.length > 0` guard around
   * `referenceFollow` in `actions/studio.ts` and this goes red.
   */
  it('a hand-made request naming a step with no reference gets the default', async () => {
    await ask({ referenceFollow: 'close', referenceAssetIds: [] })
    expect(generationRow()?.prompt_sent).not.toMatch(/follow the reference images closely/i)
  })

  it('with a reference picked, the named step reaches the model', async () => {
    assetRows = [{ id: REF, storage_path: `${WS}/a.png` }]
    const out = await ask({
      mode: 'match',
      referenceAssetIds: [REF],
      referenceFollow: 'close',
    })

    expect(out.ok).toBe(true)
    expect(generationRow()?.prompt_sent).toMatch(/follow the reference images closely/i)
  })
})

describe('a request too long once everything is added together is refused honestly', () => {
  /**
   * MUTATION: delete the `conditioned.prompt.length > IMAGE_PROMPT_MAX_CHARS`
   * check in `actions/studio.ts` and this goes red — `runImage` would be
   * called (and, against the real mesh, fail the generic way instead).
   */
  it('refuses before any hold and any row, and says why', async () => {
    const out = await ask({ wanted: 'x'.repeat(998), excludeText: 'no people at all please' })

    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.insufficient).toBe(false)
    expect(withCredits).not.toHaveBeenCalled()
    expect(runImage).not.toHaveBeenCalled()
    expect(writes).toEqual([])
    if (!out.insufficient) {
      expect(out.message).toMatch(/too long/i)
      expect(out.message).toMatch(/shorten/i)
    }
  })

  it('a request that fits is unaffected by the same check', async () => {
    const out = await ask({ wanted: 'a bowl of chai', excludeText: 'no people' })
    expect(out.ok).toBe(true)
    expect(sentPrompt()!.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS)
  })
})
