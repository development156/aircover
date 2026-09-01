import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * WHAT THIS FILE IS FOR: THE STUDIO'S MONEY CLAIMS.
 *
 * `queueGeneration` is a paid action and had NO test of any kind. Four defects
 * lived in it, and every one of them was a false statement about money rather
 * than a crash — the shape nothing notices, because the screen renders happily
 * and the sentence it renders is wrong.
 *
 * Each test below is written against one of them and was confirmed RED before
 * the fix and GREEN after. The mutation is named in each test's own comment, so
 * the next person can break it deliberately and watch it fail rather than
 * trusting that it ever did.
 *
 * The fakes are deliberately dumb: a chainable Supabase stand-in that logs every
 * write and can be told to fail one of them, and a `withCredits` that models the
 * one property the real wrapper guarantees — a THROW in the callback releases
 * the hold, so nothing is charged.
 */

// ── the seams ────────────────────────────────────────────────────────────────

const auth = vi.fn(async () => ({ userId: 'user_1' }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => auth() }))

const workspaceForWrite = vi.fn(async () => ({
  ok: true as const,
  workspace: { id: WS },
}))
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

// ── the Supabase stand-in ────────────────────────────────────────────────────

interface Write {
  table: string
  op: 'insert' | 'update' | 'delete'
  row?: Record<string, unknown>
}

/** Writes seen this test, in order. Assertions read this to prove a rollback. */
let writes: Write[] = []
/** `${table}:${op}` → the error to answer with, once. */
let failWrite: Record<string, { message: string }> = {}
let storage: { uploaded: string[]; removed: string[] } = { uploaded: [], removed: [] }
/** Rows `from('assets').select(...)` answers with, for reference signing. */
let assetRows: { id: string; storage_path: string }[] = []

function result(table: string, op: string): { data: unknown; error: unknown } {
  const error = failWrite[`${table}:${op}`] ?? null
  if (table === 'studio_generations' && op === 'insert') {
    return { data: error ? null : { id: 'gen_1' }, error }
  }
  if (table === 'assets' && op === 'select') return { data: assetRows, error: null }
  return { data: null, error }
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
        upload: async (path: string) => {
          storage.uploaded.push(path)
          return { error: failWrite['storage:upload'] ?? null }
        },
        remove: async (paths: string[]) => {
          storage.removed.push(...paths)
          return { error: null }
        },
      }),
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => fakeSupabase() }))

const { queueGeneration } = await import('./studio')

// ── defaults: one press, one picture, everything works ───────────────────────

const WS = '11111111-1111-4111-8111-111111111111'
const REF = '22222222-2222-4222-8222-222222222222'

const CREDITS = 5
/** The debit answers, one per press, consumed in order. */
let debits: { ok: boolean }[] = []

