import { describe, it, expect } from 'vitest'
import { AdapterError } from '@sahoda/shared'
import { createFixtureAdapter } from '@sahoda/publishing'
import type {
  GateCheckInput,
  GateVerdict,
  PublishAdapter,
  PublishGate,
  PublishPostPayload,
  RuleSet,
} from '@sahoda/shared'
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

// ── The refusal gate, as a test double ───────────────────────────────────────
// A real RuleSet rather than a stub, so a verdict built here is the same shape
// `resolveRuleSet` produces and a field added there cannot be forgotten here.
const RULE_SET: RuleSet = {
  ruleSetVersion: 'regime-_floor@2026.08',
  packs: [{ id: 'regime-_floor', version: '2026.08' }],
  rules: [],
  regime: { value: 'consumer', locale: 'IN', basis: 'default' },
}

const passVerdict = (): GateVerdict => ({
  decision: 'pass',
  findings: [],
  ruleSet: RULE_SET,
  brandVersion: 2,
  checks: { hard: 'ran', classifier: 'ran' },
  classifierModel: 'test-model',
})

const blockVerdict = (): GateVerdict => ({
  decision: 'block',
  findings: [
    {
      ruleId: 'health.no-cure-claim',
      tier: 'mandated',
      statement: 'A treatment may not be advertised as a cure.',
      source: 'packs/regime/healthcare.md',
      layer: 'hard',
      quote: 'cure',
      rewrite: 'Describe what the treatment does.',
    },
  ],
  ruleSet: RULE_SET,
  brandVersion: 2,
  checks: { hard: 'ran', classifier: 'skipped-already-blocked' },
})

const holdVerdict = (): GateVerdict => ({
  decision: 'hold',
  findings: [],
  ruleSet: RULE_SET,
  brandVersion: 2,
  checks: { hard: 'ran', classifier: 'timeout' },
  holdReason: 'The wording check did not finish in time.',
})

interface Harness {
  deps: PublishPostDeps
  /** Every call the publish core made to the gate, in order. */
  gateChecks: GateCheckInput[]
  logs: PublishLogEntry[]
  variantUpdates: VariantUpdate[]
  connectionUpdates: { connectionId: string; status: string }[]
  adapterCalls: number
}

