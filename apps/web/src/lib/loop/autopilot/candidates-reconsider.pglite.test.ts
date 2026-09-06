import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import { bootFullSchema } from '@sahoda/db/testing'

import { AUTOPILOT_CANDIDATES_SQL } from './sql'

/**
 * A REFUSAL IS NOT A VERDICT FOR EVER, AND THE SCAN HAS TO KNOW THE DIFFERENCE.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * Until 2026-09-06 `AUTOPILOT_CANDIDATES_SQL` excluded a variant the moment
 * ANY `loop_autopilot_log` row named it. `decide.ts` documents `DAILY_CAP` as
 * "expires at midnight" and `WEEKLY_BUDGET` as "expires at the end of the
 * week", and `BRAIN_BELOW_FLOOR` clears the moment a person confirms a field.
 * None of those expiries could ever be observed: the first refusal was the
 * last look, and the post sat as a draft until somebody noticed.
 *
 * ── THE RULE, IN ONE PLACE ───────────────────────────────────────────────────
 * Only the LATEST row for the variant counts, because the table is append-only
 * and the truth about a post is the sequence. That row excludes the variant
 * when it is:
 *
 *   - `announced`, `dispatched` or `cancelled` (pending or terminal),
 *   - a refusal younger than 60 minutes, whatever the reason, so a permanent
 *     reason is re-evaluated at most hourly and the log cannot grow without
 *     bound,
 *   - a `DAILY_CAP` refusal from the same day, in the WORKSPACE's own day,
 *     because that is the day `PUBLISHED_TODAY_SQL` counts the cap in.
 *
 * ── PROVEN BY MUTATION, 2026-09-06 ───────────────────────────────────────────
 * Restoring the bare `not exists (... any row ...)` turns three of these red:
 * the yesterday-cap, the two-hour gate refusal and the sixty-minute floor's
 * positive half. Dropping the tiebreaker turns the same-instant case red.
 *
 * ── THE L3 TRIGGER IS DISABLED FOR THIS DATABASE ONLY ────────────────────────
 * Its preconditions are proven in the migration's own suite; the question here
 * is what the SCAN returns, so the dial is set to 3 without satisfying them.
 */

const WS = '5e5e5e5e-5555-4555-8555-555555555555'
const USER = 'user_candidates_reconsider'
const CYCLE = 'c5c5c5c5-0000-4000-8000-000000000001'
const PROFILE = 'a1b2c3d4e5f6a7b8c9d0e1f2'
const ACCOUNT = '0f1e2d3c4b5a69788796a5b4'

/** One post + variant + brief per scenario, because the log cannot be edited. */
const V = {
  clean: ['e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001'],
  capYesterday: ['e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002'],
  capToday: ['e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000003'],
  cancelled: ['e0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000004'],
  gateTwoHours: ['e0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000005'],
  gateHalfHour: ['e0000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000006'],
  announcedAfterRefusal: [
    'e0000000-0000-4000-8000-000000000007',
    'f0000000-0000-4000-8000-000000000007',
  ],
  dispatched: ['e0000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-000000000008'],
  sameInstant: ['e0000000-0000-4000-8000-000000000009', 'f0000000-0000-4000-8000-000000000009'],
  budgetTwoHours: ['e0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-00000000000a'],
} as const

async function plant(db: PGlite, [post, variant]: readonly [string, string], priority: number) {
  await db.exec(`
    insert into posts (id, workspace_id, title, status, channels, created_by)
      values ('${post}', '${WS}', 'p${priority}', 'draft', '{x}', '${USER}');
    insert into post_variants (id, workspace_id, post_id, channel, body, publish_status)
      values ('${variant}', '${WS}', '${post}', 'x', 'body ${priority}', 'pending');
    insert into loop_briefs (workspace_id, cycle_id, title, body, channels, post_id, priority)
      values ('${WS}', '${CYCLE}', 'b${priority}', 'brief', '{x}', '${post}', ${priority});
  `)
}

/**
 * A log row at a chosen instant. Inserted directly rather than through
 * `WRITE_DECISION_SQL` because that statement, correctly, does not let a
 * caller choose `created_at`, and the append-only trigger refuses an UPDATE.
 */
async function logAt(
  db: PGlite,
  [post, variant]: readonly [string, string],
  decision: 'announced' | 'dispatched' | 'refused' | 'cancelled',
  reason: string | null,
  createdAtSql: string,
) {
  await db.exec(`
    insert into loop_autopilot_log
      (workspace_id, post_id, variant_id, channel, account_id, decision,
       refusal_reason, dispatch_after, created_at)
    values ('${WS}', '${post}', '${variant}', 'x', '${ACCOUNT}', '${decision}',
            ${reason === null ? 'null' : `'${reason}'`},
            ${decision === 'announced' ? `(${createdAtSql}) + interval '30 minutes'` : 'null'},
            ${createdAtSql});
  `)
}

