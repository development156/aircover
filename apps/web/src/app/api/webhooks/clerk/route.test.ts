import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Built INSIDE the hoisted factory: vi.hoisted runs above every top-level
// const, so referencing an outer one here is a temporal-dead-zone error that
// fails the whole file to load with "no tests" rather than a useful message.
const state = vi.hoisted(() => {
  const secret = `whsec_${Buffer.from('a-test-signing-key-32-bytes-long').toString('base64')}`
  return {
  secret,
  env: { CLERK_WEBHOOK_SECRET: secret as string | undefined },
  links: [] as { email: string; userId: string }[],
  linkResult: { ok: true, linkedSeat: false } as
    { ok: true; linkedSeat: boolean } | { ok: false; reason: 'unavailable' },
  }
})

const SECRET = state.secret

vi.mock('@/lib/env', () => ({ env: state.env }))
vi.mock('@/lib/ops/service-rpc', () => ({
  linkClerkUser: (email: string, userId: string) => {
    state.links.push({ email, userId })
    return Promise.resolve(state.linkResult)
  },
}))

const { POST } = await import('./route')

function signed(body: string, secret = SECRET): Request {
  const id = 'msg_1'
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signature = `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`

  return new Request('http://localhost:3000/api/webhooks/clerk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    },
    body,
  })
}

const USER_CREATED = JSON.stringify({
  type: 'user.created',
  data: {
    id: 'user_2abc',
    primary_email_address_id: 'idn_2',
    email_addresses: [
      { id: 'idn_1', email_address: 'old@example.com' },
      { id: 'idn_2', email_address: 'primary@example.com' },
    ],
  },
})

afterEach(() => {
  state.env.CLERK_WEBHOOK_SECRET = SECRET
  state.links.length = 0
  state.linkResult = { ok: true, linkedSeat: false }
})

describe('an unverified request never reaches the database', () => {
  it('refuses an unsigned request', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/webhooks/clerk', {
        method: 'POST',
        body: USER_CREATED,
      }),
    )

    expect(response.status).toBe(401)
    expect(state.links).toEqual([])
  })

  it('refuses a payload signed with the wrong secret', async () => {
    const other = `whsec_${Buffer.from('a-different-key-of-the-same-size').toString('base64')}`

    const response = await POST(signed(USER_CREATED, other))

    expect(response.status).toBe(401)
    expect(state.links).toEqual([])
  })

  it('refuses a body altered after signing', async () => {
    const request = signed(USER_CREATED)
    const tampered = new Request(request, {
      body: USER_CREATED.replace('user_2abc', 'user_evil'),
    })

    const response = await POST(tampered)

    expect(response.status).toBe(401)
    expect(state.links).toEqual([])
  })

  it('answers 503 when no signing secret is configured, and writes nothing', async () => {
    state.env.CLERK_WEBHOOK_SECRET = undefined

    const response = await POST(signed(USER_CREATED))

    expect(response.status).toBe(503)
    expect(state.links).toEqual([])
  })
})

describe('a verified user.created', () => {
  it('links the PRIMARY email to the Clerk id', async () => {
    const response = await POST(signed(USER_CREATED))

    expect(response.status).toBe(200)
    expect(state.links).toEqual([{ email: 'primary@example.com', userId: 'user_2abc' }])
  })

  it('reports whether an admin seat was activated', async () => {
    state.linkResult = { ok: true, linkedSeat: true }

    const body = await (await POST(signed(USER_CREATED))).json()

    expect(body).toMatchObject({ ok: true, linked_admin_seat: true })
  })

  it('asks Clerk to retry when the write is unavailable', async () => {
    // 502, not 200: this one IS transient and losing it would leave an
    // application stuck at "invited" forever.
    state.linkResult = { ok: false, reason: 'unavailable' }

    const response = await POST(signed(USER_CREATED))

    expect(response.status).toBe(502)
  })
})

describe('verified events we do not act on', () => {
  it('accepts and ignores another event type rather than failing it', async () => {
    // Clerk retries non-2xx. Retrying an event nobody wants is noise.
    const response = await POST(signed(JSON.stringify({ type: 'session.created', data: {} })))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ignored: 'session.created' })
    expect(state.links).toEqual([])
  })

  it('accepts and ignores a user with no resolvable primary email', async () => {
    const orphaned = JSON.stringify({
      type: 'user.created',
      data: { id: 'user_x', primary_email_address_id: 'missing', email_addresses: [] },
    })

    const response = await POST(signed(orphaned))

    expect(response.status).toBe(200)
    expect(state.links).toEqual([])
  })
})
