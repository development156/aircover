import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import { bootFullSchema } from './helpers/pglite-tenant'

import {
  ACTIVE_BRAIN_SQL,
  ARM_FOR_PUBLISH_SQL,
  AUTOPILOT_CANDIDATES_SQL,
  AUTOPILOT_SETTINGS_SQL,
  DIAL_SQL,
  PENDING_ANNOUNCEMENTS_SQL,
  PUBLISHED_TODAY_SQL,
  WRITE_DECISION_SQL,
} from '../../../apps/web/src/lib/loop/autopilot/sql'

/**
 * THE AUTOPILOT DISPATCHER'S STATEMENTS, SENT TO A REAL POSTGRES.
 *
 * ── THE DEFECT THIS EXISTS FOR, AND IT CAUGHT ONE WHILE BEING WRITTEN ────────
 * On 2026-08-23 the Sunday tick shipped naming `loop_autonomy` where the table
 * is `loop_channel_autonomy`, and no test could see it because the only test
 * over that code stubbed the pool. Writing THIS file caught the same class of
 * mistake in `AUTOPILOT_SETTINGS_SQL`: it selected `s.budget_credits`, and
 * `loop_settings` has no such column — the budget there is
 * `weekly_budget_credits`, and `budget_credits` is a column on `loop_cycles`.
 * A mock would have accepted it. The typecheck did accept it.
 *
 * ── WHY EACH TEST INSERTS AND ASSERTS RATHER THAN ONLY RUNNING ───────────────
 * `where decision = 'announced'` parses exactly as well as `'announce'`, and
 * the second would scan nothing for ever while every check stayed green. So the
 * plain "it runs" assertion is only the first of each pair.
 *
 * ── WHAT THIS FILE CANNOT SEE ────────────────────────────────────────────────
 * Whether the dispatcher CALLS these. It proves the statements are valid and
 * return what their headers claim; a store that built its own string inline
 * would pass every test here. `decide.test.ts` and `dispatch-due.test.ts` own
 * the decision, and neither of those three files proves a real publish.
 */

const WS = '3c2b1a09-8f7e-4d6c-9b5a-1e2f3a4b5c6d'
const OTHER = '7d8e9f01-2a3b-4c5d-8e9f-0a1b2c3d4e5f'
const USER = 'user_autopilot_sql'
const POST = 'a1111111-1111-4111-8111-111111111111'
const VARIANT = 'b2222222-2222-4222-8222-222222222222'

