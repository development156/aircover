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
    { ok: true; id: string; merged: boolean } | { ok: false; reason: 'unavailable' | 'no_contact' },
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
  submitSiteLead: (input: unknown) => {
    state.writes.push(input)
    return Promise.resolve(state.submitResult)
  },
}))

const { POST } = await import('./route')

/**
 * EXACTLY what `lead-form.tsx` posts for a visitor who typed a name and a
 * phone number and left the other two fields empty: every key present, the
 * empty ones as `''`. This is the common shape for a shop's customers, and it
 * is the one that was refused.
 */
const PHONE_ONLY = {
  site_slug: 'chai-and-chapters',
  name: 'Asha Rao',
  email: '',
  phone: '+91 98765 43210',
  message: '',
  website: '',
  turnstile_token: 'tok_ok',
}

function post(body: unknown, rawBody?: string): Request {
  return new Request('http://localhost:3000/api/public/site-lead', {
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

describe('a phone-only enquiry, which is what the screen promises to take', () => {
  it('stores it when the email field was left blank', async () => {
    const response = await POST(post(PHONE_ONLY))

    const body = (await response.json()) as { ok?: boolean; fields?: string[] }
    expect(body.fields ?? []).not.toContain('email')
    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(state.writes).toHaveLength(1)
    expect(state.writes[0]).toMatchObject({
      siteSlug: 'chai-and-chapters',
      name: 'Asha Rao',
      phone: '+91 98765 43210',
    })
  })

  it('stores an email-only enquiry when the phone field was left blank', async () => {
    const response = await POST(post({ ...PHONE_ONLY, email: 'asha@example.com', phone: '' }))

    expect(response.status).toBe(200)
    expect(state.writes[0]).toMatchObject({ email: 'asha@example.com' })
  })

  it('answers the one-or-the-other sentence, not "invalid email", when both are blank', async () => {
    const response = await POST(post({ ...PHONE_ONLY, email: '', phone: '' }))

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string; message: string }
    expect(body.error).toBe('no_contact')
    expect(body.message).toBe('Leave an email address or a phone number so they can reply.')
    expect(state.captchaCalls).toBe(0)
    expect(state.writes).toEqual([])
  })
})

describe('the bot check never produced a token', () => {
  it('says the check could not load, never "check the details"', async () => {
    // MEASURED 2026-09-02: with the Turnstile widget blocked, the form posts
    // an empty token and the visitor was told to re-check details that were
    // already right. Re-checking cannot work, so the sentence must not ask it.
    const response = await POST(post({ ...PHONE_ONLY, turnstile_token: '' }))

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string; message: string }
    expect(body.error).toBe('challenge_missing')
    expect(body.message).toBe(CHALLENGE_MISSING_MESSAGE)
    expect(body.message.toLowerCase()).not.toContain('check the details')
    expect(state.captchaCalls).toBe(0)
    expect(state.writes).toEqual([])
  })

  it('does the same when the token key is absent altogether', async () => {
    const { turnstile_token: _omitted, ...withoutToken } = PHONE_ONLY

    const body = (await (await POST(post(withoutToken))).json()) as { error: string }
    expect(body.error).toBe('challenge_missing')
  })

  it('keeps the generic sentence when a detail is ALSO wrong, so a real mistake is still named', async () => {
    const response = await POST(post({ ...PHONE_ONLY, email: 'not-an-email', turnstile_token: '' }))

    const body = (await response.json()) as { error: string; fields: string[] }
    expect(body.error).toBe('invalid')
    expect(body.fields).toContain('email')
  })
})

describe('the captcha fails closed', () => {
  it('refuses with 503 when Turnstile is not configured, and writes nothing', async () => {
    state.captcha = { ok: false, reason: 'not_configured' }

    const response = await POST(post(PHONE_ONLY))

    expect(response.status).toBe(503)
    expect(state.writes).toEqual([])
  })

  it('refuses when Turnstile says no', async () => {
    state.captcha = { ok: false, reason: 'rejected' }

    const response = await POST(post(PHONE_ONLY))

    expect(response.status).toBe(400)
    expect(state.writes).toEqual([])
  })
})

describe('the honeypot', () => {
  it('rejects a filled honeypot before spending a captcha call or a write', async () => {
    const response = await POST(post({ ...PHONE_ONLY, website: 'http://spam.example' }))

    expect(response.status).toBe(400)
    expect(state.captchaCalls).toBe(0)
    expect(state.writes).toEqual([])
  })
})

describe('shape', () => {
  it('rejects a body that is not JSON', async () => {
    const response = await POST(post(null, 'not json'))

    expect(response.status).toBe(400)
    expect(state.writes).toEqual([])
  })

  it('reports failure rather than success when the write is unavailable', async () => {
    state.submitResult = { ok: false, reason: 'unavailable' }

    const response = await POST(post(PHONE_ONLY))

    expect(response.status).toBe(502)
    const body = (await response.json()) as { ok: boolean; message: string }
    expect(body.ok).toBe(false)
    expect(body.message).toContain('Nothing was saved')
  })

  it('never returns the row id to an anonymous caller', async () => {
    const body = await (await POST(post(PHONE_ONLY))).text()

    expect(body).not.toContain('row-1')
  })
})
