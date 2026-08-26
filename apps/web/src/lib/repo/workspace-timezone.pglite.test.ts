import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bootFullSchema } from '@sahoda/db/testing'

/**
 * `workspaces.timezone` — the column, and the trigger that keeps it truthful.
 *
 * ── THE DEFECT THIS PREVENTS ─────────────────────────────────────────────────
 * A wrong timezone does not fail. It produces a confidently wrong number, every
 * time, for one customer, in a feature that exists to tell them when to post.
 * `Asia/Kolkatta` is one keystroke from the real zone, passes any shape test a
 * CHECK could express, and would shift every hour this product ever reports for
 * that business. So the value is validated against the zones Postgres actually
 * knows, which a CHECK cannot do — the catalog lookup is STABLE, not IMMUTABLE
 * — and a trigger is therefore the only place the real test can live.
 *
 * ── WHY NULL IS NOT A HOLE TO BE FILLED ──────────────────────────────────────
 * MEASURED 2026-08-26 against production: 32 of 33 workspaces have no timezone
 * anywhere. A default of `UTC` or `Asia/Kolkata` would turn every one of those
 * into a confident claim about where somebody lives. The tests below pin the
 * absence as deliberate, so a later session that "fixes the missing default"
 * has to argue with a failing test rather than with a comment.
 */

const WS = '11111111-1111-4111-8111-111111111111'
const USER = 'user_pglite_ws'

describe('workspaces.timezone', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootFullSchema()
  })

  beforeEach(async () => {
    await db.exec('begin')
    await db.query(`insert into workspaces (id, name, slug, created_by) values ($1, $2, $3, $4)`, [
      WS,
      'Brain WS',
      'brain-ws',
      USER,
    ])
  })

  afterEach(async () => {
    await db.exec('rollback')
  })

  it('starts as nothing, and nothing is a real answer', async () => {
    const r = await db.query<{ timezone: string | null }>(
      `select timezone from workspaces where id = $1`,
      [WS],
    )
    expect(r.rows[0]?.timezone).toBeNull()
  })

  it('accepts a zone Postgres knows', async () => {
    await db.query(`update workspaces set timezone = 'Asia/Kolkata' where id = $1`, [WS])
    const r = await db.query<{ timezone: string }>(
      `select timezone from workspaces where id = $1`,
      [WS],
    )
    expect(r.rows[0]?.timezone).toBe('Asia/Kolkata')
  })

  it('REFUSES a plausible typo rather than storing a zone that does not exist', async () => {
    await expect(
      db.query(`update workspaces set timezone = 'Asia/Kolkatta' where id = $1`, [WS]),
    ).rejects.toThrow(/not a zone this database knows/)
  })

  it('refuses one on an INSERT too, not only on the correction afterwards', async () => {
    await expect(
      db.query(
        `insert into workspaces (id, name, slug, created_by, timezone)
         values ('22222222-2222-4222-8222-222222222222', 'Second', 'second', $1, 'Mars/Olympus')`,
        [USER],
      ),
    ).rejects.toThrow(/not a zone this database knows/)
  })

  it('lets a workspace be renamed without its timezone being re-examined', async () => {
    // The trigger is `update of timezone`, so an ordinary rename never reaches
    // it. Worth pinning: a trigger on every column would put a catalog lookup
    // in front of every workspace write in the product.
    await db.query(`update workspaces set name = 'Renamed' where id = $1`, [WS])
    const r = await db.query<{ name: string }>(`select name from workspaces where id = $1`, [WS])
    expect(r.rows[0]?.name).toBe('Renamed')
  })

  it('can be cleared back to nothing, because an answer can be withdrawn', async () => {
    await db.query(`update workspaces set timezone = 'Europe/London' where id = $1`, [WS])
    await db.query(`update workspaces set timezone = null where id = $1`, [WS])
    const r = await db.query<{ timezone: string | null }>(
      `select timezone from workspaces where id = $1`,
      [WS],
    )
    expect(r.rows[0]?.timezone).toBeNull()
  })
})

