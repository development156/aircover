import { describe, it, expect } from 'vitest'
import { AdapterError } from '@sahoda/shared'
import { createFixtureAdapter } from '@sahoda/publishing'
import type { GateVerdict, PublishPostPayload, RuleSet } from '@sahoda/shared'
import { runPublishPost, type PublishJobContext, type PublishPostDeps } from './runPublishPost'

/**
 * WHICH FAILURE SENTENCES A CUSTOMER MAY READ, DECIDED WHERE IT IS KNOWN.
 *
 * `runPublishPost` produces two kinds of `message` on a permanent failure. One
 * is written by Sahoda code for a person: the Constraint Engine's "allows 280
 * characters; this has 312", the per-day cap's "held until tomorrow". The other
 * is whatever was THROWN: an adapter's `createPost: HTTP 500 <html>`, or the
 * driver's `error: CROSS_TENANT_ACCOUNT`. The publish route used to forward both
 * verbatim, so Zernio's response body reached the shop owner's screen.
 *
 * The route cannot tell the two apart by code (MEDIA_REQUIRED comes from both the
 * engine and the adapter), so the outcome says which it is. This file pins that
 * tag at its source; the route's own test pins what reaches the body.
 */

const payload: PublishPostPayload = {
  workspaceId: '22222222-2222-4222-8222-222222222222',
  postId: '33333333-3333-4333-8333-333333333333',
  variantId: '44444444-4444-4444-8444-444444444444',
  channel: 'x',
  scheduledAt: '2026-07-19T10:00:00.000Z',
}
const ctx: PublishJobContext = { attempt: 1, jobRunId: 'run_abc' }

const RULE_SET: RuleSet = {
  ruleSetVersion: 'regime-_floor@2026.08',
  packs: [{ id: 'regime-_floor', version: '2026.08' }],
  rules: [],
  regime: { value: 'consumer', locale: 'IN', basis: 'default' },
}
const pass = (): GateVerdict => ({
  decision: 'pass',
  findings: [],
  ruleSet: RULE_SET,
  brandVersion: 2,
  checks: { hard: 'ran', classifier: 'ran' },
  classifierModel: 'test-model',
})

function deps(over: Partial<PublishPostDeps> & { body?: string } = {}): PublishPostDeps {
  return {
    mode: 'fixture',
    gate: { check: async () => pass() },
    countLiveSends: async () => 0,
    loadVariant: async () => ({
      variantId: payload.variantId,
      body: over.body ?? 'Fresh samosas from 4pm today.',
      media: [],
    }),
    resolveConnection: async () => ({
      connectionId: '55555555-5555-4555-8555-555555555555',
      externalAccountId: 'x-account-1',
      accessToken: 'token',
      viaZernio: false,
    }),
    adapterFor: (channel) => createFixtureAdapter(channel),
    writeLog: async () => {},
    markVariant: async () => {},
    recordPublished: async () => {},
    ...over,
  }
}

const RAW = 'createPost: HTTP 500 <html><body>Bad gateway</body></html>'

describe('runPublishPost marks whose sentence the failure message is', () => {
  it('an adapter’s thrown message is NOT customer-readable, though it is still logged', async () => {
    const logged: string[] = []
    const err = new AdapterError({
      message: RAW,
      code: 'PLATFORM_REJECTED',
      classification: 'permanent',
      channel: 'x',
    })
    const out = await runPublishPost(
      payload,
      ctx,
      deps({
        adapterFor: () => ({
          channel: 'x',
          publish: async () => {
            throw err
          },
        }),
        writeLog: async (entry) => {
          if (entry.error) logged.push(entry.error.message)
        },
      }),
    )

    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.customerReadable).toBe(false)
    // The raw text goes to the log row, where an operator can read it. Only there.
    expect(out.message).toBe(RAW)
    expect(logged).toEqual([RAW])
  })

  it('a pre-flight refusal raised by the database is NOT customer-readable', async () => {
    const out = await runPublishPost(
      payload,
      ctx,
      deps({
        resolveConnection: async () => {
          throw new Error('error: CROSS_TENANT_ACCOUNT')
        },
      }),
    )

    expect(out).toMatchObject({ status: 'failed', code: 'CROSS_TENANT_ACCOUNT' })
    if (out.status !== 'failed') return
    expect(out.customerReadable).toBe(false)
  })

  it('the Constraint Engine’s own refusal IS customer-readable, with its exact figures', async () => {
    const out = await runPublishPost(payload, ctx, deps({ body: 'x'.repeat(400) }))

    expect(out).toMatchObject({ status: 'failed', code: 'MAX_CHARS' })
    if (out.status !== 'failed') return
    expect(out.customerReadable).toBe(true)
    // The figures are the whole point of keeping this sentence; a code-mapped
    // sentence would be vaguer than the truth it replaced.
    expect(out.message).toMatch(/280 characters; this has 400/)
  })

  it('the job’s own "no variant" sentence names a lowercase key, so it is not for a customer', async () => {
    const out = await runPublishPost(payload, ctx, deps({ loadVariant: async () => null }))

    expect(out).toMatchObject({ status: 'failed', code: 'VARIANT_NOT_FOUND' })
    if (out.status !== 'failed') return
    expect(out.customerReadable).toBe(false)
  })
})
