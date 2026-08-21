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

/** The monthly ration's window is the only one that starts on the 1st at midnight. */
const isMonthWindow = (since: Date): boolean =>
  since.getUTCDate() === 1 && since.getUTCHours() === 0

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
 *
 * It receives the ARGS since 2026-08-20, because `runPublishPost` now asks
 * `countLiveSends` TWICE on X — once for the Constraint Engine's per-day cap and
 * once for the monthly X ration — and a case that wants to fail only one of them
 * has to be able to tell which it is being asked. `isMonthWindow` below is the
 * discriminator: the monthly window always starts on the 1st.
 */
function harness(
  count: (args: { workspaceId: string; channel: string; since: Date }) => Promise<number>,
  channel: PublishPostPayload['channel'] = 'x',
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
      return count(args)
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

  it('counts only this workspace and only X — over TWO windows, the day and the month', async () => {
    // Two counts since 2026-08-20, and the second is the one this file is about.
    // Asserting a length of 1 was correct until the Constraint Engine's per-day cap
    // was wired; it is recorded here as two named windows rather than a number, so
    // the next reader can see WHICH question each one asks.
    const { deps, spend } = harness(async () => 0)

    await runPublishPost(payloadFor('x'), ctx, deps)

    expect(spend.countedFor).toHaveLength(2)
    for (const asked of spend.countedFor) {
      expect(asked.workspaceId).toBe(payloadFor('x').workspaceId)
      expect(asked.channel).toBe('x')
      expect(asked.since.getUTCHours()).toBe(0)
    }
    const months = spend.countedFor.filter((a) => isMonthWindow(a.since))
    // Exactly one MONTH window — the ration's. (On the 1st of a month the day
    // window coincides with it, so this asserts on the count of distinct windows
    // rather than on which slot each landed in.)
    expect(new Set(spend.countedFor.map((a) => a.since.getTime())).size).toBe(
      months.length === 2 ? 1 : 2,
    )
    expect(months.length).toBeGreaterThanOrEqual(1)
  })

  it("never charges a channel that does not bill per post against X's monthly ration", async () => {
    // ONE BODY PER CHANNEL. LinkedIn's variant publishes independently of X's, so an
    // exhausted X allowance may not touch it.
    //
    // The original form of this test asserted LinkedIn was never COUNTED AT ALL, and
    // that stopped being the right claim on 2026-08-20: LinkedIn is now counted, but
    // against its OWN per-day cap, over a DAY window. What must still never happen —
    // and is what this test now says — is LinkedIn being asked about a MONTH window,
    // which is the only way it could start consuming X's budget.
    const { deps, spend } = harness(async () => 0, 'linkedin')

    const out = await runPublishPost(payloadFor('linkedin'), ctx, deps)

    expect(out.status).toBe('succeeded')
    expect(spend.adapterCalls).toBe(1)
    expect(spend.countedFor).toHaveLength(1)
    expect(spend.countedFor[0]!.channel).toBe('linkedin')
    const asked = spend.countedFor[0]!.since
    // Today at UTC midnight, never the 1st — unless today IS the 1st, in which case
    // the two windows coincide and the discriminator is the CHANNEL, asserted above.
    expect(asked.getTime()).toBe(
      Date.UTC(asked.getUTCFullYear(), asked.getUTCMonth(), asked.getUTCDate()),
    )
  })

  it('an UNREADABLE count refuses transiently — it neither spends nor gives up', async () => {
    // Two wrong answers are available here and both would ship silently: reading
    // the failure as "0 used" spends real money off a failed read, and reading it
    // as "exhausted" tells a customer they are out of posts when we simply could
    // not count. The third answer is: retry, having sent nothing.
    // Only the MONTH read fails. The per-day read runs first now, so a counter that
    // threw unconditionally would be caught by the per-day guard and this file would
    // stop testing the ration's own unreadable path without saying so.
    const { deps, spend } = harness(async ({ since }) => {
      if (isMonthWindow(since)) throw new Error('pool is gone')
      return 0
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
