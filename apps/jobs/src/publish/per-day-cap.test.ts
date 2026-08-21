import { describe, it, expect } from 'vitest'
import { X_MONTHLY_RATION, X_RATION_EXHAUSTED_CODE, createFixtureAdapter } from '@sahoda/publishing'
import {
  CONSTRAINTS,
  PER_DAY_CAP_EXHAUSTED_CODE,
  PER_DAY_CAP_UNREADABLE_CODE,
  checkPerDayCap,
  perDayCapWindowStart,
  type Channel,
  type GateCheckInput,
  type GateVerdict,
  type PublishAdapter,
  type PublishGate,
  type PublishPostPayload,
  type RuleSet,
} from '@sahoda/shared'
import {
  runPublishPost,
  type PublishJobContext,
  type PublishLogEntry,
  type PublishPostDeps,
  type VariantUpdate,
} from './runPublishPost'

/**
 * THE CONSTRAINT ENGINE'S PER-DAY CAP, SHOWN REFUSING.
 *
 * `PlatformSpec.perDayCap` carried a number on all four channels from the engine's
 * first commit and was referenced by NOTHING until 2026-08-20 — four declarations,
 * zero call sites. Every case here runs the real `runPublishPost` and asserts on what
 * DID NOT HAPPEN downstream (no gate call, so no model spend; no adapter call, so
 * nothing reached a platform) rather than on a returned flag.
 */

const ctx: PublishJobContext = { attempt: 1, jobRunId: 'run_per_day' }

const RULE_SET: RuleSet = {
  ruleSetVersion: 'regime-_floor@2026.08',
  packs: [{ id: 'regime-_floor', version: '2026.08' }],
  rules: [],
  regime: { value: 'consumer', locale: 'IN', basis: 'default' },
}

