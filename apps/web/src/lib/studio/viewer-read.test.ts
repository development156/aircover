import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `readPictureForViewer`, AND THE FOUR THINGS IT MUST GET RIGHT.
 *
 * 1. A picture belonging to another workspace (or that never existed) is a
 *    `not-found`, never a rendered screen and never a distinguishable error.
 * 2. `42703` on the lineage-column probe is read as "not applied", and the
 *    plain fallback select still returns the picture.
 * 3. A read failure that is NOT `42703` is `unreadable`, never `not-found`.
 * 4. Versions are computed only once the columns are confirmed reachable, and
 *    a lineage group of one comes back as `null`, never a strip of one.
 */

const WS = '11111111-1111-4111-8111-111111111111'
const IMAGE_ID = '22222222-2222-4222-8222-222222222222'
const GENERATION_ID = '33333333-3333-4333-8333-333333333333'

const activeWorkspaceRead = vi.fn()
vi.mock('@/lib/workspaces', () => ({ activeWorkspaceRead: () => activeWorkspaceRead() }))

const picturesFor = vi.fn()
vi.mock('@/lib/studio/read', () => ({ picturesFor: (...args: unknown[]) => picturesFor(...args) }))

/** One queue per table, popped in call order. */
const queues: Record<string, { data: unknown; error: unknown }[]> = {
  studio_generation_images: [],
  studio_generations: [],
}

/** Every `.eq(...)` call made against each table, in order. */
const eqCalls: Record<string, unknown[][]> = {
  studio_generation_images: [],
  studio_generations: [],
}

function chainFor(table: string) {
  const next = () => queues[table]?.shift() ?? { data: null, error: null }
  const b: Record<string, unknown> = {}
  for (const method of ['select', 'order', 'or']) b[method] = () => b
  b.eq = (...args: unknown[]) => {
    eqCalls[table]?.push(args)
    return b
  }
  b.maybeSingle = () => Promise.resolve(next())
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(next()).then(res, rej)
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({ from: (table: string) => chainFor(table) }),
}))

const { readPictureForViewer } = await import('./viewer-read')

const imageRow = (over: Record<string, unknown> = {}) => ({
  id: IMAGE_ID,
  workspace_id: WS,
  generation_id: GENERATION_ID,
  idx: 0,
  asset_id: '44444444-4444-4444-8444-444444444444',
  created_at: '2026-09-04T00:00:00Z',
  ...over,
})

const generationRow = (over: Record<string, unknown> = {}) => ({
  id: GENERATION_ID,
  workspace_id: WS,
  status: 'ready',
  mode: 'on_brand',
  prompt_given: 'A plate of fresh samosas',
  format_id: 'square',
  reference_asset_ids: [],
  requested_count: 1,
  created_at: '2026-09-04T00:00:00Z',
  updated_at: '2026-09-04T00:00:00Z',
  finished_at: '2026-09-04T00:01:00Z',
  ...over,
})

const onePicture = {
  imageId: IMAGE_ID,
  assetId: '44444444-4444-4444-8444-444444444444',
  url: 'https://signed.example/a.png',
  width: 1024,
  height: 1024,
  prompt: 'A plate of fresh samosas',
  formatId: 'square',
  mime: 'image/png',
  mode: 'on_brand' as const,
  referenceAssetIds: [],
  stampedUrl: null,
  stampOutcome: null,
  madeAgo: '2h ago',
}

beforeEach(() => {
  vi.clearAllMocks()
  queues.studio_generation_images = []
  queues.studio_generations = []
  eqCalls.studio_generation_images = []
  eqCalls.studio_generations = []
  activeWorkspaceRead.mockResolvedValue({ status: 'ok', workspace: { id: WS } })
  picturesFor.mockResolvedValue(new Map([[GENERATION_ID, []]]))
})

describe('not found, never a distinguishable error', () => {
  it('a malformed id is not-found, never a query', async () => {
    const read = await readPictureForViewer('not-a-uuid')
    expect(read.status).toBe('not-found')
  })

  it('an id from another workspace (or one that never existed) is not-found', async () => {
    queues.studio_generation_images = [{ data: null, error: null }]
    const read = await readPictureForViewer(IMAGE_ID)
    expect(read.status).toBe('not-found')
  })

  it('the image lookup is scoped by workspace_id, not by id alone', async () => {
    queues.studio_generation_images = [{ data: null, error: null }]
    await readPictureForViewer(IMAGE_ID)
    expect(eqCalls.studio_generation_images).toContainEqual(['workspace_id', WS])
  })

  it('a workspace read that could not be answered is unreadable, not not-found', async () => {
    activeWorkspaceRead.mockResolvedValue({ status: 'unreadable' })
    const read = await readPictureForViewer(IMAGE_ID)
    expect(read.status).toBe('unreadable')
  })
})

