import { afterEach, describe, expect, it, vi } from 'vitest'

import { CHALLENGE_MISSING_MESSAGE } from '@/components/embed/challenge-copy'

const state = vi.hoisted(() => ({
  minute: { allowed: true, count: 1, unmeasured: false },
  day: { allowed: true, count: 1, unmeasured: false },
  captcha: { ok: true } as
    { ok: true } | { ok: false; reason: 'not_configured' | 'rejected' | 'unreachable' },
  captchaCalls: 0,
  writes: [] as unknown[],
  submitResult: { ok: true, id: 'row-1', merged: false } as
    { ok: true; id: string; merged: boolean } | { ok: false; reason: 'unavailable' },
}))

vi.mock('@/lib/ops/rate-limit', () => ({
  fixedWindowAllow: (key: string) =>
    Promise.resolve(key.includes(':day:') ? state.day : state.minute),
}))

vi.mock('@/lib/ops/turnstile', () => ({
  verifyTurnstile: () => {
    state.captchaCalls += 1
    return Promise.resolve(state.captcha)
  },
  clientIpFrom: () => '203.0.113.9',
}))

vi.mock('@/lib/ops/service-rpc', () => ({
  submitBetaApplication: (input: unknown) => {
    state.writes.push(input)
    return Promise.resolve(state.submitResult)
  },
}))

const { POST } = await import('./route')

const GOOD = {
  name: 'Asha Rao',
  business_name: 'Chai & Chapters',
  email: 'asha@example.com',
  phone: '9876543210',
  turnstile_token: 'tok_ok',
}

function post(body: unknown, rawBody?: string): Request {
  return new Request('http://localhost:3000/api/public/beta-apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody ?? JSON.stringify(body),
  })
}

afterEach(() => {
  state.minute = { allowed: true, count: 1, unmeasured: false }
  state.day = { allowed: true, count: 1, unmeasured: false }
  state.captcha = { ok: true }
  state.captchaCalls = 0
  state.writes.length = 0
  state.submitResult = { ok: true, id: 'row-1', merged: false }
})

describe('the happy path', () => {
  it('stores the application and thanks the visitor', async () => {
    const response = await POST(post(GOOD))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
    expect(state.writes).toHaveLength(1)
    expect(state.writes[0]).toMatchObject({
      name: 'Asha Rao',
      businessName: 'Chai & Chapters',
      email: 'asha@example.com',
    })
  })

  it('never returns the row id to an anonymous caller', async () => {
    const body = await (await POST(post(GOOD))).text()

    expect(body).not.toContain('row-1')
  })

  it('carries ?src= through as the source', async () => {
    await POST(post({ ...GOOD, source_url: 'chai-landing' }))

    expect(state.writes[0]).toMatchObject({ sourceUrl: 'chai-landing' })
  })
})

describe('the captcha fails closed', () => {
  it('refuses with 503 when Turnstile is not configured, and writes nothing', async () => {
    // An unverified captcha on a service-role insert is an open public write.
    // Unconfigured must never degrade to "allow".
    state.captcha = { ok: false, reason: 'not_configured' }

    const response = await POST(post(GOOD))

    expect(response.status).toBe(503)
    expect(state.writes).toEqual([])
  })

  it('refuses when Turnstile says no', async () => {
    state.captcha = { ok: false, reason: 'rejected' }

    const response = await POST(post(GOOD))

    expect(response.status).toBe(400)
    expect(state.writes).toEqual([])
  })

  it('refuses when Turnstile is unreachable rather than assuming a pass', async () => {
    state.captcha = { ok: false, reason: 'unreachable' }

    const response = await POST(post(GOOD))

    expect(response.status).toBe(502)
    expect(state.writes).toEqual([])
  })
})

describe('the honeypot', () => {
  it('rejects a filled honeypot before spending a captcha call or a write', async () => {
    const response = await POST(post({ ...GOOD, website: 'http://spam.example' }))

    expect(response.status).toBe(400)
    expect(state.captchaCalls).toBe(0)
    expect(state.writes).toEqual([])
  })

  it('does not name the honeypot field in the reply', async () => {
    // Telling a bot which field trapped it teaches the next one to skip it.
    const body = await (await POST(post({ ...GOOD, website: 'http://spam.example' }))).text()

    expect(body.toLowerCase()).not.toContain('honeypot')
  })

  it('accepts an empty honeypot, which is what a real browser sends', async () => {
    const response = await POST(post({ ...GOOD, website: '' }))

    expect(response.status).toBe(200)
  })
})

describe('rate limiting', () => {
  it.each([
    ['per minute', 'minute'],
    ['per day', 'day'],
  ] as const)('refuses over the %s limit without writing', async (_label, which) => {
    state[which] = { allowed: false, count: 99, unmeasured: false }

    const response = await POST(post(GOOD))

    expect(response.status).toBe(429)
    expect(state.captchaCalls).toBe(0)
    expect(state.writes).toEqual([])
  })
})

describe('the bot check never produced a token', () => {
  it('says the check could not load, never "check the details"', async () => {
    // MEASURED 2026-09-02: with the Turnstile widget blocked, the form posts an
    // empty token and the visitor was told to re-check details that were
    // already right. Re-checking cannot work, so the sentence must not ask it.
    const response = await POST(post({ ...GOOD, turnstile_token: '' }))

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string; message: string }
    expect(body.error).toBe('challenge_missing')
    expect(body.message).toBe(CHALLENGE_MISSING_MESSAGE)
    expect(body.message.toLowerCase()).not.toContain('check the details')
    expect(state.captchaCalls).toBe(0)
    expect(state.writes).toEqual([])
  })

  it('keeps the generic sentence when a detail is ALSO wrong, so a real mistake is still named', async () => {
    const response = await POST(post({ ...GOOD, email: 'not-an-email', turnstile_token: '' }))

    const body = (await response.json()) as { error: string; fields: string[] }
    expect(body.error).toBe('invalid')
    expect(body.fields).toContain('email')
  })
})

describe('shape', () => {
  it.each([
    ['no name', { ...GOOD, name: '' }],
    ['no business', { ...GOOD, business_name: '   ' }],
    ['not an email', { ...GOOD, email: 'not-an-email' }],
    ['too few digits', { ...GOOD, phone: '12' }],
    ['no captcha token', { ...GOOD, turnstile_token: '' }],
  ])('rejects %s', async (_label, body) => {
    const response = await POST(post(body))

    expect(response.status).toBe(400)
    expect(state.writes).toEqual([])
  })

  it('rejects a body that is not JSON', async () => {
    const response = await POST(post(null, 'not json'))

    expect(response.status).toBe(400)
    expect(state.writes).toEqual([])
  })

  it('reports failure rather than success when the write is unavailable', async () => {
    state.submitResult = { ok: false, reason: 'unavailable' }

    const response = await POST(post(GOOD))

    expect(response.status).toBe(502)
    const body = (await response.json()) as { ok: boolean; message: string }
    expect(body.ok).toBe(false)
    // "Nothing was saved" has to be true when we say it.
    expect(body.message).toContain('Nothing was saved')
  })
})
