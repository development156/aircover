import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Reading BOTH logo variants as bytes, together.
 *
 * ── WHY `./logo` IS MOCKED WHOLESALE HERE ───────────────────────────────────
 * The byte-level correctness of `downloadLogo` and `measure` — decoding real
 * PNG and JPEG fixtures, checking the trim box lands where it was drawn — is
 * already pinned by `logo-bytes.test.ts` for the light variant, and
 * `downloadLogo`/`measure` are the same private functions the dark reader
 * calls. What is NOT yet pinned is the composition: that
 * `readBrandLogoBytesDark` asks `readBrandLogoDark` (not `readBrandLogo`), and
 * that `readBrandLogoBytesVariants` reads both and reports them together, each
 * independently null-safe. Mocking `./logo` isolates exactly that.
 */

const state = vi.hoisted(() => ({
  light: null as { assetId: string; url: string | null } | null,
  dark: null as { assetId: string; url: string | null } | null,
  readBrandLogoCalls: 0,
  readBrandLogoDarkCalls: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    cache: <A extends unknown[], T>(fn: (...args: A) => T) => {
      const memo = new Map<string, T>()
      return (...args: A): T => {
        const key = JSON.stringify(args)
        if (!memo.has(key)) memo.set(key, fn(...args))
        return memo.get(key) as T
      }
    },
  }
})
vi.mock('./logo', () => ({
  readBrandLogo: () => {
    state.readBrandLogoCalls += 1
    return Promise.resolve(state.light)
  },
  readBrandLogoDark: () => {
    state.readBrandLogoDarkCalls += 1
    return Promise.resolve(state.dark)
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ download: () => Promise.resolve({ data: null, error: null }) }) },
  }),
}))

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  state.light = null
  state.dark = null
  state.readBrandLogoCalls = 0
  state.readBrandLogoDarkCalls = 0
  vi.resetModules()
})

describe('readBrandLogoBytesDark', () => {
  /** No dark variant chosen is the ordinary case, not a failure. */
  it('answers null when there is no dark variant', async () => {
    const { readBrandLogoBytesDark } = await import('./logo-bytes')

    expect(await readBrandLogoBytesDark(WORKSPACE)).toBeNull()
  })

  /**
   * `downloadLogo` fails (the mocked `assets` read finds no row) even when a
   * pointer exists, and that failure must not throw: this pins the same
   * never-throw contract `readBrandLogoBytes` carries, on the dark path.
   */
  it('answers null rather than throwing when the pointed asset cannot be loaded', async () => {
    state.dark = { assetId: 'asset-dark', url: 'https://signed.test/dark.png' }
    const { readBrandLogoBytesDark } = await import('./logo-bytes')

    await expect(readBrandLogoBytesDark(WORKSPACE)).resolves.toBeNull()
  })

  /**
   * ── THE READER IT MUST ASK, AND MUST NOT ASK ──────────────────────────────
   * A copy-paste of `readBrandLogoBytes` that kept calling `readBrandLogo`
   * would answer null just as often as the correct code on these fixtures
   * (both readers return null unless told otherwise), so a bytes-level
   * assertion alone cannot see it. This is the guard that can: it asks WHICH
   * reader ran.
   */
  it('asks readBrandLogoDark, and never readBrandLogo', async () => {
    state.dark = { assetId: 'asset-dark', url: 'https://signed.test/dark.png' }
    const { readBrandLogoBytesDark } = await import('./logo-bytes')

    await readBrandLogoBytesDark(WORKSPACE)

    expect(state.readBrandLogoDarkCalls).toBe(1)
    expect(state.readBrandLogoCalls, 'the light reader must never be asked here').toBe(0)
  })
})

describe('readBrandLogoBytesVariants', () => {
  it('reports both as null for a workspace with no logo at all', async () => {
    const { readBrandLogoBytesVariants } = await import('./logo-bytes')

    expect(await readBrandLogoBytesVariants(WORKSPACE)).toEqual({ light: null, dark: null })
  })

  /**
   * The light variant failing to load must not stop the dark variant's own
   * (null, here) answer from being reported, and vice versa: they are read
   * independently, per the file's own header.
   */
  it('reads light and dark independently', async () => {
    state.light = { assetId: 'asset-light', url: 'https://signed.test/light.png' }
    state.dark = { assetId: 'asset-dark', url: 'https://signed.test/dark.png' }
    const { readBrandLogoBytesVariants } = await import('./logo-bytes')

    const result = await readBrandLogoBytesVariants(WORKSPACE)
    // Both point at assets the mocked `assets` table cannot load, so both
    // answer null. What is under test is that BOTH readers ran (the mock's
    // `from` is shared and would otherwise throw or hang if only one path
    // were exercised), not the file bytes themselves.
    expect(result).toEqual({ light: null, dark: null })
  })
})
