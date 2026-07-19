import { describe, it, expect } from 'vitest'
import { routedTransport, type Transport, type TransportRequest } from '../transport'
import { createTokenVault, type TokenVault } from '../vault/token-vault'
import { createGbpOAuthHandlers } from './gbp'
import type { ConnectionStore, ConnectionUpsert } from './store'
import tokenSuccess from '../../fixtures/gbp/oauth-token.success.json'
import tokenError from '../../fixtures/gbp/oauth-token.error.json'
import accounts from '../../fixtures/gbp/accounts.success.json'
import locationsSingle from '../../fixtures/gbp/locations.single.json'
import locationsMulti from '../../fixtures/gbp/locations.multi.json'

const bodyText = (b: string | Uint8Array | undefined): string => (typeof b === 'string' ? b : '')

const FIXED_NOW = new Date('2026-07-19T12:00:00.000Z')
const ELEVEN_MINUTES_LATER = new Date('2026-07-19T12:11:00.000Z')
const TEST_VAULT: TokenVault = createTokenVault({
  current: 1,
  keys: { 1: Buffer.from('ef'.repeat(32), 'hex') },
})

function fakeStore(): { store: ConnectionStore; calls: ConnectionUpsert[] } {
  const calls: ConnectionUpsert[] = []
  return {
    store: {
      upsertConnection: async (record) => {
        calls.push(record)
        return { connectionId: 'conn-gbp-1' }
      },
    },
    calls,
  }
}

function handlers(transport: Transport, store: ConnectionStore, now: () => Date = () => FIXED_NOW) {
  return createGbpOAuthHandlers({
    clientId: 'g-client-id',
    clientSecret: 'g-client-secret',
    redirectUri: 'https://app.example/api/oauth/gbp/callback',
    transport,
    store,
    seal: (s) => JSON.stringify(TEST_VAULT.encrypt(s)),
    unseal: (s) => TEST_VAULT.decrypt(JSON.parse(s)),
    now,
  })
}

const transportWith = (locations: unknown) =>
  routedTransport([
    {
      match: { method: 'POST', urlIncludes: 'oauth2.googleapis.com/token' },
      response: tokenSuccess as never,
    },
    {
      match: { method: 'GET', urlIncludes: 'mybusinessaccountmanagement' },
      response: accounts as never,
    },
    {
      match: { method: 'GET', urlIncludes: 'mybusinessbusinessinformation' },
      response: locations as never,
    },
  ])

function callbackArgs(overrides: Record<string, unknown> = {}) {
  return {
    params: { code: 'gbp-code-1', state: 'expected-state' },
    expectedState: 'expected-state',
    workspaceId: 'ws-1',
    createdBy: 'user-1',
    ...overrides,
  }
}

describe('GBP OAuth — beginAuthorize', () => {
  it('builds a spec-correct offline-access authorize URL', () => {
    const { store } = fakeStore()
    const start = handlers(transportWith(locationsSingle), store).beginAuthorize()
    const url = new URL(start.url)

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('g-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/api/oauth/gbp/callback')
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/business.manage')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe(start.state)
  })
})

