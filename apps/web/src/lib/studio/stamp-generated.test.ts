import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE STAMPING STEP, PROVEN TO COST A GENERATION NOTHING WHEN IT FAILS.
 *
 * ── WHAT THIS FILE IS ACTUALLY GUARDING ─────────────────────────────────────
 * One claim: a stamp failure is never a generation failure. Every case below is
 * a different way stamping can go wrong (no logo, a refusal, a dead upload, a
 * dead row insert, a client that throws) and every one of them asserts the same
 * two things: `null` came back, and nothing was left behind. `null` alone is not
 * enough. An upload that succeeded followed by a row that failed leaves bytes in
 * a private bucket that no row names, which nothing can ever reach or delete, so
 * the removal is asserted by path.
 *
 * ── THE PIXELS ARE REAL, THE DATABASE IS NOT ────────────────────────────────
 * `stampLogo` and `sharp` run for real against real encoded images, because the
 * interesting failures in compositing are geometric and a stubbed compositor
 * proves none of them. Supabase is a fake, and it is a PARAMETER rather than a
 * module mock: the function takes the caller's own client, which is what keeps
 * the write scoped to the caller's token.
 *
 * ── WHY THE RETURNED ID IS COMPARED, NOT SHAPE-CHECKED ──────────────────────
 * The stamped picture is a NEW asset beside the original. A function that
 * returned the logo's id, or the original picture's, would still return a uuid
 * and still satisfy `expect.any(String)`. So the id is asserted to equal the id
 * of the row that was actually inserted, and to differ from the logo's.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const USER = 'user_abc'
const LOGO_ASSET = '33333333-3333-4333-8333-333333333333'

interface Inserted {
  table: string
  row: Record<string, unknown>
}

const state = vi.hoisted(() => ({
  logo: null as { assetId: string; bytes: Uint8Array; facts: unknown } | null,
  logoThrows: false,
  theme: null as Record<string, unknown> | null,
  uploads: [] as string[],
  uploadError: null as { message: string } | null,
  uploadThrows: false,
  removed: [] as string[],
  inserted: [] as Inserted[],
  insertError: null as { message: string } | null,
  insertThrows: false,
  /**
   * Whether a logo POINTER exists, independent of whether its bytes read.
   *
   * The two are separate facts and the module now separates them: bytes that
   * will not read plus a pointer is `logo_unreadable` (replace the file), and
   * no pointer at all is `no_logo` (add one). Offering the wrong remedy of
   * those two is the impossible remedy this product forbids.
   */
  logoPointer: null as { assetId: string } | null,
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/brand/logo-bytes', () => ({
  readBrandLogoBytes: async () => {
    if (state.logoThrows) throw new Error('storage exploded')
    return state.logo
  },
}))

vi.mock('@/lib/brand/logo', () => ({
  readBrandLogo: async () => state.logoPointer,
}))

vi.mock('@/lib/brand/read-theme', () => ({
  activeThemeTokens: async () => state.theme,
}))

import { stampGeneratedPicture } from './stamp-generated'

/** A fake of exactly the surface this module touches, and nothing else. */
function fakeSupabase() {
  return {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (state.insertThrows) throw new Error('postgrest exploded')
        state.inserted.push({ table, row })
        return Promise.resolve({ error: state.insertError })
      },
    }),
    storage: {
      from: () => ({
        upload: (path: string) => {
          if (state.uploadThrows) throw new Error('storage exploded')
          if (state.uploadError === null) state.uploads.push(path)
          return Promise.resolve({ error: state.uploadError })
        },
        remove: (paths: string[]) => {
          state.removed.push(...paths)
          return Promise.resolve({ error: null })
        },
      }),
    },
  }
}

