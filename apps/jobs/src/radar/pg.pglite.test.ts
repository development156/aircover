import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createRadarPgDb } from './pg'

/**
 * `dueSources`, EXECUTED against a real Postgres.
 *
 * ── THE STARVATION THIS FILE EXISTS TO CATCH ─────────────────────────────────
 * The query used to order by `last_seen_at asc nulls first`, and `last_seen_at`
 * moves only on a SUCCESSFUL read. A source that never succeeds stays NULL and
 * sorts ahead of every source that has ever been seen, forever. With a batch
 * of 100 and one careless watch list of 100 dead hostnames, every weekly pass
 * spent its whole batch on the same 100 failures and no other customer's
 * competitor was ever read again, while the pass reported `ok: true`.
 *
 * So the order is now by the last ATTEMPT (the fetch log records every one,
 * including the zero-cost gaps) with `last_seen_at` as the floor, and the id as
 * a tiebreaker so a pass is deterministic. The first test seeds 101 sources,
 * fails 100 of them, and asserts the 101st is taken on the second pass. It was
 * watched go red with the order-by put back.
 *
 * ── AND THE ORPHANS ──────────────────────────────────────────────────────────
 * Unsubscribing deletes the subscription and leaves the source in the registry.
 * `app.radar_begin_fetch` then refuses it NO_SUBSCRIBERS every pass, and with
 * no stamp it too occupied a slot forever. `dueSources` now returns only
 * sources somebody is still watching.
 *
 * The DDL below carries only the columns these statements touch. Drift against
 * the real migration is the live suite's job.
 */

const DDL = `
  create table workspaces (id uuid primary key);
  create table competitors (id uuid primary key default gen_random_uuid());
  create table competitor_sources (
    id uuid primary key,
    competitor_id uuid not null references competitors (id) on delete cascade,
    kind text not null,
    locator text not null,
    cadence text not null,
    etag text,
    last_modified text,
    content_hash text,
    last_seen_at timestamptz
  );
  create table competitor_subscriptions (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references workspaces (id) on delete cascade,
    competitor_id uuid not null references competitors (id) on delete cascade,
    unique (workspace_id, competitor_id)
  );
  create table radar_fetch_log (
    id uuid primary key default gen_random_uuid(),
    source_id uuid not null references competitor_sources (id) on delete cascade,
    outcome text not null default 'pending',
    fetched_at timestamptz not null default now()
  );
`

const WS = '11111111-1111-4111-8111-111111111111'
const WS_2 = '22222222-2222-4222-8222-222222222222'

