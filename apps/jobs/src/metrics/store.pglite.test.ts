import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { createMetricStore, type PgQueryable } from './store'

/**
 * The metric-history pass's two statements, EXECUTED against a real Postgres.
 *
 * ── WHY EXECUTION AND NOT REVIEW ─────────────────────────────────────────────
 * `capture.test.ts` injects both of these as functions, which is right for testing
 * the pass and proves nothing about the SQL underneath it. The read here decides
 * which channels get asked about at all, and its failure mode is the quiet one: a
 * mis-joined condition does not error, it returns fewer rows — so the product
 * collects a smaller history than the customer believes they have, and nothing
 * anywhere goes red.
 *
 * The write's failure mode is worse and also silent: `on conflict do nothing`
 * against the wrong key would double every total on the chart.
 *
 * ── THE DDL IS THE REAL ONE ──────────────────────────────────────────────────
 * Not a hand-written subset. `post_metric_snapshots` is created by executing the
 * actual migration file, so the conflict target this store names is the constraint
 * the founder will really apply. A hand copy would let the two drift and the test
 * would keep passing.
 */

const MIGRATIONS = new URL('../../../../packages/db/supabase/migrations/', import.meta.url).pathname

const SNAPSHOT_MIGRATION = '20260819000100_post_metric_snapshots.sql'

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'
const POST = '22222222-2222-4222-8222-222222222222'
const PROFILE = 'a'.repeat(24)

