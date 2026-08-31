import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Finding the workspace's logo.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * It did not, and an adversarial review found what that cost: `readBrandLogo`
 * had no `deleted_at is null` filter, so a logo the customer moved to the trash
 * went on painting the topbar — and worse, HID a newer one behind it, because a
 * trashed row can still be the most recent. Removing the filter left all 535
 * tests in the suite green.
 *
 * `assets` marks deletion with a column rather than by removing the row, so
 * every read of that table has to say which it wants. The whole point of this
 * file is that the query is now pinned.
 */

const state = vi.hoisted(() => ({
  filters: [] as [string, unknown][],
  nullChecks: [] as string[],
  row: null as Record<string, unknown> | null,
  error: null as unknown,
  signed: [{ id: 'asset-1', url: 'https://signed.test/logo.png' }] as
    { id: string; url: string | null }[] | null,
}))

vi.mock('@/lib/posts/media-url', () => ({
  signMediaPreviews: () => Promise.resolve(state.signed ?? []),
}))
vi.mock('@/lib/supabase/server', () => {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      state.filters.push([column, value])
      return chain
    },
    is: (column: string) => {
      state.nullChecks.push(column)
      return chain
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: state.row, error: state.error }),
  }
  return { createServerSupabase: () => ({ from: () => chain }) }
})

const { readBrandLogo } = await import('./logo')

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  state.filters = []
  state.nullChecks = []
  state.row = { id: 'asset-1', storage_path: `${WORKSPACE}/library/logo.png` }
  state.error = null
  state.signed = [{ id: 'asset-1', url: 'https://signed.test/logo.png' }]
})

describe('readBrandLogo', () => {
  it('returns a signed link to the workspace logo', async () => {
    expect(await readBrandLogo(WORKSPACE)).toEqual({
      assetId: 'asset-1',
      url: 'https://signed.test/logo.png',
    })
  })

  /**
   * ── THE FILTER THE REVIEW FOUND MISSING ───────────────────────────────────
   * A trashed logo is not the logo. Without this the topbar kept painting a file
   * the customer had deleted, and a newer logo could not displace it.
   */
  it('ignores a logo in the trash', async () => {
    await readBrandLogo(WORKSPACE)

    expect(state.nullChecks, 'a trashed asset must not be read as the logo').toContain('deleted_at')
  })

  /** Scoped to the workspace, and to a picture rather than any file named Logo. */
  it('reads only this workspace, and only an image titled Logo', async () => {
    await readBrandLogo(WORKSPACE)

    expect(state.filters).toContainEqual(['workspace_id', WORKSPACE])
    expect(state.filters).toContainEqual(['kind', 'image'])
    expect(state.filters).toContainEqual(['title', 'Logo'])
  })

  /** Null is an answer, not a failure — the mark renders its colour chip. */
  it('answers null when the workspace has no logo', async () => {
    state.row = null
    expect(await readBrandLogo(WORKSPACE)).toBeNull()
  })

  it('answers null when the read did not succeed', async () => {
    state.error = { code: '08006' }
    expect(await readBrandLogo(WORKSPACE)).toBeNull()
  })

  /** A row that cannot be signed is still a row. The link is what is missing. */
  it('reports the asset with no link when signing fails', async () => {
    state.signed = []
    expect(await readBrandLogo(WORKSPACE)).toEqual({ assetId: 'asset-1', url: null })
  })
})
