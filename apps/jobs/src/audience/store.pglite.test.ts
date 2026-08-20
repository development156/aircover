import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { createAudienceStore, type PgQueryable } from './store'
import type { AudienceSnapshot } from './capture'

/**
 * The audience pass's two statements, EXECUTED against a real Postgres.
 *
 * ── WHY EXECUTION AND NOT REVIEW ─────────────────────────────────────────────
 * `capture.test.ts` injects both of these as functions, which is right for testing
 * the pass and proves nothing about the SQL underneath it. The read here decides
 * which accounts get asked about at all, and its failure mode is the quiet one: a
 * mis-joined condition returns fewer rows and nothing goes red, so the product
 * collects a smaller history than the customer believes they have — a gap that,
 * for this table, can never be filled in afterwards.
 *
 * The write's failure mode is worse and also silent: `on conflict do nothing`
 * naming the wrong key would double every figure on the screen.
 *
 * ── THE DDL IS THE REAL MIGRATION FILE ───────────────────────────────────────
 * Not a hand-written subset. A hand copy would let the store's conflict target and
 * the founder's actual constraint drift apart while this file stayed green.
 */

const MIGRATION = new URL(
  '../../../../packages/db/supabase/migrations/20260820220000_audience_snapshots.sql',
  import.meta.url,
).pathname

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'
const PROFILE = 'a'.repeat(24)
const OTHER_PROFILE = 'b'.repeat(24)
const ACCT = '6a81aff477555aae0149e261'

/** Only what these two statements touch, plus Supabase's side, stubbed. */
const DDL = `
  create table workspaces (id uuid primary key);
  create table connections (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    platform text not null,
    status text not null,
    external_account jsonb,
    created_at timestamptz not null default now()
  );
  create table zernio_profiles (
    workspace_id uuid primary key,
    profile_id text not null
  );

  create schema if not exists app;
  create or replace function app.apply_tenant_read_policy(tbl text) returns void
  language plpgsql as $$
  begin
    execute format('alter table %I enable row level security', tbl);
  end;
  $$;
  create or replace function app.block_mutations() returns trigger
  language plpgsql as $$
  begin
    if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
    raise exception 'append-only: % on % is not permitted', tg_op, tg_table_name;
  end;
  $$;
`

function poolOver(db: PGlite): PgQueryable {
  return {
    query: async <R extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ): Promise<{ rows: R[]; rowCount: number | null }> => {
      const r = await db.query(text, params as unknown[])
      return { rows: r.rows as R[], rowCount: r.affectedRows ?? r.rows.length }
    },
  }
}

function snapshot(over: Partial<AudienceSnapshot> = {}): AudienceSnapshot {
  return {
    workspaceId: WS,
    accountId: ACCT,
    channel: 'instagram',
    audience: 'followers',
    dimension: 'age',
    bucket: '25-34',
    value: 4500,
    measuredOn: '2026-08-20',
    timeframe: 'this_month',
    source: 'zernio:instagram_demographics:follower_demographics',
    ...over,
  }
}