describe('the autopilot dispatcher SQL against the real schema', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootFullSchema()

    await db.exec(`
      insert into workspaces (id, name, slug, created_by, timezone)
        values ('${WS}', 'Autopilot SQL', 'autopilot-sql', '${USER}', 'Asia/Kolkata');
      insert into workspaces (id, name, slug, created_by)
        values ('${OTHER}', 'Another', 'autopilot-sql-other', '${USER}');
      insert into loop_settings (workspace_id, paused, weekly_budget_credits)
        values ('${WS}', false, 150);
      insert into loop_channel_autonomy (workspace_id, channel, level, created_by)
        values ('${WS}', 'x', 2, '${USER}');
    `)
  }, 120_000)

  it('every statement parses and executes — each relation and column it names exists', async () => {
    await db.query(PENDING_ANNOUNCEMENTS_SQL, [WS, 50])
    await db.query(PUBLISHED_TODAY_SQL, [WS])
    await db.query(AUTOPILOT_SETTINGS_SQL, [WS])
    await db.query(DIAL_SQL, [WS])
  })

  it('the settings statement returns the two autopilot columns and the weekly budget', async () => {
    const r = await db.query<{
      autopilot_daily_cap: number | null
      autopilot_cancel_minutes: number | null
      weekly_budget_credits: number | null
    }>(AUTOPILOT_SETTINGS_SQL, [WS])
    expect(r.rows).toHaveLength(1)
    // The defaults come from the migration and are asserted, not restated:
    // a default written twice is two defaults and they drift.
    expect(r.rows[0]?.autopilot_daily_cap).toBe(3)
    expect(r.rows[0]?.autopilot_cancel_minutes).toBe(30)
    expect(r.rows[0]?.weekly_budget_credits).toBe(150)
  })

  it('a workspace that never opened the Loop answers with nulls, not with nothing', async () => {
    const r = await db.query<{ autopilot_daily_cap: number | null }>(AUTOPILOT_SETTINGS_SQL, [
      OTHER,
    ])
    // One row, all-null settings. An inner join would return zero rows here and
    // the caller could not tell "no settings" from "no such workspace".
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]?.autopilot_daily_cap).toBeNull()
  })

  it('the dial statement returns the stored level', async () => {
    const r = await db.query<{ channel: string; level: number }>(DIAL_SQL, [WS])
    expect(r.rows).toEqual([{ channel: 'x', level: 2 }])
  })

  it('writes an announcement, and the row carries its window', async () => {
    const r = await db.query<{ id: string }>(WRITE_DECISION_SQL, [
      WS,
      POST,
      VARIANT,
      'x',
      'acct-1',
      null,
      null,
      'announced',
      null,
      new Date('2030-01-01T09:30:00.000Z').toISOString(),
    ])
    expect(r.rows).toHaveLength(1)
  })

  it('the pending scan finds it', async () => {
    const r = await db.query<{ post_id: string; account_id: string }>(PENDING_ANNOUNCEMENTS_SQL, [
      WS,
      50,
    ])
    expect(r.rows.map((x) => x.post_id)).toContain(POST)
    expect(r.rows[0]?.account_id).toBe('acct-1')
  })

  it('and stops finding it once a dispatched row lands after it', async () => {
    await db.query(WRITE_DECISION_SQL, [
      WS,
      POST,
      VARIANT,
      'x',
      'acct-1',
      null,
      null,
      'dispatched',
      null,
      null,
    ])
    const r = await db.query<{ post_id: string }>(PENDING_ANNOUNCEMENTS_SQL, [WS, 50])
    expect(r.rows.map((x) => x.post_id)).not.toContain(POST)
  })

  it('a cancellation retires an announcement the same way', async () => {
    const post = 'c3333333-3333-4333-8333-333333333333'
    await db.query(WRITE_DECISION_SQL, [
      WS,
      post,
      VARIANT,
      'x',
      'acct-1',
      null,
      null,
      'announced',
      null,
      new Date('2030-01-01T09:30:00.000Z').toISOString(),
    ])
    await db.query(WRITE_DECISION_SQL, [
      WS,
      post,
      VARIANT,
      'x',
      'acct-1',
      null,
      null,
      'cancelled',
      null,
      null,
    ])
    const r = await db.query<{ post_id: string }>(PENDING_ANNOUNCEMENTS_SQL, [WS, 50])
    expect(r.rows.map((x) => x.post_id)).not.toContain(post)
  })

  it('a REFUSED row does not retire an announcement — a refusal is not a decision to stop', async () => {
    const post = 'd4444444-4444-4444-8444-444444444444'
    await db.query(WRITE_DECISION_SQL, [
      WS,
      post,
      VARIANT,
      'x',
      'acct-1',
      null,
      null,
      'announced',
      null,
      new Date('2030-01-01T09:30:00.000Z').toISOString(),
    ])
    await db.query(WRITE_DECISION_SQL, [
      WS,
      post,
      VARIANT,
      'x',
      'acct-1',
      null,
      null,
      'refused',
      'DAILY_CAP',
      null,
    ])
    const r = await db.query<{ post_id: string }>(PENDING_ANNOUNCEMENTS_SQL, [WS, 50])
    expect(r.rows.map((x) => x.post_id)).toContain(post)
  })

  it('the pending scan never crosses a workspace boundary', async () => {
    const r = await db.query<{ post_id: string }>(PENDING_ANNOUNCEMENTS_SQL, [OTHER, 50])
    expect(r.rows).toHaveLength(0)
  })

  it('counts announcements as well as dispatches against the day', async () => {
    const r = await db.query<{ n: number }>(PUBLISHED_TODAY_SQL, [WS])
    // Three announcements and one dispatch written above, all today.
    expect(r.rows[0]?.n).toBe(4)
  })

  it("counts in the WORKSPACE's day, not in UTC", async () => {
    // One minute past midnight in Asia/Kolkata. That instant is ALWAYS today in
    // the workspace's calendar and ALWAYS yesterday in UTC, because the zone is
    // +05:30 — so the row discriminates between the two readings whatever the
    // wall clock says when this test runs. A count in UTC misses it; the
    // workspace's own day includes it, and the cap is a promise about that day.
    const before = await db.query<{ n: number }>(PUBLISHED_TODAY_SQL, [WS])
    await db.exec(`
      insert into loop_autopilot_log
        (workspace_id, post_id, variant_id, channel, account_id, decision, dispatch_after, created_at)
      values ('${WS}', 'e5555555-5555-4555-8555-555555555555', '${VARIANT}', 'x', 'acct-1',
              'announced', now() + interval '1 hour',
              (date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '1 minute')
                at time zone 'Asia/Kolkata');
    `)
    const after = await db.query<{ n: number }>(PUBLISHED_TODAY_SQL, [WS])
    expect(after.rows[0]?.n).toBe((before.rows[0]?.n ?? 0) + 1)
  })

  it('and leaves out a row that is still yesterday in the workspace, though today in UTC', async () => {
    // One minute BEFORE midnight in Asia/Kolkata: yesterday locally, and today
    // in UTC for every clock reading up to 18:29 UTC. The correct count omits
    // it. This is the same boundary as the test above, walked from the other
    // side, so neither reading can satisfy both.
    const before = await db.query<{ n: number }>(PUBLISHED_TODAY_SQL, [WS])
    await db.exec(`
      insert into loop_autopilot_log
        (workspace_id, post_id, variant_id, channel, account_id, decision, dispatch_after, created_at)
      values ('${WS}', 'e7777777-7777-4777-8777-777777777777', '${VARIANT}', 'x', 'acct-1',
              'announced', now() + interval '1 hour',
              (date_trunc('day', now() at time zone 'Asia/Kolkata') - interval '1 minute')
                at time zone 'Asia/Kolkata');
    `)
    const after = await db.query<{ n: number }>(PUBLISHED_TODAY_SQL, [WS])
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n)
  })

  it('a workspace with no timezone set is counted in UTC rather than counted as nothing', async () => {
    await db.exec(`
      insert into loop_autopilot_log
        (workspace_id, post_id, variant_id, channel, account_id, decision, dispatch_after)
      values ('${OTHER}', 'f6666666-6666-4666-8666-666666666666', '${VARIANT}', 'x', 'acct-2',
              'announced', now() + interval '1 hour');
    `)
    const r = await db.query<{ n: number }>(PUBLISHED_TODAY_SQL, [OTHER])
    expect(r.rows[0]?.n).toBe(1)
  })

  it('the database refuses a row that cannot say which account it acted on', async () => {
    await expect(
      db.query(WRITE_DECISION_SQL, [
        WS,
        POST,
        VARIANT,
        'x',
        '   ',
        null,
        null,
        'announced',
        null,
        new Date('2030-01-01T09:30:00.000Z').toISOString(),
      ]),
    ).rejects.toThrow()
  })

  it('the database refuses an announcement with no window to stop it', async () => {
    await expect(
      db.query(WRITE_DECISION_SQL, [
        WS,
        POST,
        VARIANT,
        'x',
        'acct-1',
        null,
        null,
        'announced',
        null,
        null,
      ]),
    ).rejects.toThrow()
  })

  it('the database refuses a refusal that does not name the guardrail', async () => {
    await expect(
      db.query(WRITE_DECISION_SQL, [
        WS,
        POST,
        VARIANT,
        'x',
        'acct-1',
        null,
        null,
        'refused',
        null,
        null,
      ]),
    ).rejects.toThrow()
  })

  describe('the candidate scan', () => {
    const CPOST = 'aa000000-0000-4000-8000-000000000001'
    const CVAR = 'bb000000-0000-4000-8000-000000000002'
    const CYCLE = 'cc000000-0000-4000-8000-000000000003'
    const PROFILE = 'a1b2c3d4e5f6a7b8c9d0e1f2'
    const ACCOUNT = '0f1e2d3c4b5a69788796a5b4'

    beforeAll(async () => {
      await db.exec(`
        -- The dial cannot reach level 3 without BOTH preconditions the trigger
        -- in 20260828120000_loop_autopilot_l3.sql enforces. This fixture
        -- satisfies them for real rather than working around them: a cycle a
        -- person approved the cost of and which reached the end, and a brain
        -- with the four named fields confirmed. Writing them here is what
        -- makes the later update to level 3 legal, and the first
        -- draft of this file left them out and was correctly refused with
        -- AUTOPILOT_NEEDS_SUPERVISED_CYCLE.
        -- Approval is ONE FACT IN THREE COLUMNS and loop_cycles checks them
        -- together: who, when, and how much was approved. Setting only
        -- cost_approved_by is a row nobody writes on purpose, and the table
        -- refuses it -- which this fixture found the hard way.
        insert into loop_cycles (id, workspace_id, iso_year, iso_week, status,
                                 cost_approved_by, cost_approved_at, approved_credits)
          values ('${CYCLE}', '${WS}', 2026, 35, 'reported', '${USER}', now(), 29);
        insert into brand_memory (workspace_id, version, status, payload, source)
          values ('${WS}', 1, 'active', '{"field_meta":{
                    "hook.core_promise":{"confirmed":true},
                    "customer_persona.primary_pain_point":{"confirmed":true},
                    "voice.descriptor":{"confirmed":true},
                    "taboo.red_lines":{"confirmed":true}}}'::jsonb, 'resolved');
        insert into posts (id, workspace_id, title, status, channels, created_by)
          values ('${CPOST}', '${WS}', 'A planned post', 'draft', '{x}', '${USER}');
        insert into post_variants (id, workspace_id, post_id, channel, body, publish_status)
          values ('${CVAR}', '${WS}', '${CPOST}', 'x', 'the body', 'pending');
        insert into loop_briefs (id, workspace_id, cycle_id, title, body, channels, post_id, priority)
          values ('dd000000-0000-4000-8000-000000000004', '${WS}', '${CYCLE}',
                  'brief', 'brief body', '{x}', '${CPOST}', 1);
        -- The account side, on the same four terms assert_account_for_scheduled_post
        -- uses: an ACTIVE connection, on the SAME channel, whose external_account
        -- id is the account and whose profileId matches this workspace's Zernio
        -- profile. Both ids are 24-char lowercase hex because the column's own
        -- CHECK says so: a uuid here is accepted by a plain text column and matches
        -- nothing Zernio ever returns.
        insert into zernio_profiles (workspace_id, profile_id)
          values ('${WS}', '${PROFILE}');
        insert into connections (workspace_id, platform, status, external_account, created_by)
          values ('${WS}', 'x', 'active',
                  '{"id":"${ACCOUNT}","profileId":"${PROFILE}"}'::jsonb, '${USER}');
      `)
    }, 120_000)

    it('parses and executes against the real schema', async () => {
      await db.query(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
    })

    it('finds NOTHING while the channel sits at level 2', async () => {
      // The dial is inserted at level 2 in the outer beforeAll. A channel
      // nobody armed must produce no row at all, so it cannot be defaulted
      // to something on the way to the decision.
      const r = await db.query(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
      expect(r.rows).toHaveLength(0)
    })

    it('finds the post once the dial reaches level 3, and names its brief and cycle', async () => {
      await db.exec(`update loop_channel_autonomy set level = 3
                      where workspace_id = '${WS}' and channel = 'x'`)
      const r = await db.query<{
        post_id: string
        variant_id: string
        channel: string
        body: string
        brief_id: string
        cycle_id: string
        account_id: string
      }>(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
      expect(r.rows).toHaveLength(1)
      expect(r.rows[0]).toMatchObject({
        post_id: CPOST,
        variant_id: CVAR,
        channel: 'x',
        body: 'the body',
        cycle_id: CYCLE,
        account_id: ACCOUNT,
      })
    })

    it('a post the Loop never planned is invisible to it, however armed the channel', async () => {
      // Scoped through loop_briefs, never posts.origin. This post has no brief.
      const stray = 'ee000000-0000-4000-8000-000000000005'
      await db.exec(`
        insert into posts (id, workspace_id, title, status, channels, created_by)
          values ('${stray}', '${WS}', 'Hand written', 'draft', '{x}', '${USER}');
        insert into post_variants (workspace_id, post_id, channel, body, publish_status)
          values ('${WS}', '${stray}', 'x', 'typed by a person', 'pending');
      `)
      const r = await db.query<{ post_id: string }>(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
      expect(r.rows.map((x) => x.post_id)).not.toContain(stray)
    })

    it('a variant already in flight is never picked up, which would publish it twice', async () => {
      await db.exec(`update post_variants set publish_status = 'publishing' where id = '${CVAR}'`)
      const r = await db.query(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
      expect(r.rows).toHaveLength(0)
      await db.exec(`update post_variants set publish_status = 'pending' where id = '${CVAR}'`)
    })

    it('a brief the person trimmed out of the plan is not a candidate', async () => {
      await db.exec(`update loop_briefs set included = false where post_id = '${CPOST}'`)
      const r = await db.query(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
      expect(r.rows).toHaveLength(0)
      await db.exec(`update loop_briefs set included = true where post_id = '${CPOST}'`)
    })

    it('stops being a candidate once autopilot has already decided on it', async () => {
      await db.query(WRITE_DECISION_SQL, [
        WS,
        CPOST,
        CVAR,
        'x',
        'acct-1',
        null,
        null,
        'refused',
        'DAILY_CAP',
        null,
      ])
      const r = await db.query(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
      expect(r.rows).toHaveLength(0)
    })

    describe('the account, on the same four terms the publish assertion uses', () => {
      // Each of these is a way autopilot could otherwise pick up work it can
      // never complete: the row would reach a decision, get announced, and then
      // fail at assert_account_for_scheduled_post with nobody watching.
      const other = 'aa000000-0000-4000-8000-00000000000a'

      beforeAll(async () => {
        await db.exec(`
          insert into posts (id, workspace_id, title, status, channels, created_by)
            values ('${other}', '${WS}', 'Needs an account', 'draft', '{gbp}', '${USER}');
          insert into post_variants (workspace_id, post_id, channel, body, publish_status)
            values ('${WS}', '${other}', 'gbp', 'for a channel with no connection', 'pending');
          insert into loop_briefs (workspace_id, cycle_id, title, body, channels, post_id, priority)
            values ('${WS}', '${CYCLE}', 'b3', 'body', '{gbp}', '${other}', 3);
          insert into loop_channel_autonomy (workspace_id, channel, level, created_by)
            values ('${WS}', 'gbp', 3, '${USER}');
        `)
      }, 120_000)

      it('a channel armed at L3 with NO connection yields no candidate at all', async () => {
        const r = await db.query<{ post_id: string }>(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
        expect(r.rows.map((x) => x.post_id)).not.toContain(other)
      })

      it('a connection on a DIFFERENT channel does not qualify it', async () => {
        await db.exec(`
          insert into connections (workspace_id, platform, status, external_account, created_by)
            values ('${WS}', 'linkedin', 'active',
                    '{"id":"111122223333444455556666","profileId":"${PROFILE}"}'::jsonb, '${USER}');
        `)
        const r = await db.query<{ post_id: string }>(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
        expect(r.rows.map((x) => x.post_id)).not.toContain(other)
      })

      it('an INACTIVE connection on the right channel does not qualify it either', async () => {
        await db.exec(`
          insert into connections (workspace_id, platform, status, external_account, created_by)
            values ('${WS}', 'gbp', 'revoked',
                    '{"id":"777788889999aaaabbbbcccc","profileId":"${PROFILE}"}'::jsonb, '${USER}');
        `)
        const r = await db.query<{ post_id: string }>(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
        expect(r.rows.map((x) => x.post_id)).not.toContain(other)
      })

      it("a connection whose profileId is not this workspace's Zernio profile does not qualify it", async () => {
        await db.exec(`
          insert into connections (workspace_id, platform, status, external_account, created_by)
            values ('${WS}', 'gbp', 'active',
                    '{"id":"dddd1111eeee2222ffff3333","profileId":"999888777666555444333222"}'::jsonb,
                    '${USER}');
        `)
        const r = await db.query<{ post_id: string }>(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
        expect(r.rows.map((x) => x.post_id)).not.toContain(other)
      })

      it('and it becomes a candidate the moment all four hold, naming that account', async () => {
        await db.exec(`
          insert into connections (workspace_id, platform, status, external_account, created_by)
            values ('${WS}', 'gbp', 'active',
                    '{"id":"44445555666677778888aaaa","profileId":"${PROFILE}"}'::jsonb, '${USER}');
        `)
        const r = await db.query<{ post_id: string; account_id: string }>(
          AUTOPILOT_CANDIDATES_SQL,
          [WS, 50],
        )
        const row = r.rows.find((x) => x.post_id === other)
        expect(row).toBeDefined()
        expect(row?.account_id).toBe('44445555666677778888aaaa')
      })
    })

    it('never crosses a workspace boundary', async () => {
      // A LIVE candidate has to exist in WS for this to mean anything. The
      // first draft asserted only that OTHER saw nothing, and by the time it
      // ran the preceding test had already retired the one candidate — so
      // dropping the workspace filter entirely left this test GREEN. It was
      // measuring an empty world, not a boundary.
      const fresh = 'ff000000-0000-4000-8000-000000000006'
      await db.exec(`
        insert into posts (id, workspace_id, title, status, channels, created_by)
          values ('${fresh}', '${WS}', 'Still to go out', 'draft', '{x}', '${USER}');
        insert into post_variants (workspace_id, post_id, channel, body, publish_status)
          values ('${WS}', '${fresh}', 'x', 'unspoken for', 'pending');
        insert into loop_briefs (workspace_id, cycle_id, title, body, channels, post_id, priority)
          values ('${WS}', '${CYCLE}', 'b2', 'body', '{x}', '${fresh}', 2);
      `)
      const mine = await db.query<{ post_id: string }>(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
      expect(mine.rows.map((x) => x.post_id)).toContain(fresh)

      const theirs = await db.query(AUTOPILOT_CANDIDATES_SQL, [OTHER, 50])
      expect(theirs.rows).toHaveLength(0)
    })
  })

  describe('arming a post for the publish path that already exists', () => {
    const armed = 'ab000000-0000-4000-8000-0000000000ab'

    beforeAll(async () => {
      await db.exec(`
        insert into posts (id, workspace_id, title, status, channels, created_by)
          values ('${armed}', '${WS}', 'To be armed', 'draft', '{x}', '${USER}');
      `)
    }, 120_000)

    it('moves a draft to scheduled with a real time, which is what isDispatchable needs', async () => {
      const r = await db.query<{ id: string }>(ARM_FOR_PUBLISH_SQL, [WS, armed])
      expect(r.rows).toHaveLength(1)

      const after = await db.query<{ status: string; scheduled_at: string | null }>(
        `select status, scheduled_at from posts where id = $1`,
        [armed],
      )
      expect(after.rows[0]?.status).toBe('scheduled')
      // Both halves matter: isDispatchable refuses a dispatchable status with a
      // null time, so arming the status alone would produce a post that looks
      // scheduled on a screen and is never picked up.
      expect(after.rows[0]?.scheduled_at).not.toBeNull()
    })

    it('REFUSES a post that is already publishing, which would otherwise go out twice', async () => {
      const flying = 'ac000000-0000-4000-8000-0000000000ac'
      await db.exec(`
        insert into posts (id, workspace_id, title, status, channels, created_by, scheduled_at)
          values ('${flying}', '${WS}', 'In flight', 'publishing', '{x}', '${USER}', now());
      `)
      const r = await db.query(ARM_FOR_PUBLISH_SQL, [WS, flying])
      // No row returned means nothing was armed, and the caller can tell.
      expect(r.rows).toHaveLength(0)
      const after = await db.query<{ status: string }>(`select status from posts where id = $1`, [
        flying,
      ])
      expect(after.rows[0]?.status).toBe('publishing')
    })

    it('REFUSES a post that already published', async () => {
      const done = 'ad000000-0000-4000-8000-0000000000ad'
      await db.exec(`
        insert into posts (id, workspace_id, title, status, channels, created_by)
          values ('${done}', '${WS}', 'Already out', 'published', '{x}', '${USER}');
      `)
      const r = await db.query(ARM_FOR_PUBLISH_SQL, [WS, done])
      expect(r.rows).toHaveLength(0)
    })

    it("never arms another workspace's post", async () => {
      const theirs = 'ae000000-0000-4000-8000-0000000000ae'
      await db.exec(`
        insert into posts (id, workspace_id, title, status, channels, created_by)
          values ('${theirs}', '${OTHER}', 'Not ours', 'draft', '{x}', '${USER}');
      `)
      const r = await db.query(ARM_FOR_PUBLISH_SQL, [WS, theirs])
      expect(r.rows).toHaveLength(0)
      const after = await db.query<{ status: string }>(`select status from posts where id = $1`, [
        theirs,
      ])
      expect(after.rows[0]?.status).toBe('draft')
    })
  })

  describe('the brain read, which decides whether autopilot may write at all', () => {
    it('returns the ACTIVE payload', async () => {
      const r = await db.query<{ payload: { field_meta?: Record<string, unknown> } }>(
        ACTIVE_BRAIN_SQL,
        [WS],
      )
      expect(r.rows).toHaveLength(1)
      expect(r.rows[0]?.payload?.field_meta).toHaveProperty('taboo.red_lines')
    })

    it('a workspace with no brain returns NO ROW, which the caller reads as null', async () => {
      const r = await db.query(ACTIVE_BRAIN_SQL, [OTHER])
      expect(r.rows).toHaveLength(0)
    })

    it('NEVER returns a superseded version, however recent', async () => {
      // A superseded payload describes the business the way it was described
      // before somebody corrected it. Publishing unattended from one is
      // publishing a correction the customer already made.
      await db.exec(`
        update brand_memory set status = 'superseded' where workspace_id = '${WS}';
        insert into brand_memory (workspace_id, version, status, payload, source)
          values ('${WS}', 2, 'active',
                  '{"field_meta":{"hook.core_promise":{"confirmed":true}}}'::jsonb, 'resolved');
      `)
      const r = await db.query<{ payload: { field_meta?: Record<string, unknown> } }>(
        ACTIVE_BRAIN_SQL,
        [WS],
      )
      expect(r.rows).toHaveLength(1)
      // Version 2's payload, not version 1's.
      expect(r.rows[0]?.payload?.field_meta).not.toHaveProperty('taboo.red_lines')
    })
  })
})
