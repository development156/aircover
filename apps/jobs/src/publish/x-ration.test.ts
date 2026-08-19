import { describe, it, expect } from 'vitest'
import { createFixtureAdapter } from '@sahoda/publishing'
import {
  X_MONTHLY_RATION,
  X_RATION_EXHAUSTED_CODE,
  X_RATION_UNREADABLE_CODE,
} from '@sahoda/publishing'
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
  type VariantUpdate,
} from './runPublishPost'

/**
 * THE X SPENDING CAP, SHOWN REFUSING.
 *
 * A guard never shown to fail is not a guard. Every case here runs the real
 * `runPublishPost` and asserts on what DID NOT HAPPEN downstream — no gate call
 * (no model spend), no adapter call (no $0.20 to X) — rather than on a flag.
 */

const ctx: PublishJobContext = { attempt: 1, jobRunId: 'run_ration' }

const RULE_SET: RuleSet = {
  ruleSetVersion: 'regime-_floor@2026.08',
  packs: [{ id: 'regime-_floor', version: '2026.08' }],
  rules: [],
  regime: { value: 'consumer', locale: 'IN', basis: 'default' },
}

const payloadFor = (channel: PublishPostPayload['channel']): PublishPostPayload => ({
  workspaceId: '22222222-2222-4222-8222-222222222222',
  postId: '33333333-3333-4333-8333-333333333333',
  variantId: '44444444-4444-4444-8444-444444444444',
  channel,
  scheduledAt: '2026-07-19T10:00:00.000Z',
})

interface Spend {
  gateChecks: GateCheckInput[]
  adapterCalls: number
  logs: PublishLogEntry[]
  variantUpdates: VariantUpdate[]
  countedFor: { workspaceId: string; channel: string; since: Date }[]
}

/**
 * `count` is a function so a case can make the read THROW, which is the third
 * state — neither "allowed" nor "exhausted" but "we could not find out".
 */
function harness(count: () => Promise<number>, channel: PublishPostPayload['channel'] = 'x') {
  const spend: Spend = {
    gateChecks: [],
    adapterCalls: 0,
    logs: [],
    variantUpdates: [],
    countedFor: [],
  }

  const gate: PublishGate = {
    check: async (input): Promise<GateVerdict> => {
      // Recording the call IS the assertion: reaching this line means a model
      // was paid for a post the cap had already decided against.
      spend.gateChecks.push(input)
      return {
        decision: 'pass',
        findings: [],
        ruleSet: RULE_SET,
        brandVersion: 2,
        checks: { hard: 'ran', classifier: 'ran' },
        classifierModel: 'test-model',
      }
    },
  }

  const counting = (inner: PublishAdapter): PublishAdapter => ({
    channel: inner.channel,
    publish: async (req) => {
      spend.adapterCalls += 1
      return inner.publish(req)
    },
  })

  const deps: PublishPostDeps = {
    mode: 'fixture',
    gate,
    countLiveSends: async (args) => {
      spend.countedFor.push(args)
      return count()
    },
    loadVariant: async () => ({
      variantId: payloadFor(channel).variantId,
      body: 'Fresh samosas from 4pm today.',
      media: [],
      hasLink: false,
    }),
    resolveConnection: async () => ({
      connectionId: '55555555-5555-4555-8555-555555555555',
      externalAccountId: 'x-account-1',
      accessToken: 'super-secret-access-token',
      viaZernio: false,
    }),
    adapterFor: (c) => counting(createFixtureAdapter(c)),
    writeLog: async (e) => {
      spend.logs.push(e)
    },
    markVariant: async (u) => {
      spend.variantUpdates.push(u)
    },
  }

  return { deps, spend }
}

