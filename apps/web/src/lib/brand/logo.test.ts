import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Finding the workspace's logo.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * It did not, and an adversarial review found what that cost: `readBrandLogo`
 * had no `deleted_at is null` filter, so a logo the customer moved to the trash
 * went on painting the topbar, and worse, HID a newer one behind it, because a
 * trashed row can still be the most recent. Removing the filter left all 535
 * tests in the suite green.
 *
 * `assets` marks deletion with a column rather than by removing the row, so
 * every read of that table has to say which it wants. The whole point of this
 * file is that the query is now pinned.
 *
 * ── THE POINTER, ADDED HERE TOO ─────────────────────────────────────────────
 * `workspaces.logo_asset_id` is a migration a human has not applied yet, so the
 * mock below has to answer three shapes: a pointer that names an asset, a null
 * pointer, and a `42703` that says the column does not exist on this deploy.
 * The mock distinguishes the `workspaces` table from the `assets` table, and
 * within `assets` distinguishes the pointer read (filters on `id`) from the
 * title-match fallback (filters on `title`), because both queries now go
 * through the same mocked client.
 */

const state = vi.hoisted(() => ({
  filters: [] as [string, unknown][],
  nullChecks: [] as string[],
  /** The title-match fallback's answer. */
  row: null as Record<string, unknown> | null,
  error: null as unknown,
  /** The `workspaces.logo_asset_id` read. */
  workspaceRow: null as Record<string, unknown> | null,
  workspaceError: null as { code: string } | null,
  /** The pointer read, when `workspaceRow.logo_asset_id` is not null. */
  pointedRow: null as Record<string, unknown> | null,
  pointedError: null as { code: string } | null,
  signed: [{ id: 'asset-1', url: 'https://signed.test/logo.png' }] as
    | { id: string; url: string | null }[]
    | null,
}))

vi.mock('@/lib/posts/media-url', () => ({
  signMediaPreviews: (rows: { id: string }[]) =>
    Promise.resolve((state.signed ?? []).filter((s) => rows.some((r) => r.id === s.id))),
}))
vi.mock('@/lib/supabase/server', () => {
  const chainFor = (table: string) => {
    const eqs: [string, unknown][] = []
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        state.filters.push([column, value])
        eqs.push([column, value])
        return chain
      },
      is: (column: string) => {
        state.nullChecks.push(column)
        return chain
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => {
        if (table === 'workspaces') {
          return Promise.resolve({ data: state.workspaceRow, error: state.workspaceError })
        }
        const byId = eqs.some(([column]) => column === 'id')
        return byId
          ? Promise.resolve({ data: state.pointedRow, error: state.pointedError })
          : Promise.resolve({ data: state.row, error: state.error })
      },
    }
    return chain
  }
  return { createServerSupabase: () => ({ from: (table: string) => chainFor(table) }) }
})

const { readBrandLogo } = await import('./logo')

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  state.filters = []
  state.nullChecks = []
  state.row = { id: 'asset-1', storage_path: `${WORKSPACE}/library/logo.png` }
  state.error = null
  state.workspaceRow = { logo_asset_id: null }
  state.workspaceError = null
  state.pointedRow = null
  state.pointedError = null
  state.signed = [
    { id: 'asset-1', url: 'https://signed.test/logo.png' },
    { id: 'asset-ptr', url: 'https://signed.test/ptr.png' },
  ]
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

  /** Null is an answer, not a failure, the mark renders its colour chip. */
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

  /**
   * ── THE POINTER WINS, WHICH IS THE WHOLE POINT OF THE CHANGE ──────────────
   * A newer asset happens to carry the title `Logo` too (the fallback's own
   * query would find it), and the pointer still wins: it names an exact row,
   * not "whatever is newest and titled right".
   */
  it('reads the pointer over a differently-titled newer asset', async () => {
    state.workspaceRow = { logo_asset_id: 'asset-ptr' }
    state.pointedRow = {
      id: 'asset-ptr',
      storage_path: `${WORKSPACE}/library/ptr.png`,
      deleted_at: null,
    }
    // The fallback row is still here, standing in for "a newer file titled
    // Logo", and must not be what wins.
    state.row = { id: 'asset-1', storage_path: `${WORKSPACE}/library/logo.png` }

    expect(await readBrandLogo(WORKSPACE)).toEqual({
      assetId: 'asset-ptr',
      url: 'https://signed.test/ptr.png',
    })
  })

  /**
   * ── A TRASHED POINTER IS NOT THE LOGO ──────────────────────────────────────
   * Decision: answer null rather than fall back to the title match. The
   * pointer is an explicit choice; silently substituting a different file for
   * it is the "it says it worked and nothing changed" shape this file's
   * trash filter already exists to close on the fallback path. See the header
   * in logo.ts for the full reasoning.
   */
  it('answers null when the pointer names a trashed asset', async () => {
    state.workspaceRow = { logo_asset_id: 'asset-ptr' }
    state.pointedRow = {
      id: 'asset-ptr',
      storage_path: `${WORKSPACE}/library/ptr.png`,
      deleted_at: '2026-08-01T00:00:00Z',
    }

    expect(await readBrandLogo(WORKSPACE)).toBeNull()
  })

  /** A null pointer is not a pointer. Falls back to exactly today's answer. */
  it('falls back to the title match when the pointer is null', async () => {
    state.workspaceRow = { logo_asset_id: null }

    expect(await readBrandLogo(WORKSPACE)).toEqual({
      assetId: 'asset-1',
      url: 'https://signed.test/logo.png',
    })
  })

  /**
   * ── THE MIGRATION HAS NOT BEEN APPLIED YET ─────────────────────────────────
   * `42703` is "undefined column". Until a human runs `supabase db push`, every
   * workspace reads this way, so the fallback has to answer exactly what it
   * answered before the pointer existed.
   */
  it('falls back to the title match when the column does not exist', async () => {
    state.workspaceError = { code: '42703' }

    expect(await readBrandLogo(WORKSPACE)).toEqual({
      assetId: 'asset-1',
      url: 'https://signed.test/logo.png',
    })
  })
})
