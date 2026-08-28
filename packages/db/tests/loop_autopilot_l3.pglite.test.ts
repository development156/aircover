import type { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bootFullSchema } from './helpers/pglite-tenant'

/**
 * L3 · AUTOPILOT — the two preconditions, enforced where they cannot be skipped.
 *
 * ── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────
 * Autopilot is the only feature in this product that acts with nobody in the
 * room. Every guardrail on it is therefore a STORED FACT: something a caller can
 * try to force, and watch refuse. A screen that hides the option is not a guard,
 * because the row can be written from a job, a script, or a future route that
 * nobody has written yet.
 *
 * The Loop's cost preview is the pattern being copied: a peer forced
 * `status = 'creating'` with no approval and watched the balance not move.
 *
 * ── AND THE MUTATION THAT MATTERS ────────────────────────────────────────────
 * TWO GUARDS ON ONE HOLE LOOK LIKE ONE GUARD WORKING. Each test below is
 * written so that exactly one condition is wrong and everything else is right,
 * which is the only arrangement that can tell which guard refused.
 */

const MIGRATION = resolve(
  import.meta.dirname,
  '../supabase/migrations/20260828120000_loop_autopilot_l3.sql',
)
const FLOOR_TS = resolve(import.meta.dirname, '../../../apps/web/src/lib/brand/autopilot-floor.ts')

const WS = '7c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f'
const USER = 'user_autopilot_l3'

/** A brain payload with the four required paths confirmed, plus one that is not. */
function brain(confirmed: readonly string[]): string {
  const meta: Record<string, { confirmed: boolean }> = {
    'voice.banned_phrases': { confirmed: false },
  }
  for (const p of confirmed) meta[p] = { confirmed: true }
  return JSON.stringify({ field_meta: meta })
}

const ALL_FOUR = [
  'hook.core_promise',
  'customer_persona.primary_pain_point',
  'voice.descriptor',
  'taboo.red_lines',
]

