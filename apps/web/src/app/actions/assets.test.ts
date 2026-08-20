import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `attachAssetToPost` — the OTHER attach path.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * There are two ways a photo reaches a post: uploaded (`attachMedia`, covered by
 * posts-media.test.ts) and taken from the media library (this one). The upload
 * path has been fed `post_variants.format` since wt-editor2. The library path was
 * written on a different lane and was never given it — and when the two lanes met,
 * `decideAttach` had gained a REQUIRED fourth parameter, so the merge would not
 * compile until somebody answered for this call site.
 *
 * `{}` is a compiling answer, and it is the wrong one: it means "no version states
 * an intent", so a story would go back to accepting the landscape photo it cannot
 * publish, and the call would look exactly like a call that had checked. That is
 * the whole reason the parameter was made required rather than optional.
 *
 * So the check is here, executed, rather than asserted in a commit message. The
 * discriminating case is a LANDSCAPE photo onto an Instagram version that says
 * `story`: the same file is accepted when no format is stated, which is what makes
 * the format — and not the file — the thing being tested.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const POST_ID = '11111111-1111-4111-8111-111111111111'
const ASSET_ID = '33333333-3333-4333-8333-333333333333'

const state = vi.hoisted(() => ({
  post: null as { id: string; channels: string[] } | null,
  existingMedia: [] as unknown[],
  formats: {} as Record<string, string | null>,
  asset: null as Record<string, unknown> | null,
  inserted: [] as Record<string, unknown>[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WORKSPACE }),
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/posts/read', () => ({
  getPost: () => Promise.resolve(state.post),
  listMedia: () => Promise.resolve(state.existingMedia),
  readVariantFormats: () => Promise.resolve(state.formats),
}))
vi.mock('@/lib/assets/read', () => ({
  readAsset: () =>
    Promise.resolve(
      state.asset === null
        ? { status: 'missing' }
        : { status: 'ok', asset: { asset: state.asset } },
    ),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        state.inserted.push(row)
        return Promise.resolve({ error: null })
      },
    }),
  }),
}))

const { attachAssetToPost } = await import('./assets')

/** 1600x900 — a perfectly ordinary landscape photo, inside Instagram's FEED range. */
function landscape(): Record<string, unknown> {
  return {
    id: ASSET_ID,
    storage_path: `${WORKSPACE}/library/shopfront.png`,
    mime: 'image/png',
    bytes: 400_000,
    width: 1600,
    height: 900,
    alt: 'The shopfront',
  }
}

beforeEach(() => {
  state.post = { id: POST_ID, channels: ['instagram'] }
  state.formats = {}
  state.existingMedia = []
  state.asset = landscape()
  state.inserted = []
})

describe('attachAssetToPost reads the version formats', () => {
  test('a landscape photo is accepted when no version states a format', async () => {
    // The CONTROL. Without this the test below proves nothing: a refusal could
    // just as well mean the file is bad, the mock is wrong, or the channel
    // rejects everything. 1600x900 is 1.78, inside Instagram's feed range.
    const result = await attachAssetToPost(POST_ID, ASSET_ID)

    expect(result.ok).toBe(true)
    expect(state.inserted).toHaveLength(1)
  })

  test('the SAME photo is refused when the Instagram version says story', async () => {
    // Only the format changes. A story is 9:16 (0.56) and this photo is 1.78, so
    // the shape rule that belongs to the KIND of post refuses it — and nothing is
    // written. Passing `{}` here compiles and puts the row in.
    state.formats = { instagram: 'story' }

    const result = await attachAssetToPost(POST_ID, ASSET_ID)

    expect(result.ok).toBe(false)
    expect(state.inserted).toEqual([])
  })

  test('the refusal names the channel rather than failing anonymously', async () => {
    // A rejection the writer cannot act on is barely better than a silent one.
    state.formats = { instagram: 'story' }

    const result = await attachAssetToPost(POST_ID, ASSET_ID)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rejections?.map((r) => r.channel)).toContain('instagram')
  })

  test('a file already on the post is refused before any format is read', async () => {
    // Pre-existing behaviour, pinned here because this file is now the only test
    // of this action and a later edit to the format read must not cost it.
    state.existingMedia = [{ storage_path: `${WORKSPACE}/library/shopfront.png` }]

    const result = await attachAssetToPost(POST_ID, ASSET_ID)

    expect(result.ok).toBe(false)
    expect(state.inserted).toEqual([])
  })

  test('a row whose facts were never established is refused, not guessed at', async () => {
    // Nulls slide under every numeric limit, so an unmeasured file would be
    // accepted by rules it was never actually judged against.
    state.asset = { ...landscape(), width: null, height: null }

    const result = await attachAssetToPost(POST_ID, ASSET_ID)

    expect(result.ok).toBe(false)
    expect(state.inserted).toEqual([])
  })
})
