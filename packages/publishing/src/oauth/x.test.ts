import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { routedTransport, type Transport } from '../transport'
import { createTokenVault, type TokenVault } from '../vault/token-vault'
import { createXOAuthHandlers } from './x'
import type { ConnectionStore, ConnectionUpsert } from './store'
import tokenSuccess from '../../fixtures/x/oauth-token.success.json'
import tokenError from '../../fixtures/x/oauth-token.error.json'
import meSuccess from '../../fixtures/x/users-me.success.json'

const FIXED_NOW = new Date('2026-07-19T12:00:00.000Z')
const TEST_VAULT: TokenVault = createTokenVault({
  current: 1,
  keys: { 1: Buffer.from('cd'.repeat(32), 'hex') },
})

function fakeStore(): { store: ConnectionStore; calls: ConnectionUpsert[] } {
  const calls: ConnectionUpsert[] = []
  return {
    store: {
      upsertConnection: async (record) => {
        calls.push(record)
        return { connectionId: 'conn-123' }
      },
    },
    calls,
  }
}

function handlers(transport: Transport, store: ConnectionStore) {
  return createXOAuthHandlers({
    clientId: 'x-client-id',
    clientSecret: 'x-client-secret',
    redirectUri: 'https://app.example/api/oauth/x/callback',
    transport,
    store,
    seal: (s) => JSON.stringify(TEST_VAULT.encrypt(s)),
    unseal: (s) => TEST_VAULT.decrypt(JSON.parse(s)),
    now: () => FIXED_NOW,
  })
}

const happyTransport = () =>
  routedTransport([
    { match: { method: 'POST', urlIncludes: '/2/oauth2/token' }, response: tokenSuccess as never },
    { match: { method: 'GET', urlIncludes: '/2/users/me' }, response: meSuccess as never },
  ])

function callbackArgs(overrides: Record<string, unknown> = {}) {
  return {
    params: { code: 'auth-code-1', state: 'expected-state' },
    expectedState: 'expected-state',
    codeVerifier: 'verifier-value-verifier-value-verifier-value',
    workspaceId: 'ws-1',
    createdBy: 'user-1',
    ...overrides,
  }
}

