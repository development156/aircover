import { describe, it, expect } from 'vitest'
import { AdapterError } from '@sahoda/shared'
import { createFixtureAdapter, splitIntoThread } from '@sahoda/publishing'
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

/** A hold that a PERSON must resolve — the check ran and could not tell. */
const holdVerdict = (): GateVerdict => ({
  decision: 'hold',
  findings: [],
  ruleSet: RULE_SET,
  brandVersion: 2,
  checks: { hard: 'ran', classifier: 'ran' },
  classifierModel: 'test-model',
  holdReason: 'The check was not certain about this one.',
})

/** A hold that is INFRASTRUCTURE — the check could not be reached at all. */
const unreachableVerdict = (): GateVerdict => ({
  decision: 'hold',
  findings: [],
  ruleSet: RULE_SET,
  brandVersion: 2,
  checks: { hard: 'ran', classifier: 'unavailable' },
  holdReason: 'The wording check could not run, so nothing was cleared to go out.',
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
    // Default: this workspace has sent nothing this month, so the X ration never
    // fires and every existing case still exercises what it was written for. A
    // test that wants the cap overrides this.
    countLiveSends: async () => 0,
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

  it('checks the words that will be published, KEYWORD tail included', async () => {
    // A red line written into a keyword is still on the post. Gating
    // `variant.body` would miss it, because `formatForPlatform` appends the tail.
    // The tail is `[guaranteedresults]` since keywords replaced hashtags
    // (REQUESTS §34); the claim — the gate reads what publishes, not the body —
    // is exactly the one it was written for.
    const h = harness({ variant: { body: 'Open late', hashtags: ['guaranteedresults'] } })

    await runPublishPost(payload, ctx, h.deps)

    expect(h.gateChecks[0]?.text).toContain('[guaranteedresults]')
    expect(h.gateChecks[0]?.text).not.toContain('#guaranteedresults')
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
    // Ambiguity is not permission.
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

/**
 * A HOLD IS NOT ONE THING, and conflating the two costs an incident.
 *
 * "The check read this and could not tell" needs a person. "The check could not
 * be reached" needs a retry — and left terminal it would mean one provider
 * outage permanently failing every post scheduled inside it, each needing a
 * human to press Publish. Neither publishes, which is what requirement 4 asks.
 */
describe('runPublishPost — an unreachable gate is transient, an unsure one is not', () => {
  it('rethrows when the check could not be reached, so the claim comes back', async () => {
    const h = harness({ gate: { check: async () => unreachableVerdict() } })

    await expect(runPublishPost(payload, ctx, h.deps)).rejects.toThrow(/gate unavailable/i)

    // Recorded — "nothing publishes without a post_publish_logs row" holds here
    // too — but recorded as TRANSIENT, and the variant is left mid-flight rather
    // than marked failed.
    expect(h.logs).toHaveLength(1)
    expect(h.logs[0]?.error).toMatchObject({ code: 'GATE_HELD', classification: 'transient' })
    expect(h.variantUpdates).toHaveLength(0)
    expect(h.adapterCalls).toBe(0)
  })

  it('terminally fails when the check ran and was unsure — a person must read it', async () => {
    const h = harness({ gate: { check: async () => holdVerdict() } })

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed', classification: 'permanent' })
    expect(h.logs[0]?.error).toMatchObject({ code: 'GATE_HELD', classification: 'permanent' })
    expect(h.variantUpdates[0]).toMatchObject({ publishStatus: 'failed' })
  })

  it('terminally fails a workspace with more rules than one check can carry', async () => {
    // `over-bounds` fails identically on every retry, so retrying is a loop.
    const h = harness({
      gate: {
        check: async () => ({
          ...unreachableVerdict(),
          checks: { hard: 'ran' as const, classifier: 'over-bounds' as const },
        }),
      },
    })

    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed', classification: 'permanent' })
  })
})

describe('a post that is not what it says it is', () => {
  /**
   * ── THE PROPERTY, AND WHY IT NEEDS ITS OWN TESTS ────────────────────────────
   * `packages/publishing/src/format.test.ts` proves the RULES. These prove the
   * publish path actually consults them, and — the part that matters more —
   * consults them BEFORE anything irreversible or expensive happens: before the
   * refusal gate spends a model call, and before an adapter touches a network.
   *
   * Asserting only the returned code would pass against an implementation that
   * refused after publishing. `adapterCalls` and `gateChecks` are what make these
   * about the ORDER rather than about the message.
   *
   * NOTHING HERE PUBLISHES. The fixture adapter is counted, never reached.
   */

  it('publishes a variant with no format exactly as before', async () => {
    // Every variant written before migration 20260819000200 is in this state, and
    // none of them may change behaviour. No format states no intent.
    const h = harness({ variant: { format: null } })
    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'succeeded' })
    expect(h.adapterCalls).toBe(1)
  })

  it('refuses a photo post with no photo, before the gate and before the adapter', async () => {
    // On X this publishes today as a bare text post and reports success — the
    // engine has no complaint, because an X post with no media is perfectly legal.
    // Only the declared format knows that is not what was written.
    const h = harness({ variant: { format: 'image', media: [] } })
    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed', classification: 'permanent' })
    expect(out).toHaveProperty('code', 'FORMAT_NEEDS_MEDIA')
    // The order is the point. A refusal after either of these is a refusal that
    // cost something it did not need to.
    expect(h.gateChecks).toEqual([])
    expect(h.adapterCalls).toBe(0)
  })

  it('refuses a text-only post that has an image attached', async () => {
    const h = harness({
      variant: {
        format: 'text',
        media: [{ storagePath: 'w/p/a.jpg', mime: 'image/jpeg', bytes: 1000 }],
      },
    })
    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toHaveProperty('code', 'FORMAT_CONTRADICTED')
    expect(h.adapterCalls).toBe(0)
  })

  it('refuses video, which no channel can publish today', async () => {
    const h = harness({ variant: { format: 'video', media: [] } })
    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toHaveProperty('code', 'FORMAT_UNSUPPORTED')
    expect(h.adapterCalls).toBe(0)
  })

  it('publishes a text post that really is text-only', async () => {
    const h = harness({ variant: { format: 'text', media: [] } })
    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'succeeded' })
    expect(h.adapterCalls).toBe(1)
  })

  it('refuses AFTER the channel limits, so the first complaint is the cheaper one', async () => {
    // A 600-character X post declared as a photo post breaks both rules. The
    // engine's answer comes first because it is about words that could never be
    // published at all — the same ordering `validateVariant` already has with the
    // gate, for the same reason.
    const h = harness({ variant: { format: 'image', media: [], body: 'x'.repeat(600) } })
    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toHaveProperty('code', 'MAX_CHARS')
  })
})