describe('GBP OAuth — handleCallback', () => {
  it('auto-connects when exactly one location exists, with the full accounts/…/locations/… id', async () => {
    const { store, calls } = fakeStore()

    const result = await handlers(transportWith(locationsSingle), store).handleCallback(
      callbackArgs(),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.kind).toBe('connected')
    if (result.data.kind !== 'connected') return
    expect(result.data.connection).toEqual({
      connectionId: 'conn-gbp-1',
      platform: 'gbp',
      externalAccount: {
        id: 'accounts/108283981976/locations/40123456789',
        name: 'Chai & Chapters — Indiranagar',
      },
      scopes: ['https://www.googleapis.com/auth/business.manage'],
      expiresAt: '2026-07-19T12:59:59.000Z',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.platform).toBe('gbp')
  })

  it('persists a sealed token bundle that round-trips — never plaintext', async () => {
    const { store, calls } = fakeStore()

    await handlers(transportWith(locationsSingle), store).handleCallback(callbackArgs())

    const record = calls[0]!
    expect(record.encryptedSecret).not.toContain('gbp-access-token-fixture-value')
    const bundle = JSON.parse(TEST_VAULT.decrypt(JSON.parse(record.encryptedSecret)))
    expect(bundle.accessToken).toBe('gbp-access-token-fixture-value')
    expect(bundle.refreshToken).toBe('gbp-refresh-token-fixture-value')
  })

  it('sends a Google-style form token exchange (credentials in the body, no Basic header)', async () => {
    const { store } = fakeStore()
    let tokenReq: TransportRequest | undefined
    const transport: Transport = async (req) => {
      if (req.url.includes('oauth2.googleapis.com/token')) tokenReq = req
      return transportWith(locationsSingle)(req)
    }

    await handlers(transport, store).handleCallback(callbackArgs())

    expect(tokenReq?.headers?.['Authorization']).toBeUndefined()
    const body = new URLSearchParams(bodyText(tokenReq?.body))
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('gbp-code-1')
    expect(body.get('client_id')).toBe('g-client-id')
    expect(body.get('client_secret')).toBe('g-client-secret')
    expect(body.get('redirect_uri')).toBe('https://app.example/api/oauth/gbp/callback')
  })

  it('returns choose_location (and persists nothing) when several locations exist', async () => {
    const { store, calls } = fakeStore()

    const result = await handlers(transportWith(locationsMulti), store).handleCallback(
      callbackArgs(),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.kind).toBe('choose_location')
    if (result.data.kind !== 'choose_location') return
    expect(result.data.locations).toEqual([
      {
        name: 'locations/40123456789',
        title: 'Chai & Chapters — Indiranagar',
        accountName: 'accounts/108283981976',
      },
      {
        name: 'locations/40987654321',
        title: 'Chai & Chapters — Koramangala',
        accountName: 'accounts/108283981976',
      },
    ])
    expect(result.data.resumeToken).not.toContain('gbp-access-token-fixture-value')
    expect(result.data.resumeToken).not.toContain('gbp-refresh-token-fixture-value')
    expect(calls).toHaveLength(0)
  })

  it('completeConnection redeems the resume token for the CHOSEN location', async () => {
    const { store, calls } = fakeStore()
    const h = handlers(transportWith(locationsMulti), store)
    const cb = await h.handleCallback(callbackArgs())
    if (!cb.ok || cb.data.kind !== 'choose_location') throw new Error('expected choose_location')

    const result = await h.completeConnection({
      resumeToken: cb.data.resumeToken,
      locationName: 'locations/40987654321',
      workspaceId: 'ws-1',
      createdBy: 'user-1',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.externalAccount.id).toBe('accounts/108283981976/locations/40987654321')
    expect(result.data.externalAccount.name).toBe('Chai & Chapters — Koramangala')
    expect(calls).toHaveLength(1)
  })

  it('rejects an expired resume token (TTL) as VALIDATION_ERROR without persisting', async () => {
    const { store, calls } = fakeStore()
    const cb = await handlers(transportWith(locationsMulti), store).handleCallback(callbackArgs())
    if (!cb.ok || cb.data.kind !== 'choose_location') throw new Error('expected choose_location')

    const late = handlers(transportWith(locationsMulti), store, () => ELEVEN_MINUTES_LATER)
    const result = await late.completeConnection({
      resumeToken: cb.data.resumeToken,
      locationName: 'locations/40987654321',
      workspaceId: 'ws-1',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(calls).toHaveLength(0)
  })

  it('rejects a location that was not offered', async () => {
    const { store } = fakeStore()
    const h = handlers(transportWith(locationsMulti), store)
    const cb = await h.handleCallback(callbackArgs())
    if (!cb.ok || cb.data.kind !== 'choose_location') throw new Error('expected choose_location')

    const result = await h.completeConnection({
      resumeToken: cb.data.resumeToken,
      locationName: 'locations/99999999999',
      workspaceId: 'ws-1',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a garbage resume token as VALIDATION_ERROR', async () => {
    const { store } = fakeStore()
    const result = await handlers(transportWith(locationsMulti), store).completeConnection({
      resumeToken: 'not-a-sealed-envelope',
      locationName: 'locations/40987654321',
      workspaceId: 'ws-1',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a state mismatch before any network call', async () => {
    const { store, calls } = fakeStore()
    let networkCalls = 0
    const transport: Transport = async (req) => {
      networkCalls += 1
      return transportWith(locationsSingle)(req)
    }

    const result = await handlers(transport, store).handleCallback(
      callbackArgs({ params: { code: 'c', state: 'evil' } }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(networkCalls).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('maps declined consent to PROVIDER_ERROR', async () => {
    const { store } = fakeStore()
    const result = await handlers(transportWith(locationsSingle), store).handleCallback(
      callbackArgs({ params: { error: 'access_denied', state: 'expected-state' } }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PROVIDER_ERROR')
  })

  it('maps a failed token exchange to PROVIDER_ERROR without leaking the client secret', async () => {
    const { store } = fakeStore()
    const transport = routedTransport([
      {
        match: { method: 'POST', urlIncludes: 'oauth2.googleapis.com/token' },
        response: tokenError as never,
      },
    ])

    const result = await handlers(transport, store).handleCallback(callbackArgs())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(JSON.stringify(result)).not.toContain('g-client-secret')
  })

  it('reports zero locations honestly as PROVIDER_ERROR — never a fake connect', async () => {
    const { store, calls } = fakeStore()

    const result = await handlers(transportWith({ status: 200, body: {} }), store).handleCallback(
      callbackArgs(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(result.error.message.toLowerCase()).toContain('location')
    expect(calls).toHaveLength(0)
  })

  it('never embeds a malformed account name into a request URL (URL-injection guard)', async () => {
    const { store } = fakeStore()
    const urls: string[] = []
    const hostileAccounts = {
      status: 200,
      body: { accounts: [{ name: 'accounts/../../evil.example/steal', accountName: 'Evil' }] },
    }
    const transport: Transport = async (req) => {
      urls.push(req.url)
      return routedTransport([
        {
          match: { method: 'POST', urlIncludes: 'oauth2.googleapis.com/token' },
          response: tokenSuccess as never,
        },
        {
          match: { method: 'GET', urlIncludes: 'mybusinessaccountmanagement' },
          response: hostileAccounts as never,
        },
        {
          match: { method: 'GET', urlIncludes: 'mybusinessbusinessinformation' },
          response: locationsSingle as never,
        },
      ])(req)
    }

    const result = await handlers(transport, store).handleCallback(callbackArgs())

    for (const url of urls) {
      expect(url).not.toContain('..')
      expect(url).not.toContain('evil.example')
    }
    // The only account was invalid → zero locations → honest failure.
    expect(result.ok).toBe(false)
  })
})