const payloadFor = (channel: Channel): PublishPostPayload => ({
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

function harness(
  count: (args: { workspaceId: string; channel: string; since: Date }) => Promise<number>,
  channel: Channel,
) {
  const spend: Spend = {
    gateChecks: [],
    adapterCalls: 0,
    logs: [],
    variantUpdates: [],
    countedFor: [],
  }

  const gate: PublishGate = {
    check: async (input): Promise<GateVerdict> => {
      // Recording the call IS the assertion: reaching this line means a model was
      // paid for a post the cap had already decided against.
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
      return count(args)
    },
    loadVariant: async () => ({
      variantId: payloadFor(channel).variantId,
      body: 'Fresh samosas from 4pm today.',
      // Instagram is the one channel that refuses a caption-only post, so it needs a
      // media item or `validateVariant` rejects before the cap is ever consulted —
      // which would make an instagram case pass for the wrong reason.
      media:
        channel === 'instagram'
          ? [{ storagePath: 'ws/post/a.jpg', mime: 'image/jpeg', bytes: 120_000 }]
          : [],
      hasLink: false,
    }),
    resolveConnection: async () => ({
      connectionId: '55555555-5555-4555-8555-555555555555',
      externalAccountId: 'account-1',
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

/** Every channel the engine declares, so none is quietly left unguarded. */
const CHANNELS = Object.keys(CONSTRAINTS) as Channel[]

describe('the per-day cap, as a pure function', () => {
  it('reads the number off the channel spec rather than carrying its own', () => {
    for (const channel of CHANNELS) {
      expect(checkPerDayCap({ channel, used: 0 }).cap).toBe(CONSTRAINTS[channel].perDayCap)
    }
  })

  it('allows the last post of the day and refuses the one after it', () => {
    for (const channel of CHANNELS) {
      const cap = CONSTRAINTS[channel].perDayCap
      expect(checkPerDayCap({ channel, used: cap - 1 }).allowed).toBe(true)
      expect(checkPerDayCap({ channel, used: cap }).allowed).toBe(false)
    }
  })

  it('never reports a negative remaining, and never lets a negative count inflate it', () => {
    const cap = CONSTRAINTS.linkedin.perDayCap
    expect(checkPerDayCap({ channel: 'linkedin', used: cap + 7 }).remaining).toBe(0)
    // A count that came back negative must not read as "cap + 3 posts left".
    expect(checkPerDayCap({ channel: 'linkedin', used: -3 }).remaining).toBe(cap)
  })

  it('counts a UTC day, from midnight', () => {
    const start = perDayCapWindowStart(new Date('2026-08-20T21:07:00.000Z'))
    expect(start.toISOString()).toBe('2026-08-20T00:00:00.000Z')
    // And the instant before midnight belongs to the PREVIOUS day, not this one.
    expect(perDayCapWindowStart(new Date('2026-08-20T00:00:00.000Z')).toISOString()).toBe(
      '2026-08-20T00:00:00.000Z',
    )
    expect(perDayCapWindowStart(new Date('2026-08-19T23:59:59.999Z')).toISOString()).toBe(
      '2026-08-19T00:00:00.000Z',
    )
  })
})

describe('the per-day cap, on the publish path', () => {
  it('publishes when the channel still has room today — on every channel', async () => {
    for (const channel of CHANNELS) {
      // `perDayCap - 1` for three channels, and NOT for x — see the test below. On x
      // the same count is also read by the monthly ration, whose ceiling is lower.
      const room = channel === 'x' ? 0 : CONSTRAINTS[channel].perDayCap - 1
      const { deps, spend } = harness(async () => room, channel)
      const out = await runPublishPost(payloadFor(channel), ctx, deps)
      expect(out.status, `${channel} should publish with room left`).toBe('succeeded')
      expect(spend.adapterCalls).toBe(1)
    }
  })

  it("x's declared per-day cap of 100 is unreachable, because Sahoda's month is 40", async () => {
    // MEASURED, not asserted as design: `CONSTRAINTS.x.perDayCap` is 100 and
    // `X_MONTHLY_RATION` is 12, so a workspace runs out of MONTH before it can reach
    // one day's platform limit. The per-day cap on x can therefore never be the thing
    // that refuses — the ration always gets there first.
    //
    // This is recorded rather than "fixed" because both numbers are correct about
    // different things: 100 is what X accepts, 40 is what Sahoda will pay for. It is
    // here so that raising the ration above 100 does not silently make x's daily limit
    // load-bearing without anyone noticing.
    expect(CONSTRAINTS.x.perDayCap).toBeGreaterThan(X_MONTHLY_RATION)

    const { deps, spend } = harness(async () => X_MONTHLY_RATION, 'x')
    const out = await runPublishPost(payloadFor('x'), ctx, deps)

    // The RATION refuses, not the day cap — the used count is far below 100.
    expect(out).toMatchObject({ status: 'failed', code: X_RATION_EXHAUSTED_CODE })
    expect(spend.adapterCalls).toBe(0)
  })

  it('REFUSES the post that would go one over the cap — on every channel', async () => {
    for (const channel of CHANNELS) {
      const { deps, spend } = harness(async () => CONSTRAINTS[channel].perDayCap, channel)
      const out = await runPublishPost(payloadFor(channel), ctx, deps)
      expect(out, `${channel} should refuse at the cap`).toMatchObject({
        status: 'failed',
        classification: 'permanent',
        code: PER_DAY_CAP_EXHAUSTED_CODE,
      })
      expect(spend.adapterCalls, `${channel} must not reach a platform`).toBe(0)
    }
  })

  it('refuses BEFORE the gate, so no model call is paid for', async () => {
    // The whole claim of "refuse before spending" rests on this ordering. If the cap
    // ever moves below the gate, this is the test that says so.
    const { deps, spend } = harness(async () => CONSTRAINTS.instagram.perDayCap, 'instagram')
    await runPublishPost(payloadFor('instagram'), ctx, deps)
    expect(spend.gateChecks).toHaveLength(0)
  })

  it('asks about THIS workspace, THIS channel, and today only', async () => {
    const { deps, spend } = harness(async () => 0, 'gbp')
    await runPublishPost(payloadFor('gbp'), ctx, deps)

    expect(spend.countedFor).toHaveLength(1)
    const asked = spend.countedFor[0]!
    expect(asked.workspaceId).toBe(payloadFor('gbp').workspaceId)
    expect(asked.channel).toBe('gbp')
    expect(asked.since.getTime()).toBe(
      Date.UTC(asked.since.getUTCFullYear(), asked.since.getUTCMonth(), asked.since.getUTCDate()),
    )
  })

  it('an UNREADABLE count refuses transiently — it neither spends nor gives up', async () => {
    // Two wrong answers are available and both would ship silently. "0 used" publishes
    // past a platform limit off a failed read; "exhausted" tells a customer the channel
    // refused them when the truth is we could not count — and that verdict is permanent,
    // so the post dies on a reason nothing measured.
    const { deps, spend } = harness(async () => {
      throw new Error('pool is gone')
    }, 'linkedin')

    await expect(runPublishPost(payloadFor('linkedin'), ctx, deps)).rejects.toThrow()

    expect(spend.adapterCalls).toBe(0)
    expect(spend.gateChecks).toHaveLength(0)
    expect(spend.logs).toHaveLength(1)
    expect(spend.logs[0]!.error).toMatchObject({
      code: PER_DAY_CAP_UNREADABLE_CODE,
      classification: 'transient',
    })
    expect(spend.logs[0]!.error?.code).not.toBe(PER_DAY_CAP_EXHAUSTED_CODE)
  })

  it('is NOT a reconnect prompt, and never expires the connection', async () => {
    // `RECONNECT_CODES` drives both `reconnectRequired` and `markConnection(id,
    // 'expired')`. A daily-limit refusal misfiled there would tell a customer to
    // reconnect a perfectly healthy account over a rule about volume.
    const { deps } = harness(async () => CONSTRAINTS.linkedin.perDayCap, 'linkedin')
    const expired: { connectionId: string; status: string }[] = []
    const out = await runPublishPost(payloadFor('linkedin'), ctx, {
      ...deps,
      markConnection: async (connectionId, status) => {
        expired.push({ connectionId, status })
      },
    })

    expect(out).toMatchObject({ status: 'failed', reconnectRequired: false })
    expect(expired).toHaveLength(0)
  })

  it("says it is the channel's limit and not Sahoda's, and that nothing was sent", async () => {
    // The two caps in this system have different owners and must never borrow each
    // other's sentence: this one is the platform's rule, X_MONTHLY_RATION is Sahoda's
    // budget. Asserts the CLAIM, never the wording.
    const { deps } = harness(async () => CONSTRAINTS.gbp.perDayCap, 'gbp')
    const out = await runPublishPost(payloadFor('gbp'), ctx, deps)
    const message = out.status === 'failed' ? out.message : ''
    expect(message).toContain("channel's own limit")
    expect(message).toContain('nothing was sent')
    expect(message).toContain('tomorrow')
  })

  it('marks the variant failed and never published', async () => {
    const { deps, spend } = harness(async () => CONSTRAINTS.x.perDayCap + 5, 'x')
    await runPublishPost(payloadFor('x'), ctx, deps)
    expect(spend.variantUpdates.every((u) => u.publishStatus !== 'published')).toBe(true)
    expect(spend.logs[0]).toMatchObject({ status: 'failed', channel: 'x' })
  })
})
