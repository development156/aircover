import { describe, it, expect } from 'vitest'
import { createFixtureProvider } from './fixture'

const paid = {
  workspaceId: 'ws-1',
  planId: 'starter' as const,
  period: '2026-07',
  eventId: 'evt_fixture_1',
}

describe('fixture provider — checkout', () => {
  it('creates a checkout session explicitly labelled mode:fixture', async () => {
    const provider = createFixtureProvider()
    const session = await provider.createCheckout({
      workspaceId: 'ws-1',
      planId: 'starter',
      period: '2026-07',
      successUrl: 'https://app.local/ok',
      cancelUrl: 'https://app.local/cancel',
    })
    expect(session.mode).toBe('fixture')
    expect(session.id).toContain('ws-1')
    expect(session.url).toMatch(/^https?:\/\//)
    expect(provider.id).toBe('fixture')
    expect(provider.mode).toBe('fixture')
  })
})

describe('fixture provider — webhook signature', () => {
  it('verifies a signature it produced (sign → verify roundtrip)', () => {
    const provider = createFixtureProvider()
    const body = JSON.stringify({ hello: 'world' })
    const sig = provider.sign(body)
    expect(provider.verifyWebhookSignature(body, sig)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const provider = createFixtureProvider()
    const body = JSON.stringify({ amount: 100 })
    const sig = provider.sign(body)
    const tampered = JSON.stringify({ amount: 999 })
    expect(provider.verifyWebhookSignature(tampered, sig)).toBe(false)
  })

  it('rejects a garbage signature without throwing on length mismatch', () => {
    const provider = createFixtureProvider()
    const body = JSON.stringify({ x: 1 })
    expect(provider.verifyWebhookSignature(body, 'deadbeef')).toBe(false)
    expect(provider.verifyWebhookSignature(body, '')).toBe(false)
  })

  it('is bound to the secret — another secret does not verify', () => {
    const a = createFixtureProvider({ webhookSecret: 'secret-a' })
    const b = createFixtureProvider({ webhookSecret: 'secret-b' })
    const body = JSON.stringify({ x: 1 })
    expect(b.verifyWebhookSignature(body, a.sign(body))).toBe(false)
  })
})

describe('fixture provider — parse webhook event', () => {
  it('normalizes a paid event into the shape billing acts on', () => {
    const provider = createFixtureProvider()
    const { rawBody, signature } = provider.emitPaidEvent(paid)

    expect(provider.verifyWebhookSignature(rawBody, signature)).toBe(true)

    const event = provider.parseWebhookEvent(rawBody)
    expect(event).toMatchObject({
      provider: 'fixture',
      eventId: 'evt_fixture_1',
      eventType: 'payment_succeeded',
      workspaceId: 'ws-1',
      planId: 'starter',
      period: '2026-07',
      mode: 'fixture',
    })
    expect(event.raw).toBeDefined()
  })

  it('rejects a malformed payload (validated at the boundary)', () => {
    const provider = createFixtureProvider()
    expect(() => provider.parseWebhookEvent('not json')).toThrow()
    expect(() => provider.parseWebhookEvent(JSON.stringify({ id: 'x' }))).toThrow()
    expect(() =>
      provider.parseWebhookEvent(
        JSON.stringify({
          id: 'x',
          type: 'payment.succeeded',
          data: { workspace_id: 'w', plan_id: 'not-a-plan', period: '2026-07' },
        }),
      ),
    ).toThrow()
  })
})
