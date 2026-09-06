import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The stored answer to "what is this logo file": computed once, written to
 * `asset_logo_facts`, read back instead of decoding the image again.
 *
 * ── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────
 * Every claim the cache makes is a claim about something NOT happening, and
 * those are the ones that rot silently. A cache that never writes, a cache that
 * writes and never reads back, and a cache that serves an answer computed from a
 * file that has since been replaced all behave identically from the outside:
 * pictures come out stamped. So the assertions here count the DECODES (a `sharp`
 * that counts and then delegates to the real one) and read the row the write
 * actually sent, rather than checking that a function was called.
 *
 * Stale facts are not a cosmetic defect. `trim` puts the mark somewhere, and
 * `inkPolarity` decides whether a plate is painted behind it, so facts taken
 * from a different file put the mark in the wrong place or plate one that needs
 * no plate.
 *
 * ── WHY THE STORED ROWS BELOW DISAGREE WITH THE FIXTURE ─────────────────────
 * Deliberately. The fixture measures to a dark 4x4 mark at (4, 2); the rows
 * stored in these tests say something else entirely. An assertion that the two
 * agreed could not tell a read from a decode.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const ASSET = '33333333-3333-4333-8333-333333333333'

const state = vi.hoisted(() => ({
  workspaceRow: null as Record<string, unknown> | null,
  logoRow: null as Record<string, unknown> | null,
  assetRow: null as Record<string, unknown> | null,
  /** The `asset_logo_facts` row this deploy holds, and what reading it answers. */
  factsRow: null as Record<string, unknown> | null,
  factsError: null as { code: string } | null,
  /** What the upsert answers, and whether it throws instead. */
  writeError: null as { code: string; message?: string } | null,
  writeThrows: false,
  /** Every row the writer sent. */
  writes: [] as Record<string, unknown>[],
  factsReads: 0,
  decodes: 0,
  downloads: 0,
  /** What storage answers with. Never null here: the download path has its own tests. */
  fileBytes: null as Uint8Array | null,
}))

vi.mock('server-only', () => ({}))

/** A memoising `cache`, standing in for the request-scoped real one. */
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

/**
 * The real sharp, counted. Mocking it away would make "did not decode" a claim
 * about a mock; delegating keeps the measured facts genuinely measured, so a
 * test that expects a decode still checks the numbers it produces.
 */
vi.mock('sharp', async () => {
  const actual = await vi.importActual<{ default: typeof sharp }>('sharp')
  return {
    default: (...args: Parameters<typeof sharp>) => {
      state.decodes += 1
      return actual.default(...args)
    },
  }
})

vi.mock('@/lib/posts/media-url', () => ({
  signMediaPreviews: (rows: { id: string }[]) =>
    Promise.resolve(rows.map((row) => ({ id: row.id, url: 'https://signed.test/logo.png' }))),
}))

vi.mock('@/lib/supabase/server', () => {
  const chainFor = (table: string) => {
    let columns = ''
    const chain: Record<string, unknown> = {
      select: (cols: string) => {
        columns = cols
        return chain
      },
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      upsert: (row: Record<string, unknown>) => {
        if (state.writeThrows) throw new Error('transport failed')
        state.writes.push(row)
        return Promise.resolve({ data: null, error: state.writeError })
      },
      maybeSingle: () => {
        if (table === 'asset_logo_facts') {
          state.factsReads += 1
          return Promise.resolve({ data: state.factsRow, error: state.factsError })
        }
        if (table === 'workspaces') {
          return Promise.resolve({ data: state.workspaceRow, error: null })
        }
        // Only this reader's own `assets` read asks for `bytes`.
        return columns.includes('bytes')
          ? Promise.resolve({ data: state.assetRow, error: null })
          : Promise.resolve({ data: state.logoRow, error: null })
      },
    }
    return chain
  }

  return {
    createServerSupabase: () => ({
      from: (table: string) => chainFor(table),
      storage: {
        from: () => ({
          download: () => {
            state.downloads += 1
            const bytes = state.fileBytes!
            return Promise.resolve({
              data: { arrayBuffer: () => Promise.resolve(bytes.slice().buffer) },
              error: null,
            })
          },
        }),
      },
    }),
  }
})

