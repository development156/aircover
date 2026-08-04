import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  createTokenVault,
  decryptToken,
  encryptToken,
  keyringFromEnv,
  type EncryptedToken,
  type Keyring,
} from './token-vault'

const REAL_KEY = process.env.TOKEN_VAULT_KEY

/** A deterministic 32-byte key as 64 hex chars, for tests only. */
const KEY_A_HEX = '00'.repeat(32)
const KEY_B_HEX = 'ab'.repeat(32)

function keyring(hex: string, version = 1): Keyring {
  return { current: version, keys: { [version]: Buffer.from(hex, 'hex') } }
}

/** Corrupt the first byte of a base64 blob — used to tamper with ciphertext/tag. */
function flipFirstByte(b64: string): string {
  const buf = Buffer.from(b64, 'base64')
  buf[0] = (buf[0] ?? 0) ^ 0xff
  return buf.toString('base64')
}

describe('token vault — AES-256-GCM', () => {
  it('round-trips a token back to the original plaintext', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX))
    const secret = 'oauth-access-token-abc123'

    const sealed = vault.encrypt(secret)

    expect(vault.decrypt(sealed)).toBe(secret)
  })

  it('round-trips unicode and long tokens', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX))
    const secret = 'ключ-🔐-' + 'x'.repeat(4096)

    expect(vault.decrypt(vault.encrypt(secret))).toBe(secret)
  })

  it('produces the {iv, tag, data, key_version} envelope with no plaintext leak', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX, 1))
    const secret = 'super-secret-token-value'

    const sealed = vault.encrypt(secret)

    expect(Object.keys(sealed).sort()).toEqual(['data', 'iv', 'key_version', 'tag'])
    expect(sealed.key_version).toBe(1)
    // Every byte field is a base64 string; none contains the plaintext.
    for (const field of [sealed.iv, sealed.tag, sealed.data]) {
      expect(typeof field).toBe('string')
      expect(field).not.toContain(secret)
    }
    // The whole serialized envelope must not reveal the plaintext.
    expect(JSON.stringify(sealed)).not.toContain(secret)
  })

  it('uses a fresh random IV per call (same plaintext → different ciphertext)', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX))
    const secret = 'repeat-me'

    const a = vault.encrypt(secret)
    const b = vault.encrypt(secret)

    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
    // ...yet both decrypt to the same plaintext.
    expect(vault.decrypt(a)).toBe(secret)
    expect(vault.decrypt(b)).toBe(secret)
  })

  it('stamps and honors key_version — an unknown version is rejected', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX, 1))
    const sealed = vault.encrypt('t')

    const forged: EncryptedToken = { ...sealed, key_version: 99 }

    expect(() => vault.decrypt(forged)).toThrow()
  })

  it('rejects tampered ciphertext (GCM auth tag catches a flipped data byte)', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX))
    const secret = 'do-not-tamper'
    const sealed = vault.encrypt(secret)

    const tampered: EncryptedToken = { ...sealed, data: flipFirstByte(sealed.data) }

    expect(() => vault.decrypt(tampered)).toThrow()
  })

  it('rejects a tampered auth tag', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX))
    const sealed = vault.encrypt('token')

    const tampered: EncryptedToken = { ...sealed, tag: flipFirstByte(sealed.tag) }

    expect(() => vault.decrypt(tampered)).toThrow()
  })

  it('cannot decrypt a token sealed under a different key', () => {
    const sealed = createTokenVault(keyring(KEY_A_HEX)).encrypt('cross-key')
    const otherVault = createTokenVault(keyring(KEY_B_HEX))

    expect(() => otherVault.decrypt(sealed)).toThrow()
  })

  it('never leaks the plaintext through a decrypt error message', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX))
    const secret = 'leak-canary-9f3a'
    const sealed = vault.encrypt(secret)

    try {
      vault.decrypt({ ...sealed, tag: flipFirstByte(sealed.tag) })
      throw new Error('expected decrypt to throw')
    } catch (err) {
      expect((err as Error).message).not.toContain(secret)
    }
  })

  it('fails fast when creating a vault whose current version has no key', () => {
    const bad: Keyring = { current: 2, keys: { 1: randomBytes(32) } }
    expect(() => createTokenVault(bad)).toThrow()
  })

  it('fails fast on a key that is not 32 bytes', () => {
    const bad: Keyring = { current: 1, keys: { 1: randomBytes(16) } }
    expect(() => createTokenVault(bad)).toThrow()
  })
})

