import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { bootSchema, applyMigration, CONTENT_FOUNDATION } from './helpers/pglite-schema'

/**
 * A2 — the metric history table, EXECUTED.
 *
 * ── WHAT IS WORTH TESTING HERE AND WHAT IS NOT ───────────────────────────────
 * The columns are not. A `create table` that lists six columns has them; asserting
 * that back is a restatement, not a check.
 *
 * What IS worth testing is every place this table makes a PROMISE the collecting
 * job and the chart are built on top of:
 *
 *   · running the job twice cannot double a total — the whole reason the day
 *     column and the uniqueness rule exist, and the defect class this repo has
 *     shipped three times;
 *   · a measurement cannot be edited or deleted after the fact, INCLUDING by the
 *     service account the job connects as, which is what forces the job to write
 *     "create or do nothing";
 *   · deleting a post still takes its measurements with it, so the block above
 *     cannot strand rows;
 *   · the day is worked out from the timestamp and cannot be set independently of
 *     it, so the two can never disagree.
 */

const MIGRATION = '20260819000100_post_metric_snapshots.sql'

const WS = '11111111-1111-4111-8111-111111111111'
const POST = '22222222-2222-4222-8222-222222222222'

describe('A2 · post_metric_snapshots (real Postgres, in-process)', () => {
  let db: PGlite

  async function seed(): Promise<void> {
    await db.query(
      `insert into workspaces (id, name, slug, created_by) values ($1, 'QA', 'qa', 'user_qa')`,
      [WS],
    )
    await db.query(`insert into posts (id, workspace_id, title) values ($1, $2, 'A post')`, [
      POST,
      WS,
    ])
  }

  /** Exactly how the collecting job writes: create it, or do nothing. */
  async function capture(metric: string, value: number, measuredAt: string): Promise<number> {
    const r = await db.query(
      `insert into post_metric_snapshots
         (workspace_id, post_id, channel, metric, value, measured_at)
       values ($1, $2, 'instagram', $3, $4, $5)
       on conflict (workspace_id, post_id, channel, metric, measured_on) do nothing`,
      [WS, POST, metric, value, measuredAt],
    )
    return r.affectedRows ?? 0
  }

  /**
   * ONE Postgres for the file, not one per test.
   *
   * Each boot is a fresh WebAssembly Postgres costing about three seconds of CPU;
   * per-test booting made this file start thirteen of them, and under the full gate
   * — every package's suite at once — that starved the web suite into timeouts.
   *
   * `truncate` rather than `delete`, and not only for speed: this table carries an
   * append-only guard that refuses DELETE outright, which is one of the things the
   * file asserts. Truncate is a different statement and the row-level guard does
   * not see it, so the cleanup cannot quietly depend on the rule being absent.
   */
  beforeAll(async () => {
    db = await bootSchema(CONTENT_FOUNDATION)
    await applyMigration(db, MIGRATION)
  })

  beforeEach(async () => {
    await db.exec('truncate post_metric_snapshots, post_variants, posts, workspaces cascade')
    await seed()
  })

  afterAll(async () => {
    await db.close()
  })

  it('stores one measurement', async () => {
    expect(await capture('reach', 1200, '2026-08-17T09:00:00Z')).toBe(1)

    const r = await db.query<{ value: string; measured_on: unknown }>(
      `select value, measured_on from post_metric_snapshots`,
    )
    expect(r.rows).toHaveLength(1)
    // bigint comes back as a string over the wire; the READ layer parses it.
    expect(Number(r.rows[0]?.value)).toBe(1200)
  })

  it('cannot be made to double a total by running the job twice', async () => {
    // The defect this table is shaped around. A retry, an overlapping run, or a
    // founder re-running the job by hand must not add a second point for one day.
    await capture('reach', 1200, '2026-08-17T09:00:00Z')
    const second = await capture('reach', 1200, '2026-08-17T21:30:00Z') // same UTC day

    expect(second).toBe(0)
    const r = await db.query<{ n: string }>(`select count(*) as n from post_metric_snapshots`)
    expect(Number(r.rows[0]?.n)).toBe(1)
  })

  it('keeps the next day as its own point', async () => {
    await capture('reach', 1200, '2026-08-17T09:00:00Z')
    await capture('reach', 1450, '2026-08-18T09:00:00Z')

    const r = await db.query<{ n: string }>(`select count(*) as n from post_metric_snapshots`)
    expect(Number(r.rows[0]?.n)).toBe(2)
  })

  it('keeps each metric apart on the same day', async () => {
    await capture('reach', 1200, '2026-08-17T09:00:00Z')
    await capture('impressions', 3000, '2026-08-17T09:00:00Z')

    const r = await db.query<{ n: string }>(`select count(*) as n from post_metric_snapshots`)
    expect(Number(r.rows[0]?.n)).toBe(2)
  })

  it('works out the day from the timestamp, so the two cannot disagree', async () => {
    // `measured_on` is generated. An attempt to set it directly is rejected, which
    // is what makes it trustworthy as the grouping key.
    await capture('reach', 1200, '2026-08-17T23:59:00Z')
    const r = await db.query<{ measured_on: unknown }>(
      `select measured_on::text as measured_on from post_metric_snapshots`,
    )
    expect(r.rows[0]?.measured_on).toBe('2026-08-17')

    await expect(
      db.query(
        `insert into post_metric_snapshots
           (workspace_id, post_id, channel, metric, value, measured_at, measured_on)
         values ($1, $2, 'x', 'reach', 5, now(), date '2020-01-01')`,
        [WS, POST],
      ),
    ).rejects.toThrow()
  })

  it('refuses a metric name nothing reads', async () => {
    await expect(capture('followers', 10, '2026-08-17T09:00:00Z')).rejects.toThrow()
  })

  it('refuses to edit a measurement after it is written', async () => {
    // PGlite connects as a superuser, so this covers the service account the job
    // uses too — the block is a trigger, not a permission, and applies to everyone.
    await capture('reach', 1200, '2026-08-17T09:00:00Z')

    await expect(db.query(`update post_metric_snapshots set value = 999999`)).rejects.toThrow(
      /append-only/,
    )
    await expect(db.query(`delete from post_metric_snapshots`)).rejects.toThrow(/append-only/)
  })

  it('still removes a post’s measurements when the post is deleted', async () => {
    // The block above must not strand rows. This is the cascade path, which the
    // guard lets through because it arrives underneath another delete.
    await capture('reach', 1200, '2026-08-17T09:00:00Z')
    await db.query(`delete from posts where id = $1`, [POST])

    const r = await db.query<{ n: string }>(`select count(*) as n from post_metric_snapshots`)
    expect(Number(r.rows[0]?.n)).toBe(0)
  })

  it('will not attach a measurement to a post in another account', async () => {
    const OTHER = '99999999-9999-4999-8999-999999999999'
    await db.query(
      `insert into workspaces (id, name, slug, created_by) values ($1, 'O', 'o', 'user_o')`,
      [OTHER],
    )

    // Same post, wrong workspace. The composite key to `posts` refuses it.
    await expect(
      db.query(
        `insert into post_metric_snapshots
           (workspace_id, post_id, channel, metric, value, measured_at)
         values ($1, $2, 'instagram', 'reach', 5, now())`,
        [OTHER, POST],
      ),
    ).rejects.toThrow()
  })

  it('holds a number larger than an ordinary integer', async () => {
    // A viral post on a large account passes two billion. An `int` column would
    // fail the write at exactly the moment the number mattered.
    await capture('impressions', 4_000_000_000, '2026-08-17T09:00:00Z')
    const r = await db.query<{ value: string }>(`select value from post_metric_snapshots`)
    expect(Number(r.rows[0]?.value)).toBe(4_000_000_000)
  })

  it('has row-level security switched on', async () => {
    const r = await db.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where relname = 'post_metric_snapshots'`,
    )
    expect(r.rows[0]?.relrowsecurity).toBe(true)
  })

  it('scopes its read policy to the workspace, and grants no write policy', async () => {
    const r = await db.query<{ cmd: string; qual: string | null }>(
      `select cmd, qual from pg_policies where tablename = 'post_metric_snapshots'`,
    )
    expect(r.rows.map((row) => row.cmd)).toEqual(['SELECT'])
    expect(r.rows[0]?.qual).toContain('member_workspace_ids')
  })

  it('answers the chart’s query, with a gap where nothing was measured', async () => {
    // The query written out in section 5 of the migration, run for real. The 18th
    // is deliberately absent: it must produce NO ROW, never a zero.
    await capture('reach', 1200, '2026-08-17T09:00:00Z')
    await capture('reach', 1450, '2026-08-19T09:00:00Z')

    const r = await db.query<{ measured_on: string; total: string; series_count: string }>(
      `select measured_on::text as measured_on, sum(value) as total, count(*) as series_count
         from post_metric_snapshots
        where workspace_id = $1 and metric = $2 and measured_on >= $3
        group by measured_on
        order by measured_on`,
      [WS, 'reach', '2026-08-01'],
    )

    expect(r.rows.map((row) => row.measured_on)).toEqual(['2026-08-17', '2026-08-19'])
    expect(r.rows.map((row) => Number(row.total))).toEqual([1200, 1450])
  })
})