describe('workspace A publishing through workspace B’s connection', () => {
  /**
   * ── WHERE THE GUARD ACTUALLY LIVES, AND WHY THAT MATTERS ────────────────────
   * Not in this file. `public.assert_account_for_scheduled_post` (applied
   * 2026-08-01) re-derives the workspace FROM THE POST and returns an account id
   * only if an ACTIVE connection, on the same channel, in that workspace, under
   * that workspace's Zernio profile, owns it. `store.ts` calls it and treats the
   * id it just read as a candidate until the database says otherwise.
   *
   * That placement is the point. A guard in this function would hold for today's
   * four entries into publishing and for no future one; a guard in the database
   * holds for a caller, a job, a script, and the service role alike — the same
   * property proven for `save_post_variant`, whose `where workspace_id =` refused
   * a cross-tenant write even when RLS was bypassed entirely.
   *
   * PROVEN AGAINST PRODUCTION 2026-08-19, with workspace A's real post and
   * workspace B's real, active Instagram account id: `CROSS_TENANT_ACCOUNT`.
   * A well-formed id belonging to nobody, a variant from another post, a post from
   * another workspace, a null and a SQL-shaped string were all refused too.
   *
   * ── WHAT THESE TESTS ADD ────────────────────────────────────────────────────
   * The database refuses by RAISING, so what this file owns is what happens to
   * that raise: the attempt must be recorded under its own name rather than as an
   * outage, and NOTHING may reach an adapter. `adapterCalls` is the assertion that
   * makes the second half real — a refusal after the network is not a refusal.
   *
   * NOTHING HERE PUBLISHES. The fixture adapter is counted, never reached.
   */

  /** Exactly how the assertion surfaces: the driver prefixes the raised code. */
  const raises = (code: string): PublishPostDeps['resolveConnection'] => {
    return async () => {
      throw new Error(`error: ${code}`)
    }
  }

  it('records a cross-tenant attempt under its OWN code, not as an outage', async () => {
    // The audit defect this closes. Filed as CONNECTION_UNAVAILABLE, a deliberate
    // cross-tenant attempt is indistinguishable from the vault being briefly down,
    // and the one event anyone would search for is the one no filter can find.
    const h = harness({ resolveConnection: raises('CROSS_TENANT_ACCOUNT') })
    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toMatchObject({ status: 'failed', classification: 'permanent' })
    expect(out).toHaveProperty('code', 'CROSS_TENANT_ACCOUNT')
    expect(h.adapterCalls).toBe(0)
  })

  it('writes that attempt to the publish log, with the workspace and the channel', async () => {
    // Without a row there is no answer to "did this ever happen before the guard",
    // which is the first question anybody asks.
    const h = harness({ resolveConnection: raises('CROSS_TENANT_ACCOUNT') })
    await runPublishPost(payload, ctx, h.deps)

    expect(h.logs).toHaveLength(1)
    expect(h.logs[0]).toMatchObject({
      workspaceId: payload.workspaceId,
      postId: payload.postId,
      channel: payload.channel,
      status: 'failed',
    })
    expect(h.logs[0]?.error).toMatchObject({ code: 'CROSS_TENANT_ACCOUNT' })
  })

  it('keeps every other pre-flight refusal distinguishable too', async () => {
    for (const code of ['NO_PROFILE_MAPPING', 'POST_NOT_PUBLISHABLE', 'INVALID_ACCOUNT']) {
      const h = harness({ resolveConnection: raises(code) })
      const out = await runPublishPost(payload, ctx, h.deps)
      expect(out).toHaveProperty('code', code)
      expect(h.adapterCalls).toBe(0)
    }
  })

  it('still calls a genuine outage an outage', async () => {
    // The other direction, and the reason the codes are matched by name rather
    // than sniffed for: a real vault failure must NOT be dressed as a tenant event.
    const h = harness({
      resolveConnection: async () => {
        throw new Error('connection to the token vault timed out')
      },
    })
    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toHaveProperty('code', 'CONNECTION_UNAVAILABLE')
    expect(h.adapterCalls).toBe(0)
  })

  it('does not re-label a message that merely mentions a code', async () => {
    // Anchored matching. `INVALID_POSTCODE` is not `INVALID_POST`.
    const h = harness({ resolveConnection: raises('INVALID_POSTCODE_LOOKUP') })
    const out = await runPublishPost(payload, ctx, h.deps)

    expect(out).toHaveProperty('code', 'CONNECTION_UNAVAILABLE')
  })
})