beforeEach(() => {
  writes = []
  failWrite = {}
  storage = { uploaded: [], removed: [] }
  assetRows = []
  debits = []
  vi.clearAllMocks()

  auth.mockResolvedValue({ userId: 'user_1' })
  workspaceForWrite.mockResolvedValue({ ok: true as const, workspace: { id: WS } })
  signMediaPreviews.mockResolvedValue([])
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
        await cb({ actionType: 'image_generate', creditsCharged: CREDITS })
      } catch {
        // The real wrapper RELEASES the hold on a throw. Nothing is charged.
        return { ok: false as const, error: { code: 'CALLBACK_THREW' } }
      }
      const next = debits.shift()
      if (next && !next.ok) {
        // The debit itself failed AFTER the callback returned. The hold is
        // released, so this press was not charged either.
        return { ok: false as const, error: { code: 'DEBIT_FAILED' } }
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

const readyRow = () =>
  writes.find(
    (w) => w.table === 'studio_generations' && w.op === 'update' && w.row?.status === 'ready',
  )

describe('the provenance row is checked like every other write', () => {
  /**
   * MUTATION: drop the `if (image.error)` block in `actions/studio.ts` and this
   * test goes green while the product charges for a picture it did not record.
   */
  it('does not charge when the image row could not be written', async () => {
    failWrite['studio_generation_images:insert'] = { message: 'duplicate key' }

    const out = await ask()

    expect(out.ok).toBe(false)
    // No row may claim this generation is ready, because nothing recorded it.
    expect(readyRow()).toBeUndefined()
  })

  it('rolls the asset and its bytes back rather than orphaning them', async () => {
    failWrite['studio_generation_images:insert'] = { message: 'duplicate key' }

    await ask()

    expect(writes.some((w) => w.table === 'assets' && w.op === 'delete')).toBe(true)
    expect(storage.removed).toEqual(storage.uploaded)
  })
})

describe('cost_credits counts only what actually left the wallet', () => {
  /**
   * MUTATION: move `charged += chargedThis` back inside the `withCredits`
   * callback and this reports 2 charges for 1 delivered picture.
   *
   * Two presses. The first is charged. The second's callback succeeds but its
   * DEBIT fails, so its hold is released and nothing is taken for it.
   */
  it('does not count a press whose debit failed', async () => {
    debits = [{ ok: true }, { ok: false }]

    const out = await ask({ count: 2 })

    expect(out.ok).toBe(true)
    expect(readyRow()?.row?.cost_credits).toBe(CREDITS)
  })
})

describe('a mode that needs a reference will not run without one', () => {
  /**
   * MUTATION: delete the second `describeModeBlock` call and `edit` sends a bare
   * prompt to the model, gets an unrelated picture, and charges in full.
   */
  it('refuses when every picked reference failed to sign, and charges nothing', async () => {
    assetRows = [{ id: REF, storage_path: `${WS}/a.png` }]
    signMediaPreviews.mockResolvedValue([]) // signing dropped all of them

    const out = await ask({ mode: 'edit', referenceAssetIds: [REF] })

    expect(out.ok).toBe(false)
    // Not a hold, not a model call, not a row.
    expect(withCredits).not.toHaveBeenCalled()
    expect(runImage).not.toHaveBeenCalled()
  })

  it('says the pictures could not be opened, never "pick a picture"', async () => {
    assetRows = [{ id: REF, storage_path: `${WS}/a.png` }]
    signMediaPreviews.mockResolvedValue([])

    const out = await ask({ mode: 'edit', referenceAssetIds: [REF] })

    // Narrows past the insufficient-balance arm too, which carries no `message`.
    if (out.ok || out.insufficient) throw new Error('expected a refusal with a sentence')
    // The CLAIM, not the wording: they did pick one, so telling them to pick one
    // is a remedy that cannot work.
    expect(out.message).toMatch(/could not open the pictures you picked/i)
    expect(out.message).not.toMatch(/pick the picture you want changed/i)
  })
})

describe('a refusal names the field that actually failed', () => {
  /**
   * MUTATION: map every `!parsed.success` back to `REFUSALS.malformed` and this
   * goes green while a request with too many pictures is told to write a longer
   * prompt.
   */
  it('says the pictures are too many, not that the prompt is too short', async () => {
    const tooMany = Array.from({ length: 9 }, (_x, i) => `3333333${i}-3333-4333-8333-333333333333`)

    const out = await ask({ mode: 'match', referenceAssetIds: tooMany })

    if (out.ok || out.insufficient) throw new Error('expected a refusal with a sentence')
    expect(out.message).toMatch(/pictures/i)
    expect(out.message).not.toMatch(/in a few words at least/i)
  })

  it('still complains about the prompt when the prompt is what failed', async () => {
    // Without this, pointing every refusal at the references would pass above.
    const out = await ask({ wanted: 'x' })

    if (out.ok || out.insufficient) throw new Error('expected a refusal with a sentence')
    expect(out.message).toMatch(/in a few words at least/i)
  })
})

describe('the specific refusal sentences actually reach a reader', () => {
  /**
   * MUTATION: point the throw sites back at a reason that is not in
   * `FAILURE_REASON` and every one of these collapses to the generic line.
   */
  it('says the bytes were unreadable rather than the generic line', async () => {
    sniffImage.mockReturnValue({ ok: false })

    const out = await ask()

    // Narrows past the insufficient-balance arm too, which carries no `message`.
    if (out.ok || out.insufficient) throw new Error('expected a refusal with a sentence')
    expect(out.message).toMatch(/could not read as a picture/i)
    expect(out.message).not.toBe('Could not complete this action. You were not charged. Try again.')
  })

  it('says the image could not be saved rather than the generic line', async () => {
    failWrite['storage:upload'] = { message: 'bucket unavailable' }

    const out = await ask()

    // Narrows past the insufficient-balance arm too, which carries no `message`.
    if (out.ok || out.insufficient) throw new Error('expected a refusal with a sentence')
    expect(out.message).toMatch(/could not be saved to your library/i)
    expect(out.message).not.toBe('Could not complete this action. You were not charged. Try again.')
  })
})
