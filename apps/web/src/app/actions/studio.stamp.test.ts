import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * STAMPING RIDES ALONG WITH A GENERATION, AND CANNOT COST IT ANYTHING.
 *
 * ── WHY THE STAMP PATH IS NOT MOCKED HERE ───────────────────────────────────
 * The claim under test is a wiring claim: that a failure deep inside stamping
 * cannot reach the `withCredits` callback, where a throw releases the hold and
 * turns a picture somebody already has into refusal copy. Mocking
 * `stampGeneratedPicture` would test the mock's promise not to throw, and a
 * mutation inside the real module would sail past. So the real module runs and
 * its DEPENDENCIES are mocked: `readBrandLogoBytes` throwing is the deepest
 * failure the path has, and it is exactly what a dead storage client looks like.
 *
 * ── AND WHY THE MONEY IS ASSERTED TWICE ─────────────────────────────────────
 * Once at the wrapper (`withCredits` was entered exactly once, so exactly one
 * hold existed) and once at the record (`cost_credits` on the finished row).
 * Stamping is local compute: a second charge for it would be a customer paying
 * twice for one picture, and the two assertions fail on different mistakes. A
 * duplicated `charged +=` moves the record and not the wrapper count.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const GENERATION = '44444444-4444-4444-8444-444444444444'
const LOGO_ASSET = '33333333-3333-4333-8333-333333333333'

interface Inserted {
  table: string
  row: Record<string, unknown>
}

