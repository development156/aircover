import { describe, it, expect } from 'vitest'
import { AdapterError } from '@sahoda/shared'
import { createFixtureAdapter } from '@sahoda/publishing'
import type { PublishAdapter, PublishPostPayload } from '@sahoda/shared'
import {
  runPublishPost,
  type PublishJobContext,
  type PublishLogEntry,
  type PublishPostDeps,
  type PublishVariant,
  type VariantUpdate,
} from './runPublishPost'

const payload: PublishPostPayload = {
  workspaceId: '22222222-2222-4222-8222-222222222222',
  postId: '33333333-3333-4333-8333-333333333333',
  variantId: '44444444-4444-4444-8444-444444444444',
  channel: 'x',
  scheduledAt: '2026-07-19T10:00:00.000Z',
}

const ctx: PublishJobContext = { attempt: 1, jobRunId: 'run_abc' }

const SECRET = 'super-secret-access-token'

interface Harness {
  deps: PublishPostDeps
  logs: PublishLogEntry[]
  variantUpdates: VariantUpdate[]
  connectionUpdates: { connectionId: string; status: string }[]
  adapterCalls: number
}

function harness(over: Partial<PublishPostDeps> & { variant?: Partial<PublishVariant> } = {}) {
  const logs: PublishLogEntry[] = []
  const variantUpdates: VariantUpdate[] = []
  const connectionUpdates: { connectionId: string; status: string }[] = []
  let adapterCalls = 0

  const variant: PublishVariant = {
    variantId: payload.variantId,
    body: 'Fresh samosas from 4pm today.',
    media: [],
    ...over.variant,
  }

  const countingAdapter = (inner: PublishAdapter): PublishAdapter => ({
    channel: inner.channel,
    publish: async (req) => {
      adapterCalls += 1
      return inner.publish(req)
    },
  })

  const deps: PublishPostDeps = {
    mode: 'fixture',
    loadVariant: async () => variant,
    resolveConnection: async () => ({
      connectionId: '55555555-5555-4555-8555-555555555555',
      externalAccountId: 'x-account-1',
      accessToken: SECRET,
    }),
    adapterFor: (channel) => countingAdapter(createFixtureAdapter(channel)),
    writeLog: async (e) => {
      logs.push(e)
    },
    markVariant: async (u) => {
      variantUpdates.push(u)
    },
    markConnection: async (connectionId, status) => {
      connectionUpdates.push({ connectionId, status })
    },
    ...over,
  }

  const h: Harness = {
    deps,
    logs,
    variantUpdates,
    connectionUpdates,
    get adapterCalls() {
      return adapterCalls
    },
  } as Harness
  return h
}

/** An adapter that always throws the given AdapterError. */
const throwingAdapter = (err: AdapterError): PublishAdapter => ({
  channel: 'x',
  publish: async () => {
    throw err
  },
})