/** Only the columns these two statements touch, plus the real snapshots table. */
const DDL = `
  create table posts (
    id uuid primary key,
    workspace_id uuid not null,
    unique (id, workspace_id)
  );
  create table workspaces (id uuid primary key);
  create table post_variants (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    post_id uuid not null,
    channel text not null,
    publish_status text not null,
    platform_post_id text,
    permalink text
  );
  create table post_publish_logs (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    post_id uuid not null,
    channel text not null,
    status text not null,
    published_at timestamptz
  );
  create table zernio_profiles (
    workspace_id uuid primary key,
    profile_id text not null
  );

  -- Supabase's side, stubbed just enough for the migration file to run. Neither
  -- stub can flatter a result: they let the DDL execute and decide nothing. What
  -- they stand in for is exercised for real in packages/db's own suite.
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

describe('the metric store (real Postgres, in-process)', () => {
  let db: PGlite
  let store: ReturnType<typeof createMetricStore>

  /**
   * `??` is deliberately NOT used to apply the defaults below.
   *
   * It cannot be: two of these columns are legitimately null, and `?? default`
   * silently replaces an explicit null with the default — so the case that asserts
   * "a variant with no platform id is skipped" would have inserted an id and
   * passed for the wrong reason. Presence of the KEY decides, not truthiness.
   */
  const addVariant = (over: Record<string, unknown> = {}): Promise<unknown> => {
    const pick = (key: string, fallback: unknown): unknown => (key in over ? over[key] : fallback)
    return db.query(
      `insert into post_variants
         (workspace_id, post_id, channel, publish_status, platform_post_id, permalink)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        pick('workspace_id', WS),
        pick('post_id', POST),
        pick('channel', 'instagram'),
        pick('publish_status', 'published'),
        pick('platform_post_id', '17900000000000000'),
        pick('permalink', 'https://instagram.com/p/abc'),
      ],
    )
  }

  /**
   * ONE Postgres for the file, not one per test.
   *
   * Each boot is a fresh WebAssembly Postgres costing about three seconds of CPU;
   * per-test booting made this file start sixteen of them, and under the full gate
   * — every package's suite running at once — that starved the web suite into
   * timeouts. Truncating between tests gives the same isolation for a fraction of
   * the cost.
   *
   * The snapshots table is deliberately NOT created here. Half of these tests are
   * about the pass having nowhere to store yet, which is the state production is
   * in, so it is created only by the tests that need it — and dropped again after,
   * so no test can depend on a neighbour having made it.
   */
  async function boot(): Promise<void> {
    db = await new PGlite()
    await db.exec(`create extension if not exists pgcrypto;`).catch(() => undefined)
    await db.exec(DDL)
    store = createMetricStore({ pool: poolOver(db) })
  }

  beforeAll(boot)

  beforeEach(async () => {
    await db.exec(`
      drop table if exists post_metric_snapshots;
      truncate post_variants, post_publish_logs, posts, workspaces, zernio_profiles cascade;
    `)
    await db.query(`insert into workspaces (id) values ($1), ($2)`, [WS, OTHER_WS])
    await db.query(`insert into posts (id, workspace_id) values ($1, $2)`, [POST, WS])
    await db.query(`insert into zernio_profiles (workspace_id, profile_id) values ($1, $2)`, [
      WS,
      PROFILE,
    ])
    store = createMetricStore({ pool: poolOver(db) })
  })

  afterAll(async () => {
    await db.close()
  })

  describe('choosing what to ask about', () => {
    it('takes a published channel with a platform id', async () => {
      await addVariant()
      const targets = await store.listTargets()

      expect(targets).toHaveLength(1)
      expect(targets[0]).toMatchObject({
        workspaceId: WS,
        profileId: PROFILE,
        channel: 'instagram',
        platformPostId: '17900000000000000',
      })
    })

    it('skips a channel that has not published', async () => {
      await addVariant({ publish_status: 'scheduled' })
      expect(await store.listTargets()).toEqual([])
    })

    it('skips a published channel with no platform id', async () => {
      // That id IS the analytics key. Without one there is no question to ask.
      await addVariant({ platform_post_id: null })
      expect(await store.listTargets()).toEqual([])
    })

    it('skips a simulated publish', async () => {
      // A fixture never reached a platform. Asking spends a call to be told
      // nothing — or is answered about a real post if the id ever collided.
      await addVariant({ permalink: 'fixture://instagram/abc' })
      expect(await store.listTargets()).toEqual([])
    })

    it('skips a workspace with no Zernio profile', async () => {
      // The profile is what SCOPES the read. Zernio's analytics filter defaults to
      // every profile on the key, so asking without one reads across tenants.
      await db.query(`insert into posts (id, workspace_id) values ($1, $2)`, [
        '33333333-3333-4333-8333-333333333333',
        OTHER_WS,
      ])
      await addVariant({
        workspace_id: OTHER_WS,
        post_id: '33333333-3333-4333-8333-333333333333',
      })

      expect(await store.listTargets()).toEqual([])
    })

    it('pairs each post with its OWN workspace’s profile', async () => {
      // The join is the tenant boundary here — the id and the post it is asked
      // about must come out of the same row. A cross join would read one
      // customer's numbers under another's profile and return HTTP 200.
      await db.query(`insert into zernio_profiles (workspace_id, profile_id) values ($1, $2)`, [
        OTHER_WS,
        'b'.repeat(24),
      ])
      await addVariant()

      const targets = await store.listTargets()
      expect(targets).toHaveLength(1)
      expect(targets[0]?.profileId).toBe(PROFILE)
    })

    it('carries the latest succeeded publish time, and ignores failures', async () => {
      // The window judgement is measured from it, and the LATEST succeeded attempt
      // is the one the platform is reporting on.
      await addVariant()
      await db.query(
        `insert into post_publish_logs (workspace_id, post_id, channel, status, published_at)
         values ($1, $2, 'instagram', 'succeeded', '2026-08-10T09:00:00Z'),
                ($1, $2, 'instagram', 'succeeded', '2026-08-12T09:00:00Z'),
                ($1, $2, 'instagram', 'failed',    '2026-08-14T09:00:00Z')`,
        [WS, POST],
      )

      const targets = await store.listTargets()
      expect(targets[0]?.publishedAt).toContain('2026-08-12')
    })

    it('still asks about a channel whose publish time was never recorded', async () => {
      // Null is a legitimate answer and the classifier handles it. Dropping the row
      // would silently exclude it from the history forever.
      await addVariant()
      const targets = await store.listTargets()

      expect(targets).toHaveLength(1)
      expect(targets[0]?.publishedAt).toBeNull()
    })

    /**
     * ── ONE WORKSPACE, BECAUSE A PERSON PRESSED A BUTTON ───────────────────
     * "Measure now" on /analytics runs this same pass for the caller's own
     * workspace. Unscoped, their click spends the whole batch on the fleet and
     * can come back having measured none of their posts at all.
     *
     * Executed rather than asserted through a mock: a mock that checks
     * `createMetricStore` was handed a workspace id proves the argument
     * arrived, and says nothing about whether the SQL uses it.
     */
    it('asks only about the workspace it was given', async () => {
      const otherPost = '44444444-4444-4444-8444-444444444444'
      await db.query(`insert into posts (id, workspace_id) values ($1, $2)`, [otherPost, OTHER_WS])
      await db.query(`insert into zernio_profiles (workspace_id, profile_id) values ($1, $2)`, [
        OTHER_WS,
        'b'.repeat(24),
      ])
      await addVariant()
      await addVariant({ workspace_id: OTHER_WS, post_id: otherPost })

      expect(await store.listTargets()).toHaveLength(2)

      const scoped = createMetricStore({ pool: poolOver(db), workspaceId: OTHER_WS })
      const targets = await scoped.listTargets()
      expect(targets).toHaveLength(1)
      expect(targets[0]?.workspaceId).toBe(OTHER_WS)
    })

    /**
     * The scope has to hold on BOTH forms of the query. `listTargets` orders by
     * least-recently-measured and falls back to `published_at` when the history
     * table is absent — which is the state this environment is in until the
     * migration is applied. A filter applied to one form only would leak the
     * whole fleet into one person's click on exactly the path production takes.
     */
    it('asks only about that workspace on the no-history fallback too', async () => {
      const otherPost = '55555555-5555-4555-8555-555555555555'
      await db.query(`insert into posts (id, workspace_id) values ($1, $2)`, [otherPost, OTHER_WS])
      await db.query(`insert into zernio_profiles (workspace_id, profile_id) values ($1, $2)`, [
        OTHER_WS,
        'b'.repeat(24),
      ])
      await addVariant()
      await addVariant({ workspace_id: OTHER_WS, post_id: otherPost })
      // `beforeEach` drops post_metric_snapshots, so the fair ordering raises
      // 42P01 and the fallback is the path actually taken here.
      const scoped = createMetricStore({ pool: poolOver(db), workspaceId: WS })

      const targets = await scoped.listTargets()
      expect(targets).toHaveLength(1)
      expect(targets[0]?.workspaceId).toBe(WS)
    })

    it('bounds one pass, because each target is a request', async () => {
      for (let i = 0; i < 5; i += 1) {
        await addVariant({ channel: `ch${i}`, platform_post_id: `id${i}` })
      }
      const bounded = createMetricStore({ pool: poolOver(db), limit: 3 })

      expect(await bounded.listTargets()).toHaveLength(3)
    })
  })

  describe('storing what was measured', () => {
    const row = (over: Record<string, unknown> = {}) => ({
      workspaceId: WS,
      postId: POST,
      channel: 'instagram' as const,
      metric: 'reach' as const,
      value: 1200,
      measuredAt: '2026-08-17T09:00:00Z',
      ...over,
    })

    /**
     * The real migration file, applied WHOLE.
     *
     * Whole rather than a chosen slice of it: the conflict target this store names
     * has to be the constraint the founder will really create, and a test that
     * applied part of the file could go green against a table nobody will have.
     *
     * The two `app.*` helpers it calls are Supabase-side and stubbed above — this
     * suite is about the store's two statements, and what those helpers install
     * (the read policy, the append-only guard) is executed for real in
     * `packages/db/tests/post_metric_snapshots.pglite.test.ts`.
     */
    async function applySnapshots(): Promise<void> {
      const { readFileSync } = await import('node:fs')
      await db.exec(readFileSync(`${MIGRATIONS}20260819000100_post_metric_snapshots.sql`, 'utf8'))
    }

    it('reports that there is nowhere to store, rather than throwing', async () => {
      // The state production is in until the founder applies the migration.
      const result = await store.writeSnapshots([row()])
      expect(result).toEqual({ inserted: 0, storage: 'not-ready' })
    })

    it('reports the same with nothing to store', async () => {
      // Otherwise a quiet night would report a healthy table that does not exist,
      // and nobody would learn the migration is still missing.
      expect(await store.writeSnapshots([])).toEqual({ inserted: 0, storage: 'not-ready' })
    })

    it('stores the numbers once the table is there', async () => {
      await applySnapshots()
      const result = await store.writeSnapshots([
        row(),
        row({ metric: 'impressions', value: 3000 }),
      ])

      expect(result).toEqual({ inserted: 2, storage: 'ready' })
    })

    it('cannot double a total when the pass runs twice in one day', async () => {
      // The conflict target names the constraint from the migration file itself,
      // so this goes red if the two ever disagree.
      await applySnapshots()
      await store.writeSnapshots([row()])
      const again = await store.writeSnapshots([row({ measuredAt: '2026-08-17T21:00:00Z' })])

      expect(again).toEqual({ inserted: 0, storage: 'ready' })
      const count = await db.query<{ n: string }>(`select count(*) as n from post_metric_snapshots`)
      expect(Number(count.rows[0]?.n)).toBe(1)
    })

    it('keeps the next day as its own point', async () => {
      await applySnapshots()
      await store.writeSnapshots([row()])
      const next = await store.writeSnapshots([row({ measuredAt: '2026-08-18T09:00:00Z' })])

      expect(next.inserted).toBe(1)
    })

    it('reports an empty pass as ready once the table exists', async () => {
      await applySnapshots()
      expect(await store.writeSnapshots([])).toEqual({ inserted: 0, storage: 'ready' })
    })

    it('refuses loudly if the daily rule it relies on is not there', async () => {
      // ── WHAT NAMING THE CONFLICT TARGET ACTUALLY BUYS ──────────────────────
      // While the constraint exists, `on conflict (…cols…) do nothing` and a bare
      // `on conflict do nothing` behave identically — so no test can tell them
      // apart on a correct schema, and swapping one for the other is an
      // equivalent change rather than a defect.
      //
      // They differ exactly here: if the daily rule is ever dropped or changed,
      // the NAMED target errors and this pass stops, while the bare form silently
      // swallows whatever conflicts remain and writes a second row for the same
      // day — doubling every total the chart draws, with nothing going red.
      //
      // Failing to store one night is recoverable. A doubled history is not.
      await applySnapshots()

      // Looked up rather than spelled out: Postgres generates the name from the
      // column list and TRUNCATES it at 63 characters, so a hardcoded one is a
      // guess that would make this test drop nothing and pass for free.
      const found = await db.query<{ conname: string }>(
        `select conname from pg_constraint
          where conrelid = 'post_metric_snapshots'::regclass and contype = 'u'`,
      )
      expect(found.rows).toHaveLength(1)
      await db.exec(`alter table post_metric_snapshots drop constraint "${found.rows[0]!.conname}"`)

      await expect(store.writeSnapshots([row()])).rejects.toThrow()
    })
  })

  /**
   * ── PERMANENT STARVATION PAST THE BATCH SIZE ────────────────────────────────
   *
   * The route asks for 120 targets a night. The ordering was `published_at asc`,
   * and `published_at` NEVER CHANGES — so the same 120 rows were selected every
   * night for ever and target 121 was never measured once. Not "delayed until the
   * backlog drains", which is what the comment above the query claimed: starved,
   * permanently. At the current batch that arrives at roughly fifty workspaces.
   *
   * These run ABOVE the threshold — 150 targets against a batch of 120 — because
   * at or below it every target fits in one pass and the bug cannot appear. A
   * fixture where the defect is impossible proves nothing about the defect.
   */
  describe('fairness above the batch size', () => {
    const BATCH = 120
    const TARGETS = 150

    /** One post per target, each its own channel row, all published. */
    async function seedTargets(n: number): Promise<string[]> {
      const ids: string[] = []
      for (let i = 0; i < n; i += 1) {
        const postId = `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`
        ids.push(postId)
        await db.query(`insert into posts (id, workspace_id) values ($1, $2)`, [postId, WS])
        await db.query(
          `insert into post_variants
             (workspace_id, post_id, channel, publish_status, platform_post_id, permalink)
           values ($1, $2, 'instagram', 'published', $3, $4)`,
          [WS, postId, `pid-${i}`, `https://instagram.com/p/${i}`],
        )
        // Published oldest-first, so the OLD ordering is deterministic and its
        // starvation is reproducible rather than incidental.
        await db.query(
          `insert into post_publish_logs (workspace_id, post_id, channel, status, published_at)
           values ($1, $2, 'instagram', 'succeeded', $3)`,
          [WS, postId, new Date(Date.UTC(2026, 0, 1) + i * 3_600_000)],
        )
      }
      return ids
    }

    /** Record a measurement for each target, as a real pass would. */
    async function measure(targets: { postId: string }[], at: Date): Promise<void> {
      for (const target of targets) {
        await db.query(
          `insert into post_metric_snapshots
             (workspace_id, post_id, channel, metric, value, measured_at)
           values ($1, $2, 'instagram', 'impressions', 1, $3)
           on conflict do nothing`,
          [WS, target.postId, at],
        )
      }
    }

    beforeEach(async () => {
      await db.exec(readFileSync(resolve(MIGRATIONS, SNAPSHOT_MIGRATION), 'utf8'))
      store = createMetricStore({ pool: poolOver(db), limit: BATCH })
    })

    it('reaches EVERY target within two nights, at 150 targets and a batch of 120', async () => {
      await seedTargets(TARGETS)

      const seen = new Set<string>()
      for (let night = 0; night < 2; night += 1) {
        const targets = await store.listTargets()
        expect(targets).toHaveLength(BATCH)
        for (const t of targets) seen.add(t.postId)
        await measure(targets, new Date(Date.UTC(2026, 5, 1 + night)))
      }

      // 150 targets, 120 a night: two nights is enough to reach all of them, and
      // only because the second night selects the ones the first did not.
      expect(seen.size).toBe(TARGETS)
    })

    it('puts a measured target BEHIND one never measured', async () => {
      await seedTargets(TARGETS)

      const firstNight = await store.listTargets()
      await measure(firstNight, new Date(Date.UTC(2026, 5, 1)))

      const secondNight = await store.listTargets()
      const measured = new Set(firstNight.map((t) => t.postId))

      // The 30 never-measured targets sort first, ahead of everything measured.
      const leading = secondNight.slice(0, TARGETS - BATCH).map((t) => t.postId)
      expect(leading.every((id) => !measured.has(id))).toBe(true)
      expect(new Set(leading).size).toBe(TARGETS - BATCH)
    })

    it('rotates: after everything is measured once, the oldest measurement goes first', async () => {
      await seedTargets(TARGETS)

      const night1 = await store.listTargets()
      await measure(night1, new Date(Date.UTC(2026, 5, 1)))
      const night2 = await store.listTargets()
      await measure(night2, new Date(Date.UTC(2026, 5, 2)))

      // Everything has now been measured. The third night must lead with the
      // targets measured on the FIRST night, not with the same 120 again.
      const night3 = await store.listTargets()
      const night2Ids = new Set(night2.map((t) => t.postId))
      expect(night3.slice(0, 20).every((t) => !night2Ids.has(t.postId))).toBe(true)
    })
  })
})
