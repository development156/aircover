import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { bootSchema, applyMigration, CONTENT_FOUNDATION } from './helpers/pglite-schema'

/**
 * audience_snapshots — the audience history table, EXECUTED.
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────────
 * Not the column list: a `create table` that names a column has it, and asserting
 * that back is a restatement. What is tested is every place this table makes a
 * PROMISE the collector and the screen are built on:
 *
 *   · running the collector twice cannot double a figure;
 *   · a measurement cannot be edited or deleted afterwards, INCLUDING by the
 *     service account the job connects as — which is what forces the collector to
 *     write "create it, or do nothing";
 *   · a disconnection does NOT destroy history, which is the one place this table
 *     deliberately diverges from `post_metric_snapshots` and the one that would be
 *     unrecoverable if it were wrong;
 *   · the day is SUPPLIED rather than generated, so one call can write thirty days
 *     of dated follower history — the other deliberate divergence;
 *   · no measurement in this table can be negative, because every one of them is a
 *     count of accounts.
 */

const MIGRATION = '20260820220000_audience_snapshots.sql'

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'
const ACCT = '6a81aff477555aae0149e261'
const ACCT_2 = 'aaaaaaaaaaaaaaaaaaaaaaaa'

describe('audience_snapshots (real Postgres, in-process)', () => {
  let db: PGlite

  async function seed(): Promise<void> {
    await db.query(
      `insert into workspaces (id, name, slug, created_by) values ($1, 'QA', 'qa', 'user_qa')`,
      [WS],
    )
  }

  /** Exactly how the collector writes: create it, or do nothing. */
  async function capture(row: {
    workspaceId?: string
    accountId?: string
    audience?: string
    dimension: string
    bucket: string
    value: number
    measuredOn: string
    timeframe?: string
    source?: string
  }): Promise<number> {
    const r = await db.query(
      `insert into audience_snapshots
         (workspace_id, account_id, channel, audience, dimension, bucket, value,
          measured_on, timeframe, source)
       values ($1, $2, 'instagram', $3, $4, $5, $6, $7, $8, $9)
       on conflict (workspace_id, account_id, channel, audience, dimension, bucket, measured_on)
         do nothing`,
      [
        row.workspaceId ?? WS,
        row.accountId ?? ACCT,
        row.audience ?? 'followers',
        row.dimension,
        row.bucket,
        row.value,
        row.measuredOn,
        row.timeframe ?? 'this_month',
        row.source ?? 'zernio:instagram_demographics',
      ],
    )
    return r.affectedRows ?? 0
  }

  beforeAll(async () => {
    db = await bootSchema(CONTENT_FOUNDATION)
    await applyMigration(db, MIGRATION)
  })

  beforeEach(async () => {
    // `truncate`, not `delete`: the append-only guard refuses DELETE outright, and
    // that refusal is one of the things this file asserts. Truncate is a different
    // statement the row-level trigger never sees, so the cleanup cannot quietly
    // depend on the rule being absent.
    await db.exec('truncate audience_snapshots, workspaces cascade')
    await seed()
  })

  afterAll(async () => {
    await db.close()
  })

  it('stores one measurement', async () => {
    expect(
      await capture({ dimension: 'age', bucket: '25-34', value: 4500, measuredOn: '2026-08-20' }),
    ).toBe(1)

    const r = await db.query<{ value: string; bucket: string }>(
      `select value, bucket from audience_snapshots`,
    )
    expect(r.rows).toHaveLength(1)
    // bigint arrives as a string over the wire; the READ layer parses it.
    expect(Number(r.rows[0]?.value)).toBe(4500)
  })

  it('cannot be made to double a figure by running the collector twice', async () => {
    await capture({ dimension: 'age', bucket: '25-34', value: 4500, measuredOn: '2026-08-20' })
    const second = await capture({
      dimension: 'age',
      bucket: '25-34',
      value: 4600, // a slightly different answer later the same day
      measuredOn: '2026-08-20',
    })

    expect(second).toBe(0)
    const r = await db.query<{ n: string; value: string }>(
      `select count(*) as n, max(value) as value from audience_snapshots`,
    )
    expect(Number(r.rows[0]?.n)).toBe(1)
    // The FIRST answer of the day is the one kept — forced by the append-only
    // guard, which makes "create or update" impossible.
    expect(Number(r.rows[0]?.value)).toBe(4500)
  })

  it('keeps every bucket, dimension, audience, day and account apart', async () => {
    // The sibling-shape check. A uniqueness rule that collapses any one of these
    // silently merges two different populations, and a guard written against
    // `age` alone would let `gender` walk straight through.
    const base = { dimension: 'age', bucket: '25-34', value: 1, measuredOn: '2026-08-20' } as const
    await capture(base)
    await capture({ ...base, bucket: '35-44' }) // different bucket
    await capture({ ...base, dimension: 'gender', bucket: 'F' }) // different dimension
    await capture({ ...base, audience: 'engaged' }) // different audience
    await capture({ ...base, measuredOn: '2026-08-21' }) // different day
    await capture({ ...base, accountId: ACCT_2 }) // second Instagram account

    const r = await db.query<{ n: string }>(`select count(*) as n from audience_snapshots`)
    expect(Number(r.rows[0]?.n)).toBe(6)
  })

  it('takes the day it is given, so one call can write thirty dated days', async () => {
    // The divergence from `post_metric_snapshots`, tested rather than asserted in a
    // comment. `/analytics/instagram/follower-history` returns roughly thirty dated
    // points in ONE response; a day generated from "now" would stack all of them
    // onto today and destroy the history the call exists to provide.
    for (const day of ['2026-07-22', '2026-07-23', '2026-07-24']) {
      await capture({
        dimension: 'follower_count',
        bucket: 'total',
        value: 1,
        measuredOn: day,
        timeframe: 'day',
        source: 'zernio:instagram_follower_history',
      })
    }

    const r = await db.query<{ measured_on: string }>(
      `select measured_on::text as measured_on from audience_snapshots order by measured_on`,
    )
    expect(r.rows.map((row) => row.measured_on)).toEqual(['2026-07-22', '2026-07-23', '2026-07-24'])
  })

  it('refuses a row that does not state which day it is for', async () => {
    // A mutation survivor found this gap: every other test SUPPLIES `measured_on`,
    // so giving the column a `default now()` changed nothing and the suite stayed
    // green. It would not have been harmless — a default is exactly how thirty
    // dated follower-history points would silently collapse onto today. The day
    // must be stated by the caller, so this asserts the column has no default to
    // fall back on.
    await expect(
      db.query(
        `insert into audience_snapshots
           (workspace_id, account_id, channel, audience, dimension, bucket, value, timeframe, source)
         values ($1, $2, 'instagram', 'followers', 'age', '25-34', 1, 'this_month', 'qa')`,
        [WS, ACCT],
      ),
    ).rejects.toThrow()
  })

  it('refuses a dimension nothing reads, and a bucket that is empty', async () => {
    await expect(
      capture({ dimension: 'language', bucket: 'en', value: 1, measuredOn: '2026-08-20' }),
    ).rejects.toThrow()
    await expect(
      capture({ dimension: 'age', bucket: '', value: 1, measuredOn: '2026-08-20' }),
    ).rejects.toThrow()
  })

  it('refuses an audience that is neither of the two Instagram reports', async () => {
    await expect(
      capture({
        audience: 'everyone',
        dimension: 'age',
        bucket: '25-34',
        value: 1,
        measuredOn: '2026-08-20',
      }),
    ).rejects.toThrow()
  })

  it('refuses an account id that is not a Zernio id', async () => {
    // A uuid here would mean a `connections.id` had been written where a Zernio
    // SocialAccount id belongs, and every read for that account would silently
    // return nothing.
    await expect(
      capture({
        accountId: '11111111-1111-4111-8111-111111111111',
        dimension: 'age',
        bucket: '25-34',
        value: 1,
        measuredOn: '2026-08-20',
      }),
    ).rejects.toThrow()
  })

  it('refuses a negative count', async () => {
    // Every value here is a count of accounts — Meta's own words. A negative would
    // mean the collector had COMPUTED something rather than copied it, and once
    // written it could never be taken out again.
    await expect(
      capture({
        dimension: 'follower_count',
        bucket: 'lost',
        value: -3,
        measuredOn: '2026-08-20',
        timeframe: 'day',
      }),
    ).rejects.toThrow()
  })

  it('stores a reported zero, because a reported zero is a measurement', async () => {
    // The other half of the rule above, and the one a naive "reject zeroes" guard
    // would get wrong: `followers_gained` is 0 on a quiet day and Instagram said so.
    expect(
      await capture({
        dimension: 'follower_count',
        bucket: 'gained',
        value: 0,
        measuredOn: '2026-08-20',
        timeframe: 'day',
      }),
    ).toBe(1)
  })

  it('refuses to edit or delete a measurement after it is written', async () => {
    // PGlite connects as a superuser, so this covers the service account the job
    // uses too — the block is a trigger, not a permission, and applies to everyone.
    await capture({ dimension: 'age', bucket: '25-34', value: 4500, measuredOn: '2026-08-20' })

    await expect(db.query(`update audience_snapshots set value = 999999`)).rejects.toThrow(
      /append-only/,
    )
    await expect(db.query(`delete from audience_snapshots`)).rejects.toThrow(/append-only/)
  })

  it('still removes an account’s history when the whole workspace is deleted', async () => {
    // The block above must not strand rows. This is the cascade path, which the
    // guard lets through because it arrives underneath another delete.
    await capture({ dimension: 'age', bucket: '25-34', value: 4500, measuredOn: '2026-08-20' })
    await db.query(`delete from workspaces where id = $1`, [WS])

    const r = await db.query<{ n: string }>(`select count(*) as n from audience_snapshots`)
    expect(Number(r.rows[0]?.n)).toBe(0)
  })

  it('has row-level security switched on', async () => {
    const r = await db.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where relname = 'audience_snapshots'`,
    )
    expect(r.rows[0]?.relrowsecurity).toBe(true)
  })

  it('scopes its read policy to the workspace, and grants no write policy', async () => {
    const r = await db.query<{ cmd: string; qual: string | null }>(
      `select cmd, qual from pg_policies where tablename = 'audience_snapshots'`,
    )
    expect(r.rows.map((row) => row.cmd)).toEqual(['SELECT'])
    expect(r.rows[0]?.qual).toContain('member_workspace_ids')
  })

  it('will not store a measurement against a workspace that does not exist', async () => {
    await expect(
      capture({
        workspaceId: OTHER_WS,
        dimension: 'age',
        bucket: '25-34',
        value: 1,
        measuredOn: '2026-08-20',
      }),
    ).rejects.toThrow()
  })

  it('answers the screen’s query, with a gap where nothing was collected', async () => {
    // Question (b) from section 6 of the migration, run for real. The 21st is
    // deliberately absent: it must produce NO ROW, never a zero.
    for (const [day, value] of [
      ['2026-08-20', 1],
      ['2026-08-22', 3],
    ] as const) {
      await capture({
        dimension: 'follower_count',
        bucket: 'total',
        value,
        measuredOn: day,
        timeframe: 'day',
        source: 'zernio:instagram_follower_history',
      })
    }

    const r = await db.query<{ measured_on: string; value: string }>(
      `select measured_on::text as measured_on, value
         from audience_snapshots
        where workspace_id = $1 and account_id = $2
          and dimension = 'follower_count' and bucket = 'total'
        order by measured_on`,
      [WS, ACCT],
    )
    expect(r.rows.map((row) => [row.measured_on, Number(row.value)])).toEqual([
      ['2026-08-20', 1],
      ['2026-08-22', 3],
    ])
  })
})
