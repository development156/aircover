import { beforeEach, describe, expect, test, vi } from 'vitest'
import { publishIdempotencyKey, type PublishPostPayload } from '@sahoda/shared'

/**
 * WHAT THE PUBLISH ROUTE HANDS THE CUSTOMER, AND WHAT IT HANDS THE PUBLISHER.
 *
 * Three defects, one route, all past the workspace read that
 * `route.workspace.test.ts` covers:
 *
 *  · The body's `message` on a 422 was the adapter's own `Error.message`, which for
 *    Zernio is built from the provider's response body. "createPost: HTTP 500
 *    <html>" reached the shop owner's screen, and the route's own two sentences
 *    printed the lowercase channel key ("not set up for gbp").
 *  · A variant whose only "publish" was the fixture rail (`fixture://` permalink)
 *    was answered `{ ok: true, alreadyPublished: true }` with no `mode`, which
 *    renders as "Already live on X" in green for a post that never left the
 *    building, and nothing could ever publish it for real.
 *  · `scheduled_at` came back from the RPC as jsonb text with microseconds and a
 *    numeric offset, and went into the idempotency key verbatim; the cron rail
 *    mints `Date.toISOString()`. Same post, two keys, so Zernio's collapse never
 *    spanned the two rails.
 */

const WS = { id: '22222222-2222-4222-8222-222222222222', name: 'Bakery', slug: 'bakery' }
const POST_ID = '11111111-1111-4111-8111-111111111111'
const VARIANT_ID = '33333333-3333-4333-8333-333333333333'
const RAW = 'createPost: HTTP 500 <html><body>Bad gateway</body></html>'

type Variant = { id: string; channel: string; publish_status: string; permalink: string | null }

const state = vi.hoisted(() => ({
  channels: ['x', 'gbp', 'instagram'] as string[],
  variants: [] as Variant[],
  rpcResult: { scheduled_at: '2026-09-02T10:00:00.000Z' } as unknown,
  claimed: [] as PublishPostPayload[],
  outcome: {
    status: 'failed',
    classification: 'permanent',
    code: 'PLATFORM_REJECTED',
    message: 'createPost: HTTP 500 <html><body>Bad gateway</body></html>',
    reconnectRequired: false,
    customerReadable: false,
  } as unknown,
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/workspaces', () => ({
  readActiveWorkspace: () => Promise.resolve({ status: 'ok', workspace: WS }),
}))
vi.mock('@/lib/workspace-role', () => ({
  getWorkspaceRole: () => Promise.resolve('owner'),
  canPublish: () => true,
}))
vi.mock('@/lib/posts/read', () => ({
  getPost: () => Promise.resolve({ id: POST_ID, channels: state.channels }),
  listVariants: () => Promise.resolve(state.variants),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: () => Promise.resolve({ data: state.rpcResult, error: null }),
  }),
}))
vi.mock('@sahoda/jobs/publish', () => ({
  PublishInfraError: class extends Error {
    stage: string
    constructor(stage: string) {
      super(stage)
      this.stage = stage
    }
  },
  publishPostDeps: () => ({}),
  runClaimedPublish: (payload: PublishPostPayload) => {
    state.claimed.push(payload)
    return Promise.resolve({ claimed: true, outcome: state.outcome })
  },
}))

const { POST } = await import('./route')

const call = (channel: string) =>
  POST(
    new Request('https://app.example/api/posts/p1/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel }),
    }),
    { params: Promise.resolve({ postId: POST_ID }) },
  )

const scheduledVariant = (channel: string): Variant => ({
  id: VARIANT_ID,
  channel,
  publish_status: 'scheduled',
  permalink: null,
})

beforeEach(() => {
  state.channels = ['x', 'gbp', 'instagram']
  state.variants = [scheduledVariant('x')]
  state.rpcResult = { scheduled_at: '2026-09-02T10:00:00.000Z' }
  state.claimed = []
  state.outcome = {
    status: 'failed',
    classification: 'permanent',
    code: 'PLATFORM_REJECTED',
    message: RAW,
    reconnectRequired: false,
    customerReadable: false,
  }
})