describe('token vault — envelope hardening (security review)', () => {
  it('rejects a truncated GCM auth tag (no short-tag forgery downgrade)', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX))
    const sealed = vault.encrypt('do-not-truncate')

    // A 4-byte slice of the real 16-byte tag: Node otherwise accepts it, weakening
    // forgery resistance from 2^128 to 2^32. The vault must reject non-16-byte tags.
    const shortTag = Buffer.from(sealed.tag, 'base64').subarray(0, 4).toString('base64')

    expect(() => vault.decrypt({ ...sealed, tag: shortTag })).toThrow()
  })

  it('rejects an envelope whose IV is not 12 bytes', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX))
    const sealed = vault.encrypt('t')
    const shortIv = Buffer.from(sealed.iv, 'base64').subarray(0, 8).toString('base64')

    expect(() => vault.decrypt({ ...sealed, iv: shortIv })).toThrow()
  })

  it('throws the uniform decryption error for a null or shapeless envelope', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX))

    expect(() => vault.decrypt(null as unknown as EncryptedToken)).toThrow(
      'token vault: decryption failed',
    )
    expect(() => vault.decrypt({} as unknown as EncryptedToken)).toThrow(
      'token vault: decryption failed',
    )
  })

  it('rejects a non-integer or prototype-polluting key_version without a chain lookup', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX))
    const sealed = vault.encrypt('t')

    expect(() =>
      vault.decrypt({ ...sealed, key_version: '__proto__' as unknown as number }),
    ).toThrow()
    expect(() => vault.decrypt({ ...sealed, key_version: 1.5 })).toThrow()
    expect(() =>
      vault.decrypt({ ...sealed, key_version: 'constructor' as unknown as number }),
    ).toThrow()
  })

  it('rejects an envelope with non-string byte fields', () => {
    const vault = createTokenVault(keyring(KEY_A_HEX))
    const sealed = vault.encrypt('t')

    expect(() => vault.decrypt({ ...sealed, data: 123 as unknown as string })).toThrow(
      'token vault: decryption failed',
    )
  })
})

describe('keyringFromEnv', () => {
  it('reads TOKEN_VAULT_KEY as the current (v1) key', () => {
    const ring = keyringFromEnv({ TOKEN_VAULT_KEY: KEY_A_HEX })

    expect(ring.current).toBe(1)
    expect(ring.keys[1]?.equals(Buffer.from(KEY_A_HEX, 'hex'))).toBe(true)
  })

  it('throws when TOKEN_VAULT_KEY is missing', () => {
    expect(() => keyringFromEnv({})).toThrow()
  })

  it('throws when TOKEN_VAULT_KEY is not 32 bytes of hex', () => {
    expect(() => keyringFromEnv({ TOKEN_VAULT_KEY: 'deadbeef' })).toThrow()
  })

  it('round-trips through a vault built from env', () => {
    const vault = createTokenVault(keyringFromEnv({ TOKEN_VAULT_KEY: KEY_B_HEX }))
    expect(vault.decrypt(vault.encrypt('env-token'))).toBe('env-token')
  })
})

describe('encryptToken / decryptToken (env-backed helpers)', () => {
  beforeEach(() => {
    process.env.TOKEN_VAULT_KEY = KEY_A_HEX
  })
  afterEach(() => {
    if (REAL_KEY === undefined) delete process.env.TOKEN_VAULT_KEY
    else process.env.TOKEN_VAULT_KEY = REAL_KEY
  })

  it('round-trips using TOKEN_VAULT_KEY from the environment', () => {
    const sealed = encryptToken('access-token-from-env')
    expect(sealed.key_version).toBe(1)
    expect(decryptToken(sealed)).toBe('access-token-from-env')
  })

  it('throws when TOKEN_VAULT_KEY is absent', () => {
    delete process.env.TOKEN_VAULT_KEY
    expect(() => encryptToken('x')).toThrow()
  })
})
