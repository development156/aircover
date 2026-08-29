import type { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bootFullSchema } from './helpers/pglite-tenant'

/**
 * loop_autopilot_log — the trail that has to be readable after the fact.
 *
 * ── THE DEFECT THIS TABLE IS DESIGNED AGAINST ────────────────────────────────
 * MEASURED against production 2026-08-28: `ops_audit_log` holds 17,556 rows and
 * 16,915 of them — 96.3% — carry an empty `target_id`. It records that
 * something happened, which is the same information as no record at all. That
 * happened because naming the target was a CONVENTION.
 *
 * So the tests below are mostly about what the table REFUSES. A log you can
 * write a useless row into becomes a useless log, one hurried commit at a time,
 * and no amount of care at the call sites prevents it.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * The last test reads the migration and `autopilot-refusals.ts` as TEXT. It can
 * tell that both files mention the same refusal names; it cannot tell that any
 * CODE writes one of them into `refusal_reason`, nor that a guardrail which
 * refuses in practice picks the matching name rather than a plausible-looking
 * one. A name present in both files and used by nothing would pass. Only a test
 * that drives a real refusal through the dispatch path can close that, and the
 * dispatch path does not exist yet.
 */

const MIGRATION = resolve(
  import.meta.dirname,
  '../supabase/migrations/20260828130000_loop_autopilot_log.sql',
)
const REFUSALS_TS = resolve(
  import.meta.dirname,
  '../../../apps/web/src/lib/loop/autopilot-refusals.ts',
)

const WS = '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a'
const USER = 'user_autopilot_log'
const POST = '11111111-2222-4333-8444-555555555555'
const VARIANT = '66666666-7777-4888-8999-aaaaaaaaaaaa'
const ACCOUNT = 'a1b2c3d4e5f6a7b8c9d0e1f2'

function row(over: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    workspace_id: `'${WS}'`,
    post_id: `'${POST}'`,
    variant_id: `'${VARIANT}'`,
    channel: `'x'`,
    account_id: `'${ACCOUNT}'`,
    decision: `'dispatched'`,
    ...over,
  }
  const cols = Object.keys(base).join(', ')
  const vals = Object.values(base).join(', ')
  return `insert into loop_autopilot_log (${cols}) values (${vals})`
}