describe('runPublishPost', () => {
  it('publishes and writes a succeeded log with the platform result', async () => {
    const h = harness()

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'succeeded', mode: 'fixture' })
    expect(h.logs).toHaveLength(1)
    expect(h.logs[0]).toMatchObject({
      workspaceId: payload.workspaceId,
      postId: payload.postId,
      variantId: payload.variantId,
      channel: 'x',
      status: 'succeeded',
      mode: 'fixture',
      attempt: 1,
      jobRunId: 'run_abc',
    })
    expect(h.logs[0]!.platformPostId).toBeTruthy()
    expect(h.logs[0]!.permalink).toBeTruthy()
  })

  it('marks the variant published with the platform id and permalink', async () => {
    const h = harness()

    await runPublishPost(payload, ctx, h.deps)

    expect(h.variantUpdates).toHaveLength(1)
    expect(h.variantUpdates[0]).toMatchObject({
      variantId: payload.variantId,
      publishStatus: 'published',
    })
    expect(h.variantUpdates[0]!.permalink).toBeTruthy()
  })

  it('logs the mode the adapter actually returned, not the configured one', async () => {
    // The honesty rule: a fixture result must never be recorded as a live publish,
    // even when the job believed it was running live.
    const h = harness({ mode: 'live' })

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'succeeded', mode: 'fixture' })
    expect(h.logs[0]!.mode).toBe('fixture')
  })

  it('rejects a variant that breaks the channel spec before touching the adapter', async () => {
    // validateVariant is the real gate — formatForPlatform does no checking and the
    // fixture adapter accepts anything, so a too-long body must die here.
    const h = harness({ variant: { body: 'x'.repeat(281) } })

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed', classification: 'permanent', code: 'MAX_CHARS' })
    expect(h.adapterCalls).toBe(0)
    expect(h.logs[0]).toMatchObject({ status: 'failed', channel: 'x' })
    expect(h.variantUpdates[0]).toMatchObject({ publishStatus: 'failed' })
  })

  // CONTRACT CHANGE 2026-08-04: instagram is publishable via the Zernio rail, so it no
  // longer trips CHANNEL_NOT_PUBLISHABLE. It is refused BEFORE the adapter for a better
  // reason — a photoless Instagram post cannot exist — which keeps the property this
  // test actually guards: an impossible post never reaches the network.
  it('refuses a photoless instagram post before reaching the adapter', async () => {
    const h = harness()

    const out = await runPublishPost({ ...payload, channel: 'instagram' }, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed', classification: 'permanent' })
    expect(out).toHaveProperty('code', 'MEDIA_REQUIRED')
    expect(h.adapterCalls).toBe(0)
    expect(h.logs).toHaveLength(1)
  })

  it('rethrows a transient adapter error so the durable runner retries it', async () => {
    const err = new AdapterError({
      message: 'X request failed with HTTP 503',
      code: 'SERVER_ERROR',
      classification: 'transient',
      channel: 'x',
    })
    const h = harness({ adapterFor: () => throwingAdapter(err) })

    // Rethrown as-is, so the runner sees the original classified error.
    await expect(runPublishPost(payload, ctx, h.deps)).rejects.toBe(err)

    // Still logged: nothing publishes — or fails to publish — without a log row.
    expect(h.logs).toHaveLength(1)
    expect(h.logs[0]).toMatchObject({
      status: 'failed',
      error: { code: 'SERVER_ERROR', classification: 'transient' },
    })
    // A retry is coming, so the variant is not terminally failed.
    expect(h.variantUpdates.map((u) => u.publishStatus)).not.toContain('failed')
  })

  it('does not rethrow a permanent adapter error — it is terminal', async () => {
    const err = new AdapterError({
      message: 'X request failed with HTTP 400',
      code: 'HTTP_ERROR',
      classification: 'permanent',
      channel: 'x',
    })
    const h = harness({ adapterFor: () => throwingAdapter(err) })

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed', classification: 'permanent', code: 'HTTP_ERROR' })
    expect(h.logs[0]).toMatchObject({ status: 'failed' })
    expect(h.variantUpdates[0]).toMatchObject({ publishStatus: 'failed' })
  })

  it('flags a reconnect and expires the connection on an auth failure', async () => {
    const err = new AdapterError({
      message: 'X request failed with HTTP 401',
      code: 'UNAUTHORIZED',
      classification: 'permanent',
      channel: 'x',
    })
    const h = harness({ adapterFor: () => throwingAdapter(err) })

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed', reconnectRequired: true })
    expect(h.connectionUpdates).toEqual([
      { connectionId: '55555555-5555-4555-8555-555555555555', status: 'expired' },
    ])
  })

  it('writes a log even when the token cannot be resolved', async () => {
    const h = harness({
      resolveConnection: async () => {
        throw new Error('TOKEN_VAULT_UNAVAILABLE')
      },
    })

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed' })
    expect(h.logs).toHaveLength(1)
    expect(h.logs[0]).toMatchObject({ status: 'failed' })
    expect(h.adapterCalls).toBe(0)
  })

  it('never puts the access token in a log row', async () => {
    const err = new AdapterError({
      message: 'boom',
      code: 'HTTP_ERROR',
      classification: 'permanent',
      channel: 'x',
      // A careless adapter echoing the token back is exactly what must not reach the log.
      raw: { echoed: SECRET },
    })
    const h = harness({ adapterFor: () => throwingAdapter(err) })

    await runPublishPost(payload, ctx, h.deps)

    const serialized = JSON.stringify([...h.logs, ...h.variantUpdates])
    expect(serialized).not.toContain(SECRET)
  })

  it('records the runner attempt number on the log row', async () => {
    const h = harness()

    await runPublishPost(payload, { attempt: 3, jobRunId: 'run_xyz' }, h.deps)

    expect(h.logs[0]).toMatchObject({ attempt: 3, jobRunId: 'run_xyz' })
  })

  it('fails honestly when the variant is missing', async () => {
    const h = harness({ loadVariant: async () => null })

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed', classification: 'permanent' })
    expect(out).toHaveProperty('code', 'VARIANT_NOT_FOUND')
    expect(h.logs).toHaveLength(1)
  })
})
