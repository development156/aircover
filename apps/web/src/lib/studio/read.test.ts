import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE LIBRARY PICKER'S READ, AND THE THREE ANSWERS IT MUST KEEP APART.
 *
 * `readLibraryPictures` returned `[]` for a failed read AND for a workspace
 * that could not be found, so the workbench told a person with thirty pictures
 * "You have no pictures yet" the moment the assets table blinked. "We asked and
 * got nothing" and "we could not ask" are different claims, and the screen can
 * only state the true one if the reader hands both back.
 */

const activeWorkspaceRead = vi.fn()
vi.mock('@/lib/workspaces', () => ({ activeWorkspaceRead: () => activeWorkspaceRead() }))

const signMediaPreviews = vi.fn()
vi.mock('@/lib/posts/media-url', () => ({
  signMediaPreviews: (rows: unknown) => signMediaPreviews(rows),
}))

/** What `from('assets').select(...)` answers with this test. */
let assetsAnswer: { data: unknown; error: unknown } = { data: [], error: null }

function chain() {
  const b: Record<string, unknown> = {}
  const self = () => b
  for (const k of ['select', 'eq', 'is', 'order', 'limit']) b[k] = self
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(assetsAnswer).then(res, rej)
  return b
}
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({ from: () => chain() }),
}))

const { readLibraryPictures, stampAnchorFromImageRow } = await import('./read')

const WS = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  assetsAnswer = { data: [], error: null }
  activeWorkspaceRead.mockResolvedValue({ status: 'ok', workspace: { id: WS } })
  signMediaPreviews.mockResolvedValue([])
})

describe('readLibraryPictures keeps a failed read apart from an empty library', () => {
  /**
   * MUTATION: make the `error` arm `return { status: 'ok', pictures: [] }` and
   * this goes red while the screen tells somebody their library is empty.
   */
  it('says the read failed when the assets query errors', async () => {
    assetsAnswer = { data: null, error: { message: 'connection reset' } }

    const read = await readLibraryPictures()

    expect(read.status).toBe('unreadable')
  })

  it('says the read failed when the workspace itself could not be read', async () => {
    activeWorkspaceRead.mockResolvedValue({ status: 'unreadable' })

    const read = await readLibraryPictures()

    expect(read.status).toBe('unreadable')
  })

  /** Not the same as a failure: nothing was asked, because there was nobody to ask for. */
  it('says there is no workspace when there is none', async () => {
    activeWorkspaceRead.mockResolvedValue({ status: 'none' })

    const read = await readLibraryPictures()

    expect(read.status).toBe('no-workspace')
  })

  it('an empty answer is an empty library, and says so as ok', async () => {
    const read = await readLibraryPictures()

    expect(read).toEqual({ status: 'ok', pictures: [] })
  })

  it('hands back the pictures, newest first as read, with a null url when signing failed', async () => {
    assetsAnswer = {
      data: [
        { id: 'a1', storage_path: `${WS}/a1.png`, title: 'A shopfront' },
        { id: 'a2', storage_path: `${WS}/a2.png`, title: '' },
      ],
      error: null,
    }
    signMediaPreviews.mockResolvedValue([{ id: 'a1', url: 'https://signed.test/a1' }])

    const read = await readLibraryPictures()

    expect(read).toEqual({
      status: 'ok',
      pictures: [
        { assetId: 'a1', url: 'https://signed.test/a1', title: 'A shopfront' },
        // An empty title is no title. A link that would not sign is still a picture.
        { assetId: 'a2', url: null, title: null },
      ],
    })
  })
})

describe('stampAnchorFromImageRow reads the corner columns off the raw row', () => {
  /**
   * The two columns arrive in a migration a human applies. `select *` omits a
   * column that is not yet applied, so the reader must treat an ABSENT column
   * exactly like NULL: not recorded, never a guessed placement.
   */
  it('reads a recorded move, corner and reason together', () => {
    expect(
      stampAnchorFromImageRow({
        id: '11111111-1111-4111-8111-111111111111',
        stamped_anchor: 'top-left',
        stamp_anchor_moved_reason: 'busy',
      }),
    ).toEqual({ stampAnchor: 'top-left', stampAnchorMovedReason: 'busy' })
  })

  it('reads a stayed mark as a corner with no reason', () => {
    expect(
      stampAnchorFromImageRow({
        id: '11111111-1111-4111-8111-111111111111',
        stamped_anchor: 'bottom-right',
        stamp_anchor_moved_reason: null,
      }),
    ).toEqual({ stampAnchor: 'bottom-right', stampAnchorMovedReason: null })
  })

  it('treats an ABSENT column as null, so a pre-migration deploy stays silent', () => {
    // A row from before the migration: `select *` never returned these keys.
    // MUTATION: default the anchor to `bottom-right` here and this goes red while
    // the screen claims a placement nobody measured.
    expect(stampAnchorFromImageRow({ id: '11111111-1111-4111-8111-111111111111' })).toEqual({
      stampAnchor: null,
      stampAnchorMovedReason: null,
    })
  })

  it('treats a value outside the vocabulary as not recorded, never as a corner', () => {
    expect(
      stampAnchorFromImageRow({
        id: '11111111-1111-4111-8111-111111111111',
        stamped_anchor: 'bottom_right',
      }),
    ).toEqual({ stampAnchor: null, stampAnchorMovedReason: null })
  })
})