describe('loop_autopilot_log', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootFullSchema()
  }, 120_000)

  beforeEach(async () => {
    // The log rows go away through the WORKSPACE, never directly: a direct
    // delete is refused by the append-only trigger, which is the guard under
    // test. The cascade runs at trigger depth > 1 and `app.block_mutations`
    // permits that on purpose, so this cleanup is also a standing check that
    // offboarding still works.
    await db.exec(`
      delete from workspaces where id = '${WS}';
      insert into workspaces (id, name, slug, created_by)
        values ('${WS}', 'Autopilot log', 'autopilot-log', '${USER}');
    `)
  })

  // ── Every row names what it acted on ───────────────────────────────────────

  it('accepts a row that names the post, the variant, the channel and the account', async () => {
    await expect(db.exec(row())).resolves.toBeDefined()
    const r = await db.query<{ post_id: string; account_id: string }>(
      `select post_id, account_id from loop_autopilot_log where workspace_id = $1`,
      [WS],
    )
    expect(r.rows[0]?.post_id).toBe(POST)
    expect(r.rows[0]?.account_id).toBe(ACCOUNT)
  })

  /**
   * THE ops_audit_log DEFECT, ATTEMPTED DIRECTLY. An empty account id is the
   * exact value that made 96.3% of that table useless, and here it is refused
   * by a CHECK rather than discouraged by a comment.
   */
  it('REFUSES an empty account id, which is how the other audit log became useless', async () => {
    await expect(db.exec(row({ account_id: `''` }))).rejects.toThrow(/account_id_check|violates/i)
    await expect(db.exec(row({ account_id: `'   '` }))).rejects.toThrow(
      /account_id_check|violates/i,
    )
  })

  it('REFUSES a row with no post, no variant or no channel', async () => {
    for (const col of ['post_id', 'variant_id', 'channel']) {
      await expect(db.exec(row({ [col]: 'null' }))).rejects.toThrow(/null value|violates/i)
    }
  })

  it('REFUSES a channel this product does not have', async () => {
    await expect(db.exec(row({ channel: `'myspace'` }))).rejects.toThrow(/channel_check|violates/i)
  })

  // ── A decision that cannot be read is not a decision ──────────────────────

  /**
   * A refusal that does not name the guardrail is the same defect in a
   * different column. "We refused" is not an audit trail; "the daily cap
   * refused" is.
   */
  it('REFUSES a refusal that does not say which guardrail refused', async () => {
    await expect(db.exec(row({ decision: `'refused'` }))).rejects.toThrow(
      /autopilot_refusal_has_reason|violates/i,
    )
    await expect(db.exec(row({ decision: `'refused'`, refusal_reason: `'  '` }))).rejects.toThrow(
      /autopilot_refusal_has_reason|violates/i,
    )
    await expect(
      db.exec(row({ decision: `'refused'`, refusal_reason: `'DAILY_CAP'` })),
    ).resolves.toBeDefined()
  })

  /** An announcement with no window is a post with no way to stop it. */
  it('REFUSES an announcement that carries no cancel window', async () => {
    await expect(db.exec(row({ decision: `'announced'` }))).rejects.toThrow(
      /autopilot_announced_has_window|violates/i,
    )
    await expect(
      db.exec(row({ decision: `'announced'`, dispatch_after: `now() + interval '30 minutes'` })),
    ).resolves.toBeDefined()
  })

  it('REFUSES a decision that is not one of the four', async () => {
    await expect(db.exec(row({ decision: `'published'` }))).rejects.toThrow(
      /decision_check|violates/i,
    )
  })

  // ── Append-only ───────────────────────────────────────────────────────────

  /**
   * A cancellation is a NEW ROW. The fact that a post was going out at 09:00
   * stays true after somebody stops it, and a trail that rewrites its own
   * history is not one.
   */
  it('REFUSES an UPDATE, so a cancellation cannot overwrite the announcement', async () => {
    await db.exec(row({ decision: `'announced'`, dispatch_after: `now() + interval '30 minutes'` }))
    await expect(
      db.exec(`update loop_autopilot_log set decision = 'cancelled' where workspace_id = '${WS}'`),
    ).rejects.toThrow(/append-only/i)
  })

  it('REFUSES a DELETE, even the tidy-up kind', async () => {
    await db.exec(row())
    await expect(
      db.exec(`delete from loop_autopilot_log where workspace_id = '${WS}'`),
    ).rejects.toThrow(/append-only/i)
  })

  /**
   * And a workspace can still be offboarded: the cascade runs at trigger depth
   * greater than one, which `app.block_mutations` allows on purpose. An
   * append-only table that made erasure impossible would be a privacy defect.
   */
  it('still lets a workspace be deleted, cascading its rows away', async () => {
    await db.exec(row())
    await expect(db.exec(`delete from workspaces where id = '${WS}'`)).resolves.toBeDefined()
    const r = await db.query(`select 1 from loop_autopilot_log where workspace_id = $1`, [WS])
    expect(r.rows).toHaveLength(0)
  })

  // ── RLS ───────────────────────────────────────────────────────────────────

  it('has row-level security switched on', async () => {
    const r = await db.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where relname = 'loop_autopilot_log'`,
    )
    expect(r.rows[0]?.relrowsecurity).toBe(true)
  })

  // ── The two lists that must not drift ─────────────────────────────────────

  /**
   * The migration's comment names where the refusal names come from. If that
   * file stops holding them, the column becomes free text and drifts to the
   * ops_audit_log state.
   */
  it('the migration points at the refusal list, and that list exists', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('autopilot-refusals.ts')
    const ts = readFileSync(REFUSALS_TS, 'utf8')
    for (const name of [
      'NOT_AUTOPILOT_CHANNEL',
      'REFUSAL_GATE',
      'CONSTRAINT_ENGINE',
      'WEEKLY_BUDGET',
      'DAILY_CAP',
      'BRAIN_BELOW_FLOOR',
      'INSIDE_CANCEL_WINDOW',
      'CANCELLED',
    ]) {
      expect(ts, `${name} missing from the refusal list`).toContain(name)
    }
  })
})
