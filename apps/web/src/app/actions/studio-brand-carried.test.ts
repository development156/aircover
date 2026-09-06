import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A REFINED PROMPT CARRIES THE BRAND ONCE, NOT TWICE, ALL THE WAY TO THE MODEL.
 *
 * `prompt.test.ts` proves `conditionPrompt` itself skips its `Brand context:`
 * block when told the text already carries it. This file proves the FLAG
 * actually reaches that call from `queueGeneration`'s own input, which is the
 * half a unit test on `conditionPrompt` alone cannot see: a hand-made request
 * that omits the field, an old client, and a request that explicitly sends
 * `false` must all still get the block.
 *
 * The harness is `studio-leave-out.test.ts`'s own: a chainable Supabase
 * stand-in that logs every write, and a `withCredits` that models the one
 * property the real wrapper guarantees — a throw in the callback releases the
 * hold.
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

const SIGNALS = [{ field: 'voice', certainty: 'confirmed' as const, value: 'warm and direct' }]
vi.mock('@/lib/studio/brand-signals', () => ({ brandSignalsFor: async () => SIGNALS }))
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

function result(table: string, op: string): { data: unknown; error: unknown } {
  if (table === 'studio_generations' && op === 'insert')
    return { data: { id: 'gen_1' }, error: null }
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

beforeEach(() => {
  writes = []
  vi.clearAllMocks()

  auth.mockResolvedValue({ userId: 'user_1' })
  workspaceForWrite.mockResolvedValue({ ok: true as const, workspace: { id: WS } })
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
    mode: 'on_brand',
    wanted: 'a shopfront',
    formatId: 'square',
    referenceAssetIds: [],
    count: 1,
    ...over,
  })

const sentPrompt = () => (runImage.mock.calls[0]?.[0] as { prompt: string } | undefined)?.prompt

describe('the brandAlreadyCarried flag, carried from the request into conditionPrompt', () => {
  it('true: the sent prompt carries no Brand context block, even though signals exist', async () => {
    const out = await ask({ brandAlreadyCarried: true })
    expect(out.ok).toBe(true)
    expect(sentPrompt()).not.toContain('Brand context:')
  })

  it('false: the sent prompt still carries the Brand context block', async () => {
    const out = await ask({ brandAlreadyCarried: false })
    expect(out.ok).toBe(true)
    expect(sentPrompt()).toContain('Brand context:')
  })

  /**
   * MUTATION: delete `brandAlreadyCarried: z.boolean().default(false)` from
   * `GenerateInputSchema` (or stop passing it to `conditionPrompt`) and this
   * goes red — a hand-made or old-client request that never mentions the
   * field must be conditioned exactly as it always has been.
   */
  it('absent: defaults to false, so an old client or hand-made request is unaffected', async () => {
    const out = await ask()
    expect(out.ok).toBe(true)
    expect(sentPrompt()).toContain('Brand context:')
  })
})
