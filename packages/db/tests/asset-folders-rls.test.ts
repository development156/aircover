import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootFullSchema, asMember, asRole, probe, currentRole } from './helpers/pglite-tenant'

/**
 * asset_folders / asset_folder_items / asset_smart_folders, WITH RLS ENFORCED.
 *
 * This runs against a real Postgres (PGlite) with every migration applied and the
 * superuser bit DROPPED per transaction, so the policies in the migration files
 * are the only thing standing between the two tenants — see helpers/pglite-tenant.
 * It never skips: there is no network and no credential, so a green gate here is a
 * policy actually enforced, not a suite that declined to run. (The live-key
 * variants `rls.test.ts` / `ops_rls.test.ts` skip without SAHODA_ALLOW_LIVE_TESTS;
 * this one is the copy that executes on every run.)
 *
 * Beyond tenant isolation it exercises the two things the migration does that no
 * policy can: the cycle/depth guard trigger, and the sibling-name uniqueness whose
 * NULL (root) case a single unique constraint would miss.
 *
 * A third identity, `USER_C`, holds a valid token and belongs to no workspace — it
 * proves the policies key on MEMBERSHIP, not merely on "some other tenant".
 */

const WS_A = '11111111-0000-4000-8000-111111111111'
const WS_B = '22222222-0000-4000-8000-222222222222'
const USER_A = 'user_folders_a'
const USER_B = 'user_folders_b'
const USER_C = 'user_folders_none'

const THREE_TABLES = ['asset_folders', 'asset_folder_items', 'asset_smart_folders'] as const

const VALID_QUERY = JSON.stringify({
  mode: 'all',
  rules: [{ field: 'description', is: 'missing' }],
})

type Row = { id: string }