// ── THREADS ────────────────────────────────────────────────────────────────
describe('a thread is the one body, split', () => {
  /**
   * A body that is far past 280 as one post and perfectly legal as several.
   * The banned phrase is deliberately in the LAST sentence, so it lands in the
   * final segment and nowhere else.
   */
  const LONG =
    'We open at nine every morning and the chai is fresh. ' +
    'Come by for samosas at four, they sell out fast. '.repeat(4) +
    'Parking is easy on the side street behind the shop. '.repeat(3) +
    'And finally, this last line is the one that matters.'

  it('publishes a body the whole-body limit would have refused', async () => {
    const h = harness({ variant: { body: LONG, format: 'thread' } })
    const res = await runPublishPost(payload, ctx, h.deps)
    expect(res.status).toBe('succeeded')
    expect(h.adapterCalls).toBe(1)
  })

  it('still refuses that body when it is NOT declared a thread', async () => {
    // The swap is earned by the format, not granted to the channel. Without the
    // declaration the engine's whole-body MAX_CHARS stands, exactly as before.
    const h = harness({ variant: { body: LONG } })
    const res = await runPublishPost(payload, ctx, h.deps)
    expect(res.status).toBe('failed')
    if (res.status !== 'failed') return
    expect(res.code).toBe('MAX_CHARS')
    expect(h.adapterCalls).toBe(0)
  })

  /**
   * ── THE GUARD, SHOWN TO FAIL ──────────────────────────────────────────────
   * docs/31 §6.2 withheld threads because *"a red line written into segment three
   * would go out having never been put to the classifier, while the classifier
   * returned a clean pass on a string nobody will read."*
   *
   * This is that exact scenario: the offending line is in the LAST segment of a
   * multi-post thread. It must reach the gate, and the gate must block.
   */
  it('puts the LAST segment in front of the refusal gate', async () => {
    const h = harness({
      variant: { body: LONG, format: 'thread' },
      gate: { check: async () => blockVerdict() },
    })
    const res = await runPublishPost(payload, ctx, h.deps)

    expect(res.status).toBe('failed')
    expect(h.adapterCalls).toBe(0)

    // Not merely "the gate ran" — the words from the final post were IN the text
    // it was given. A gate handed a truncated string would pass this file's other
    // assertions and fail this one.
    expect(h.gateChecks).toHaveLength(1)
    expect(h.gateChecks[0]!.text).toContain('this last line is the one that matters')

    // And every segment the thread will publish is inside what the gate read.
    const segments = splitIntoThread(h.gateChecks[0]!.text, 280)
    expect(segments.length).toBeGreaterThan(1)
    for (const segment of segments) expect(h.gateChecks[0]!.text).toContain(segment)
  })

  it('gives the gate the KEYWORD tail as well, so a word only in the tail is read', async () => {
    /**
     * ── THE CLAIM IS UNCHANGED AND MATTERS MORE NOW ────────────────────────
     * The safety gate has to read the whole published string, tail included: a
     * word that appears nowhere but the tail still goes out on a live account.
     *
     * The tail changed shape from `#lastword` to `[lastword]` when keywords
     * replaced hashtags (REQUESTS §34), so the literal moved. The reason to keep
     * this test is stronger than before, not weaker — the brackets publish
     * literally, so what is in them is exactly as visible as the caption.
     *
     * The stored `#lastword` is deliberate: a row written before the ruling has
     * to reach the gate in the new form, which is what makes this also a guard
     * on the legacy read.
     */
    const h = harness({
      variant: { body: LONG, format: 'thread', hashtags: ['#lastword'] },
      gate: { check: async () => blockVerdict() },
    })
    await runPublishPost(payload, ctx, h.deps)

    expect(h.gateChecks[0]!.text).toContain('[lastword]')
    expect(h.gateChecks[0]!.text).not.toContain('#lastword')
  })

  it('refuses a thread whose link cannot be broken, before the gate is reached', async () => {
    const h = harness({
      variant: { body: `Read this https://example.com/${'a'.repeat(400)}`, format: 'thread' },
    })
    const res = await runPublishPost(payload, ctx, h.deps)
    expect(res.status).toBe('failed')
    if (res.status !== 'failed') return
    expect(res.code).toBe('THREAD_UNBREAKABLE')
    // Before the gate, so an unpublishable thread never costs a model call.
    expect(h.gateChecks).toHaveLength(0)
    expect(h.adapterCalls).toBe(0)
  })

  it('refuses a thread on a channel that does not have one', async () => {
    const h = harness({ variant: { body: 'hello', format: 'thread' } })
    const res = await runPublishPost({ ...payload, channel: 'linkedin' }, ctx, h.deps)
    expect(res.status).toBe('failed')
    if (res.status !== 'failed') return
    expect(res.code).toBe('FORMAT_UNSUPPORTED')
    expect(h.adapterCalls).toBe(0)
  })

  it('hands the planned segments to the adapter factory', async () => {
    let seen: readonly string[] | undefined
    const h = harness({
      variant: { body: LONG, format: 'thread' },
      adapterFor: (channel, _viaZernio, _format, thread) => {
        seen = thread?.segments
        return createFixtureAdapter(channel)
      },
    })
    await runPublishPost(payload, ctx, h.deps)
    expect(seen).toBeDefined()
    expect(seen!.length).toBeGreaterThan(1)
    for (const s of seen!) expect(Array.from(s).length).toBeLessThanOrEqual(280)
  })

  it('hands no plan to the adapter for an ordinary post', async () => {
    let called = false
    let seen: unknown = 'untouched'
    const h = harness({
      adapterFor: (channel, _viaZernio, _format, thread) => {
        called = true
        seen = thread
        return createFixtureAdapter(channel)
      },
    })
    await runPublishPost(payload, ctx, h.deps)
    expect(called).toBe(true)
    expect(seen).toBeNull()
  })
})