const state = vi.hoisted(() => ({
  logo: null as { assetId: string; bytes: Uint8Array; facts: unknown } | null,
  logoThrows: false,
  base64: '',
  inserted: [] as Inserted[],
  /** Per table, so one table can be made to fail without touching the others. */
  insertErrors: {} as Record<string, { code?: string; message: string } | null>,
  /**
   * Which inserts an error applies to, per table. Defaults to every one.
   *
   * ── WHY THIS EXISTS, AND WHAT IT WAS BEFORE ────────────────────────────────
   * `insertErrors` used to fail EVERY insert into a table, and the `42703` test
   * below set it and passed. It passed because the retry's `.error` was never
   * read: this fake was describing a table where the second write fails too,
   * the code was quietly ignoring that, and the assertion could not tell the
   * difference. `wt-core` gave that insert an error check on 2026-09-01 and the
   * fixture went red at once — correctly, because a retry that also fails must
   * roll the generation back rather than charge for a lost record.
   *
   * A missing column fails the write that NAMES it and nothing else, which is
   * what this models. A fake that is wrong in the direction of the code being
   * tested is not a fixture, it is an alibi.
   */
  insertErrorWhen: {} as Record<string, (row: Record<string, unknown>) => boolean>,
  /** Rows deleted, as `table:id`, and objects removed from storage. */
  deleted: [] as string[],
  removed: [] as string[],
  updates: [] as Record<string, unknown>[],
  uploads: [] as string[],
  withCreditsCalls: 0,
  /** How many times the logo file was actually read. Zero proves stamping never ran. */
  logoReads: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: async () => ({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/actions/revalidate-balance', () => ({ revalidateBalance: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/studio/brand-signals', () => ({ brandSignalsFor: async () => [] }))
vi.mock('@/app/actions/assets', () => ({ attachAssetToPost: vi.fn() }))
vi.mock('@/app/actions/posts', () => ({ createPost: vi.fn() }))

vi.mock('@/lib/brand/logo-bytes', () => ({
  // BOTH readers, because `stamp-generated.ts` now asks for the variants so it
  // can choose a mark that reads on the picture rather than plating behind the
  // only one it has. `light` is the single-logo workspace every existing test
  // describes; `dark` null keeps them describing exactly that.
  readBrandLogoBytesVariants: async () => {
    // Counted here, because this is the reader the stamping path actually calls
    // now. Leaving the counter on the single-file reader would have "never reads
    // the logo file" pass while the code read it through the other door — the
    // test would have been describing a call site that no longer exists.
    state.logoReads += 1
    if (state.logoThrows) throw new Error('storage exploded')
    return { light: state.logo, dark: null }
  },
  readBrandLogoBytes: async () => {
    state.logoReads += 1
    if (state.logoThrows) throw new Error('storage exploded')
    return state.logo
  },
}))
vi.mock('@/lib/brand/read-theme', () => ({ activeThemeTokens: async () => null }))

vi.mock('@sahoda/mesh', () => ({
  createMesh: () => ({
    runImage: async () => ({
      ok: true,
      data: { base64: state.base64, mime: 'image/png', providerCostUsd: 0.01 },
    }),
  }),
}))

vi.mock('@sahoda/billing', () => ({
  loadBillingEnv: () => ({ databaseUrl: 'postgres://test' }),
  createPgLedgerPort: () => ({}),
  createWithCredits:
    () => async (config: { action: string }, callback: (ctx: unknown) => Promise<unknown>) => {
      state.withCreditsCalls += 1
      try {
        await callback({ actionType: config.action, creditsCharged: 1 })
        return { ok: true, data: { balanceAfter: 41 } }
      } catch {
        return { ok: false, error: { code: 'PROVIDER_ERROR' } }
      }
    },
}))

vi.mock('@/lib/supabase/server', () => {
  const thenable = <T>(answer: T) => ({
    eq() {
      return this
    },
    in() {
      return this
    },
    select: () => ({ single: async () => ({ data: { id: GENERATION }, error: null }) }),
    then: (res: (value: T) => unknown, rej: (reason: unknown) => unknown) =>
      Promise.resolve(answer).then(res, rej),
  })

  return {
    createServerSupabase: () => ({
      from: (table: string) => ({
        insert: (row: Record<string, unknown>) => {
          state.inserted.push({ table, row })
          const when = state.insertErrorWhen[table]
          const applies = when === undefined || when(row)
          return thenable({ error: (applies ? state.insertErrors[table] : null) ?? null })
        },
        update: (row: Record<string, unknown>) => {
          state.updates.push(row)
          return thenable({ error: null })
        },
        delete: () => ({
          eq(_column: string, value: string) {
            state.deleted.push(`${table}:${value}`)
            return thenable({ error: null })
          },
        }),
        select: () => thenable({ data: [], error: null }),
      }),
      storage: {
        from: () => ({
          upload: (path: string) => {
            state.uploads.push(path)
            return Promise.resolve({ error: null })
          },
          remove: (paths: string[]) => {
            state.removed.push(...paths)
            return Promise.resolve({ error: null })
          },
        }),
      },
    }),
  }
})

import { queueGeneration } from './studio'

/** A 1080x1080 picture, the square preset's real canvas. */
async function pictureBase64(): Promise<string> {
  const png = await sharp({
    create: { width: 1080, height: 1080, channels: 3, background: { r: 250, g: 250, b: 250 } },
  })
    .png()
    .toBuffer()
  return png.toString('base64')
}

/** A 20x10 knockout PNG whose dark 4x4 mark sits at (4, 2). */
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

const REQUEST = {
  mode: 'explore',
  wanted: 'a loaf of bread on a wooden board',
  formatId: 'square',
  referenceAssetIds: [],
  count: 1,
}

let logoBytes: Uint8Array

beforeEach(async () => {
  state.base64 ||= await pictureBase64()
  logoBytes ??= await logoPng()

  state.logo = { assetId: LOGO_ASSET, bytes: logoBytes, facts: FACTS }
  state.logoThrows = false
  state.inserted = []
  state.insertErrors = {}
  state.insertErrorWhen = {}
  state.deleted = []
  state.removed = []
  state.updates = []
  state.uploads = []
  state.withCreditsCalls = 0
  state.logoReads = 0
})

const imageRow = () => state.inserted.find((one) => one.table === 'studio_generation_images')!
const assetRows = () => state.inserted.filter((one) => one.table === 'assets')
const finished = () => state.updates.find((one) => one.status === 'ready')

describe('a generation that stamps', () => {
  it('records the stamped copy beside the original, as a separate asset', async () => {
    const result = await queueGeneration(REQUEST)

    expect(result).toMatchObject({ ok: true, made: 1 })
    // Two assets: the model's picture and the stamped copy of it.
    expect(assetRows()).toHaveLength(2)
    const original = assetRows()[0]!.row.id
    const stamped = assetRows()[1]!.row.id
    expect(stamped).not.toBe(original)

    // The generation still points at the ORIGINAL. The stamped copy is an
    // addition, and destroying the un-stamped bytes somebody paid for would be
    // the one unrecoverable outcome here.
    expect(imageRow().row.asset_id).toBe(original)
    expect(imageRow().row.stamped_asset_id).toBe(stamped)
  })

  it('costs exactly what a generation without a stamp costs', async () => {
    await queueGeneration(REQUEST)
    const withStamp = { calls: state.withCreditsCalls, cost: finished()!.cost_credits }

    state.logo = null
    state.inserted = []
    state.updates = []
    state.withCreditsCalls = 0
    await queueGeneration(REQUEST)
    const withoutStamp = { calls: state.withCreditsCalls, cost: finished()!.cost_credits }

    expect(withStamp).toEqual(withoutStamp)
    // Stated absolutely as well, so the pair cannot agree by both being wrong.
    expect(withStamp).toEqual({ calls: 1, cost: 1 })
  })
})

describe('a generation with the stamp turned off', () => {
  it('never reads the logo file, produces one asset, and charges exactly the same', async () => {
    const result = await queueGeneration({
      ...REQUEST,
      stamp: { enabled: false, anchor: 'bottom-right', sizeStep: 'medium' },
    })

    expect(result).toMatchObject({ ok: true, made: 1 })
    // Nothing about the logo ran at all, not even a read that would have found one.
    expect(state.logoReads).toBe(0)
    expect(assetRows()).toHaveLength(1)
    expect(imageRow().row.asset_id).toBe(assetRows()[0]!.row.id)
    expect(imageRow().row.stamped_asset_id).toBeNull()
    // ── RECORDED AS A CHOICE, NOT AS AN ABSENCE ─────────────────────────────
    // This asserted `toBeNull()` when the toggle first shipped, and null was the
    // smaller change and a lie: `stamp-copy.ts` renders null as "made before
    // Sahoda placed logos", which is false about a picture somebody drew today
    // with the stamp turned off. A choice the customer made a minute ago and a
    // fact about when the product shipped are not the same sentence.
    expect(imageRow().row.stamp_outcome).toBe('skipped')
    expect(imageRow().row.stamp_outcome).not.toBeNull()
    expect(state.withCreditsCalls).toBe(1)
    expect(finished()!.cost_credits).toBe(1)
  })

  it('costs exactly what a stamped generation costs', async () => {
    await queueGeneration(REQUEST)
    const stamped = { calls: state.withCreditsCalls, cost: finished()!.cost_credits }

    state.inserted = []
    state.updates = []
    state.withCreditsCalls = 0
    await queueGeneration({
      ...REQUEST,
      stamp: { enabled: false, anchor: 'bottom-right', sizeStep: 'medium' },
    })
    const off = { calls: state.withCreditsCalls, cost: finished()!.cost_credits }

    expect(off).toEqual(stamped)
  })

  it('an absent `stamp` field behaves exactly like `{ enabled: true, ... }` (the schema default)', async () => {
    await queueGeneration(REQUEST)
    const noField = { reads: state.logoReads, stampedAssetId: imageRow().row.stamped_asset_id }

    state.inserted = []
    state.logoReads = 0
    await queueGeneration({
      ...REQUEST,
      stamp: { enabled: true, anchor: 'bottom-right', sizeStep: 'medium' },
    })
    const explicitDefault = {
      reads: state.logoReads,
      stampedAssetId: imageRow().row.stamped_asset_id,
    }

    expect(noField.reads).toBeGreaterThan(0)
    expect(explicitDefault.reads).toBe(noField.reads)
    expect(explicitDefault.stampedAssetId).not.toBeNull()
    expect(noField.stampedAssetId).not.toBeNull()
  })
})

describe('a generation whose stamping fails', () => {
  it('still reports success, still charges once, and still keeps the picture', async () => {
    // The deepest failure the stamp path has: the logo read itself throws. A
    // throw that escaped would reach the `withCredits` callback, release the
    // hold, and refuse a picture the customer already has.
    state.logoThrows = true

    const result = await queueGeneration(REQUEST)

    expect(result).toMatchObject({ ok: true, made: 1, asked: 1 })
    expect(state.withCreditsCalls).toBe(1)
    expect(finished()!.cost_credits).toBe(1)
    // One asset, the original, and the record points at it.
    expect(assetRows()).toHaveLength(1)
    expect(imageRow().row.asset_id).toBe(assetRows()[0]!.row.id)
    expect(imageRow().row.stamped_asset_id).toBeNull()
  })

  it('reports success when the workspace has no logo at all', async () => {
    state.logo = null

    const result = await queueGeneration(REQUEST)

    expect(result).toMatchObject({ ok: true, made: 1 })
    expect(assetRows()).toHaveLength(1)
    expect(imageRow().row.stamped_asset_id).toBeNull()
  })
})

describe('the stamped_asset_id column before its migration is applied', () => {
  it('writes the record without the column rather than losing the record', async () => {
    // `42703` is "undefined column": the migration has not been applied on this
    // deploy. The picture is still stamped and stored; only the link is lost.
    state.insertErrors.studio_generation_images = { code: '42703', message: 'no such column' }
    // Postgres refuses the write that NAMES the absent column, not every write.
    state.insertErrorWhen.studio_generation_images = (row) => 'stamped_asset_id' in row

    const result = await queueGeneration(REQUEST)

    expect(result).toMatchObject({ ok: true, made: 1 })
    const attempts = state.inserted.filter((one) => one.table === 'studio_generation_images')
    expect(attempts).toHaveLength(2)
    expect(attempts[0]!.row).toHaveProperty('stamped_asset_id')
    // The retry carries the record and nothing that cannot be written.
    expect(attempts[1]!.row).not.toHaveProperty('stamped_asset_id')
    expect(attempts[1]!.row.asset_id).toBe(assetRows()[0]!.row.id)
  })

  /**
   * ── AND WHEN THE RETRY FAILS TOO ──────────────────────────────────────────
   * Added because a mutation proved the case uncovered: dropping the retry's
   * error check left this file green. That is the same blind spot the old
   * fixture had — it modelled a table where every insert fails and passed
   * anyway — so the fixture and the assertion were wrong together, which is
   * how a fixture becomes an alibi.
   *
   * A retry that fails is not "the column is missing". It is a lost provenance
   * row for a generation somebody paid for, and it must cost a released hold
   * rather than a silent charge.
   */
  it('rolls the generation back when the retry fails as well', async () => {
    state.insertErrors.studio_generation_images = { code: '42703', message: 'no such column' }
    // No `insertErrorWhen`, so BOTH writes are refused.

    const result = await queueGeneration(REQUEST)

    const attempts = state.inserted.filter((one) => one.table === 'studio_generation_images')
    expect(attempts).toHaveLength(2)
    expect(result).toMatchObject({ ok: false })
    expect(state.deleted).toContain(`assets:${assetRows()[0]!.row.id as string}`)
  })
})

describe('a generation rolled back after its picture was already stamped', () => {
  /**
   * ── THE CASE THIS MERGE CREATED, AND WHY IT IS NOT A LOOSE END ─────────────
   * Two changes met on 2026-09-01. `wt-core` gave the `studio_generation_images`
   * insert an error check that DELETES the generation's asset and removes its
   * object, so a lost provenance row costs a released hold rather than a false
   * claim about money. This branch had, one statement earlier, written a SECOND
   * asset: the stamped copy.
   *
   * Neither change is wrong and their combination has a failure neither had.
   * Undoing only the generation's own asset leaves the stamped picture sitting
   * in the customer's library, attached to a generation that was refused and
   * refunded. That is an orphan WITH A THUMBNAIL — strictly worse than an
   * orphan nobody can see, which is the outcome every rollback in this file
   * already exists to prevent.
   */
  it('removes the stamped copy too, not just the original', async () => {
    state.insertErrors.studio_generation_images = { message: 'row rejected' }

    const result = await queueGeneration(REQUEST)

    // Both assets reached the library before the row failed.
    expect(assetRows()).toHaveLength(2)
    const original = assetRows()[0]!.row.id as string
    const stampedId = assetRows()[1]!.row.id as string
    expect(stampedId).not.toBe(original)

    // Both are undone. The stamped one is the one a person would have SEEN.
    expect(state.deleted).toContain(`assets:${stampedId}`)
    expect(state.deleted).toContain(`assets:${original}`)
    expect(state.removed).toHaveLength(2)
    expect(state.uploads.every((path) => state.removed.includes(path))).toBe(true)

    // And nothing is claimed to have been delivered.
    expect(result).toMatchObject({ ok: false })
  })
})