/**
 * A knockout PNG: 20x10, fully transparent, with an opaque red 4x4 block at
 * (4, 2). Its facts are a consequence of those numbers and checkable by hand.
 */
async function transparentLogoPng(): Promise<Uint8Array> {
  const width = 20
  const height = 10
  const raw = Buffer.alloc(width * height * 4, 0)
  for (let y = 2; y <= 5; y += 1) {
    for (let x = 4; x <= 7; x += 1) {
      const offset = (y * width + x) * 4
      raw[offset] = 255
      raw[offset + 3] = 255
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

/** What the fixture above genuinely measures to. */
const MEASURED = {
  hasAlpha: true,
  transparentBackground: true,
  trim: { x: 4, y: 2, width: 4, height: 4 },
  inkPolarity: 'dark',
  shapeClass: 'square',
  meanInkLuminance: 0.2126000000000001,
  darkInkShare: 1,
  lightInkShare: 0,
}

const ASSET_UPDATED_AT = '2026-09-01T10:00:00.000Z'

/** A stored row that disagrees with the fixture on every fact it holds. */
function storedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    asset_id: ASSET,
    workspace_id: WORKSPACE,
    has_alpha: false,
    transparent_background: false,
    trim_x: 1,
    trim_y: 1,
    trim_width: 2,
    trim_height: 3,
    ink_polarity: 'light',
    shape_class: 'tall',
    computed_at: '2026-09-01T11:00:00.000Z',
    created_at: '2026-09-01T11:00:00.000Z',
    updated_at: '2026-09-01T11:00:00.000Z',
    ...overrides,
  }
}

/** `cache()` memoises for the life of the module, so each read is a fresh one. */
async function read() {
  const mod = await import('./logo-bytes')
  return mod.readBrandLogoBytes(WORKSPACE)
}

beforeEach(async () => {
  state.workspaceRow = { logo_asset_id: ASSET }
  state.logoRow = { id: ASSET, storage_path: `${WORKSPACE}/library/logo.png`, deleted_at: null }
  state.assetRow = {
    id: ASSET,
    storage_path: `${WORKSPACE}/library/logo.png`,
    bytes: 400,
    updated_at: ASSET_UPDATED_AT,
  }
  state.factsRow = null
  state.factsError = null
  state.writeError = null
  state.writeThrows = false
  state.writes = []
  state.fileBytes = await transparentLogoPng()
  // Counted AFTER the fixture is built: `transparentLogoPng` encodes with the
  // same counted sharp, so resetting before it would charge every test one
  // decode it never made and every "did not decode" claim would be off by one.
  state.factsReads = 0
  state.decodes = 0
  state.downloads = 0
  vi.resetModules()
})

describe('logo facts, computed once and stored', () => {
  it('decodes on a miss and writes what it measured', async () => {
    const result = await read()

    expect(result?.facts).toEqual(MEASURED)
    expect(state.decodes, 'a miss must decode the file').toBe(1)
    expect(state.writes).toHaveLength(1)

    const written = state.writes[0]!
    expect(written).toMatchObject({
      asset_id: ASSET,
      workspace_id: WORKSPACE,
      has_alpha: true,
      transparent_background: true,
      trim_x: 4,
      trim_y: 2,
      trim_width: 4,
      trim_height: 4,
      ink_polarity: 'dark',
      shape_class: 'square',
    })
    // Set by the writer, never left to the column default: the default only
    // fires on an insert, and a recomputation must move the freshness stamp.
    expect(typeof written.computed_at).toBe('string')
    expect(Number.isNaN(Date.parse(written.computed_at as string))).toBe(false)
  })

  it('reads the stored row back and does not decode', async () => {
    state.factsRow = storedRow()

    const result = await read()

    expect(state.decodes, 'a hit must not decode the file').toBe(0)
    expect(state.writes, 'a hit writes nothing').toHaveLength(0)
    expect(result?.facts).toEqual({
      hasAlpha: false,
      transparentBackground: false,
      trim: { x: 1, y: 1, width: 2, height: 3 },
      inkPolarity: 'light',
      shapeClass: 'tall',
    })
  })

  /**
   * ── THE ROW IS KEYED TO THE FILE IT DESCRIBES ─────────────────────────────
   * The table carries no content hash, so freshness is `computed_at` against the
   * asset row's own `updated_at`. Facts computed BEFORE the asset last changed
   * are not served: a mark placed from a previous file's trim box lands in the
   * wrong place, and one plated from a previous file's ink polarity is plated
   * wrongly.
   */
  it('does not serve facts computed before the asset last changed', async () => {
    state.factsRow = storedRow({ computed_at: '2026-08-30T09:00:00.000Z' })

    const result = await read()

    expect(result?.facts, 'the stale row must not reach the caller').toEqual(MEASURED)
    expect(state.decodes, 'a stale row is measured again').toBe(1)
    expect(state.writes[0], 'and the fresh answer replaces it').toMatchObject({ trim_x: 4 })
  })

  /** The boundary: computed at the same instant the asset last changed is current. */
  it('serves a row computed at exactly the asset time', async () => {
    state.factsRow = storedRow({ computed_at: ASSET_UPDATED_AT })

    const result = await read()

    expect(state.decodes).toBe(0)
    expect(result?.facts.inkPolarity).toBe('light')
  })

  /**
   * ── THE THREE FIELDS THE TABLE HAS NO COLUMN FOR ──────────────────────────
   * `meanInkLuminance`, `darkInkShare` and `lightInkShare` postdate the
   * migration. They are read only for a `mixed` mark, so a `mixed` row cannot
   * answer in full and is never served. `plateDecisionFor` reads an absent
   * measurement as "plate unconditionally", so serving one would change the
   * picture that gets drawn.
   */
  it('never serves a mixed row, and measures the three unstorable fields instead', async () => {
    state.factsRow = storedRow({ ink_polarity: 'mixed' })

    const result = await read()

    expect(state.decodes, 'a mixed row cannot answer, so the file is measured').toBe(1)
    expect(result?.facts.meanInkLuminance, 'a real measurement, never a default').toBe(
      MEASURED.meanInkLuminance,
    )
    expect(result?.facts.darkInkShare).toBe(1)
  })

  /** A row that is not a row this code understands is a miss, not a crash. */
  it('measures the file when the stored row will not parse', async () => {
    state.factsRow = { asset_id: ASSET, ink_polarity: 'chartreuse' }

    expect((await read())?.facts).toEqual(MEASURED)
    expect(state.decodes).toBe(1)
  })

  it('measures the file when the stored row cannot be read', async () => {
    state.factsRow = null
    state.factsError = { code: '42P01' }

    expect((await read())?.facts).toEqual(MEASURED)
    expect(state.decodes).toBe(1)
  })

  it('still stamps the logo when the write is refused', async () => {
    state.writeError = { code: '42501', message: 'row-level security' }

    expect((await read())?.facts).toEqual(MEASURED)
  })

  it('still stamps the logo when the write throws', async () => {
    state.writeThrows = true

    expect((await read())?.facts).toEqual(MEASURED)
  })

  /**
   * The request-scoped `cache()` still holds: four pictures in one generation
   * ask four times, and neither the network nor the decode happens twice.
   */
  it('asks the cache once per request, not once per picture', async () => {
    const mod = await import('./logo-bytes')

    await mod.readBrandLogoBytes(WORKSPACE)
    await mod.readBrandLogoBytes(WORKSPACE)

    expect(state.downloads).toBe(1)
    expect(state.factsReads).toBe(1)
    expect(state.decodes).toBe(1)
  })
})