describe('the lineage-column probe', () => {
  it('42703 on the probe means the columns are not applied, and the plain fallback still finds the picture', async () => {
    queues.studio_generation_images = [{ data: imageRow(), error: null }]
    queues.studio_generations = [
      { data: null, error: { code: '42703' } },
      { data: generationRow(), error: null },
    ]
    picturesFor.mockResolvedValue(new Map([[GENERATION_ID, [onePicture]]]))

    const read = await readPictureForViewer(IMAGE_ID)

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.lineage).toEqual({ columnsApplied: false })
    // Never queried once the columns are known unreachable.
    expect(read.versions).toBeNull()
  })

  it('a read failure that is not 42703 is unreadable, not not-found', async () => {
    queues.studio_generation_images = [{ data: imageRow(), error: null }]
    queues.studio_generations = [{ data: null, error: { code: 'other' } }]

    const read = await readPictureForViewer(IMAGE_ID)
    expect(read.status).toBe('unreadable')
  })

  it('columns applied and nothing recorded reads as lineage with a null stamp, and a lone generation has no versions', async () => {
    queues.studio_generation_images = [{ data: imageRow(), error: null }]
    queues.studio_generations = [
      { data: generationRow({ remixed_from: null, stamp_enabled: null }), error: null },
      // The siblings query: only this generation itself.
      { data: [generationRow({ remixed_from: null, stamp_enabled: null })], error: null },
    ]
    picturesFor.mockResolvedValue(new Map([[GENERATION_ID, [onePicture]]]))

    const read = await readPictureForViewer(IMAGE_ID)

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.lineage).toEqual({ columnsApplied: true, remixedFrom: null, stamp: null })
    expect(read.versions).toBeNull()
  })

  it('a full stamp record on the row is carried into the lineage', async () => {
    queues.studio_generation_images = [{ data: imageRow(), error: null }]
    queues.studio_generations = [
      {
        data: generationRow({
          stamp_enabled: true,
          stamp_anchor: 'top-left',
          stamp_size_step: 'large',
        }),
        error: null,
      },
      {
        data: [
          generationRow({
            stamp_enabled: true,
            stamp_anchor: 'top-left',
            stamp_size_step: 'large',
          }),
        ],
        error: null,
      },
    ]
    picturesFor.mockResolvedValue(new Map([[GENERATION_ID, [onePicture]]]))

    const read = await readPictureForViewer(IMAGE_ID)

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.lineage).toEqual({
      columnsApplied: true,
      remixedFrom: null,
      stamp: { enabled: true, anchor: 'top-left', sizeStep: 'large' },
    })
  })
})

describe('versions, only once there is a group', () => {
  it('two generations in the same lineage produce an ordered strip with the current one flagged', async () => {
    const rootId = GENERATION_ID
    const remixId = '55555555-5555-4555-8555-555555555555'
    const remixImageId = '66666666-6666-4666-8666-666666666666'

    queues.studio_generation_images = [
      { data: imageRow({ id: remixImageId, generation_id: remixId }), error: null },
    ]
    const remixRow = generationRow({
      id: remixId,
      remixed_from: rootId,
      created_at: '2026-09-04T01:00:00Z',
    })
    queues.studio_generations = [
      { data: remixRow, error: null },
      { data: [generationRow({ id: rootId }), remixRow], error: null },
    ]

    const rootPicture = { ...onePicture, imageId: IMAGE_ID }
    const remixPicture = { ...onePicture, imageId: remixImageId, prompt: 'A remix' }
    picturesFor.mockImplementation(async (_ws: string, ids: string[]) => {
      const map = new Map<string, unknown[]>()
      if (ids.includes(rootId)) map.set(rootId, [rootPicture])
      if (ids.includes(remixId)) map.set(remixId, [remixPicture])
      return map
    })

    const read = await readPictureForViewer(remixImageId)

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.versions).not.toBeNull()
    expect(read.versions?.total).toBe(2)
    expect(read.versions?.index).toBe(2)
    expect(read.versions?.entries.map((e) => e.current)).toEqual([false, true])
  })
})