describe('the audience store (real Postgres, in-process)', () => {
  let db: PGlite
  let store: ReturnType<typeof createAudienceStore>

  /**
   * `??` is deliberately NOT used to apply the defaults below: `external_account`
   * is legitimately null in one case, and `?? default` would silently replace an
   * explicit null, making that test pass for the wrong reason.
   */
  const addConnection = (over: Record<string, unknown> = {}): Promise<unknown> => {
    const pick = (key: string, fallback: unknown): unknown => (key in over ? over[key] : fallback)
    return db.query(
      `insert into connections (workspace_id, platform, status, external_account)
       values ($1, $2, $3, $4)`,
      [
        pick('workspace_id', WS),
        pick('platform', 'instagram'),
        pick('status', 'active'),
        JSON.stringify(pick('external_account', { id: ACCT, profileId: PROFILE })),
      ],
    )
  }

  /**
   * ONE Postgres for the file. Each boot is a fresh WebAssembly Postgres costing
   * seconds of CPU, and under the full gate that starves the web suite.
   *
   * The snapshots table is deliberately NOT created here. Half of these tests are
   * about the pass having nowhere to store yet, so it is created only by the tests
   * that need it and dropped again after — no test may depend on a neighbour
   * having made it.
   */
  beforeAll(async () => {
    db = await new PGlite()
    await db.exec(`create extension if not exists pgcrypto;`).catch(() => undefined)
    await db.exec(DDL)
    store = createAudienceStore({ pool: poolOver(db) })
  })

  beforeEach(async () => {
    await db.exec('drop table if exists audience_snapshots cascade')
    await db.exec('truncate connections, zernio_profiles, workspaces cascade')
    await db.query(`insert into workspaces (id) values ($1), ($2)`, [WS, OTHER_WS])
    await db.query(`insert into zernio_profiles (workspace_id, profile_id) values ($1, $2), ($3, $4)`, [
      WS,
      PROFILE,
      OTHER_WS,
      OTHER_PROFILE,
    ])
  })

  afterAll(async () => {
    await db.close()
  })

  async function createTable(): Promise<void> {
    await db.exec(readFileSync(MIGRATION, 'utf8'))
  }

  describe('which accounts get asked about', () => {
    it('finds an active Instagram account with a matching profile', async () => {
      await addConnection()
      expect(await store.listTargets()).toEqual([
        { workspaceId: WS, accountId: ACCT, channel: 'instagram' },
      ])
    })

    it.each(['expired', 'revoked', 'error'])('skips a %s connection', async (status) => {
      // MEASURED 2026-08-20: both expired rows in production answer HTTP 404
      // `account_not_found`. Asking spends a call to be told nothing.
      await addConnection({ status })
      expect(await store.listTargets()).toEqual([])
    })

    it.each(['x', 'gbp', 'linkedin'])('skips %s, which reports no demographics', async (platform) => {
      // The sibling-shape check: a filter written against one wrong platform would
      // let the other two through and burn the rate limit on 404s every night.
      await addConnection({ platform })
      expect(await store.listTargets()).toEqual([])
    })

    it('skips a connection carrying no account id', async () => {
      await addConnection({ external_account: { profileId: PROFILE } })
      expect(await store.listTargets()).toEqual([])
    })

    it('skips a connection whose account id is a uuid rather than a Zernio id', async () => {
      // The id space this join assumes. A uuid here earns a 404 from Zernio, and
      // the failure would read as "the account is gone" rather than "we stored the
      // wrong id".
      await addConnection({
        external_account: { id: '11111111-1111-4111-8111-111111111111', profileId: PROFILE },
      })
      expect(await store.listTargets()).toEqual([])
    })

    it('skips an account sitting under another workspace’s profile', async () => {
      // Doc 13 section 3: Zernio validates an account id against the whole TEAM, so
      // a mismatched pairing does not error — it answers 200 with someone else's
      // audience. The join is what makes that unexpressible.
      await addConnection({ external_account: { id: ACCT, profileId: OTHER_PROFILE } })
      expect(await store.listTargets()).toEqual([])
    })

    it('skips a workspace with no Zernio profile at all', async () => {
      await db.exec('truncate zernio_profiles')
      await addConnection()
      expect(await store.listTargets()).toEqual([])
    })

    it('honours the batch limit', async () => {
      await addConnection()
      await addConnection({ external_account: { id: 'c'.repeat(24), profileId: PROFILE } })
      const small = createAudienceStore({ pool: poolOver(db), limit: 1 })
      expect(await small.listTargets()).toHaveLength(1)
    })
  })

  describe('writing', () => {
    it('says the table is not there rather than throwing', async () => {
      // Production's state until the migration is applied. A nightly job that
      // raised an alarm until then is a job people learn to ignore.
      expect(await store.writeSnapshots([])).toEqual({ inserted: 0, storage: 'not-ready' })
      expect(await store.writeSnapshots([snapshot()])).toEqual({
        inserted: 0,
        storage: 'not-ready',
      })
    })

    it('reports the table as ready with nothing to write', async () => {
      await createTable()
      expect(await store.writeSnapshots([])).toEqual({ inserted: 0, storage: 'ready' })
    })

    it('stores a batch', async () => {
      await createTable()
      const rows = [
        snapshot(),
        snapshot({ dimension: 'gender', bucket: 'F', value: 4800 }),
        snapshot({
          dimension: 'follower_count',
          bucket: 'total',
          value: 1,
          measuredOn: '2026-08-17',
          timeframe: 'day',
          source: 'zernio:instagram_follower_history',
        }),
      ]
      expect(await store.writeSnapshots(rows)).toEqual({ inserted: 3, storage: 'ready' })
    })

    it('writes NOTHING on a second run of the same day', async () => {
      // The conflict target this store names, checked against the constraint the
      // migration file really creates. Naming a different key here would double
      // every figure on the screen, silently.
      await createTable()
      await store.writeSnapshots([snapshot()])
      expect(await store.writeSnapshots([snapshot({ value: 9999 })])).toEqual({
        inserted: 0,
        storage: 'ready',
      })
      const r = await db.query<{ value: string }>(`select value from audience_snapshots`)
      expect(r.rows).toHaveLength(1)
      expect(Number(r.rows[0]?.value)).toBe(4500) // the FIRST answer of the day is kept
    })

    it('writes the thirty-day overlap of the follower endpoint exactly once', async () => {
      // One call returns ~30 dated points, and tomorrow's call returns 29 of the
      // same ones. Without the day key that would be 29 duplicates every night.
      await createTable()
      const days = ['2026-08-17', '2026-08-18', '2026-08-19']
      const rows = days.map((d) =>
        snapshot({
          dimension: 'follower_count',
          bucket: 'total',
          value: 1,
          measuredOn: d,
          timeframe: 'day',
          source: 'zernio:instagram_follower_history',
        }),
      )
      expect((await store.writeSnapshots(rows)).inserted).toBe(3)
      // Tomorrow: the same three, plus one new day.
      const tomorrow = [
        ...rows,
        snapshot({
          dimension: 'follower_count',
          bucket: 'total',
          value: 2,
          measuredOn: '2026-08-20',
          timeframe: 'day',
          source: 'zernio:instagram_follower_history',
        }),
      ]
      expect((await store.writeSnapshots(tomorrow)).inserted).toBe(1)
      const r = await db.query<{ n: string }>(`select count(*) as n from audience_snapshots`)
      expect(Number(r.rows[0]?.n)).toBe(4)
    })

    it('keeps the day as a DATE, not as today', async () => {
      // The peer failure this shape exists to avoid: a parameter Postgres has to
      // infer two types for. `measured_on` is passed as text and cast explicitly.
      await createTable()
      await store.writeSnapshots([snapshot({ measuredOn: '2026-07-04' })])
      const r = await db.query<{ d: string }>(
        `select measured_on::text as d from audience_snapshots`,
      )
      expect(r.rows[0]?.d).toBe('2026-07-04')
    })

    it('lets the table refuse a row the collector should never have built', async () => {
      // The constraints are the last line, and they are reachable from here. A
      // negative count would mean the collector had computed rather than copied.
      await createTable()
      await expect(store.writeSnapshots([snapshot({ value: -1 })])).rejects.toThrow()
      await expect(
        store.writeSnapshots([snapshot({ accountId: 'not-a-zernio-id' })]),
      ).rejects.toThrow()
    })
  })
})
