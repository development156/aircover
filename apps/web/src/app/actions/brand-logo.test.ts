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
  uploadResult: { ok: true } as { ok: boolean; message?: string },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('./assets', () => ({
  uploadAsset: () => {
    state.uploadCalled += 1
    return Promise.resolve(state.uploadResult)
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: state.match, error: state.lookupError }),
              }),
            }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        state.updates.push(patch)
        return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }
      },
    }),
  }),
}))

const { setBrandLogo } = await import('./brand-logo')

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
  state.uploadResult = { ok: true }
})

describe('setBrandLogo', () => {
  /** THE ONE THE FOUNDER NEEDED. The bytes are here; claim them. */
  it('adopts a file the workspace already holds instead of refusing it', async () => {
    state.match = { id: 'asset-1', deleted_at: null }

    const result = await setBrandLogo(form())

    expect(result).toEqual({ ok: true, adopted: true })
    expect(state.updates[0]).toMatchObject({ title: 'Logo' })
    expect(state.uploadCalled, 'the library action would have refused this').toBe(0)
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

    expect(result).toEqual({ ok: true, adopted: false })
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

    expect(await setBrandLogo(form())).toEqual({ ok: true, adopted: false })
    expect(state.uploadCalled).toBe(1)
  })

  it('refuses an empty file rather than storing nothing', async () => {
    const empty = new FormData()
    empty.set('file', new File([], 'logo.png', { type: 'image/png' }))

    expect((await setBrandLogo(empty)).ok).toBe(false)
  })
})
