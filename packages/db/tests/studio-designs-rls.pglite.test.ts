import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { asMember, bootFullSchema, probe } from './helpers/pglite-tenant'

/**
 * studio_designs / studio_exports, WITH RLS ENFORCED.
 *
 * Real Postgres (PGlite), every migration applied, the superuser bit dropped per
 * transaction, so the policies in the migration are the only thing between the
 * two tenants. It never skips: no network, no credential, so green here means a
 * policy actually enforced rather than a suite that declined to run.
 *
 * A third identity, `USER_C`, holds a valid token and belongs to no workspace.
 * It is what proves the policies key on MEMBERSHIP rather than merely on "some
 * other tenant" — a policy that let a stranger read everything would still pass
 * a two-tenant test.
 */

const WS_A = '11111111-0000-4000-8000-aaaaaaaaaaaa'
const WS_B = '22222222-0000-4000-8000-bbbbbbbbbbbb'
const USER_A = 'user_studio_a'
const USER_B = 'user_studio_b'
const USER_C = 'user_studio_none'

const DOC = JSON.stringify({ v: 1, pages: [{ slots: { headline: 'Fresh samosas' } }] })
const SHA_A = 'a'.repeat(64)

type Row = { id: string }

/**
 * `probe` returns `{rows}` OR `{denied}`, and the difference is load-bearing:
 * a policy that returns ZERO ROWS and one that REFUSES THE STATEMENT are
 * different behaviours, and RLS on a select is meant to be the first. Flattening
 * them would let a table that started throwing look identical to a table that
 * correctly hid its rows.
 *
 * So every read below goes through this: it asserts the read was allowed to run,
 * and hands back the rows. A denial fails the test by name rather than
 * disappearing into an empty array.
 */
function rowsOf<T>(result: { rows: T[] } | { denied: string }, what: string): T[] {
  if ('denied' in result) {
    throw new Error(`${what} was DENIED rather than filtered: ${result.denied}`)
  }
  return result.rows
}