/**
 * ── THE CHECK THE GOOGLE BUTTON NEVER HAD ─────────────────────────────────────
 * The CTA picker wrote `extras.gbpCta` to the database for months and NOTHING
 * between there and Google read it: the writer chose "ORDER", saw it saved, and
 * no button appeared. A test asserting the composer stores the value would have
 * passed the whole time.
 *
 * So every control added since is tested at the seam that actually broke — what
 * the adapter factory was HANDED — not at the one that was always fine.
 */
describe('the per-channel controls reach the adapter', () => {
  const seenOptions = () => {
    let seen: unknown = 'never called'
    const h = harness({
      variant: {
        options: {
          poll: { options: ['Chai', 'Coffee'], durationMinutes: 1440 },
          firstComment: '#chai',
          aiGenerated: true,
        },
      },
      adapterFor: (channel, _via, _format, _thread, options) => {
        seen = options
        return createFixtureAdapter(channel)
      },
    })
    return { h, get: () => seen }
  }

  it('hands the stored options through, unchanged', async () => {
    const { h, get } = seenOptions()
    const res = await runPublishPost(payload, ctx, h.deps)
    expect(res.status).toBe('succeeded')
    expect(get()).toEqual({
      poll: { options: ['Chai', 'Coffee'], durationMinutes: 1440 },
      firstComment: '#chai',
      aiGenerated: true,
    })
  })

  it('hands null when the version carries none, never an empty object', async () => {
    // `{}` would be a claim that we considered the controls and chose nothing,
    // which is a different thing from a version that has none — and it is what
    // decides whether `platformSpecificData` appears on the wire at all.
    let seen: unknown = 'never called'
    const h = harness({
      adapterFor: (channel, _via, _format, _thread, options) => {
        seen = options
        return createFixtureAdapter(channel)
      },
    })
    await runPublishPost(payload, ctx, h.deps)
    expect(seen).toBeNull()
  })
})
