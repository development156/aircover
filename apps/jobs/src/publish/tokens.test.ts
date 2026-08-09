import { describe, it, expect } from 'vitest'
import { createConnectionResolver, type StoredConnection } from './tokens'

const SEALED = { iv: 'aaa', tag: 'bbb', data: 'ciphertext-that-must-not-leak' }
const PLAINTEXT = 'plaintext-access-token'

const stored: StoredConnection = {
  connectionId: '55555555-5555-4555-8555-555555555555',
  externalAccountId: 'x-account-1',
  status: 'active',
  sealedAccessToken: SEALED,
}

const payload = {
  workspaceId: '22222222-2222-4222-8222-222222222222',
  postId: 'p',
  variantId: 'v',
  channel: 'x' as const,
  scheduledAt: '2026-07-19T10:00:00.000Z',
}

describe('createConnectionResolver', () => {
  it('returns connection identity plus the opened token', async () => {
    const resolve = createConnectionResolver({
      loadConnection: async () => stored,
      openSecret: () => PLAINTEXT,
    })

    await expect(resolve(payload)).resolves.toEqual({
      connectionId: stored.connectionId,
      externalAccountId: 'x-account-1',
      accessToken: PLAINTEXT,
      // `x` is not aggregator-fronted and the row does not say Zernio, so the resolver
      // must still state the answer rather than omit it. toEqual is exact, so this
      // asserts presence — the omission is what the 2026-08-09 regression was.
      viaZernio: false,
    })
  })

  it('fails with TOKEN_VAULT_UNAVAILABLE when no opener is wired', async () => {
    // The current state of the world: packages/publishing exports no vault opener, so a
    // live publish cannot get a token. This must fail loudly, never silently succeed.
    const resolve = createConnectionResolver({ loadConnection: async () => stored })

    await expect(resolve(payload)).rejects.toThrow('TOKEN_VAULT_UNAVAILABLE')
  })

  it('fails when the workspace has no connection for the channel', async () => {
    const resolve = createConnectionResolver({
      loadConnection: async () => null,
      openSecret: () => PLAINTEXT,
    })

    await expect(resolve(payload)).rejects.toThrow('CONNECTION_NOT_FOUND')
  })

  it('refuses a connection that is not active', async () => {
    const resolve = createConnectionResolver({
      loadConnection: async () => ({ ...stored, status: 'expired' }),
      openSecret: () => PLAINTEXT,
    })

    await expect(resolve(payload)).rejects.toThrow('CONNECTION_NOT_ACTIVE')
  })

  it('never leaks ciphertext or plaintext through a failure', async () => {
    const resolve = createConnectionResolver({
      loadConnection: async () => stored,
      openSecret: () => {
        throw new Error(`decrypt failed for ${JSON.stringify(SEALED)}`)
      },
    })

    const err = await resolve(payload).then(
      () => null,
      (e: unknown) => e as Error,
    )

    expect(err).not.toBeNull()
    expect(err!.message).toContain('TOKEN_OPEN_FAILED')
    expect(err!.message).not.toContain('ciphertext-that-must-not-leak')
    expect(err!.message).not.toContain(PLAINTEXT)
  })
})

/**
 * The flag must survive the resolver.
 *
 * `viaZernio` is decided by the ROW — `isZernioConnection` reads
 * `external_account->>'profileId'` — and it is the ONLY thing that selects the Zernio
 * adapter (`adapters.ts:56`). It is not derivable downstream: x, gbp and linkedin exist
 * in both shapes, so the channel alone cannot answer it.
 *
 * On 2026-08-09 both `return` statements below built a fresh three-field literal and
 * neither copied it. `ResolvedConnection.viaZernio` was optional, so the omission
 * typechecked; `runPublishPost.ts` then read `undefined === true` as `false` and every
 * live Instagram publish died at NO_ADAPTER with a perfectly valid connection. It went
 * unseen because fixture mode returns before the flag is ever read.
 */
describe('viaZernio survives the resolver', () => {
  const zernioStored: StoredConnection = {
    connectionId: '66666666-6666-4666-8666-666666666666',
    externalAccountId: 'ig-account-1',
    status: 'active',
    sealedAccessToken: null,
    viaZernio: true,
  }

  it('reports true for an aggregator-fronted channel', async () => {
    const resolve = createConnectionResolver({ loadConnection: async () => zernioStored })
    const resolved = await resolve({ ...payload, channel: 'instagram' as const })
    expect(resolved.viaZernio).toBe(true)
  })

  it('reports true for a channel the ROW says is Zernio-fronted', async () => {
    // x can be either shape. The row is the only authority.
    const resolve = createConnectionResolver({ loadConnection: async () => zernioStored })
    const resolved = await resolve(payload)
    expect(resolved.viaZernio).toBe(true)
  })

  it('reports false — explicitly, not absent — on the vault path', async () => {
    const resolve = createConnectionResolver({
      loadConnection: async () => stored,
      openSecret: () => PLAINTEXT,
    })
    const resolved = await resolve(payload)
    // `false`, not `undefined`: the value is stated, so a future omission is a change
    // in what the object SAYS rather than a change in whether it says anything.
    expect(resolved.viaZernio).toBe(false)
    expect('viaZernio' in resolved).toBe(true)
  })
})