describe('the candidate scan reconsiders a refused variant once the reason can have expired', () => {
  let db: PGlite
  let returned: string[]

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      alter table loop_channel_autonomy disable trigger loop_channel_autonomy_autopilot_guard;
      insert into workspaces (id, name, slug, created_by, timezone)
        values ('${WS}', 'Reconsider', 'candidates-reconsider', '${USER}', 'UTC');
      insert into loop_settings (workspace_id, paused, weekly_budget_credits)
        values ('${WS}', false, 150);
      insert into loop_channel_autonomy (workspace_id, channel, level, created_by)
        values ('${WS}', 'x', 3, '${USER}');
      insert into loop_cycles (id, workspace_id, iso_year, iso_week, status)
        values ('${CYCLE}', '${WS}', 2026, 35, 'reported');
      insert into zernio_profiles (workspace_id, profile_id)
        values ('${WS}', '${PROFILE}');
      insert into connections (workspace_id, platform, status, external_account, created_by)
        values ('${WS}', 'x', 'active',
                '{"id":"${ACCOUNT}","profileId":"${PROFILE}"}'::jsonb, '${USER}');
    `)

    let priority = 1
    for (const pair of Object.values(V)) await plant(db, pair, priority++)

    await logAt(db, V.capYesterday, 'refused', 'DAILY_CAP', `now() - interval '1 day'`)
    // Earlier TODAY in the workspace's day (which is UTC here): one minute past
    // midnight. Older than an hour for all but the first hour of the day, so it
    // is the same-day rule and not the sixty-minute floor that has to hold it.
    await logAt(
      db,
      V.capToday,
      'refused',
      'DAILY_CAP',
      `(date_trunc('day', now() at time zone 'UTC') + interval '1 minute') at time zone 'UTC'`,
    )
    await logAt(db, V.cancelled, 'announced', null, `now() - interval '2 days'`)
    await logAt(db, V.cancelled, 'cancelled', null, `now() - interval '1 day'`)
    await logAt(db, V.gateTwoHours, 'refused', 'REFUSAL_GATE', `now() - interval '2 hours'`)
    await logAt(db, V.gateHalfHour, 'refused', 'REFUSAL_GATE', `now() - interval '30 minutes'`)
    await logAt(db, V.announcedAfterRefusal, 'refused', 'DAILY_CAP', `now() - interval '3 days'`)
    await logAt(db, V.announcedAfterRefusal, 'announced', null, `now() - interval '2 days'`)
    await logAt(db, V.dispatched, 'announced', null, `now() - interval '3 days'`)
    await logAt(db, V.dispatched, 'dispatched', null, `now() - interval '2 days'`)
    // An announcement and its cancellation in the same transaction share a
    // `created_at`. The cancellation must still win the tie.
    await logAt(db, V.sameInstant, 'announced', null, `timestamptz '2020-01-01T00:00:00Z'`)
    await logAt(db, V.sameInstant, 'cancelled', null, `timestamptz '2020-01-01T00:00:00Z'`)
    await logAt(db, V.budgetTwoHours, 'refused', 'WEEKLY_BUDGET', `now() - interval '2 hours'`)

    const r = await db.query<{ variant_id: string }>(AUTOPILOT_CANDIDATES_SQL, [WS, 50])
    returned = r.rows.map((x) => x.variant_id)
  }, 120_000)

  it('a variant nobody has decided on is a candidate', () => {
    expect(returned).toContain(V.clean[1])
  })

  it('a DAILY_CAP refusal from YESTERDAY brings the variant back: the cap reset at midnight', () => {
    expect(returned).toContain(V.capYesterday[1])
  })

  it('a DAILY_CAP refusal from earlier TODAY still holds it: the cap has not reset', () => {
    expect(returned).not.toContain(V.capToday[1])
  })

  it('a cancelled announcement never comes back, however old', () => {
    expect(returned).not.toContain(V.cancelled[1])
  })

  it('a REFUSAL_GATE refusal two hours old is looked at again', () => {
    // The words may have been edited since. Permanent reasons are re-evaluated
    // at most once an hour, not never.
    expect(returned).toContain(V.gateTwoHours[1])
  })

  it('a refusal thirty minutes old is NOT looked at again: the hourly floor bounds the log', () => {
    expect(returned).not.toContain(V.gateHalfHour[1])
  })

  it('a WEEKLY_BUDGET refusal two hours old is looked at again', () => {
    expect(returned).toContain(V.budgetTwoHours[1])
  })

  it('only the LATEST row counts: an announcement after an old refusal still excludes', () => {
    expect(returned).not.toContain(V.announcedAfterRefusal[1])
  })

  it('a dispatched variant never comes back', () => {
    expect(returned).not.toContain(V.dispatched[1])
  })

  it('an announcement and its cancellation at the same instant read as cancelled', () => {
    expect(returned).not.toContain(V.sameInstant[1])
  })
})