describe('Asset folder system RLS + tree guard (real Postgres, policies enforced)', () => {
  let db: PGlite
  const seen: Record<string, string> = {}

  beforeAll(async () => {
    db = await bootFullSchema()

    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'A', 'folders-a', '${USER_A}'),
        ('${WS_B}', 'B', 'folders-b', '${USER_B}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${USER_A}', 'owner'),
        ('${WS_B}', '${USER_B}', 'owner');
    `)

    // A file to file, and a folder + filing + saved search, all in workspace A.
    // These are the rows workspace B and the no-workspace token must not see.
    const asset = await db.query<Row>(
      `insert into assets (workspace_id, storage_path, kind, created_by)
       values ('${WS_A}', '${WS_A}/library/shopfront.jpg', 'image', '${USER_A}') returning id`,
    )
    seen.assetA = asset.rows[0]!.id

    const folder = await db.query<Row>(
      `insert into asset_folders (workspace_id, name, created_by)
       values ('${WS_A}', 'Library', '${USER_A}') returning id`,
    )
    seen.folderA = folder.rows[0]!.id

    await db.exec(
      `insert into asset_folder_items (workspace_id, folder_id, asset_id, added_by)
       values ('${WS_A}', '${seen.folderA}', '${seen.assetA}', '${USER_A}')`,
    )

    const smart = await db.query<Row>(
      `insert into asset_smart_folders (workspace_id, name, query, created_by)
       values ('${WS_A}', 'Missing alt text', '${VALID_QUERY}'::jsonb, '${USER_A}') returning id`,
    )
    seen.smartA = smart.rows[0]!.id
  })

  afterAll(async () => {
    await db?.close()
  })

  it('actually drops the superuser bit — otherwise every result below is meaningless', async () => {
    const role = await asMember(db, USER_A, (tx) => currentRole(tx))
    console.log('  as a member:', role)
    expect(role.user).toBe('authenticated')
    expect(role.superuser).toBe('off')
  })

  // ── cross-tenant SELECT returns nothing on all three tables ─────────────────

  it('workspace B, and a token with no workspace, and anon all read NOTHING', async () => {
    for (const table of THREE_TABLES) {
      const asB = await asMember(db, USER_B, (tx) =>
        probe<{ n: number }>(tx, `select count(*)::int as n from ${table}`),
      )
      const asC = await asMember(db, USER_C, (tx) =>
        probe<{ n: number }>(tx, `select count(*)::int as n from ${table}`),
      )
      const asAnon = await asRole(db, 'anon', {}, (tx) =>
        probe<{ n: number }>(tx, `select count(*)::int as n from ${table}`),
      )
      console.log(`  ${table.padEnd(20)} B=%j C=%j anon=%j`, asB, asC, asAnon)
      expect('rows' in asB ? asB.rows[0]!.n : -1).toBe(0)
      expect('rows' in asC ? asC.rows[0]!.n : -1).toBe(0)
      expect('rows' in asAnon ? asAnon.rows[0]!.n : -1).toBe(0)
    }
  })

  it('workspace A sees its own folder, filing and saved search — proving the zero above is the POLICY, not an empty table', async () => {
    const counts = await asMember(db, USER_A, async (tx) => ({
      folders: (await tx.query<{ n: number }>(`select count(*)::int n from asset_folders`)).rows[0]!
        .n,
      items: (await tx.query<{ n: number }>(`select count(*)::int n from asset_folder_items`))
        .rows[0]!.n,
      smart: (await tx.query<{ n: number }>(`select count(*)::int n from asset_smart_folders`))
        .rows[0]!.n,
    }))
    console.log('  A sees:', counts)
    expect(counts.folders).toBeGreaterThanOrEqual(1)
    expect(counts.items).toBe(1)
    expect(counts.smart).toBe(1)
  })

  // ── cross-tenant INSERT fails on all three ──────────────────────────────────

  it('workspace B cannot INSERT a row scoped to workspace A into any of the three', async () => {
    const attempts: Array<[string, string]> = [
      [
        'asset_folders',
        `insert into asset_folders (workspace_id, name, created_by)
         values ('${WS_A}', 'Sneaked in', '${USER_B}')`,
      ],
      [
        'asset_folder_items',
        `insert into asset_folder_items (workspace_id, folder_id, asset_id, added_by)
         values ('${WS_A}', '${seen.folderA}', '${seen.assetA}', '${USER_B}')`,
      ],
      [
        'asset_smart_folders',
        `insert into asset_smart_folders (workspace_id, name, query, created_by)
         values ('${WS_A}', 'Sneaked search', '${VALID_QUERY}'::jsonb, '${USER_B}')`,
      ],
    ]
    for (const [table, sql] of attempts) {
      const got = await asMember(db, USER_B, (tx) => probe(tx, sql))
      console.log(`  B insert ${table.padEnd(20)} -> ${JSON.stringify(got)}`)
      expect(got).toHaveProperty('denied')
      expect((got as { denied: string }).denied).toMatch(/row-level security|permission denied/i)
    }
  })

  // ── the cycle guard actually refuses ────────────────────────────────────────

  it('refuses to move a folder inside its own child (the cycle A -> B -> A)', async () => {
    // A at the root, B under A — both legal writes.
    const a = await db.query<Row>(
      `insert into asset_folders (workspace_id, name, created_by)
       values ('${WS_A}', 'CycleA', '${USER_A}') returning id`,
    )
    const parentA = a.rows[0]!.id
    const b = await db.query<Row>(
      `insert into asset_folders (workspace_id, parent_id, name, created_by)
       values ('${WS_A}', '${parentA}', 'CycleB', '${USER_A}') returning id`,
    )
    const childB = b.rows[0]!.id

    // Now try to reparent A under B — that closes the loop and must be refused.
    const got = await asMember(db, USER_A, (tx) =>
      probe(tx, `update asset_folders set parent_id = $1 where id = $2`, [childB, parentA]),
    )
    console.log('  move A under its child B ->', JSON.stringify(got))
    expect(got).toHaveProperty('denied')
    expect((got as { denied: string }).denied).toMatch(/itself or its own subtree/i)
  })

  // ── the depth guard refuses a 7th level ─────────────────────────────────────

  it('allows six levels and refuses the seventh', async () => {
    let parent: string | null = null
    const ids: string[] = []
    // Levels 1..6 are all legal.
    for (let level = 1; level <= 6; level += 1) {
      const parentSql: string = parent === null ? 'null' : `'${parent}'`
      const inserted = await db.query<Row>(
        `insert into asset_folders (workspace_id, parent_id, name, created_by)
         values ('${WS_A}', ${parentSql}, 'Depth ${level}', '${USER_A}') returning id`,
      )
      // Held as its own `string` before it goes anywhere. Assigning straight into
      // `parent` and then pushing THAT makes `ids.push` see `string | null`, and
      // the annotations above break the circular inference tsc reports when a
      // loop variable feeds the very template that produces its next value.
      const id: string = inserted.rows[0]!.id
      parent = id
      ids.push(id)
    }
    expect(ids).toHaveLength(6)

    // Level 7 under level 6 must be refused.
    const got = await asMember(db, USER_A, (tx) =>
      probe(
        tx,
        `insert into asset_folders (workspace_id, parent_id, name, created_by)
         values ('${WS_A}', $1, 'Depth 7', '${USER_A}')`,
        [parent],
      ),
    )
    console.log('  insert 7th level ->', JSON.stringify(got))
    expect(got).toHaveProperty('denied')
    expect((got as { denied: string }).denied).toMatch(/6 levels deep/i)
  })

  /**
   * THE HALF THAT CHECKING ONLY THE WRITTEN ROW MISSES.
   *
   * Moving a folder re-depths every folder beneath it, and none of those rows has
   * its own `parent_id` touched, so the trigger never fires for any of them.
   * MEASURED before the subtree half of the guard existed: this exact move was
   * ALLOWED and left the deepest descendant at depth 7.
   *
   * The dragged folder itself lands at depth 5, comfortably legal, which is why
   * a guard that measured only the folder being moved reported nothing wrong.
   */
  it('refuses a move whose SUBTREE would go past six, even though the folder itself fits', async () => {
    const mk = async (name: string, parent: string | null): Promise<string> => {
      const parentSql: string = parent === null ? 'null' : `'${parent}'`
      const inserted = await db.query<Row>(
        `insert into asset_folders (workspace_id, parent_id, name, created_by)
         values ('${WS_A}', ${parentSql}, '${name}', '${USER_A}') returning id`,
      )
      return inserted.rows[0]!.id
    }

    // A host chain four deep, so its last folder sits at depth 4.
    let cursor: string | null = null
    for (let level = 1; level <= 4; level += 1) cursor = await mk(`Host ${level}`, cursor)
    const host = cursor as string

    // A three-deep subtree standing at the root: head, child, grandchild.
    const head = await mk('Sub head', null)
    const child = await mk('Sub child', head)
    const grandchild = await mk('Sub grandchild', child)

    const got = await asMember(db, USER_A, (tx) =>
      probe(tx, `update asset_folders set parent_id = $1 where id = $2`, [host, head]),
    )
    console.log('  move over-deep subtree ->', JSON.stringify(got))
    expect(got).toHaveProperty('denied')
    expect((got as { denied: string }).denied).toMatch(/6 levels deep/i)

    // And the rows are UNCHANGED: a refused move must not half-apply.
    const still = await db.query<{ parent_id: string | null }>(
      `select parent_id from asset_folders where id = '${head}'`,
    )
    expect(still.rows[0]!.parent_id).toBeNull()

    // The grandchild is still reachable at depth 3 from the root, not orphaned.
    const depth = await db.query<{ d: number }>(`
      with recursive up as (
        select id, parent_id, 1 as d from asset_folders where id = '${grandchild}'
        union all
        select p.id, p.parent_id, up.d + 1 from asset_folders p join up on p.id = up.parent_id
      ) select max(d) as d from up`)
    expect(Number(depth.rows[0]!.d)).toBe(3)
  })

  /**
   * THE UPSERT SHAPE THE APP ACTUALLY SENDS, AGAINST A REAL POSTGRES.
   *
   * `fileAssets` files in bulk with ON CONFLICT DO NOTHING so a partial overlap
   * is a normal outcome rather than an error. Postgres matches that target
   * against a real unique index BY ITS EXACT COLUMN SET, and this table is keyed
   * `primary key (folder_id, asset_id)`.
   *
   * The action once named `(workspace_id, folder_id, asset_id)`. No constraint
   * has that column set, so every call raised 42P10 and filing never worked
   * once. Twenty-seven action tests passed straight through it, because they
   * mock Supabase and a mock has no ON CONFLICT semantics to get wrong.
   *
   * That is why this guard lives HERE, in the suite that runs real SQL. It
   * asserts BOTH directions: the shape the app sends inserts, and the shape it
   * used to send still raises. A test that only proved the good path would go
   * green again the moment somebody re-added a column to the target.
   */
  it('accepts the filing upsert the app sends, and REFUSES the shape that never worked', async () => {
    const folder = await db.query<Row>(
      `insert into asset_folders (workspace_id, name, created_by)
       values ('${WS_A}', 'Filing target', '${USER_A}') returning id`,
    )
    const folderId = folder.rows[0]!.id

    const asset = await db.query<Row>(
      `insert into assets (workspace_id, storage_path, kind, created_by)
       values ('${WS_A}', '${WS_A}/library/filing-probe.jpg', 'image', '${USER_A}') returning id`,
    )
    const assetId = asset.rows[0]!.id

    // The shape the action sends today. Runs twice: the second is the overlap
    // case, which must be a no-op and NOT an error.
    // ── ALL OF IT INSIDE ONE TRANSACTION, DELIBERATELY ────────────────────
    // `asMember` rolls its transaction back, which is what keeps this suite
    // repeatable. So the second insert and the count have to happen in the SAME
    // block as the first, or the count reads a table the rollback already
    // emptied and the test fails for a reason that has nothing to do with the
    // constraint it exists to check.
    const result = await asMember(db, USER_A, async (tx) => {
      const insert = `insert into asset_folder_items (workspace_id, folder_id, asset_id, added_by)
         values ($1, $2, $3, $4) on conflict (folder_id, asset_id) do nothing`
      const args = [WS_A, folderId, assetId, USER_A]

      const first = await probe(tx, insert, args)
      // The overlap case: filing the same photo twice must be a no-op, not an
      // error, because that is what makes a partial bulk file a success.
      const again = await probe(tx, insert, args)

      const rows = await tx.query<{ n: number }>(
        `select count(*)::int as n from asset_folder_items where folder_id = '${folderId}'`,
      )

      // The shape that shipped broken, in the same transaction.
      const wrong = await probe(
        tx,
        `insert into asset_folder_items (workspace_id, folder_id, asset_id, added_by)
         values ($1, $2, $3, $4) on conflict (workspace_id, folder_id, asset_id) do nothing`,
        args,
      )

      return { first, again, filings: rows.rows[0]?.n ?? -1, wrong }
    })

    expect(result.first).not.toHaveProperty('denied')
    expect(result.again).not.toHaveProperty('denied')
    // Exactly one filing, so the second insert really was a no-op rather than a
    // duplicate row.
    expect(result.filings).toBe(1)

    expect(result.wrong).toHaveProperty('denied')
    expect((result.wrong as { denied: string }).denied).toMatch(
      /no unique or exclusion constraint matching the ON CONFLICT/i,
    )
  })

  /**
   * THE TWO SPELLINGS OF AN ACCENTED NAME ARE ONE NAME.
   *
   * "café" can be a single e-acute code point or a plain e plus a combining
   * acute. They render identically and are different strings, so an index on
   * `lower(name)` alone treats them as two folders and a person sees two rows
   * with the same visible name and no explanation.
   *
   * The application normalises on write and this index normalises on compare.
   * Both halves are asserted here: the premise (they really do differ as raw
   * text, so the test is not vacuous) and the guarantee (the second insert is
   * refused).
   */
  it('refuses two root folders whose names differ only by Unicode normalisation', async () => {
    const composed = 'Caf\u00e9 shots' // e-acute, one code point
    const decomposed = 'Cafe\u0301 shots' // e + combining acute

    // The premise. Without this the test could pass on a plain duplicate.
    expect(composed).not.toBe(decomposed)
    expect(composed.toLowerCase()).not.toBe(decomposed.toLowerCase())

    await db.query(
      `insert into asset_folders (workspace_id, name, created_by) values ($1, $2, $3)`,
      [WS_A, composed, USER_A],
    )

    const got = await asMember(db, USER_A, (tx) =>
      probe(tx, `insert into asset_folders (workspace_id, name, created_by) values ($1, $2, $3)`, [
        WS_A,
        decomposed,
        USER_A,
      ]),
    )
    expect(got).toHaveProperty('denied')
    expect((got as { denied: string }).denied).toMatch(/duplicate key|unique/i)

    // And the case-folded spelling of the OTHER form is refused too, so the
    // index folds case and normalises rather than doing only one of them.
    const lower = await asMember(db, USER_A, (tx) =>
      probe(tx, `insert into asset_folders (workspace_id, name, created_by) values ($1, $2, $3)`, [
        WS_A,
        decomposed.toLowerCase(),
        USER_A,
      ]),
    )
    expect(lower).toHaveProperty('denied')
  })

  // ── case-insensitive sibling uniqueness, INCLUDING the root (null) case ──────

  it('refuses "Diwali" then "diwali" under the SAME parent', async () => {
    const parent = (
      await db.query<Row>(
        `insert into asset_folders (workspace_id, name, created_by)
         values ('${WS_A}', 'Campaigns', '${USER_A}') returning id`,
      )
    ).rows[0]!.id
    await db.exec(
      `insert into asset_folders (workspace_id, parent_id, name, created_by)
       values ('${WS_A}', '${parent}', 'Diwali', '${USER_A}')`,
    )
    const got = await asMember(db, USER_A, (tx) =>
      probe(
        tx,
        `insert into asset_folders (workspace_id, parent_id, name, created_by)
         values ('${WS_A}', $1, 'diwali', '${USER_A}')`,
        [parent],
      ),
    )
    console.log('  duplicate sibling under a parent ->', JSON.stringify(got))
    expect(got).toHaveProperty('denied')
    expect((got as { denied: string }).denied).toMatch(/duplicate key|unique/i)
  })

  it('refuses "Diwali" then "diwali" at the ROOT — the null case a single constraint misses', async () => {
    // Two NULL parent_ids are DISTINCT to Postgres, so this only holds because of
    // the dedicated `where parent_id is null` partial index. This is the guard the
    // whole two-index design exists for.
    await db.exec(
      `insert into asset_folders (workspace_id, name, created_by)
       values ('${WS_A}', 'RootDiwali', '${USER_A}')`,
    )
    const got = await asMember(db, USER_A, (tx) =>
      probe(
        tx,
        `insert into asset_folders (workspace_id, name, created_by)
         values ('${WS_A}', 'rootdiwali', '${USER_A}')`,
      ),
    )
    console.log('  duplicate sibling at root ->', JSON.stringify(got))
    expect(got).toHaveProperty('denied')
    expect((got as { denied: string }).denied).toMatch(/duplicate key|unique/i)
  })

  // ── deleting a folder removes filings, never files ──────────────────────────

  it('deleting a folder that holds a file deletes the FILING and leaves the FILE', async () => {
    // A fresh asset and folder, filed together, so the count is unambiguous.
    const asset = (
      await db.query<Row>(
        `insert into assets (workspace_id, storage_path, kind, created_by)
         values ('${WS_A}', '${WS_A}/library/keepme.jpg', 'image', '${USER_A}') returning id`,
      )
    ).rows[0]!.id
    const folder = (
      await db.query<Row>(
        `insert into asset_folders (workspace_id, name, created_by)
         values ('${WS_A}', 'ToDelete', '${USER_A}') returning id`,
      )
    ).rows[0]!.id
    await db.exec(
      `insert into asset_folder_items (workspace_id, folder_id, asset_id, added_by)
       values ('${WS_A}', '${folder}', '${asset}', '${USER_A}')`,
    )

    // The whole thing runs as the member, in one transaction, so the before/after
    // asset counts are read under the same policy that authorised the delete.
    const result = await asMember(db, USER_A, async (tx) => {
      const assetsBefore = (
        await tx.query<{ n: number }>(
          `select count(*)::int n from assets where workspace_id = $1`,
          [WS_A],
        )
      ).rows[0]!.n
      const filingBefore = (
        await tx.query<{ n: number }>(
          `select count(*)::int n from asset_folder_items where folder_id = $1`,
          [folder],
        )
      ).rows[0]!.n
      await tx.query(`delete from asset_folders where id = $1`, [folder])
      const filingAfter = (
        await tx.query<{ n: number }>(
          `select count(*)::int n from asset_folder_items where folder_id = $1`,
          [folder],
        )
      ).rows[0]!.n
      const assetsAfter = (
        await tx.query<{ n: number }>(
          `select count(*)::int n from assets where workspace_id = $1`,
          [WS_A],
        )
      ).rows[0]!.n
      const fileStillThere = (
        await tx.query<{ n: number }>(`select count(*)::int n from assets where id = $1`, [asset])
      ).rows[0]!.n
      return { assetsBefore, filingBefore, filingAfter, assetsAfter, fileStillThere }
    })
    console.log('  delete folder result:', result)

    expect(result.filingBefore).toBe(1) // it held the file
    expect(result.filingAfter).toBe(0) // the filing cascaded away with the folder
    expect(result.assetsAfter).toBe(result.assetsBefore) // no file was deleted
    expect(result.fileStillThere).toBe(1) // that exact file survived
  })
})
