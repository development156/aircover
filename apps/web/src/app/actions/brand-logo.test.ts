import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Making a file the workspace's logo.
 *
 * ── THE DEAD END THIS CLOSES ────────────────────────────────────────────────
 * Founder's report, three times over two days: "Replace logo is not working."
 * It was not, and it could not have been, for a reason no error-handling in the
 * panel would have fixed.
 *
 * His logo was already in the library — it went in during onboarding, before
 * the title fix, so it carried its FILE NAME rather than the title
 * `readBrandLogo` searches for. So the topbar showed a colour chip. He pressed
 * "Replace logo", picked the same file, and `uploadAsset` refused it as a
 * duplicate by content hash. Correctly. Which made the one action that could
 * have made his logo findable the one action guaranteed to fail, every press,
 * for ever.
 *
 * Refusing a duplicate is right for a media library and wrong for a control
 * whose meaning is "this is my logo". These pin that distinction.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({
  /** What the hash lookup finds, or the error it fails with. */
  match: null as { id: string; deleted_at: string | null } | null,
  lookupError: null as { code: string } | null,
  updates: [] as Record<string, unknown>[],
  uploadCalled: 0,
  uploaded: null as FormData | null,
  /** What the adoption lookup actually filtered on. The old mock threw this away. */
  filters: [] as [string, unknown][],
  demoted: [] as Record<string, unknown>[],
  uploadResult: { ok: true, asset: { id: 'asset-new' } } as {
    ok: boolean
    message?: string
    asset?: { id: string }
  },
  /** What was written to `workspaces.logo_asset_id`, and what it filtered on. */
  pointerUpdates: [] as Record<string, unknown>[],
  pointerFilters: [] as [string, unknown][],
  /** The error the pointer write fails with, or null for success. */
  pointerError: null as { code: string } | null,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('./assets', () => ({
  uploadAsset: (data: FormData) => {
    state.uploadCalled += 1
    state.uploaded = data
    return Promise.resolve(state.uploadResult)
  },
}))
/**
 * ── THE MOCK RECORDS THE QUERY, WHICH IT USED TO DISCARD ────────────────────
 * Found by review: every `eq()` was `() => ...`, taking no arguments and
 * asserting nothing, so NO test pinned that the lookup is scoped to the
 * workspace or that it matches on the content hash. Removing `.eq('workspace_id',
 * …)` from the action — a cross-tenant read — would have left the suite green.
 */
vi.mock('@/lib/supabase/server', () => {
  const record = (bucket: [string, unknown][], errorRef: () => unknown = () => null) => {
    const chain: Record<string, unknown> = {
      eq: (column: string, value: unknown) => {
        bucket.push([column, value])
        return chain
      },
      neq: (column: string, value: unknown) => {
        bucket.push([`neq:${column}`, value])
        return chain
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: state.match, error: state.lookupError }),
      then: (resolve: (v: unknown) => unknown) => resolve({ error: errorRef() }),
    }
    return chain
  }

  return {
    createServerSupabase: () => ({
      from: (table: string) => {
        // ── THE POINTER WRITE, A DIFFERENT TABLE ────────────────────────────
        // `setBrandLogo` now also writes `workspaces.logo_asset_id`. Routed
        // separately so its own filters and its own failure mode (`42703`,
        // the migration not applied yet) can be pinned without disturbing the
        // `assets` assertions below.
        if (table === 'workspaces') {
          return {
            update: (patch: Record<string, unknown>) => {
              state.pointerUpdates.push(patch)
              return record(state.pointerFilters, () => state.pointerError)
            },
          }
        }
        expect(table).toBe('assets')
        return {
          select: () => record(state.filters),
          update: (patch: Record<string, unknown>) => {
            if (patch.title === 'Logo (previous)') state.demoted.push(patch)
            else state.updates.push(patch)
            return record(state.filters)
          },
        }
      },
    }),
  }
})

const { setBrandLogo, setBrandLogoDark } = await import('./brand-logo')

const svgForm = () => {
  const data = new FormData()
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="blue"/></svg>'
  data.set('file', new File([svg], 'brand.svg', { type: 'image/svg+xml' }))
  data.set('title', 'Logo')
  return data
}

const form = () => {
  const data = new FormData()
  data.set('file', new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' }))
  data.set('title', 'Logo')
  return data
}

beforeEach(() => {
  state.match = null
  state.lookupError = null
  state.updates = []
  state.uploadCalled = 0
  state.uploaded = null
  state.filters = []
  state.demoted = []
  state.uploadResult = { ok: true, asset: { id: 'asset-new' } }
  state.pointerUpdates = []
  state.pointerFilters = []
  state.pointerError = null
})

describe('setBrandLogo', () => {
  /** THE ONE THE FOUNDER NEEDED. The bytes are here; claim them. */
  it('adopts a file the workspace already holds instead of refusing it', async () => {
    state.match = { id: 'asset-1', deleted_at: null }

    const result = await setBrandLogo(form())

    expect(result).toEqual({ ok: true, adopted: true, converted: false })
    expect(state.updates[0]).toMatchObject({ title: 'Logo' })
    expect(state.uploadCalled, 'the library action would have refused this').toBe(0)
  })

  /**
   * ── THE LOOKUP MUST BE SCOPED, AND NOTHING SAID SO ────────────────────────
   * The old mock ignored every argument, so removing the workspace filter — a
   * read across tenants — would not have failed a single test.
   */
  it('looks only inside this workspace, and only for these bytes', async () => {
    await setBrandLogo(form())

    const columns = state.filters.map(([c]) => c)
    expect(columns, 'the lookup must be scoped to the workspace').toContain('workspace_id')
    expect(columns, 'and must match on the content hash').toContain('content_sha256')

    const scoped = state.filters.find(([c]) => c === 'workspace_id')
    expect(scoped?.[1]).toBe(WORKSPACE)
  })

  /**
   * ── ADOPTION HAS TO WIN THE READ ──────────────────────────────────────────
   * Found by TWO independent review lenses. `readBrandLogo` takes the NEWEST row
   * titled `Logo`, so retitling an OLDER row reported success while the topbar
   * went on showing the previous logo — the exact "it says it worked and nothing
   * changed" shape this whole sequence has been chasing.
   */
  it('demotes any other logo so exactly one row carries the title', async () => {
    state.match = { id: 'asset-1', deleted_at: null }

    await setBrandLogo(form())

    expect(state.demoted, 'an older logo must lose the title').toHaveLength(1)
    const columns = state.filters.map(([c]) => c)
    expect(columns, 'and the one being adopted must be spared').toContain('neq:id')
  })

  it('demotes the previous logo on a fresh upload too', async () => {
    await setBrandLogo(form())
    expect(state.demoted).toHaveLength(1)
  })

  /** A logo in the trash is still their logo. Claiming it brings it back. */
  it('takes an adopted file out of the trash', async () => {
    state.match = { id: 'asset-1', deleted_at: '2026-08-01T00:00:00Z' }

    await setBrandLogo(form())

    expect(state.updates[0]).toMatchObject({ title: 'Logo', deleted_at: null })
  })

  /** Nothing to adopt is an ordinary upload, with every check that carries. */
  it('uploads when the bytes are new', async () => {
    const result = await setBrandLogo(form())

    expect(result).toEqual({ ok: true, adopted: false, converted: false })
    expect(state.uploadCalled).toBe(1)
    expect(state.updates).toHaveLength(0)
  })

  /** And the upload's own refusal is passed through, not swallowed. */
  it('reports why an upload was refused', async () => {
    state.uploadResult = { ok: false, message: 'That file is larger than 40 MB.' }

    expect(await setBrandLogo(form())).toEqual({
      ok: false,
      message: 'That file is larger than 40 MB.',
    })
  })

  /**
   * ── A FAILED LOOKUP IS NOT "NO MATCH" ─────────────────────────────────────
   * Falling through to the upload on an unreadable read would hit its duplicate
   * check and refuse — which is exactly the dead end this function exists to
   * end, restored silently on any bad day for the database.
   */
  it('refuses rather than guessing when the library cannot be read', async () => {
    state.lookupError = { code: '08006' }

    const result = await setBrandLogo(form())

    expect(result.ok).toBe(false)
    expect(state.uploadCalled).toBe(0)
  })

  /**
   * The one exception: `content_sha256` arrives with a migration a human
   * applies. Where the column does not exist there is no hash to match on, and
   * uploading is the only thing left to try.
   */
  it('still uploads where the hash column does not exist yet', async () => {
    state.lookupError = { code: '42703' }

    expect(await setBrandLogo(form())).toEqual({ ok: true, adopted: false, converted: false })
    expect(state.uploadCalled).toBe(1)
  })

  /**
   * ── AN SVG NEVER REACHES STORAGE ──────────────────────────────────────────
   * The founder's logo is an SVG. Rather than sanitise a script container, it is
   * rasterised and the original discarded, so everything downstream receives a
   * PNG it already knows how to handle.
   */
  it('turns an SVG into a PNG and stores that', async () => {
    const result = await setBrandLogo(svgForm())

    expect(result).toEqual({ ok: true, adopted: false, converted: true })
    expect(state.uploaded, 'the upload must receive the raster, not the vector').not.toBeNull()

    const file = state.uploaded!.get('file') as File
    expect(file.type).toBe('image/png')
    expect(file.name).toBe('brand.png')
    const head = [...new Uint8Array(await file.arrayBuffer()).slice(0, 4)]
    expect(head, 'stored bytes must be a PNG').toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  /**
   * The hash is taken of what is STORED, so the same SVG uploaded twice adopts
   * rather than duplicating. Rasterising the same input is deterministic, which
   * is what makes that true.
   */
  it('adopts on a second upload of the same SVG', async () => {
    state.match = { id: 'asset-1', deleted_at: null }

    expect(await setBrandLogo(svgForm())).toEqual({ ok: true, adopted: true, converted: true })
    expect(state.uploadCalled).toBe(0)
  })

  it('refuses a hostile SVG without storing anything', async () => {
    const data = new FormData()
    const hostile = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    data.set('file', new File([hostile], 'evil.svg', { type: 'image/svg+xml' }))

    const result = await setBrandLogo(data)

    expect(result.ok).toBe(false)
    expect(state.uploadCalled).toBe(0)
    expect(state.updates).toHaveLength(0)
  })

  it('refuses an empty file rather than storing nothing', async () => {
    const empty = new FormData()
    empty.set('file', new File([], 'logo.png', { type: 'image/png' }))

    expect((await setBrandLogo(empty)).ok).toBe(false)
  })

  /**
   * ── THE POINTER, ON THE ADOPT PATH ─────────────────────────────────────────
   * Title alone used to be the whole answer. Now `setBrandLogo` also names the
   * exact row, on the workspace it belongs to.
   */
  it('points the workspace at the adopted asset', async () => {
    state.match = { id: 'asset-1', deleted_at: null }

    const result = await setBrandLogo(form())

    expect(result).toEqual({ ok: true, adopted: true, converted: false })
    expect(state.pointerUpdates).toContainEqual({ logo_asset_id: 'asset-1' })
    expect(state.pointerFilters).toContainEqual(['id', WORKSPACE])
  })

  /** And on a fresh upload, the id `uploadAsset` handed back is what gets pointed at. */
  it('points the workspace at a freshly uploaded asset', async () => {
    const result = await setBrandLogo(form())

    expect(result).toEqual({ ok: true, adopted: false, converted: false })
    expect(state.pointerUpdates).toContainEqual({ logo_asset_id: 'asset-new' })
  })

  /**
   * ── THE POINTER WRITE IS BEST EFFORT, LIKE `demoteOtherLogos` ─────────────
   * `42703` means the migration has not landed on this deploy. Setting the
   * logo must not start failing for a reason no customer caused, so the title
   * write still stands and the action still reports success.
   */
  it('still reports success when the pointer write fails with 42703', async () => {
    state.pointerError = { code: '42703' }

    const result = await setBrandLogo(form())

    expect(result).toEqual({ ok: true, adopted: false, converted: false })
  })
})

/**
 * The dark-background variant. Same sequence as `setBrandLogo`, proven above,
 * so these pin only what DIFFERS: which column the pointer goes into, and
 * that setting one variant never touches the other's title.
 */
describe('setBrandLogoDark', () => {
  it('points the workspace at logo_asset_id_dark, not logo_asset_id', async () => {
    const result = await setBrandLogoDark(form())

    expect(result).toEqual({ ok: true, adopted: false, converted: false })
    expect(state.pointerUpdates).toContainEqual({ logo_asset_id_dark: 'asset-new' })
    expect(
      state.pointerUpdates.some((u) => 'logo_asset_id' in u),
      'the light pointer column must never be touched by the dark action',
    ).toBe(false)
  })

  it('adopts a file the workspace already holds, same as the light variant', async () => {
    state.match = { id: 'asset-1', deleted_at: null }

    const result = await setBrandLogoDark(form())

    expect(result).toEqual({ ok: true, adopted: true, converted: false })
    expect(state.uploadCalled).toBe(0)
    expect(state.pointerUpdates).toContainEqual({ logo_asset_id_dark: 'asset-1' })
  })

  /**
   * The real upload door (`brand-panel.tsx`, `visual-step.tsx`) never sets a
   * `title` field for the dark variant, unlike the light form's `form()`
   * helper above. `setLogoVariant` must not need one: it names the title
   * itself on the SVG path, and passes an untitled raster through unchanged,
   * exactly as `setBrandLogo` does today.
   */
  it('accepts a plain upload with no title field at all', async () => {
    const untitled = new FormData()
    untitled.set('file', new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' }))

    const result = await setBrandLogoDark(untitled)

    expect(result).toEqual({ ok: true, adopted: false, converted: false })
    expect(state.uploaded, 'a fresh upload must have been sent').not.toBeNull()
  })

  it('reports why an upload was refused, unchanged from the light path', async () => {
    state.uploadResult = { ok: false, message: 'That file is larger than 40 MB.' }

    expect(await setBrandLogoDark(form())).toEqual({
      ok: false,
      message: 'That file is larger than 40 MB.',
    })
  })

  it('refuses an empty file rather than storing nothing', async () => {
    const empty = new FormData()
    empty.set('file', new File([], 'logo.png', { type: 'image/png' }))

    expect((await setBrandLogoDark(empty)).ok).toBe(false)
  })
})