/** A 1080x1080 white picture, the square preset's real canvas. */
async function picturePng(): Promise<Uint8Array> {
  const png = await sharp({
    create: { width: 1080, height: 1080, channels: 3, background: { r: 250, g: 250, b: 250 } },
  })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

/**
 * A 20x10 knockout PNG with an opaque dark 4x4 block whose top-left corner is at
 * (4, 2). The facts below are that rectangle stated by hand, which is what makes
 * the placement checkable: the trim box is the mark, not the file.
 */
async function logoPng(): Promise<Uint8Array> {
  const width = 20
  const height = 10
  const raw = Buffer.alloc(width * height * 4, 0)
  for (let y = 2; y < 6; y += 1) {
    for (let x = 4; x < 8; x += 1) {
      const at = (y * width + x) * 4
      raw[at] = 20
      raw[at + 1] = 20
      raw[at + 2] = 20
      raw[at + 3] = 255
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

const FACTS = {
  hasAlpha: true,
  transparentBackground: true,
  trim: { x: 4, y: 2, width: 4, height: 4 },
  inkPolarity: 'dark' as const,
  shapeClass: 'square' as const,
}

let picture: Uint8Array
let logoBytes: Uint8Array

beforeEach(async () => {
  picture ??= await picturePng()
  logoBytes ??= await logoPng()

  state.logo = { assetId: LOGO_ASSET, bytes: logoBytes, facts: FACTS }
  state.logoThrows = false
  state.theme = null
  state.uploads = []
  state.uploadError = null
  state.uploadThrows = false
  state.removed = []
  state.inserted = []
  state.insertError = null
  state.insertThrows = false
})

function run() {
  return stampGeneratedPicture({
    workspaceId: WORKSPACE,
    userId: USER,
    picture,
    supabase: fakeSupabase() as never,
  })
}

describe('stampGeneratedPicture', () => {
  it('stores the stamped picture as a NEW asset and returns that new id', async () => {
    const result = await run()

    // NARROWED, not asserted away. This module used to answer
    // `StampedPicture | null`, so `result!.assetId` was the only shape there
    // was; now the answer carries WHY, and only the `stamped` arm has an id.
    // Reading the id off an unnarrowed union is what the compiler refused.
    expect(result.outcome).toBe('stamped')
    if (result.outcome !== 'stamped') throw new Error('expected a stamped result')
    expect(state.inserted).toHaveLength(1)
    const row = state.inserted[0]!
    expect(row.table).toBe('assets')
    // The id it returned is the row it wrote, and it is neither the logo nor
    // anything else already in the library.
    expect(result.assetId).toBe(row.row.id)
    expect(result.assetId).not.toBe(LOGO_ASSET)
    expect(row.row.workspace_id).toBe(WORKSPACE)
    expect(row.row.created_by).toBe(USER)
    expect(row.row.mime).toBe('image/png')
    // The canvas is unchanged: a stamp signs a picture, it does not resize one.
    expect(row.row.width).toBe(1080)
    expect(row.row.height).toBe(1080)
    // One object, under this workspace's own prefix, named for the new row.
    expect(state.uploads).toEqual([`${WORKSPACE}/assets/${row.row.id as string}.png`])
    expect(state.removed).toEqual([])
  })

  it('never gives the stamped copy a title, so it can never become the workspace logo', async () => {
    await run()
    // `readBrandLogo` finds the logo by the title `Logo`. A titled stamped copy
    // would make every later generation stamp itself with the last picture drawn.
    expect(state.inserted[0]!.row).not.toHaveProperty('title')
  })

  it('leaves the picture it was given byte-identical', async () => {
    const before = picture.slice()
    await run()
    expect(picture).toEqual(before)
  })

  it('says no_logo and uploads nothing when the workspace has no logo', async () => {
    state.logo = null
    state.logoPointer = null

    await expect(run()).resolves.toEqual({ outcome: 'no_logo' })
    expect(state.uploads).toEqual([])
    expect(state.inserted).toEqual([])
  })

  /**
   * ── THE TWO THE OLD NULL COULD NOT TELL APART ─────────────────────────────
   * `readBrandLogoBytes` answers null for a workspace with no logo AND for one
   * whose logo file will not decode. The remedies are opposite: add a logo, or
   * replace the one you added. Telling somebody to add a logo they already
   * uploaded is exactly the dead end `no-impossible-remedy.spec.ts` exists for.
   */
  it('says logo_unreadable when a logo exists and its bytes will not read', async () => {
    state.logo = null
    state.logoPointer = { assetId: LOGO_ASSET }

    await expect(run()).resolves.toEqual({ outcome: 'logo_unreadable' })
    expect(state.uploads).toEqual([])
    expect(state.inserted).toEqual([])
  })

  it('says failed and uploads nothing when the stamp is refused', async () => {
    // A logo with no ink: `stampLogo` refuses rather than placing an empty mark.
    state.logo = { assetId: LOGO_ASSET, bytes: logoBytes, facts: { ...FACTS, trim: null } }

    await expect(run()).resolves.toEqual({ outcome: 'failed' })
    expect(state.uploads).toEqual([])
    expect(state.inserted).toEqual([])
  })

  it('says failed and leaves no asset row when the upload fails', async () => {
    state.uploadError = { message: 'bucket unavailable' }

    await expect(run()).resolves.toEqual({ outcome: 'failed' })
    expect(state.inserted).toEqual([])
    expect(state.uploads).toEqual([])
  })

  it('removes the uploaded object when the asset row fails', async () => {
    state.insertError = { message: 'row rejected' }

    await expect(run()).resolves.toEqual({ outcome: 'failed' })
    expect(state.inserted).toHaveLength(1)
    // The exact object it just wrote, not "something was removed".
    expect(state.removed).toEqual([
      `${WORKSPACE}/assets/${state.inserted[0]!.row.id as string}.png`,
    ])
  })

  it('never throws, whatever fails', async () => {
    const cases: Array<[string, () => void]> = [
      ['the logo read throws', () => (state.logoThrows = true)],
      ['the upload throws', () => (state.uploadThrows = true)],
      ['the asset insert throws', () => (state.insertThrows = true)],
    ]

    for (const [name, arrange] of cases) {
      state.uploads = []
      state.removed = []
      state.inserted = []
      state.logoThrows = false
      state.logoPointer = null
      state.uploadThrows = false
      state.insertThrows = false
      arrange()
      // The CLAIM is unchanged — nothing is stamped and nothing throws — and it
      // is now stated as the outcome the caller records rather than as a null.
      await expect(run(), name).resolves.toEqual({ outcome: 'failed' })
    }
  })

  it('removes the object when the client throws after the upload landed', async () => {
    state.insertThrows = true

    await expect(run()).resolves.toEqual({ outcome: 'failed' })
    expect(state.uploads).toHaveLength(1)
    expect(state.removed).toEqual(state.uploads)
  })
})

describe('the plate colour', () => {
  /**
   * The plate is only worth taking from the brand when it actually separates the
   * mark. These two cases are the reason `plateColour` is not simply
   * `surface[0]`: a brand whose canvas is a mid grey would get a plate the same
   * lightness as its own dark ink, which is worse than no plate at all.
   */
  const themeWith = (surface0: string) => ({
    primary: 'oklch(0.6 0.2 30)',
    primaryFg: 'oklch(1 0 0)',
    secondary: 'oklch(0.6 0.1 200)',
    accent: 'oklch(0.7 0.2 60)',
    surface: [surface0, 'oklch(0.98 0 0)', 'oklch(0.96 0 0)', 'oklch(0.94 0 0)'],
    text: { hi: 'oklch(0.2 0 0)', mid: 'oklch(0.5 0 0)', low: 'oklch(0.7 0 0)' },
    border: 'oklch(0.9 0 0)',
    success: 'oklch(0.6 0.2 145)',
    warning: 'oklch(0.8 0.2 85)',
    danger: 'oklch(0.6 0.2 25)',
    radius: '12px',
    fontHeading: 'Inter',
    fontBody: 'Inter',
  })

  it('still stamps when the brand surface is unusable behind this ink', async () => {
    state.theme = themeWith('oklch(0.5 0 0)')

    expect((await run()).outcome).toBe('stamped')
  })

  it('still stamps when the brand colour will not parse', async () => {
    state.theme = themeWith('not-a-colour')

    expect((await run()).outcome).toBe('stamped')
  })
})
