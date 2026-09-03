import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Finding the workspace's DARK-background logo variant, and both variants
 * together.
 *
 * ── WHY A SEPARATE FILE FROM `logo.test.ts` ─────────────────────────────────
 * `readBrandLogoDark` has no title-match fallback (see its own header in
 * `logo.ts`), so its mock only needs to answer the pointer shape rather than
 * `logo.test.ts`'s three-way split between the pointer, the fallback and the
 * `42703` case. Keeping it apart also means a bug introduced in one reader
 * cannot hide behind the other's passing assertions.
 */

const state = vi.hoisted(() => ({
  workspaceRow: null as Record<string, unknown> | null,
  workspaceError: null as { code: string } | null,
  pointedRow: null as Record<string, unknown> | null,
  pointedError: null as { code: string } | null,
  /** What column the `workspaces` select actually asked for. */
  selectedColumn: '' as string,
  signed: [{ id: 'asset-dark', url: 'https://signed.test/dark.png' }] as
    { id: string; url: string | null }[] | null,
}))

vi.mock('@/lib/posts/media-url', () => ({
  signMediaPreviews: (rows: { id: string }[]) =>
    Promise.resolve((state.signed ?? []).filter((s) => rows.some((r) => r.id === s.id))),
}))
vi.mock('@/lib/supabase/server', () => {
  const chainFor = (table: string) => {
    const chain: Record<string, unknown> = {
      select: (cols: string) => {
        if (table === 'workspaces') state.selectedColumn = cols
        return chain
      },
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => {
        if (table === 'workspaces') {
          return Promise.resolve({ data: state.workspaceRow, error: state.workspaceError })
        }
        return Promise.resolve({ data: state.pointedRow, error: state.pointedError })
      },
    }
    return chain
  }
  return { createServerSupabase: () => ({ from: (table: string) => chainFor(table) }) }
})

const { readBrandLogoDark, readBrandLogoVariants } = await import('./logo')

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  state.workspaceRow = { logo_asset_id_dark: null }
  state.workspaceError = null
  state.pointedRow = null
  state.pointedError = null
  state.selectedColumn = ''
  state.signed = [{ id: 'asset-dark', url: 'https://signed.test/dark.png' }]
})

describe('readBrandLogoDark', () => {
  it('reads the dark pointer column, not the light one', async () => {
    await readBrandLogoDark(WORKSPACE)

    expect(state.selectedColumn).toBe('logo_asset_id_dark')
  })

  it('answers null when no dark variant is chosen', async () => {
    expect(await readBrandLogoDark(WORKSPACE)).toBeNull()
  })

  it('answers null when the column does not exist yet (42703)', async () => {
    state.workspaceError = { code: '42703' }

    expect(await readBrandLogoDark(WORKSPACE)).toBeNull()
  })

  it('answers null on any other read failure, with no fallback to try', async () => {
    state.workspaceError = { code: '08006' }

    expect(await readBrandLogoDark(WORKSPACE)).toBeNull()
  })

  it('returns a signed link to the pointed asset', async () => {
    state.workspaceRow = { logo_asset_id_dark: 'asset-dark' }
    state.pointedRow = {
      id: 'asset-dark',
      storage_path: `${WORKSPACE}/library/dark.png`,
      deleted_at: null,
    }

    expect(await readBrandLogoDark(WORKSPACE)).toEqual({
      assetId: 'asset-dark',
      url: 'https://signed.test/dark.png',
    })
  })

  /** A trashed dark variant is not the logo, same rule as the light pointer. */
  it('answers null when the pointer names a trashed asset', async () => {
    state.workspaceRow = { logo_asset_id_dark: 'asset-dark' }
    state.pointedRow = {
      id: 'asset-dark',
      storage_path: `${WORKSPACE}/library/dark.png`,
      deleted_at: '2026-08-01T00:00:00Z',
    }

    expect(await readBrandLogoDark(WORKSPACE)).toBeNull()
  })

  it('answers null when the pointed asset cannot be read', async () => {
    state.workspaceRow = { logo_asset_id_dark: 'asset-dark' }
    state.pointedError = { code: '08006' }

    expect(await readBrandLogoDark(WORKSPACE)).toBeNull()
  })
})

describe('readBrandLogoVariants', () => {
  it('reads both variants, whichever exist', async () => {
    state.workspaceRow = { logo_asset_id_dark: 'asset-dark' }
    state.pointedRow = {
      id: 'asset-dark',
      storage_path: `${WORKSPACE}/library/dark.png`,
      deleted_at: null,
    }

    const result = await readBrandLogoVariants(WORKSPACE)

    expect(result.dark).toEqual({ assetId: 'asset-dark', url: 'https://signed.test/dark.png' })
  })

  it('answers null for a workspace with no logo at all', async () => {
    const result = await readBrandLogoVariants(WORKSPACE)

    expect(result).toEqual({ light: null, dark: null })
  })
})