function harness(over: Partial<PublishPostDeps> & { variant?: Partial<PublishVariant> } = {}) {
  const logs: PublishLogEntry[] = []
  const variantUpdates: VariantUpdate[] = []
  const connectionUpdates: { connectionId: string; status: string }[] = []
  const gateChecks: GateCheckInput[] = []
  let adapterCalls = 0

  // Wraps whatever gate the test supplied so `gateChecks` records the call
  // either way. A test that overrides the verdict still proves the gate RAN.
  const inner = over.gate
  const gate: PublishGate = {
    check: async (input) => {
      gateChecks.push(input)
      return inner ? inner.check(input) : passVerdict()
    },
  }

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
      viaZernio: false,
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
    // AFTER the spread on purpose: `over.gate` is already wrapped above, and
    // letting the raw one back in would lose the recording.
    gate,
  }

  const h: Harness = {
    deps,
    logs,
    variantUpdates,
    connectionUpdates,
    gateChecks,
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

  it('refuses an account the health sweep expired, permanently and without asking the platform', async () => {
    // The other end of the dead-account rule. The reconcile sweep flips a flagged
    // connection to `expired` (proven in reconcile/store.pglite.test.ts) and the
    // resolver then throws CONNECTION_NOT_ACTIVE (tokens.test.ts). What matters HERE
    // is the classification: `permanent` is what stops a scheduled post retrying
    // against an account that cannot publish until somebody reconnects it.
    const h = harness({
      resolveConnection: async () => {
        throw new Error('CONNECTION_NOT_ACTIVE: x connection is expired')
      },
    })

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed', classification: 'permanent' })
    expect(h.adapterCalls).toBe(0)
    expect(h.variantUpdates[0]).toMatchObject({ publishStatus: 'failed' })
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

/**
 * THE GATE IS A CONDITION OF PUBLISHING, NOT A PREFLIGHT (doc 18 §8).
 *
 * Every test here is a way the gate could stop being one — by not running, by
 * running too late, by being talked round, or by leaving a refusal a person
 * cannot act on. `mutations/publish-gate.mjs` re-runs this file against a
 * deliberately broken gate; if any of these can pass while the gate is gone,
 * that spec reports a survivor.
 */
describe('runPublishPost — the refusal gate', () => {
  it('checks every publish, including one that goes on to succeed', async () => {
    const h = harness()

    await runPublishPost(payload, ctx, h.deps)

    expect(h.gateChecks).toHaveLength(1)
    expect(h.gateChecks[0]).toMatchObject({
      postId: payload.postId,
      variantId: payload.variantId,
      channel: 'x',
      jobRunId: 'run_abc',
    })
  })

  it('checks the words that will be published, hashtag tail included', async () => {
    // A red line written into a hashtag is still on the post. Gating
    // `variant.body` would miss it, because `formatForPlatform` appends the tail.
    const h = harness({ variant: { body: 'Open late', hashtags: ['guaranteedresults'] } })

    await runPublishPost(payload, ctx, h.deps)

    expect(h.gateChecks[0]?.text).toContain('#guaranteedresults')
  })

  it('blocks before the adapter is ever reached', async () => {
    const h = harness({ gate: { check: async () => blockVerdict() } })

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed', classification: 'permanent' })
    expect(out).toHaveProperty('code', 'GATE_BLOCKED')
    // Nothing was sent anywhere.
    expect(h.adapterCalls).toBe(0)
  })

  it('blocks before a token is resolved', async () => {
    // A post that is not going out has no business causing a decrypt.
    let resolved = 0
    const h = harness({
      gate: { check: async () => blockVerdict() },
      resolveConnection: async () => {
        resolved += 1
        throw new Error('should never be reached')
      },
    })

    await runPublishPost(payload, ctx, h.deps)

    expect(resolved).toBe(0)
  })

  it('holds — does not publish — when the gate could not decide', async () => {
    // Ambiguity is not permission. A timeout is the state that looks most like
    // nothing happened, which is exactly why it is the one tested here.
    const h = harness({ gate: { check: async () => holdVerdict() } })

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed' })
    expect(out).toHaveProperty('code', 'GATE_HELD')
    expect(h.adapterCalls).toBe(0)
  })

  it('records the refusal in a form a person can act on', async () => {
    const h = harness({ gate: { check: async () => blockVerdict() } })

    await runPublishPost(payload, ctx, h.deps)

    // Named line, inherited-vs-theirs, and the rewrite — requirement 3, as
    // STRUCTURE. `describePublishError` in apps/web never echoes a stored
    // message, so a refusal carried as prose would arrive on screen as "something
    // went wrong".
    expect(h.logs[0]?.error?.gate).toMatchObject({
      decision: 'block',
      ruleSetVersion: 'regime-_floor@2026.08',
      brandVersion: 2,
      regime: { value: 'consumer', basis: 'default' },
      findings: [
        {
          ruleId: 'health.no-cure-claim',
          tier: 'mandated',
          statement: 'A treatment may not be advertised as a cure.',
          quote: 'cure',
          rewrite: 'Describe what the treatment does.',
        },
      ],
    })
  })

  it('leaves the variant retryable after a refusal, not stranded', async () => {
    // `failed` and not `skipped`: `skipped` is absent from claimVariant's
    // predicate, so a held variant could never be claimed again and the writer's
    // second press would return a 409 saying the post was already going out.
    const h = harness({ gate: { check: async () => holdVerdict() } })

    await runPublishPost(payload, ctx, h.deps)

    expect(h.variantUpdates).toHaveLength(1)
    expect(h.variantUpdates[0]).toMatchObject({ publishStatus: 'failed' })
    expect(h.variantUpdates[0]?.lastError?.gate?.holdReason).toBeTruthy()
  })

  it('does not ask the gate about a variant the Constraint Engine already refused', async () => {
    // Gating a 600-character X post spends a model call to refuse it twice.
    const h = harness({ variant: { body: 'x'.repeat(400) } })

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toHaveProperty('code', 'MAX_CHARS')
    expect(h.gateChecks).toHaveLength(0)
  })

  it('does not ask the gate about a channel this release cannot publish to', async () => {
    const h = harness({ loadVariant: async () => null })

    await runPublishPost(payload, ctx, h.deps)

    expect(h.gateChecks).toHaveLength(0)
  })
})