describe('L3 preconditions', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootFullSchema()
  }, 120_000)

  beforeEach(async () => {
    // A clean workspace per test, so one test's supervised cycle cannot satisfy
    // the next test's precondition — which is exactly how a guard comes to look
    // like it works.
    await db.exec(`
      delete from loop_channel_autonomy where workspace_id = '${WS}';
      delete from loop_cycles where workspace_id = '${WS}';
      delete from brand_memory where workspace_id = '${WS}';
      delete from loop_settings where workspace_id = '${WS}';
      delete from workspaces where id = '${WS}';
      insert into workspaces (id, name, slug, created_by)
        values ('${WS}', 'Autopilot', 'autopilot-l3', '${USER}');
      insert into loop_settings (workspace_id) values ('${WS}');
    `)
  })

  const setLevel = (level: number) =>
    db.exec(`insert into loop_channel_autonomy (workspace_id, channel, level, created_by)
               values ('${WS}', 'x', ${level}, '${USER}')`)

  /**
   * A cycle a PERSON approved and that reached the end.
   *
   * `cost_approved_at`, `cost_approved_by` and `approved_credits` are written
   * together because the table refuses anything less: it carries
   * `check ((cost_approved_at is null) = (cost_approved_by is null))` and
   * `check (cost_approved_at is null or approved_credits is not null)`. An
   * approval is a complete fact or it is not one, which is the same reasoning
   * the L3 trigger applies one level up.
   */
  const supervisedCycle = () =>
    db.exec(`insert into loop_cycles (workspace_id, iso_year, iso_week, status,
                                      trigger_source, cost_approved_at, cost_approved_by,
                                      approved_credits, created_by)
               values ('${WS}', 2026, 34, 'reported', 'manual', now(), '${USER}',
                       15, '${USER}')`)

  const activeBrain = (confirmed: readonly string[]) =>
    db.exec(`insert into brand_memory (workspace_id, version, status, payload, source)
               values ('${WS}', 1, 'active', '${brain(confirmed)}'::jsonb, 'resolved')`)

  // ── The ceiling itself ─────────────────────────────────────────────────────

  it('STILL refuses 4 — the ceiling moved by exactly one', async () => {
    await expect(setLevel(4)).rejects.toThrow(/level_check|violates check/i)
  })

  it('admits 0, 1 and 2 with no preconditions at all', async () => {
    for (const level of [0, 1, 2]) {
      await db.exec(`delete from loop_channel_autonomy where workspace_id = '${WS}'`)
      await expect(setLevel(level)).resolves.toBeDefined()
    }
  })

  // ── Precondition one: a supervised cycle ───────────────────────────────────

  it('REFUSES L3 when no cycle has ever been approved by a person', async () => {
    await activeBrain(ALL_FOUR)
    await expect(setLevel(3)).rejects.toThrow(/AUTOPILOT_NEEDS_SUPERVISED_CYCLE/)
  })

  /**
   * A cycle the CRON opened and nobody approved is not supervision. This is the
   * arm that a guard reading only `status = 'reported'` would let through.
   */
  it('REFUSES L3 when a cycle finished but no person approved its cost', async () => {
    await activeBrain(ALL_FOUR)
    // trigger_source 'schedule' is the cron's own value — the table admits only
    // 'schedule' and 'manual'. Nobody approved a cost, which is the point.
    await db.exec(`insert into loop_cycles (workspace_id, iso_year, iso_week, status,
                                            trigger_source, created_by)
                     values ('${WS}', 2026, 33, 'reported', 'schedule', '${USER}')`)
    await expect(setLevel(3)).rejects.toThrow(/AUTOPILOT_NEEDS_SUPERVISED_CYCLE/)
  })

  /** And an approved cycle that never finished is not a walked cycle either. */
  it('REFUSES L3 when a person approved a cycle that never reached the end', async () => {
    await activeBrain(ALL_FOUR)
    await db.exec(`insert into loop_cycles (workspace_id, iso_year, iso_week, status,
                                            trigger_source, cost_approved_at, cost_approved_by,
                                            approved_credits, created_by)
                     values ('${WS}', 2026, 33, 'creating', 'manual', now(), '${USER}',
                             15, '${USER}')`)
    await expect(setLevel(3)).rejects.toThrow(/AUTOPILOT_NEEDS_SUPERVISED_CYCLE/)
  })

  // ── Precondition two: a brain somebody agreed to ───────────────────────────

  it('REFUSES L3 when the workspace has no active brain at all', async () => {
    await supervisedCycle()
    await expect(setLevel(3)).rejects.toThrow(/AUTOPILOT_NEEDS_BRAIN/)
  })

  it('REFUSES L3 when the brain exists and nothing in it is confirmed', async () => {
    await supervisedCycle()
    await activeBrain([])
    await expect(setLevel(3)).rejects.toThrow(/AUTOPILOT_BRAIN_UNCONFIRMED/)
  })

  /**
   * THE ARM THAT MATTERS MOST. Three of four confirmed and the missing one is
   * `taboo.red_lines` — what Sahoda must never say. A fraction-based floor of
   * "most fields confirmed" passes this and publishes unattended with no red
   * lines, which is the exact failure the named set exists to prevent.
   */
  it('REFUSES L3 when only the red lines are unconfirmed, and NAMES that field', async () => {
    await supervisedCycle()
    await activeBrain(ALL_FOUR.filter((p) => p !== 'taboo.red_lines'))
    await expect(setLevel(3)).rejects.toThrow(/AUTOPILOT_BRAIN_UNCONFIRMED.*taboo\.red_lines/s)
  })

  it('names every unconfirmed field, not just the first', async () => {
    await supervisedCycle()
    await activeBrain(['hook.core_promise'])
    await expect(setLevel(3)).rejects.toThrow(/voice\.descriptor/)
    await expect(setLevel(3)).rejects.toThrow(/taboo\.red_lines/)
  })

  /** A superseded brain is not the brain. */
  it('REFUSES L3 when the only confirmed brain has been superseded', async () => {
    await supervisedCycle()
    await db.exec(`insert into brand_memory (workspace_id, version, status, payload, source)
                     values ('${WS}', 1, 'superseded', '${brain(ALL_FOUR)}'::jsonb, 'resolved')`)
    await expect(setLevel(3)).rejects.toThrow(/AUTOPILOT_NEEDS_BRAIN/)
  })

  // ── Both together ─────────────────────────────────────────────────────────

  it('ADMITS L3 when a person walked a cycle and confirmed the four fields', async () => {
    await supervisedCycle()
    await activeBrain(ALL_FOUR)
    await expect(setLevel(3)).resolves.toBeDefined()
    const r = await db.query<{ level: number }>(
      `select level from loop_channel_autonomy where workspace_id = $1 and channel = 'x'`,
      [WS],
    )
    expect(r.rows[0]?.level).toBe(3)
  })

  /**
   * PER CHANNEL, NEVER PER WORKSPACE. Switching on autopilot for X must leave
   * every other channel where it was — a workspace does not turn on autopilot,
   * it turns on autopilot for one place.
   */
  it('leaves every other channel where it was', async () => {
    await supervisedCycle()
    await activeBrain(ALL_FOUR)
    await db.exec(`insert into loop_channel_autonomy (workspace_id, channel, level, created_by)
                     values ('${WS}', 'linkedin', 1, '${USER}')`)
    await setLevel(3)
    const r = await db.query<{ channel: string; level: number }>(
      `select channel, level from loop_channel_autonomy where workspace_id = $1 order by channel`,
      [WS],
    )
    expect(r.rows).toEqual([
      { channel: 'linkedin', level: 1 },
      { channel: 'x', level: 3 },
    ])
  })

  /** An UPDATE is a write too. A guard only on INSERT is half a guard. */
  it('REFUSES an UPDATE to L3 as firmly as an INSERT', async () => {
    await setLevel(1)
    await expect(
      db.exec(`update loop_channel_autonomy set level = 3
                 where workspace_id = '${WS}' and channel = 'x'`),
    ).rejects.toThrow(/AUTOPILOT_NEEDS_SUPERVISED_CYCLE/)
  })

  // ── The two lists that must not drift ─────────────────────────────────────

  /**
   * The migration names four paths and `autopilot-floor.ts` names four paths.
   * Nothing but this test stops somebody adding a fifth to one of them.
   */
  it('the SQL floor and the TypeScript floor name the same four fields', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    const ts = readFileSync(FLOOR_TS, 'utf8')
    const inSql = [...sql.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1])
    for (const path of ALL_FOUR) {
      expect(inSql, `${path} missing from the migration`).toContain(path)
      expect(ts, `${path} missing from autopilot-floor.ts`).toContain(path)
    }
    // And no FIFTH path smuggled into either.
    const tsPaths = [...ts.matchAll(/^\s+'([a-z_]+\.[a-z_]+)',$/gm)].map((m) => m[1])
    expect(new Set(tsPaths)).toEqual(new Set(ALL_FOUR))
  })

  // ── The two ceilings that are not the dial ────────────────────────────────

  it('gives every workspace a daily cap and a cancel window by default', async () => {
    const r = await db.query<{ cap: number; mins: number }>(
      `select autopilot_daily_cap as cap, autopilot_cancel_minutes as mins
         from loop_settings where workspace_id = $1`,
      [WS],
    )
    expect(r.rows[0]?.cap).toBe(3)
    expect(r.rows[0]?.mins).toBe(30)
  })

  /**
   * A zero window is not autopilot with a fast cancel, it is autopilot with no
   * cancel — and the column would then be the setting that switches off the one
   * guard that makes the feature humane.
   */
  it('REFUSES a cancel window of zero, and anything under five minutes', async () => {
    for (const mins of [0, 1, 4]) {
      await expect(
        db.exec(`update loop_settings set autopilot_cancel_minutes = ${mins}
                   where workspace_id = '${WS}'`),
      ).rejects.toThrow(/autopilot_cancel_minutes_check|violates check/i)
    }
  })

  /** Zero DAILY posts is allowed: it is how a person pauses autopilot without
   *  clearing a dial they spent time setting. */
  it('allows a daily cap of zero, which is a pause rather than a mistake', async () => {
    await expect(
      db.exec(`update loop_settings set autopilot_daily_cap = 0 where workspace_id = '${WS}'`),
    ).resolves.toBeDefined()
  })

  it('REFUSES a daily cap above the ceiling', async () => {
    await expect(
      db.exec(`update loop_settings set autopilot_daily_cap = 21 where workspace_id = '${WS}'`),
    ).rejects.toThrow(/autopilot_daily_cap_check|violates check/i)
  })
})