describe('Studio design storage RLS (real Postgres, policies enforced)', () => {
  let db: PGlite
  let designA = ''
  let designB = ''
  let assetA = ''

  beforeAll(async () => {
    db = await bootFullSchema()

    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'A', 'studio-a', '${USER_A}'),
        ('${WS_B}', 'B', 'studio-b', '${USER_B}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${USER_A}', 'owner'),
        ('${WS_B}', '${USER_B}', 'owner');
    `)

    const a = await db.query<Row>(
      `insert into studio_designs (workspace_id, title, preset_id, doc, created_by)
       values ('${WS_A}', 'Diwali offer', 'portrait', '${DOC}'::jsonb, '${USER_A}')
       returning id`,
    )
    designA = a.rows[0]!.id

    const b = await db.query<Row>(
      `insert into studio_designs (workspace_id, title, preset_id, doc, created_by)
       values ('${WS_B}', 'Their design', 'square', '${DOC}'::jsonb, '${USER_B}')
       returning id`,
    )
    designB = b.rows[0]!.id

    const asset = await db.query<Row>(
      `insert into assets (workspace_id, storage_path, kind, created_by)
       values ('${WS_A}', '${WS_A}/library/export.png', 'image', '${USER_A}') returning id`,
    )
    assetA = asset.rows[0]!.id

    await db.exec(
      `insert into studio_exports (workspace_id, design_id, asset_id, content_sha256)
       values ('${WS_A}', '${designA}', '${assetA}', '${SHA_A}')`,
    )
  })

  describe('a member sees their own workspace and nothing else', () => {
    it('reads its own designs', async () => {
      const rows = rowsOf(
        await asMember(db, USER_A, (tx) => probe<Row>(tx, `select id from studio_designs`)),
        'member reading own designs',
      )
      expect(rows.map((r) => r.id)).toEqual([designA])
    })

    it('cannot see the other tenant design, and gets zero rows rather than an error', async () => {
      const rows = rowsOf(
        await asMember(db, USER_B, (tx) =>
          probe<Row>(tx, `select id from studio_designs where id = '${designA}'`),
        ),
        'other tenant reading a design',
      )
      expect(rows).toEqual([])
    })

    it('reads its own exports and not the other tenant exports', async () => {
      const mine = rowsOf(
        await asMember(db, USER_A, (tx) => probe<Row>(tx, `select id from studio_exports`)),
        'member reading own exports',
      )
      expect(mine).toHaveLength(1)
      const theirs = rowsOf(
        await asMember(db, USER_B, (tx) => probe<Row>(tx, `select id from studio_exports`)),
        'other tenant reading exports',
      )
      expect(theirs).toEqual([])
    })
  })

  describe('a valid token belonging to NO workspace reads nothing', () => {
    it('sees no designs at all', async () => {
      const rows = rowsOf(
        await asMember(db, USER_C, (tx) => probe<Row>(tx, `select id from studio_designs`)),
        'stranger reading designs',
      )
      expect(rows).toEqual([])
    })

    it('sees no exports at all', async () => {
      const rows = rowsOf(
        await asMember(db, USER_C, (tx) => probe<Row>(tx, `select id from studio_exports`)),
        'stranger reading exports',
      )
      expect(rows).toEqual([])
    })
  })

  describe('writes across a tenant boundary are refused', () => {
    it('cannot INSERT a design into another workspace', async () => {
      await expect(
        asMember(db, USER_B, (tx) =>
          tx.exec(
            `insert into studio_designs (workspace_id, title, preset_id, doc)
             values ('${WS_A}', 'Planted', 'square', '${DOC}'::jsonb)`,
          ),
        ),
      ).rejects.toThrow(/row-level security/i)
    })

    it('cannot UPDATE another workspace design, and silently changes nothing', async () => {
      await asMember(db, USER_B, (tx) =>
        tx.exec(`update studio_designs set title = 'Hijacked' where id = '${designA}'`),
      )
      const after = rowsOf(
        await asMember(db, USER_A, (tx) =>
          probe<{ title: string }>(tx, `select title from studio_designs where id = '${designA}'`),
        ),
        'owner re-reading title',
      )
      expect(after[0]!.title).toBe('Diwali offer')
    })

    it('cannot DELETE another workspace design', async () => {
      await asMember(db, USER_B, (tx) =>
        tx.exec(`delete from studio_designs where id = '${designA}'`),
      )
      const still = rowsOf(
        await asMember(db, USER_A, (tx) =>
          probe<Row>(tx, `select id from studio_designs where id = '${designA}'`),
        ),
        'owner re-reading after a foreign delete',
      )
      expect(still).toHaveLength(1)
    })

    it('cannot INSERT an export pointing at another workspace design', async () => {
      await expect(
        asMember(db, USER_B, (tx) =>
          tx.exec(
            `insert into studio_exports (workspace_id, design_id, asset_id, content_sha256)
             values ('${WS_B}', '${designA}', '${assetA}', '${'b'.repeat(64)}')`,
          ),
        ),
      ).rejects.toThrow()
    })
  })

  /**
   * The composite foreign key, not a policy. RLS decides who may READ a row; it
   * cannot stop a member of BOTH workspaces from parenting their own row onto
   * the other tenant's design. The `(design_id, workspace_id)` pairing can, and
   * that is why it exists.
   */
  describe('the composite key stops a cross-tenant link that RLS alone would allow', () => {
    it('refuses an export whose workspace does not match its design', async () => {
      await expect(
        db.exec(
          `insert into studio_exports (workspace_id, design_id, asset_id, content_sha256)
           values ('${WS_B}', '${designA}', '${assetA}', '${'c'.repeat(64)}')`,
        ),
      ).rejects.toThrow()
    })

    it('refuses an export whose asset belongs to another workspace', async () => {
      const theirAsset = await db.query<Row>(
        `insert into assets (workspace_id, storage_path, kind, created_by)
         values ('${WS_B}', '${WS_B}/library/theirs.png', 'image', '${USER_B}') returning id`,
      )
      await expect(
        db.exec(
          `insert into studio_exports (workspace_id, design_id, asset_id, content_sha256)
           values ('${WS_A}', '${designA}', '${theirAsset.rows[0]!.id}', '${'d'.repeat(64)}')`,
        ),
      ).rejects.toThrow()
    })
  })

  /**
   * THE REASON studio_exports EXISTS.
   *
   * The renderer is deterministic, so exporting an unchanged design twice
   * produces the same bytes and therefore the same hash. The unique constraint
   * is what lets the studio ANSWER "this is already in your library" instead of
   * colliding with the assets library's duplicate-upload refusal.
   */
  describe('the same design exported twice', () => {
    it('cannot record the same content hash twice for one design', async () => {
      await expect(
        db.exec(
          `insert into studio_exports (workspace_id, design_id, asset_id, content_sha256)
           values ('${WS_A}', '${designA}', '${assetA}', '${SHA_A}')`,
        ),
      ).rejects.toThrow(/unique|duplicate/i)
    })

    it('accepts a DIFFERENT hash for the same design, because an edited design is a new picture', async () => {
      await db.exec(
        `insert into studio_exports (workspace_id, design_id, asset_id, content_sha256)
         values ('${WS_A}', '${designA}', '${assetA}', '${'e'.repeat(64)}')`,
      )
      const rows = rowsOf(
        await asMember(db, USER_A, (tx) =>
          probe<Row>(tx, `select id from studio_exports where design_id = '${designA}'`),
        ),
        'owner reading exports of one design',
      )
      expect(rows).toHaveLength(2)
    })

    it('accepts the same hash under a DIFFERENT design, because two designs may look alike', async () => {
      const second = await db.query<Row>(
        `insert into studio_designs (workspace_id, title, preset_id, doc)
         values ('${WS_A}', 'A copy', 'portrait', '${DOC}'::jsonb) returning id`,
      )
      await db.exec(
        `insert into studio_exports (workspace_id, design_id, asset_id, content_sha256)
         values ('${WS_A}', '${second.rows[0]!.id}', '${assetA}', '${SHA_A}')`,
      )
      const rows = rowsOf(
        await asMember(db, USER_A, (tx) =>
          probe<Row>(tx, `select id from studio_exports where content_sha256 = '${SHA_A}'`),
        ),
        'owner reading exports by hash',
      )
      expect(rows).toHaveLength(2)
    })
  })

  describe('the column checks the migration declares', () => {
    it('refuses an empty title and one over 80 characters', async () => {
      await expect(
        db.exec(
          `insert into studio_designs (workspace_id, title, preset_id, doc)
           values ('${WS_A}', '', 'square', '${DOC}'::jsonb)`,
        ),
      ).rejects.toThrow()
      await expect(
        db.exec(
          `insert into studio_designs (workspace_id, title, preset_id, doc)
           values ('${WS_A}', '${'x'.repeat(81)}', 'square', '${DOC}'::jsonb)`,
        ),
      ).rejects.toThrow()
    })

    it('refuses a content hash that is not 64 lowercase hex characters', async () => {
      for (const bad of ['not-a-hash', 'A'.repeat(64), 'a'.repeat(63)]) {
        await expect(
          db.exec(
            `insert into studio_exports (workspace_id, design_id, asset_id, content_sha256)
             values ('${WS_A}', '${designA}', '${assetA}', '${bad}')`,
          ),
          bad,
        ).rejects.toThrow()
      }
    })

    it('defaults is_template to false, so a design is not a template by accident', async () => {
      const rows = rowsOf(
        await asMember(db, USER_A, (tx) =>
          probe<{ is_template: boolean }>(
            tx,
            `select is_template from studio_designs where id = '${designA}'`,
          ),
        ),
        'owner reading is_template',
      )
      expect(rows[0]!.is_template).toBe(false)
    })
  })

  it('takes the design with the workspace, so erasing a customer leaves nothing behind', async () => {
    await db.exec(`delete from workspaces where id = '${WS_B}'`)
    const left = await db.query<Row>(`select id from studio_designs where id = '${designB}'`)
    expect(left.rows).toEqual([])
  })
})
