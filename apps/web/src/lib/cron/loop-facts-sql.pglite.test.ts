import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import { bootFullSchema } from '@sahoda/db/testing'

import { LOOP_FACTS_SQL } from './loop-facts-sql'

/**
 * THE SUNDAY TICK'S ONE QUERY, SENT TO A REAL POSTGRES.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * From 2026-08-23 the query named `loop_autonomy`, and no such relation exists
 * — the table is `loop_channel_autonomy` and only the MIGRATION FILE is called
 * `loop_autonomy.sql`. Every tick since raised 42P01 before `assess()` ran
 * once, so `/api/cron/loop` answered `{ ok: false, error: 'LOOP_CRON_FAILED' }`
 * and no workspace was ever planned for or told why not.
 *
 * MEASURED against production 2026-08-28, the subselect run verbatim:
 * `ERROR: 42P01: relation "loop_autonomy" does not exist`.
 *
 * ── WHY NO EXISTING TEST CAUGHT IT, AND WHY THIS ONE CAN ─────────────────────
 * `run-loop-resources.test.ts` stubs the pool — `{ query: vi.fn() }` — and
 * hands every case hand-written rows. That is the right shape for testing what
 * the code DOES with a result, and it is structurally incapable of noticing
 * that the string was never valid SQL: a mock accepts any text at all.
 *
 * The only thing that can adjudicate a query is a database with this product's
 * real schema in it, which is what `bootFullSchema()` gives — every migration,
 * applied in order, in-process. The test imports the SAME constant the cron
 * runs. A copy of the query here would only prove the copy.
 *
 * ── PROVEN BY MUTATION ───────────────────────────────────────────────────────
 * Restoring `loop_autonomy` in loop-facts-sql.ts turns both tests below red
 * with `relation "loop_autonomy" does not exist`. Confirmed 2026-08-28.
 */

const WS = '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f'
const USER = 'user_loop_facts_sql'

describe('LOOP_FACTS_SQL against the real schema', () => {
  let db: PGlite

  beforeAll(async () => {
    // 120s like the sibling PGlite suites: this boots a real Postgres and
    // applies every migration before a single assertion runs. The default 10s
    // is a starved-worker failure waiting to happen under the full gate.
    db = await bootFullSchema()

    await db.exec(`
      insert into workspaces (id, name, slug, created_by)
        values ('${WS}', 'Loop facts', 'loop-facts-sql', '${USER}');
      insert into loop_settings (workspace_id, paused, weekly_budget_credits)
        values ('${WS}', false, 150);
      insert into credit_balances (workspace_id, balance_total, balance_held)
        values ('${WS}', 400, 25);
      insert into connections (workspace_id, platform, status, external_account, created_by)
        values ('${WS}', 'x', 'active', '{}'::jsonb, '${USER}');
      insert into loop_channel_autonomy (workspace_id, channel, level, created_by)
        values ('${WS}', 'x', 2, '${USER}');
    `)
  }, 120_000)

  /**
   * The assertion that would have caught the outage, and it is the plainest one
   * there is: the query runs. Everything below it is detail.
   */
  it('parses and executes — every relation it names exists', async () => {
    const r = await db.query(LOOP_FACTS_SQL, [2026, 35, 40])
    expect(r.rows.length).toBeGreaterThan(0)
  })

  /**
   * And it returns the facts `assess()` reads, in the shapes it reads them in.
   * A query that runs but aggregates the dial wrongly would leave every
   * workspace at the L1 fallback and nothing would say so.
   */
  it('returns the settings, balance, connections and dial for a workspace', async () => {
    const r = await db.query<{
      workspace_id: string
      paused: boolean | null
      weekly_budget_credits: number | null
      available_credits: string | null
      connections: { platform: string; status: string }[] | null
      dial: { channel: string; level: number }[] | null
    }>(LOOP_FACTS_SQL, [2026, 35, 40])

    const row = r.rows.find((x) => x.workspace_id === WS)
    expect(row).toBeDefined()
    expect(row?.paused).toBe(false)
    expect(row?.weekly_budget_credits).toBe(150)
    // 400 total minus 25 held. The cron reads this as available credits, and
    // reading the TOTAL instead would plan a week a workspace cannot pay for.
    expect(Number(row?.available_credits)).toBe(375)
    expect(row?.connections).toEqual([{ platform: 'x', status: 'active' }])
    expect(row?.dial).toEqual([{ channel: 'x', level: 2 }])
  })

  /**
   * A workspace that has never opened the Loop must still come back, with a
   * null `paused`. That null is what `never_enabled` is read from, and an inner
   * join here would silently drop every workspace the reason exists to explain.
   */
  it('includes a workspace with no loop_settings row, as a null paused', async () => {
    const other = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
    await db.exec(`insert into workspaces (id, name, slug, created_by)
                     values ('${other}', 'Never opened', 'never-opened-loop', '${USER}')`)

    const r = await db.query<{ workspace_id: string; paused: boolean | null }>(
      LOOP_FACTS_SQL,
      [2026, 35, 40],
    )
    const row = r.rows.find((x) => x.workspace_id === other)
    expect(row).toBeDefined()
    expect(row?.paused).toBeNull()
  })
})