describe('X OAuth — beginAuthorize', () => {
  it('builds a spec-correct PKCE authorize URL', () => {
    const { store } = fakeStore()
    const h = handlers(happyTransport(), store)

    const start = h.beginAuthorize()
    const url = new URL(start.url)

    expect(url.origin + url.pathname).toBe('https://x.com/i/oauth2/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('x-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/api/oauth/x/callback')
    expect(url.searchParams.get('state')).toBe(start.state)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    const expectedChallenge = createHash('sha256').update(start.codeVerifier).digest('base64url')
    expect(url.searchParams.get('code_challenge')).toBe(expectedChallenge)
    const scope = url.searchParams.get('scope') ?? ''
    for (const s of ['tweet.read', 'tweet.write', 'users.read', 'offline.access']) {
      expect(scope).toContain(s)
    }
  })

  it('generates a PKCE-valid code verifier and unique state by default', () => {
    const { store } = fakeStore()
    const h = handlers(happyTransport(), store)

    const a = h.beginAuthorize()
    const b = h.beginAuthorize()

    expect(a.codeVerifier.length).toBeGreaterThanOrEqual(43)
    expect(a.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
    expect(a.state).not.toBe(b.state)
    expect(a.codeVerifier).not.toBe(b.codeVerifier)
  })
})

describe('X OAuth — handleCallback', () => {
  it('exchanges the code, fetches the profile, and returns a token-free summary', async () => {
    const { store } = fakeStore()
    const h = handlers(happyTransport(), store)

    const result = await h.handleCallback(callbackArgs())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({
      connectionId: 'conn-123',
      platform: 'x',
      externalAccount: { id: '2244994945', handle: 'chaichapters', name: 'Chai & Chapters' },
      scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
      expiresAt: '2026-07-19T14:00:00.000Z',
    })
    expect(JSON.stringify(result)).not.toContain('x-access-token-fixture-value')
    expect(JSON.stringify(result)).not.toContain('x-refresh-token-fixture-value')
  })

  it('persists a sealed token bundle the vault can round-trip — never plaintext', async () => {
    const { store, calls } = fakeStore()
    const h = handlers(happyTransport(), store)

    await h.handleCallback(callbackArgs())

    expect(calls).toHaveLength(1)
    const record = calls[0]!
    expect(record.workspaceId).toBe('ws-1')
    expect(record.platform).toBe('x')
    expect(record.createdBy).toBe('user-1')
    expect(record.externalAccount.id).toBe('2244994945')
    expect(record.encryptedSecret).not.toContain('x-access-token-fixture-value')
    const bundle = JSON.parse(TEST_VAULT.decrypt(JSON.parse(record.encryptedSecret)))
    expect(bundle.accessToken).toBe('x-access-token-fixture-value')
    expect(bundle.refreshToken).toBe('x-refresh-token-fixture-value')
  })

  it('sends the token exchange as form-encoded with Basic client auth and the verifier', async () => {
    const { store } = fakeStore()
    let tokenReq: { headers?: Record<string, string>; body?: string } | undefined
    const transport: Transport = async (req) => {
      if (req.url.includes('/2/oauth2/token')) tokenReq = req
      return happyTransport()(req)
    }

    await handlers(transport, store).handleCallback(callbackArgs())

    const expectedBasic = Buffer.from('x-client-id:x-client-secret').toString('base64')
    expect(tokenReq?.headers?.['Authorization']).toBe(`Basic ${expectedBasic}`)
    expect(tokenReq?.headers?.['content-type']).toBe('application/x-www-form-urlencoded')
    const body = new URLSearchParams(tokenReq?.body ?? '')
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('auth-code-1')
    expect(body.get('code_verifier')).toBe('verifier-value-verifier-value-verifier-value')
    expect(body.get('redirect_uri')).toBe('https://app.example/api/oauth/x/callback')
  })

  it('returns PROVIDER_ERROR when the user declines consent — no network, no store', async () => {
    const { store, calls } = fakeStore()
    let networkCalls = 0
    const transport: Transport = async (req) => {
      networkCalls += 1
      return happyTransport()(req)
    }

    const result = await handlers(transport, store).handleCallback(
      callbackArgs({ params: { error: 'access_denied', state: 'expected-state' } }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(networkCalls).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('rejects a state mismatch as VALIDATION_ERROR before any network call (CSRF)', async () => {
    const { store, calls } = fakeStore()
    let networkCalls = 0
    const transport: Transport = async (req) => {
      networkCalls += 1
      return happyTransport()(req)
    }

    const result = await handlers(transport, store).handleCallback(
      callbackArgs({ params: { code: 'c', state: 'evil-state' } }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(networkCalls).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('rejects a missing code as VALIDATION_ERROR', async () => {
    const { store } = fakeStore()

    const result = await handlers(happyTransport(), store).handleCallback(
      callbackArgs({ params: { state: 'expected-state' } }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('maps a failed token exchange to PROVIDER_ERROR without leaking the client secret', async () => {
    const { store, calls } = fakeStore()
    const transport = routedTransport([
      { match: { method: 'POST', urlIncludes: '/2/oauth2/token' }, response: tokenError as never },
    ])

    const result = await handlers(transport, store).handleCallback(callbackArgs())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(JSON.stringify(result)).not.toContain('x-client-secret')
    expect(calls).toHaveLength(0)
  })

  it('maps a failed profile fetch to PROVIDER_ERROR and does not persist', async () => {
    const { store, calls } = fakeStore()
    const transport = routedTransport([
      {
        match: { method: 'POST', urlIncludes: '/2/oauth2/token' },
        response: tokenSuccess as never,
      },
      { match: { method: 'GET', urlIncludes: '/2/users/me' }, response: { status: 500, body: {} } },
    ])

    const result = await handlers(transport, store).handleCallback(callbackArgs())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(calls).toHaveLength(0)
  })

  it('fails fast at construction on missing client credentials', () => {
    const { store } = fakeStore()
    expect(() =>
      createXOAuthHandlers({
        clientId: '',
        clientSecret: 'x',
        redirectUri: 'https://app.example/cb',
        transport: happyTransport(),
        store,
      }),
    ).toThrow()
  })
})