describe('the X monthly ration, on the publish path', () => {
  it('publishes when the workspace still has room', async () => {
    const { deps, spend } = harness(async () => X_MONTHLY_RATION - 1)

    const out = await runPublishPost(payloadFor('x'), ctx, deps)

    expect(out.status).toBe('succeeded')
    expect(spend.adapterCalls).toBe(1)
  })

  it('REFUSES the post that would go one over the ration', async () => {
    const { deps, spend } = harness(async () => X_MONTHLY_RATION)

    const out = await runPublishPost(payloadFor('x'), ctx, deps)

    expect(out).toMatchObject({
      status: 'failed',
      classification: 'permanent',
      code: X_RATION_EXHAUSTED_CODE,
    })
    expect(spend.adapterCalls).toBe(0)
  })

  it('refuses BEFORE the gate, so no model call is paid for', async () => {
    // The whole claim of "refuse before spending" rests on this ordering. If the
    // ration ever moves below the gate, this is the test that says so.
    const { deps, spend } = harness(async () => X_MONTHLY_RATION)

    await runPublishPost(payloadFor('x'), ctx, deps)

    expect(spend.gateChecks).toHaveLength(0)
  })

  it('records the refusal and never marks the variant published', async () => {
    const { deps, spend } = harness(async () => X_MONTHLY_RATION + 5)

    await runPublishPost(payloadFor('x'), ctx, deps)

    expect(spend.logs).toHaveLength(1)
    expect(spend.logs[0]).toMatchObject({ status: 'failed', channel: 'x' })
    expect(spend.variantUpdates.every((u) => u.publishStatus !== 'published')).toBe(true)
  })

  it('is NOT a reconnect prompt, and never expires the connection', async () => {
    // `RECONNECT_CODES` is {UNAUTHORIZED, FORBIDDEN} and drives both
    // `reconnectRequired` and `markConnection(id, 'expired')`. A spending refusal
    // misfiled there would tell a customer to reconnect a perfectly healthy
    // account over a limit that has nothing to do with their token. Executed
    // rather than assumed.
    const { deps, spend } = harness(async () => X_MONTHLY_RATION)
    const expired: { connectionId: string; status: string }[] = []
    const out = await runPublishPost(payloadFor('x'), ctx, {
      ...deps,
      markConnection: async (connectionId, status) => {
        expired.push({ connectionId, status })
      },
    })

    expect(out).toMatchObject({ status: 'failed', reconnectRequired: false })
    expect(expired).toHaveLength(0)
    expect(spend.adapterCalls).toBe(0)
  })

  it('tells the customer nothing was sent and nothing was charged', async () => {
    const { deps } = harness(async () => X_MONTHLY_RATION)

    const out = await runPublishPost(payloadFor('x'), ctx, deps)

    // Asserts the CLAIM, never the wording — rewrite the sentence freely and the
    // guarantee survives.
    expect(out.status === 'failed' && out.message).toContain('nothing was charged')
  })

  it('counts only this workspace, only X, and only the current month', async () => {
    const { deps, spend } = harness(async () => 0)

    await runPublishPost(payloadFor('x'), ctx, deps)

    expect(spend.countedFor).toHaveLength(1)
    const asked = spend.countedFor[0]!
    expect(asked.workspaceId).toBe(payloadFor('x').workspaceId)
    expect(asked.channel).toBe('x')
    // The first instant of a UTC month: day 1, midnight.
    expect(asked.since.getUTCDate()).toBe(1)
    expect(asked.since.getUTCHours()).toBe(0)
  })

  it('never counts, and never refuses, a channel that does not bill per post', async () => {
    // ONE BODY PER CHANNEL. LinkedIn's variant publishes independently of X's, so
    // an exhausted X allowance may not touch it — and LinkedIn must not even be
    // COUNTED, or a second channel silently starts consuming X's budget.
    const { deps, spend } = harness(async () => X_MONTHLY_RATION * 10, 'linkedin')

    const out = await runPublishPost(payloadFor('linkedin'), ctx, deps)

    expect(out.status).toBe('succeeded')
    expect(spend.countedFor).toHaveLength(0)
    expect(spend.adapterCalls).toBe(1)
  })

  it('an UNREADABLE count refuses transiently — it neither spends nor gives up', async () => {
    // Two wrong answers are available here and both would ship silently: reading
    // the failure as "0 used" spends real money off a failed read, and reading it
    // as "exhausted" tells a customer they are out of posts when we simply could
    // not count. The third answer is: retry, having sent nothing.
    const { deps, spend } = harness(async () => {
      throw new Error('pool is gone')
    })

    await expect(runPublishPost(payloadFor('x'), ctx, deps)).rejects.toThrow()

    expect(spend.adapterCalls).toBe(0)
    expect(spend.gateChecks).toHaveLength(0)
    expect(spend.logs).toHaveLength(1)
    expect(spend.logs[0]!.error).toMatchObject({
      code: X_RATION_UNREADABLE_CODE,
      classification: 'transient',
    })
    // It must NOT claim the allowance is spent — that is the fabricated reason.
    expect(spend.logs[0]!.error?.code).not.toBe(X_RATION_EXHAUSTED_CODE)
  })
})