describe('the three intake columns', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootFullSchema()
  })

  beforeEach(async () => {
    await db.exec('begin')
    await db.query(`insert into workspaces (id, name, slug, created_by) values ($1, $2, $3, $4)`, [
      WS,
      'Brain WS',
      'brain-ws',
      USER,
    ])
  })

  afterEach(async () => {
    await db.exec('rollback')
  })

  it('all start as nothing, because most businesses have not been asked', async () => {
    const r = await db.query<{
      business_model: string | null
      regime: string | null
      locale: string | null
    }>(`select business_model, regime, locale from workspaces where id = $1`, [WS])
    expect(r.rows[0]).toEqual({ business_model: null, regime: null, locale: null })
  })

  it('stores the three picks onboarding produces', async () => {
    await db.query(
      `update workspaces
          set business_model = 'local_presence', regime = 'food', locale = 'IN'
        where id = $1`,
      [WS],
    )
    const r = await db.query<{ regime: string; business_model: string; locale: string }>(
      `select business_model, regime, locale from workspaces where id = $1`,
      [WS],
    )
    expect(r.rows[0]).toEqual({ business_model: 'local_presence', regime: 'food', locale: 'IN' })
  })

  it('refuses a regime nobody can be classified into', async () => {
    await expect(
      db.query(`update workspaces set regime = 'plumbing' where id = $1`, [WS]),
    ).rejects.toThrow()
  })

  it('refuses a business model outside the list', async () => {
    await expect(
      db.query(`update workspaces set business_model = 'franchise' where id = $1`, [WS]),
    ).rejects.toThrow()
  })

  it('refuses a locale outside the list', async () => {
    await expect(
      db.query(`update workspaces set locale = 'ZZ' where id = $1`, [WS]),
    ).rejects.toThrow()
  })

  it('goes when the workspace is erased, because it went before this column existed', async () => {
    // The regression this pins: the one workspace holding a timezone today
    // holds it inside `settings`, which `erase_workspace` blanks. Copying it
    // into a column the erasure does not touch would quietly weaken a deletion
    // promise, in a migration that is not about deletion.
    await db.query(
      `update workspaces
          set timezone = 'Asia/Kolkata', business_model = 'local_presence',
              regime = 'food', locale = 'IN'
        where id = $1`,
      [WS],
    )

    await db.query(`update workspaces set deleted_at = now() where id = $1`, [WS])

    const r = await db.query<{
      timezone: string | null
      business_model: string | null
      regime: string | null
      locale: string | null
    }>(`select timezone, business_model, regime, locale from workspaces where id = $1`, [WS])
    expect(r.rows[0]).toEqual({
      timezone: null,
      business_model: null,
      regime: null,
      locale: null,
    })
  })

  it('clears on the erasure ITSELF, not on every later touch of deleted_at', async () => {
    // Found by mutation: replacing the trigger's condition with `if true` left
    // every test green, because nothing here had ever written `deleted_at` on a
    // workspace that was not being erased. The condition was untested and so
    // was not yet a guard.
    //
    // The path it protects: a workspace restored by clearing `deleted_at`, then
    // given a profile again. A later write to that column must not wipe it.
    await db.query(`update workspaces set deleted_at = now() where id = $1`, [WS])
    await db.query(`update workspaces set deleted_at = null where id = $1`, [WS])
    await db.query(`update workspaces set regime = 'food' where id = $1`, [WS])

    await db.query(`update workspaces set deleted_at = null where id = $1`, [WS])

    const r = await db.query<{ regime: string | null }>(
      `select regime from workspaces where id = $1`,
      [WS],
    )
    expect(r.rows[0]?.regime).toBe('food')
  })

  it('leaves a live workspace alone when some other column is updated', async () => {
    await db.query(`update workspaces set regime = 'beauty' where id = $1`, [WS])
    await db.query(`update workspaces set name = 'Renamed' where id = $1`, [WS])
    const r = await db.query<{ regime: string | null }>(
      `select regime from workspaces where id = $1`,
      [WS],
    )
    expect(r.rows[0]?.regime).toBe('beauty')
  })

  it('never lets a locale be read as a timezone', async () => {
    // `IN` is a jurisdiction. India happens to be one zone; the United States
    // is not, and `other` is not a place at all. The two columns are separate
    // on purpose and this pins that they do not constrain each other.
    await db.query(`update workspaces set locale = 'US' where id = $1`, [WS])
    const r = await db.query<{ timezone: string | null }>(
      `select timezone from workspaces where id = $1`,
      [WS],
    )
    expect(r.rows[0]?.timezone).toBeNull()
  })
})
