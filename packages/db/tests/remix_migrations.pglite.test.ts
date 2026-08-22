import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { RemixBatchStatusSchema, RemixKindSchema } from '@sahoda/shared'

import { asMember, bootFullSchema, currentRole, probe } from './helpers/pglite-tenant'

/**
 * THE REMIX MIGRATION, APPLIED AND EXERCISED, on a real Postgres.
 *
 * ── EACH GUARANTEE IS TESTED BY BREAKING IT ──────────────────────────────────
 * The file goes to the database that serves production, applied by hand. What is
 * checkable before that happens is checked here, and every claim is checked by
 * attempting the thing it forbids:
 *
 *   · a batch cannot record an approval half-way — a total with no timestamp,
 *     or a timestamp with no total, must RAISE
 *   · two derivatives of the same kind on the same channel in one batch must
 *     RAISE, because that is one piece of work charged twice
 *   · a derivative cannot name a format the variant column would refuse
 *   · a member cannot see another workspace's batch
 *
 * ── AND THE VOCABULARIES ARE COMPARED, NOT ASSUMED ───────────────────────────
 * Decision D9 puts each enum in `@sahoda/shared` AND in a Postgres CHECK. Two
 * copies drift silently, so the CHECK is read out of the catalog and compared to
 * the zod enum — a widening on one side without the other fails here rather than
 * as a picker whose choice the database rejects.
 */

let db: PGlite

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const USER_A = 'user_remix_a'
const USER_B = 'user_remix_b'

beforeAll(async () => {
  db = await bootFullSchema()
  await db.query(
    `insert into workspaces (id, name, slug, created_by) values ($1,'A','remix-a',$3), ($2,'B','remix-b',$4)`,
    [WS_A, WS_B, USER_A, USER_B],
  )
  await db.query(
    `insert into workspace_members (workspace_id, user_id, role) values ($1,$3,'owner'), ($2,$4,'owner')`,
    [WS_A, WS_B, USER_A, USER_B],
  )
}, 120_000)

/**
 * One statement, outside any transaction, whose failure is DATA.
 *
 * `probe` from the tenant helper takes a savepoint, which Postgres allows only
 * inside a transaction block — right for `asMember`, which opens one, and an
 * error for the plain constraint checks below. Autocommit means a refused
 * statement leaves nothing behind to poison the next one.
 */
async function attempt(
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: unknown[] } | { denied: string }> {
  try {
    const result = await db.query(sql, params)
    return { rows: result.rows }
  } catch (error) {
    return { denied: error instanceof Error ? error.message.split('\n')[0]! : String(error) }
  }
}

/** The literals a CHECK on this column names, in the order the DDL wrote them. */
async function checkLiterals(table: string, column: string): Promise<string[]> {
  const rows = (
    await db.query<{ def: string }>(
      `select pg_get_constraintdef(c.oid) as def
         from pg_constraint c join pg_class r on r.oid = c.conrelid
        where c.contype = 'c' and r.relname = $1`,
      [table],
    )
  ).rows
  const out: string[] = []
  for (const row of rows) {
    if (!new RegExp(`\\b${column}\\b`).test(row.def)) continue
    for (const m of row.def.matchAll(/'([^']*)'/g)) if (m[1]) out.push(m[1])
  }
  return [...new Set(out)]
}

describe('the vocabularies match @sahoda/shared', () => {
  it('remix_batches.status is exactly RemixBatchStatusSchema', async () => {
    expect((await checkLiterals('remix_batches', 'status')).sort()).toEqual(
      [...RemixBatchStatusSchema.options].sort(),
    )
  })

  it('remix_derivatives.kind is exactly RemixKindSchema', async () => {
    expect((await checkLiterals('remix_derivatives', 'kind')).sort()).toEqual(
      [...RemixKindSchema.options].sort(),
    )
  })

  it('remix_derivatives.format is exactly what post_variants.format accepts', async () => {
    // Compared to the COLUMN it mirrors rather than to a list in this file. A
    // derivative naming a format the variant table refuses is a batch that
    // charges for a draft it cannot save.
    expect((await checkLiterals('remix_derivatives', 'format')).sort()).toEqual(
      (await checkLiterals('post_variants', 'format')).sort(),
    )
  })
})

