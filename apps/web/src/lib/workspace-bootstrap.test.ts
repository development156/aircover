import { describe, expect, test, vi } from 'vitest'

import { slugify } from './slug'
import {
  bootstrapWithRetry,
  deriveSlugSeed,
  deriveWorkspaceName,
  mapBootstrapError,
} from './workspace-bootstrap'

describe('deriveWorkspaceName', () => {
  test('uses a valid provided name, trimmed', () => {
    expect(deriveWorkspaceName('  Acme Co  ')).toBe('Acme Co')
  })

  test('caps an overlong provided name at 120 chars', () => {
    expect(deriveWorkspaceName('a'.repeat(200))).toHaveLength(120)
  })

  // THE DEFECT. The display name was built from the creator's Clerk identity,
  // so an account with no firstName and no username was labelled with its email
  // local part everywhere the name goes — including out to Zernio.
  test('never names a workspace after the person who made it', () => {
    expect(deriveWorkspaceName(null)).toBe('My workspace')
    expect(deriveWorkspaceName('')).toBe('My workspace')
    expect(deriveWorkspaceName('   ')).toBe('My workspace')
    expect(deriveWorkspaceName(undefined)).toBe('My workspace')
  })
})

describe('deriveSlugSeed', () => {
  test('a provided name still seeds the slug', () => {
    expect(deriveSlugSeed('  Acme Co  ', {})).toBe('Acme Co')
  })

  test('falls back to a possessive: first name, then username, then email local part', () => {
    expect(deriveSlugSeed('', { firstName: 'Divya' })).toBe("Divya's workspace")
    expect(deriveSlugSeed(null, { username: 'neo' })).toBe("neo's workspace")
    expect(deriveSlugSeed(null, { email: 'trinity@zion.io' })).toBe("trinity's workspace")
  })

  test('ultimate fallback is the generic name', () => {
    expect(deriveSlugSeed(undefined, {})).toBe('My workspace')
    expect(deriveSlugSeed('   ', { firstName: '  ' })).toBe('My workspace')
  })

  // THE REGRESSION GUARD. Splitting the name from the seed must not move a
  // single slug. `trinity` is a far denser namespace than `trinity-s-workspace`
  // and bootstrapWithRetry only tries 5 suffixes, so a "simplified" seed makes
  // the 6th "Divya" hit "That name is taken" on a form with no name field.
  test('produces byte-identical slugs to the pre-split derivation', () => {
    expect(slugify(deriveSlugSeed(null, { email: 'trinity@zion.io' }))).toBe('trinity-s-workspace')
    expect(slugify(deriveSlugSeed(null, { firstName: 'Divya' }))).toBe('divya-s-workspace')
    expect(slugify(deriveSlugSeed('Acme Co', {}))).toBe('acme-co')
  })

  test('the seed keeps the identity the display name gave up', () => {
    const identity = { email: 'sahoda.qa.mt3dx336uhcws1+clerk_test@example.com' }
    expect(deriveWorkspaceName(null)).toBe('My workspace')
    expect(deriveSlugSeed(null, identity)).toContain('clerk_test')
  })
})

describe('mapBootstrapError', () => {
  test('SLUG_TAKEN → typed slug-taken message', () => {
    const result = mapBootstrapError({ message: 'SLUG_TAKEN', code: 'P0001' })
    expect(result).toMatchObject({ ok: false, code: 'SLUG_TAKEN' })
    expect(result.message).toMatch(/taken/i)
  })

  test('INVALID_NAME → name error', () => {
    expect(mapBootstrapError({ message: 'INVALID_NAME' })).toMatchObject({
      ok: false,
      code: 'INVALID_NAME',
    })
  })

  test('INVALID_SLUG surfaces as a name error (the slug derives from the name)', () => {
    expect(mapBootstrapError({ message: 'INVALID_SLUG' })).toMatchObject({
      ok: false,
      code: 'INVALID_NAME',
    })
  })

  test('AUTH_REQUIRED / permission / unknown / null → generic ERROR', () => {
    expect(mapBootstrapError({ message: 'permission denied', code: '42501' })).toMatchObject({
      ok: false,
      code: 'ERROR',
    })
    expect(mapBootstrapError({ message: 'AUTH_REQUIRED' })).toMatchObject({
      ok: false,
      code: 'ERROR',
    })
    expect(mapBootstrapError(null)).toMatchObject({ ok: false, code: 'ERROR' })
  })

  test('never leaks a raw database message into user-facing copy', () => {
    const result = mapBootstrapError({
      message: 'ERROR: null value in column "x" violates not-null constraint',
    })
    expect(result.message).not.toMatch(/null value|constraint|column/i)
  })
})

describe('bootstrapWithRetry', () => {
  const okResult = (slug: string) => ({
    data: {
      workspace: {
        id: 'w1',
        name: 'n',
        slug,
        created_by: 'u1',
        settings: {},
        created_at: 't',
        updated_at: 't',
        // The seven columns added to `workspaces` after this fixture was
        // written. NULL is the real value for all of them on a workspace the
        // bootstrap has just created: nobody has been asked anything yet, and
        // no logo (of either variant) has been set.
        deleted_at: null,
        timezone: null,
        business_model: null,
        regime: null,
        locale: null,
        logo_asset_id: null,
        logo_asset_id_dark: null,
      },
      replayed: false,
    },
    error: null,
  })

  test('returns on first success — exactly one call, base slug', async () => {
    const call = vi.fn(async (slug: string) => okResult(slug))
    const res = await bootstrapWithRetry(call, 'acme')
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('acme')
    expect(res.data?.workspace.slug).toBe('acme')
  })

  test('retries with a suffixed slug on SLUG_TAKEN, then succeeds', async () => {
    const call = vi.fn(async (slug: string) =>
      slug === 'acme' ? { data: null, error: { message: 'SLUG_TAKEN' } } : okResult(slug),
    )
    const res = await bootstrapWithRetry(call, 'acme')
    expect(call).toHaveBeenCalledTimes(2)
    expect(call).toHaveBeenNthCalledWith(2, 'acme-2')
    expect(res.error).toBeNull()
    expect(res.data?.workspace.slug).toBe('acme-2')
  })

  test('gives up after maxAttempts, returning the last SLUG_TAKEN error', async () => {
    const call = vi.fn(async () => ({ data: null, error: { message: 'SLUG_TAKEN' } }))
    const res = await bootstrapWithRetry(call, 'acme', 3)
    expect(call).toHaveBeenCalledTimes(3)
    expect(res.data).toBeNull()
    expect(res.error?.message).toContain('SLUG_TAKEN')
  })

  test('does not retry a non-collision error', async () => {
    const call = vi.fn(async () => ({ data: null, error: { message: 'INVALID_NAME' } }))
    const res = await bootstrapWithRetry(call, 'acme', 5)
    expect(call).toHaveBeenCalledTimes(1)
    expect(res.error?.message).toContain('INVALID_NAME')
  })
})
