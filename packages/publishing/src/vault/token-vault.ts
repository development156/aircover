import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { z } from 'zod'

/**
 * AES-256-GCM token vault — server-internal to @sahoda/publishing.
 *
 * OAuth access/refresh tokens are sealed into an {@link EncryptedToken} envelope for
 * storage in `connection_secrets`, and only ever decrypted in job/server memory.
 * Key material and plaintext tokens are NEVER logged, returned, or embedded in errors.
 * This envelope and these helpers never enter @sahoda/shared (CLAUDE.md non-negotiable).
 *
 * Note: key `Buffer`s are not explicitly zeroized after use — Node offers no secure-memory
 * primitive, and the vault legitimately holds its key for its lifetime. A memory-dump threat
 * model (H19 hardening) would warrant a secure-buffer library; out of scope here.
 */

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32 // AES-256
const IV_BYTES = 12 // 96-bit nonce — the GCM standard
const TAG_BYTES = 16 // 128-bit auth tag — pinned so a truncated tag cannot be smuggled in
const KEY_HEX_CHARS = KEY_BYTES * 2

/** The at-rest, JSON-serializable envelope. `iv`/`tag`/`data` are base64. */
export interface EncryptedToken {
  iv: string
  tag: string
  data: string
  key_version: number
}

/** Runtime guard for envelopes crossing the DB/JSON boundary (types alone don't survive it). */
const EncryptedTokenSchema = z.object({
  iv: z.string(),
  tag: z.string(),
  data: z.string(),
  key_version: z.number().int().nonnegative(),
})

/** Versioned keys, so a key can be rotated without a data migration. */
export interface Keyring {
  current: number
  keys: Record<number, Buffer>
}

export interface TokenVault {
  encrypt(plaintext: string): EncryptedToken
  decrypt(token: EncryptedToken): string
}

/** Build a vault bound to a keyring. Fails fast on any malformed key. */
export function createTokenVault(keyring: Keyring): TokenVault {
  for (const version of Object.keys(keyring.keys)) {
    const key = keyring.keys[Number(version)]
    if (!key || key.length !== KEY_BYTES) {
      throw new Error(`token vault: key v${version} must be ${KEY_BYTES} bytes`)
    }
  }
  const currentKey = keyring.keys[keyring.current]
  if (!currentKey) {
    throw new Error(`token vault: no key for current version ${keyring.current}`)
  }

  return {
    encrypt(plaintext: string): EncryptedToken {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv(ALGORITHM, currentKey, iv, { authTagLength: TAG_BYTES })
      const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      return {
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: data.toString('base64'),
        key_version: keyring.current,
      }
    },

    decrypt(token: EncryptedToken): string {
      // Validate the envelope shape at this trust boundary — it arrives as JSON from the
      // DB, so the TS type is no guarantee. A bad shape is indistinguishable from a bad token.
      const parsed = EncryptedTokenSchema.safeParse(token)
      if (!parsed.success) {
        throw new Error('token vault: decryption failed')
      }
      const envelope = parsed.data

      // Own-property lookup only — never resolve `__proto__`/`constructor` off the prototype.
      const key = Object.prototype.hasOwnProperty.call(keyring.keys, envelope.key_version)
        ? keyring.keys[envelope.key_version]
        : undefined
      if (!key) {
        throw new Error('token vault: unknown key version')
      }

      try {
        const iv = Buffer.from(envelope.iv, 'base64')
        const tag = Buffer.from(envelope.tag, 'base64')
        // Pin IV/tag byte-lengths so a truncated tag (a GCM forgery downgrade) is rejected.
        if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
          throw new Error('bad envelope')
        }
        const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
        decipher.setAuthTag(tag)
        return Buffer.concat([
          decipher.update(Buffer.from(envelope.data, 'base64')),
          decipher.final(),
        ]).toString('utf8')
      } catch {
        // Swallow the underlying error so no plaintext/ciphertext/key can leak out.
        throw new Error('token vault: decryption failed')
      }
    },
  }
}

/** Load the keyring from `TOKEN_VAULT_KEY` (a 32-byte hex string) as the current v1 key. */
export function keyringFromEnv(env: NodeJS.ProcessEnv = process.env): Keyring {
  const hex = env.TOKEN_VAULT_KEY
  if (!hex) {
    throw new Error('token vault: TOKEN_VAULT_KEY is not set')
  }
  if (!new RegExp(`^[0-9a-fA-F]{${KEY_HEX_CHARS}}$`).test(hex)) {
    throw new Error(`token vault: TOKEN_VAULT_KEY must be ${KEY_BYTES} bytes of hex`)
  }
  return { current: 1, keys: { 1: Buffer.from(hex, 'hex') } }
}

/**
 * Seal a token using `TOKEN_VAULT_KEY` from the environment. Stateless — the keyring
 * is read per call, so there is no import-time crash and no hidden singleton to reset.
 */
export function encryptToken(plaintext: string): EncryptedToken {
  return createTokenVault(keyringFromEnv()).encrypt(plaintext)
}

/** Open a sealed token using `TOKEN_VAULT_KEY` from the environment. */
export function decryptToken(token: EncryptedToken): string {
  return createTokenVault(keyringFromEnv()).decrypt(token)
}
