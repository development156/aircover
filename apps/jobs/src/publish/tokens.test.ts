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