/** Deterministic, sortable ids: source n is `…-0000000000nn`. */
const sourceId = (n: number): string => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
const competitorId = (n: number): string => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`

function poolOver(db: PGlite): Pool {
  return {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as unknown[])
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    },
  } as unknown as Pool
}

describe('dueSources (real Postgres, in-process)', () => {
  let db: PGlite
  let radar: ReturnType<typeof createRadarPgDb>

  /** One competitor, one weekly website source, subscribed by `workspaces`. */
  const seed = async (n: number, workspaces: string[] = [WS]): Promise<void> => {
    await db.query('insert into competitors (id) values ($1)', [competitorId(n)])
    await db.query(
      `insert into competitor_sources (id, competitor_id, kind, locator, cadence)
       values ($1, $2, 'website', $3, 'weekly')`,
      [sourceId(n), competitorId(n), `rival-${n}.example`],
    )
    for (const ws of workspaces) {
      await db.query(
        'insert into competitor_subscriptions (workspace_id, competitor_id) values ($1, $2)',
        [ws, competitorId(n)],
      )
    }
  }

  const attempt = (id: string, outcome: string, at = 'now()'): Promise<unknown> =>
    db.query(
      `insert into radar_fetch_log (source_id, outcome, fetched_at) values ($1, $2, ${at})`,
      [id, outcome],
    )

  beforeEach(async () => {
    db = new PGlite()
    await db.exec(DDL)
    await db.query('insert into workspaces (id) values ($1), ($2)', [WS, WS_2])
    radar = createRadarPgDb(poolOver(db))
  })

  afterEach(async () => {
    await db.close()
  })

  it('rotates sources that never succeed out of the batch, so the 101st is reached on pass two', async () => {
    for (let n = 1; n <= 101; n += 1) await seed(n)

    const first = await radar.dueSources(100)
    expect(first).toHaveLength(100)
    // Every one of them fails: attempted, never seen. `last_seen_at` stays NULL.
    for (const s of first) await attempt(s.sourceId, 'could_not_check')

    const second = await radar.dueSources(100)
    const firstIds = new Set(first.map((s) => s.sourceId))
    const leftOut = [sourceId(101)].filter((id) => !firstIds.has(id))
    // Whichever source pass one left out, pass two takes it first.
    expect(leftOut).toHaveLength(1)
    expect(second[0]?.sourceId).toBe(leftOut[0])
  })

  it('among never-attempted sources the order is by id, so a pass is deterministic', async () => {
    await seed(3)
    await seed(1)
    await seed(2)

    const due = await radar.dueSources(10)

    expect(due.map((s) => s.sourceId)).toEqual([sourceId(1), sourceId(2), sourceId(3)])
  })

  it('a failed attempt sorts AFTER a source that has never been tried', async () => {
    await seed(1)
    await seed(2)
    await attempt(sourceId(1), 'could_not_check')

    const due = await radar.dueSources(10)

    expect(due.map((s) => s.sourceId)).toEqual([sourceId(2), sourceId(1)])
  })

  it('the oldest attempt goes first, not the oldest sighting', async () => {
    await seed(1)
    await seed(2)
    // Source 1 was seen a month ago and retried (and failed) yesterday.
    await db.query(
      `update competitor_sources set last_seen_at = now() - interval '30 days' where id = $1`,
      [sourceId(1)],
    )
    await attempt(sourceId(1), 'could_not_check', "now() - interval '1 day'")
    // Source 2 was seen ten days ago and not tried since.
    await db.query(
      `update competitor_sources set last_seen_at = now() - interval '10 days' where id = $1`,
      [sourceId(2)],
    )

    const due = await radar.dueSources(10)

    expect(due.map((s) => s.sourceId)).toEqual([sourceId(2), sourceId(1)])
  })

  it('a source nobody watches any more is not due at all', async () => {
    await seed(1, [])
    await seed(2, [WS])

    const due = await radar.dueSources(10)

    expect(due.map((s) => s.sourceId)).toEqual([sourceId(2)])
  })

  it('a source seen an hour ago is not due on a weekly cadence', async () => {
    await seed(1)
    await db.query(
      `update competitor_sources set last_seen_at = now() - interval '1 hour' where id = $1`,
      [sourceId(1)],
    )

    expect(await radar.dueSources(10)).toEqual([])
  })
})

describe('subscribers (real Postgres, in-process)', () => {
  let db: PGlite
  let radar: ReturnType<typeof createRadarPgDb>

  beforeEach(async () => {
    db = new PGlite()
    await db.exec(DDL)
    await db.query('insert into workspaces (id) values ($1), ($2)', [WS, WS_2])
    radar = createRadarPgDb(poolOver(db))
  })

  afterEach(async () => {
    await db.close()
  })

  it('lists every workspace watching the competitor a source belongs to, once each, in a fixed order', async () => {
    await db.query('insert into competitors (id) values ($1)', [competitorId(1)])
    await db.query(
      `insert into competitor_sources (id, competitor_id, kind, locator, cadence)
       values ($1, $2, 'website', 'rival.example', 'weekly'),
              ($3, $2, 'instagram', 'rival', 'weekly')`,
      [sourceId(1), competitorId(1), sourceId(2)],
    )
    await db.query(
      'insert into competitor_subscriptions (workspace_id, competitor_id) values ($1, $3), ($2, $3)',
      [WS_2, WS, competitorId(1)],
    )

    // Both sources of the competitor answer the same two workspaces.
    expect(await radar.subscribers(sourceId(1))).toEqual([WS, WS_2])
    expect(await radar.subscribers(sourceId(2))).toEqual([WS, WS_2])
  })

  it('is empty for a source nobody watches', async () => {
    await db.query('insert into competitors (id) values ($1)', [competitorId(1)])
    await db.query(
      `insert into competitor_sources (id, competitor_id, kind, locator, cadence)
       values ($1, $2, 'website', 'rival.example', 'weekly')`,
      [sourceId(1), competitorId(1)],
    )

    expect(await radar.subscribers(sourceId(1))).toEqual([])
  })
})