describe('an approval is whole or it is not there', () => {
  it('refuses a total with no timestamp', async () => {
    const result = await attempt(
      `insert into remix_batches (workspace_id, approved_credits) values ($1, 21)`,
      [WS_A],
    )
    expect(result).toMatchObject({ denied: expect.stringContaining('approval_is_whole') })
  })

  it('refuses a timestamp with no total', async () => {
    const result = await attempt(
      `insert into remix_batches (workspace_id, approved_at) values ($1, now())`,
      [WS_A],
    )
    expect(result).toMatchObject({ denied: expect.stringContaining('approval_is_whole') })
  })

  it('accepts both together, and accepts neither', async () => {
    const neither = await attempt(
      `insert into remix_batches (workspace_id) values ($1) returning id`,
      [WS_A],
    )
    expect(neither).toHaveProperty('rows')
    const both = await attempt(
      `insert into remix_batches (workspace_id, approved_credits, approved_at, status)
       values ($1, 21, now(), 'approved') returning id`,
      [WS_A],
    )
    expect(both).toHaveProperty('rows')
  })

  it('refuses a negative approved total', async () => {
    const result = await attempt(
      `insert into remix_batches (workspace_id, approved_credits, approved_at)
       values ($1, -1, now())`,
      [WS_A],
    )
    expect(result).toHaveProperty('denied')
  })
})

describe('one derivative per kind per channel', () => {
  it('refuses a second `short` for X in the same batch', async () => {
    const batch = (
      await db.query<{ id: string }>(
        `insert into remix_batches (workspace_id) values ($1) returning id`,
        [WS_A],
      )
    ).rows[0]!.id

    const first = await attempt(
      `insert into remix_derivatives (workspace_id, batch_id, kind, channel, format)
       values ($1, $2, 'short', 'x', 'text') returning id`,
      [WS_A, batch],
    )
    expect(first).toHaveProperty('rows')

    // Two rows for one piece of work is a preview that quoted it twice.
    const second = await attempt(
      `insert into remix_derivatives (workspace_id, batch_id, kind, channel, format)
       values ($1, $2, 'short', 'x', 'text')`,
      [WS_A, batch],
    )
    expect(second).toHaveProperty('denied')

    // A different kind on the same channel is fine — that is a different draft.
    const other = await attempt(
      `insert into remix_derivatives (workspace_id, batch_id, kind, channel, format)
       values ($1, $2, 'hook', 'x', 'text') returning id`,
      [WS_A, batch],
    )
    expect(other).toHaveProperty('rows')
  })

  it('refuses a derivative pointing at another tenant’s batch', async () => {
    const batch = (
      await db.query<{ id: string }>(
        `insert into remix_batches (workspace_id) values ($1) returning id`,
        [WS_B],
      )
    ).rows[0]!.id
    // The composite foreign key carries the workspace, so tenant A cannot hang a
    // derivative off tenant B's batch even with the id in hand.
    const result = await attempt(
      `insert into remix_derivatives (workspace_id, batch_id, kind, channel, format)
       values ($1, $2, 'short', 'x', 'text')`,
      [WS_A, batch],
    )
    expect(result).toHaveProperty('denied')
  })
})

describe('tenant isolation, with the policies actually applied', () => {
  it('member A sees their own batches and none of B’s', async () => {
    const seen = await asMember(db, USER_A, async (tx) => {
      // The role really dropped — a policy is inert against a superuser, and a
      // suite that skipped this would report perfect isolation having proven
      // nothing.
      expect((await currentRole(tx)).superuser).toBe('off')
      return await probe<{ workspace_id: string }>(tx, `select workspace_id from remix_batches`)
    })
    expect(seen).toHaveProperty('rows')
    const rows = (seen as { rows: { workspace_id: string }[] }).rows
    expect(rows.length).toBeGreaterThan(0) // positive control
    expect(new Set(rows.map((r) => r.workspace_id))).toEqual(new Set([WS_A]))
  })

  it('member B cannot write into A’s workspace', async () => {
    const result = await asMember(db, USER_B, (tx) =>
      probe(tx, `insert into remix_batches (workspace_id) values ($1)`, [WS_A]),
    )
    expect(result).toHaveProperty('denied')
  })

  it('a signed-out visitor sees no batch at all', async () => {
    const result = await asMember(db, 'user_nobody', (tx) =>
      probe<{ id: string }>(tx, `select id from remix_batches`),
    )
    expect(result).toEqual({ rows: [] })
  })
})
