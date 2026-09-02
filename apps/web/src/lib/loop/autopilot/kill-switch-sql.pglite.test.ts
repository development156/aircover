import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import { bootFullSchema } from '@sahoda/db/testing'

import { AUTOPILOT_SETTINGS_SQL, AUTOPILOT_WORKSPACES_SQL, WRITE_DECISION_SQL } from './sql'

/**
 * THE TWO STATEMENTS THAT CHANGED ON 2026-09-02, SENT TO A REAL POSTGRES.
 *
 * `packages/db/tests/loop_autopilot_sql.pglite.test.ts` adjudicates every
 * dispatcher statement, but it asserts the settings statement's three original
 * columns by name and never reads the fleet scan at all. This file proves the
 * two facts that file cannot see: the settings read now carries `paused`, and
 * the fleet scan drops a paused workspace UNLESS it still holds an open
 * announcement, which is the case the tick must visit to cancel.
 *
 * ── THE L3 TRIGGER IS DISABLED FOR THIS DATABASE ONLY ────────────────────────
 * `loop_channel_autonomy_autopilot_guard` refuses a level-3 write without a
 * reported supervised cycle and four confirmed brain fields. Those
 * preconditions are proven in the migration's own suite; the question here is
 * what the SCAN returns for a row that exists, so the trigger is switched off
 * on the in-process database rather than satisfied with fixtures that would
 * say nothing about the scan.
 */

const RUNNING = '1a1a1a1a-1111-4111-8111-111111111111'
const PAUSED_EMPTY = '2b2b2b2b-2222-4222-8222-222222222222'
const PAUSED_PENDING = '3c3c3c3c-3333-4333-8333-333333333333'
const PAUSED_CLOSED = '4d4d4d4d-4444-4444-8444-444444444444'
const USER = 'user_kill_switch_sql'
const POST = 'a1111111-1111-4111-8111-111111111111'
const VARIANT = 'b2222222-2222-4222-8222-222222222222'

async function announce(db: PGlite, ws: string) {
  await db.query(WRITE_DECISION_SQL, [
    ws,
    POST,
    VARIANT,
    'x',
    'acct-1',
    null,
    null,
    'announced',
    null,
    new Date('2020-01-01T00:00:00.000Z').toISOString(),
  ])
}

describe('the kill switch statements against the real schema', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      alter table loop_channel_autonomy disable trigger loop_channel_autonomy_autopilot_guard;
    `)
    for (const [id, slug, paused] of [
      [RUNNING, 'ks-running', false],
      [PAUSED_EMPTY, 'ks-paused-empty', true],
      [PAUSED_PENDING, 'ks-paused-pending', true],
      [PAUSED_CLOSED, 'ks-paused-closed', true],
    ] as const) {
      await db.exec(`
        insert into workspaces (id, name, slug, created_by)
          values ('${id}', '${slug}', '${slug}', '${USER}');
        insert into loop_settings (workspace_id, paused, weekly_budget_credits)
          values ('${id}', ${paused}, 150);
        insert into loop_channel_autonomy (workspace_id, channel, level, created_by)
          values ('${id}', 'x', 3, '${USER}');
      `)
    }
    // An announcement nobody closed, and one a person already stopped.
    await announce(db, PAUSED_PENDING)
    await announce(db, PAUSED_CLOSED)
    await db.query(WRITE_DECISION_SQL, [
      PAUSED_CLOSED,
      POST,
      VARIANT,
      'x',
      'acct-1',
      null,
      null,
      'cancelled',
      null,
      null,
    ])
  }, 120_000)

  it('the settings read carries the customer kill switch, false for a workspace with no row', async () => {
    const running = await db.query<{ paused: boolean }>(AUTOPILOT_SETTINGS_SQL, [RUNNING])
    expect(running.rows[0]?.paused).toBe(false)
    const paused = await db.query<{ paused: boolean }>(AUTOPILOT_SETTINGS_SQL, [PAUSED_EMPTY])
    expect(paused.rows[0]?.paused).toBe(true)

    const nobody = '5e5e5e5e-5555-4555-8555-555555555555'
    await db.exec(
      `insert into workspaces (id, name, slug, created_by) values ('${nobody}', 'n', 'ks-nobody', '${USER}')`,
    )
    const none = await db.query<{ paused: boolean }>(AUTOPILOT_SETTINGS_SQL, [nobody])
    expect(none.rows).toHaveLength(1)
    expect(none.rows[0]?.paused).toBe(false)
  })

  it('the fleet scan visits a running Loop, skips a paused one, and still visits a paused one with an open announcement', async () => {
    const r = await db.query<{ workspace_id: string }>(AUTOPILOT_WORKSPACES_SQL, [50])
    const ids = r.rows.map((x) => x.workspace_id)
    expect(ids).toContain(RUNNING)
    // Stopped, nothing pending: no work, not visited.
    expect(ids).not.toContain(PAUSED_EMPTY)
    // Stopped WITH an announcement nobody closed: visited, so the tick can
    // write the cancellation. Otherwise the post would go out on resume.
    expect(ids).toContain(PAUSED_PENDING)
    // Stopped, announcement already cancelled: nothing left to do.
    expect(ids).not.toContain(PAUSED_CLOSED)
  })
})