describe('the failure sentence a customer reads', () => {
  test('an adapter’s raw message never reaches the body; the code is mapped to copy', async () => {
    const res = await call('x')

    expect(res.status).toBe(422)
    const body = (await res.json()) as { message?: string; code?: string }
    expect(body.code).toBe('PLATFORM_REJECTED')
    expect(body.message).not.toContain('createPost')
    expect(body.message).not.toContain('HTTP')
    expect(body.message).not.toContain('<html>')
    // The allowlisted sentence for this code, from publish-error-copy.
    expect(body.message).toMatch(/refused this post/i)
  })

  test('an unknown adapter code still says nothing the adapter said', async () => {
    state.outcome = {
      status: 'failed',
      classification: 'permanent',
      code: 'ZERNIO_WEIRD',
      message: RAW,
      reconnectRequired: false,
      customerReadable: false,
    }
    const res = await call('x')

    const body = (await res.json()) as { message?: string }
    expect(body.message).not.toContain('createPost')
    expect(body.message).toMatch(/try again/i)
  })

  test('Sahoda’s own refusal keeps its figures, because a code-mapped sentence would be vaguer', async () => {
    state.outcome = {
      status: 'failed',
      classification: 'permanent',
      code: 'MAX_CHARS',
      message: 'x allows 280 characters; this has 312.',
      reconnectRequired: false,
      customerReadable: true,
    }
    const res = await call('x')

    const body = (await res.json()) as { message?: string }
    // The figures survive, and the LEADING key becomes the label (rule 4 of the
    // copy rules: the reader gets "X", not the enum). Nothing else is touched.
    expect(body.message).toBe('X allows 280 characters; this has 312.')
  })

  test('"not set up for" names the channel by its label, not its key', async () => {
    state.channels = ['x']
    const res = await call('gbp')

    expect(res.status).toBe(400)
    const body = (await res.json()) as { message?: string }
    expect(body.message).toBe('This post is not set up for Google Business Profile.')
  })

  test('"write the version first" names the channel by its label, not its key', async () => {
    state.variants = []
    const res = await call('gbp')

    expect(res.status).toBe(400)
    const body = (await res.json()) as { message?: string }
    expect(body.message).toBe('Write the Google Business Profile version first.')
  })
})

describe('a variant published only through the fixture rail', () => {
  test('is NOT reported already live; the route goes on to the claim', async () => {
    state.variants = [
      { id: VARIANT_ID, channel: 'x', publish_status: 'published', permalink: 'fixture://x/abc' },
    ]
    state.outcome = {
      status: 'succeeded',
      mode: 'live',
      platformPostId: '1234567890',
      permalink: 'https://x.com/bakery/status/1234567890',
    }

    const res = await call('x')

    expect(state.claimed).toHaveLength(1)
    const body = (await res.json()) as {
      ok?: boolean
      alreadyPublished?: boolean
      mode?: string
      permalink?: string
    }
    expect(body.alreadyPublished).not.toBe(true)
    expect(body).toMatchObject({
      ok: true,
      mode: 'live',
      permalink: 'https://x.com/bakery/status/1234567890',
    })
  })

  test('a variant with a real permalink is still answered already-published, and says its mode', async () => {
    state.variants = [
      {
        id: VARIANT_ID,
        channel: 'x',
        publish_status: 'published',
        permalink: 'https://x.com/bakery/status/1',
      },
    ]

    const res = await call('x')

    expect(state.claimed).toHaveLength(0)
    const body = (await res.json()) as { ok?: boolean; alreadyPublished?: boolean; mode?: string }
    expect(body).toMatchObject({ ok: true, alreadyPublished: true, mode: 'live' })
  })
})

describe('the idempotency key the manual rail mints', () => {
  test('equals the one the cron rail mints for the same row', async () => {
    // What PostgREST renders for a timestamptz inside jsonb: microseconds and a
    // numeric offset. MEASURED with PGlite in the finding.
    state.rpcResult = { scheduled_at: '2026-09-02T15:00:00.123456+05:00' }
    // What the pg driver hands pgDispatch for the same row, normalised there.
    const cronScheduledAt = new Date(Date.UTC(2026, 8, 2, 10, 0, 0, 123)).toISOString()

    await call('x')

    expect(state.claimed).toHaveLength(1)
    const manual = state.claimed[0]!
    expect(manual.scheduledAt).toBe(cronScheduledAt)
    expect(publishIdempotencyKey(POST_ID, 'x', manual.scheduledAt)).toBe(
      publishIdempotencyKey(POST_ID, 'x', cronScheduledAt),
    )
  })

  test('a scheduled_at no clock can read is a 500, not a key built from "Invalid Date"', async () => {
    state.rpcResult = { scheduled_at: 'not a timestamp' }

    const res = await call('x')

    expect(res.status).toBe(500)
    expect(state.claimed).toHaveLength(0)
  })
})
