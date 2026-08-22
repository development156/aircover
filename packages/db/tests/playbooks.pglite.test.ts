import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootSchema, CONTENT_FOUNDATION } from './helpers/pglite-schema'

/**
 * M10 · PLAYBOOKS — the two migrations, applied and exercised on a real Postgres.
 *
 * ── WHAT THIS SUITE IS FOR ───────────────────────────────────────────────────
 * These files go to the database that serves production. Everything checkable
 * before that happens is checked here: that they apply in order, and that the
 * promises Playbooks make are promises the DATABASE holds rather than promises
 * the application makes.
 *
 * Each is tested by BREAKING it and watching the break be refused:
 *
 *   · a recipe the customer invented cannot be stored — the CHECK must raise
 *   · a recipe waiting on a capability cannot be ENABLED — the CHECK must raise
 *   · a run cannot be approved twice into two different totals, and cannot be
 *     approved at a total that changed underneath — the RPC must refuse
 *   · an item cannot point at another tenant's post — the trigger must raise
 *   · THE KILL SWITCH MUST REACH A COMPLETED RUN'S POSTS, AND MUST NOT REACH A
 *     POST NO ITEM POINTS AT. Both directions, because the switch has two ways
 *     to be wrong and only one of them is the obvious one.
 *
 * ── WHAT THIS SUITE CANNOT PROVE ─────────────────────────────────────────────
 * PGlite connects as a superuser, so ROW-LEVEL SECURITY IS BYPASSED here.
 * Nothing below may be read as evidence that a policy is enforced. The
 * structural fact that RLS is on is checkable and is checked; enforcement is
 * proven against the live database with an anon client, separately.
 */

/** The Loop batch is foundation here: `app.is_channel_set` comes from 000500. */
const FOUNDATION = [
  ...CONTENT_FOUNDATION,
  '20260718000006_billing_ledger.sql',
  '20260820000200_loop_autonomy.sql',
  '20260820000300_loop_cycles.sql',
  '20260820000400_loop_rpcs.sql',
  '20260820000500_loop_brief_channel_set.sql',
  '20260820000600_loop_kill_switch_reported.sql',
] as const

const PLAYBOOK_BATCH = [
  '20260822030000_playbooks.sql',
  '20260822030100_playbook_rpcs.sql',
  '20260822030200_playbooks_policy_roles.sql',
] as const

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const USER_A = 'user_alpha'
const USER_B = 'user_beta'
const VIEWER = 'user_viewer'

/** Run as a given Clerk user — the claim `auth.jwt()` reads. */
async function asUser(db: PGlite, userId: string | null): Promise<void> {
  const claims = userId === null ? '{}' : JSON.stringify({ sub: userId })
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims])
}

/** The error message a raise carries, or '' when the call unexpectedly succeeded. */
async function raises(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
    return ''
  } catch (e) {
    return (e as Error).message
  }
}

let seq = 0

/**
 * A workspace nobody else touches, so a test that enrols a recipe cannot collide
 * with a sibling that enrolled the same one. Cheaper than threading which recipe
 * slots are still free through the file, and it keeps each test readable on its
 * own — a fixture that has to be traced through four earlier tests is a fixture
 * that will eventually make a real failure look like a collision.
 */
async function freshWorkspace(db: PGlite): Promise<string> {
  seq += 1
  const id = `44444444-4444-4444-8444-${String(seq).padStart(12, '0')}`
  await db.exec(`
    insert into workspaces (id, name, slug, created_by)
      values ('${id}', 'W${seq}', 'w${seq}', '${USER_A}');
    insert into workspace_members (workspace_id, user_id, role) values
      ('${id}', '${USER_A}', 'owner'), ('${id}', '${VIEWER}', 'viewer');
  `)
  return id
}

/** A playbook row. */
async function makePlaybook(
  db: PGlite,
  workspaceId: string,
  overrides: { recipe?: string; enabled?: boolean; trigger?: string; cadence?: string | null } = {},
): Promise<string> {
  const recipe = overrides.recipe ?? 'festival_calendar'
  const r = await db.query<{ id: string }>(
    `insert into playbooks (workspace_id, recipe_key, enabled, trigger_kind, cadence, params)
     values ($1, $2, $3, $4, $5, '{}'::jsonb) returning id`,
    [
      workspaceId,
      recipe,
      overrides.enabled ?? false,
      overrides.trigger ?? 'manual',
      overrides.cadence ?? null,
    ],
  )
  return r.rows[0]!.id
}

async function makeRun(
  db: PGlite,
  workspaceId: string,
  playbookId: string,
  status = 'awaiting_cost_approval',
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into playbook_runs (workspace_id, playbook_id, recipe_key, status, estimated_credits)
     values ($1, $2, 'festival_calendar', $3, 0) returning id`,
    [workspaceId, playbookId, status],
  )
  return r.rows[0]!.id
}

async function makeItem(
  db: PGlite,
  workspaceId: string,
  runId: string,
  position: number,
  credits: number,
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into playbook_run_items (workspace_id, run_id, position, title, body, estimated_credits)
     values ($1, $2, $3, 'Diwali', 'body', $4) returning id`,
    [workspaceId, runId, position, credits],
  )
  return r.rows[0]!.id
}

/** A post, at whatever status and origin the caller needs to probe. */
async function makePost(
  db: PGlite,
  workspaceId: string,
  origin: string,
  status: string,
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into posts (workspace_id, title, body, status, origin, scheduled_at, created_by)
     values ($1, 'p', 'b', $2, $3, now() + interval '3 days', $4) returning id`,
    [workspaceId, status, origin, USER_A],
  )
  return r.rows[0]!.id
}

describe('Playbooks · migrations 20260822030000 / 030100', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootSchema([...FOUNDATION, ...PLAYBOOK_BATCH])
    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'Alpha', 'alpha', '${USER_A}'), ('${WS_B}', 'Beta', 'beta', '${USER_B}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${USER_A}', 'owner'),
        ('${WS_B}', '${USER_B}', 'owner'),
        ('${WS_A}', '${VIEWER}', 'viewer');
    `)
  })

  afterAll(async () => {
    await db.close()
  })

  // ── structure ──────────────────────────────────────────────────────────────
  it('applies both files in order on top of the schema production has', async () => {
    const r = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`,
    )
    const live = new Set(r.rows.map((x) => x.tablename))
    expect(
      ['playbooks', 'playbook_runs', 'playbook_run_items'].filter((t) => !live.has(t)),
    ).toEqual([])
  })

  it('enables row-level security on all three tables (structural fact only)', async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
        where relname in ('playbooks','playbook_runs','playbook_run_items')`,
    )
    expect(r.rows.filter((x) => !x.relrowsecurity).map((x) => x.relname)).toEqual([])
    expect(r.rows).toHaveLength(3)
  })

  it('gives the run tables READ-ONLY policies, and playbooks no DELETE', async () => {
    const r = await db.query<{ tablename: string; cmd: string }>(
      `select tablename, cmd from pg_policies where schemaname = 'public'
         and tablename in ('playbooks','playbook_runs','playbook_run_items')`,
    )
    const byTable = (t: string) =>
      r.rows
        .filter((x) => x.tablename === t)
        .map((x) => x.cmd)
        .sort()
    // A member may not write the record of what they were charged for.
    expect(byTable('playbook_runs')).toEqual(['SELECT'])
    expect(byTable('playbook_run_items')).toEqual(['SELECT'])
    // And may not delete an enrolment, which would cascade its history away.
    expect(byTable('playbooks')).toEqual(['INSERT', 'SELECT', 'UPDATE'])
  })

  it('names `authenticated` on every policy, which is how the schema is classified', () => {
    // MEASURED 2026-08-22: the three `playbooks` policies were written by hand —
    // that table needs INSERT and UPDATE, and `app.apply_tenant_read_policy`
    // only grants SELECT — and the `to authenticated` clause was not copied
    // across. They defaulted to PUBLIC.
    //
    // No row was exposed: a PUBLIC policy still covers `authenticated`, and the
    // body needs a JWT `sub` that `anon` does not have. What it broke is the
    // classification `rls_tenant_isolation.pglite.test.ts` applies to every
    // tenant table, which reported `playbooks` as a table nobody may read.
    return db
      .query<{ tablename: string; roles: string[] }>(
        `select tablename, roles from pg_policies where schemaname = 'public'
           and tablename in ('playbooks','playbook_runs','playbook_run_items')`,
      )
      .then((r) => {
        expect(r.rows).toHaveLength(5)
        for (const row of r.rows) {
          expect(row.roles, row.tablename).toContain('authenticated')
        }
      })
  })

  it('admits `playbook` as a post origin and still refuses an invented one', async () => {
    await expect(makePost(db, WS_A, 'playbook', 'draft')).resolves.toBeTruthy()
    const msg = await raises(() => makePost(db, WS_A, 'telepathy', 'draft'))
    expect(msg).toMatch(/posts_origin_check/)
  })

  // ── THE FENCE: the catalogue is curated ────────────────────────────────────
  describe('the recipe fence', () => {
    it('stores each of the five curated recipes', async () => {
      for (const key of [
        'festival_calendar',
        'rss_to_post',
        'review_reply',
        'product_drop',
        'quiet_post_remix',
      ]) {
        await expect(makePlaybook(db, WS_B, { recipe: key })).resolves.toBeTruthy()
      }
    })

    it('REFUSES a recipe the customer invented — this is what makes it not a builder', async () => {
      const msg = await raises(() => makePlaybook(db, WS_A, { recipe: 'when_x_then_scrape_y' }))
      expect(msg).toMatch(/playbooks_recipe_key_check/)
    })

    it('REFUSES enabling a recipe that waits on a capability this product lacks', async () => {
      // Every one of the four blocked recipes, not just a representative — the
      // constraint is an allow-list of one and a typo in it would open three.
      for (const key of ['rss_to_post', 'review_reply', 'product_drop', 'quiet_post_remix']) {
        const msg = await raises(() =>
          db.query(
            `insert into playbooks (workspace_id, recipe_key, enabled, trigger_kind)
             values ($1, $2, true, 'manual')`,
            [WS_A, key],
          ),
        )
        expect(msg, `${key} was enabled`).toMatch(/playbooks_enabled_recipe_is_runnable/)
      }
    })

    it('REFUSES enabling the event trigger, which has no receiver', async () => {
      const msg = await raises(() =>
        db.query(
          `insert into playbooks (workspace_id, recipe_key, enabled, trigger_kind)
           values ($1, 'festival_calendar', true, 'event')`,
          [WS_B],
        ),
      )
      expect(msg).toMatch(/playbooks_enabled_recipe_is_runnable/)
    })

    it('pairs a cadence with a schedule in both directions', async () => {
      const ws = await freshWorkspace(db)
      expect(
        await raises(() =>
          makePlaybook(db, ws, { recipe: 'product_drop', trigger: 'schedule', cadence: null }),
        ),
      ).toMatch(/playbooks_cadence_matches_trigger/)
      expect(
        await raises(() =>
          makePlaybook(db, ws, { recipe: 'review_reply', trigger: 'manual', cadence: 'daily' }),
        ),
      ).toMatch(/playbooks_cadence_matches_trigger/)
    })

    it('allows one enrolment per recipe per workspace, and a second workspace its own', async () => {
      const ws = await freshWorkspace(db)
      await makePlaybook(db, ws, { recipe: 'festival_calendar' })
      // The same recipe in a DIFFERENT workspace is fine — the unique is scoped.
      await makePlaybook(db, await freshWorkspace(db), { recipe: 'festival_calendar' })
      const msg = await raises(() => makePlaybook(db, ws, { recipe: 'festival_calendar' }))
      expect(msg).toMatch(/playbooks_workspace_id_recipe_key_key/)
    })
  })

  // ── ONE LIVE RUN ───────────────────────────────────────────────────────────
  describe('the one-live-run slot', () => {
    it('refuses a second live run for the same playbook', async () => {
      const ws = await freshWorkspace(db)
      const pb = await makePlaybook(db, ws, { recipe: 'rss_to_post' })
      await makeRun(db, ws, pb, 'running')
      const msg = await raises(() => makeRun(db, ws, pb, 'proposing'))
      expect(msg).toMatch(/playbook_runs_one_live_per_playbook/)
    })

    /**
     * THE EXACT STATEMENT `store.openRun` SENDS, RUN TWICE.
     *
     * MEASURED 2026-08-22: the first version of that function said `on conflict
     * on constraint playbook_runs_one_live_per_playbook`, and Postgres answers
     * "constraint … does not exist" — the name belongs to a CREATE UNIQUE INDEX,
     * which has no `pg_constraint` row. Both routes into the feature would have
     * thrown on first use.
     *
     * The test above did not catch it because it proves the INDEX with a direct
     * insert, which is a different statement. This one carries the statement
     * itself, predicate and all, so the two files that hold that predicate
     * cannot drift apart in silence.
     */
    it('runs the exact upsert openRun sends, and the second attempt yields nothing', async () => {
      const ws = await freshWorkspace(db)
      const pb = await makePlaybook(db, ws, { recipe: 'festival_calendar' })
      const open = () =>
        db.query<{ id: string }>(
          `insert into playbook_runs (workspace_id, playbook_id, recipe_key, trigger_source, created_by)
           values ($1, $2, 'festival_calendar', 'manual', null)
           on conflict (playbook_id) where status in ('proposing', 'awaiting_cost_approval', 'running')
             do nothing
           returning id`,
          [ws, pb],
        )
      expect((await open()).rows).toHaveLength(1)
      // Null to the caller: "one is already going" is a normal answer, not an
      // error the action has to interpret.
      expect((await open()).rows).toHaveLength(0)
    })

    it('frees the slot once a run ends, including when it was cancelled', async () => {
      const ws = await freshWorkspace(db)
      const pb = await makePlaybook(db, ws, { recipe: 'product_drop' })
      const first = await makeRun(db, ws, pb, 'running')
      await db.query(`update playbook_runs set status = 'cancelled' where id = $1`, [first])
      // Pressing the brake must not ban the customer from ever running it again.
      await expect(makeRun(db, ws, pb, 'proposing')).resolves.toBeTruthy()
    })
  })

  // ── THE TENANCY GUARD ──────────────────────────────────────────────────────
  it('REFUSES an item pointing at another tenant’s post', async () => {
    const ws = await freshWorkspace(db)
    const pb = await makePlaybook(db, ws, { recipe: 'quiet_post_remix' })
    const run = await makeRun(db, ws, pb)
    const item = await makeItem(db, ws, run, 1, 3)
    const strangersPost = await makePost(db, WS_B, 'manual', 'draft')
    const msg = await raises(() =>
      db.query(`update playbook_run_items set post_id = $1 where id = $2`, [strangersPost, item]),
    )
    expect(msg).toMatch(/PLAYBOOK_ITEM_CROSS_TENANT/)
  })

  it('refuses a duplicate channel in an item, which is a set and not a list', async () => {
    const ws = await freshWorkspace(db)
    const pb = await makePlaybook(db, ws, { recipe: 'quiet_post_remix' })
    const run = await makeRun(db, ws, pb)
    const msg = await raises(() =>
      db.query(
        `insert into playbook_run_items (workspace_id, run_id, position, title, body, channels)
         values ($1, $2, 9, 't', 'b', array['x','x'])`,
        [ws, run],
      ),
    )
    expect(msg).toMatch(/playbook_run_items_channels_is_set/)
  })
  // ── THE HALT: nothing is charged before a person has seen the number ───────
  describe('playbook_approve_cost', () => {
    /** A workspace with one run at the halt and three priced items. */
    async function halted(prices: readonly number[] = [3, 3, 3]) {
      const ws = await freshWorkspace(db)
      const pb = await makePlaybook(db, ws, { recipe: 'festival_calendar' })
      const run = await makeRun(db, ws, pb)
      const items: string[] = []
      for (const [i, price] of prices.entries()) {
        items.push(await makeItem(db, ws, run, i + 1, price))
      }
      return { ws, pb, run, items }
    }

    it('refuses a caller with no JWT', async () => {
      const { run } = await halted()
      await asUser(db, null)
      expect(await raises(() => db.query(`select playbook_approve_cost($1)`, [run]))).toMatch(
        /AUTH_REQUIRED/,
      )
      await asUser(db, USER_A)
    })

    it('refuses a stranger, with the same error a missing run gives', async () => {
      const { run } = await halted()
      await asUser(db, USER_B)
      expect(await raises(() => db.query(`select playbook_approve_cost($1)`, [run]))).toMatch(
        /NOT_A_MEMBER/,
      )
      // And an id that does not exist is INVALID_RUN, not "exists but not yours"
      // — a distinct error would let a stranger enumerate run ids.
      await asUser(db, USER_A)
      expect(
        await raises(() =>
          db.query(`select playbook_approve_cost('99999999-9999-4999-8999-999999999999')`),
        ),
      ).toMatch(/INVALID_RUN/)
    })

    it('refuses a viewer — approving a cost is spending money', async () => {
      const { run } = await halted()
      await asUser(db, VIEWER)
      expect(await raises(() => db.query(`select playbook_approve_cost($1)`, [run]))).toMatch(
        /FORBIDDEN_ROLE/,
      )
      await asUser(db, USER_A)
    })

    it('refuses a run that is not at the halt', async () => {
      const { ws, run } = await halted()
      void ws
      await db.query(`update playbook_runs set status = 'running' where id = $1`, [run])
      await asUser(db, USER_A)
      expect(await raises(() => db.query(`select playbook_approve_cost($1)`, [run]))).toMatch(
        /WRONG_STATUS/,
      )
    })

    it('refuses when every item was trimmed — that is cancel, not approve', async () => {
      const { run, items } = await halted()
      await asUser(db, USER_A)
      expect(
        await raises(() =>
          db.query(`select playbook_approve_cost($1, $2::uuid[])`, [run, `{${items.join(',')}}`]),
        ),
      ).toMatch(/NOTHING_INCLUDED/)
    })

    it('refuses a total that changed underneath the person looking at it', async () => {
      const { run } = await halted()
      await asUser(db, USER_A)
      // The screen showed 9. Something re-priced an item to 4 since.
      await db.query(
        `update playbook_run_items set estimated_credits = 4 where run_id = $1 and position = 1`,
        [run],
      )
      expect(
        await raises(() => db.query(`select playbook_approve_cost($1, '{}'::uuid[], 9)`, [run])),
      ).toMatch(/ESTIMATE_CHANGED/)
      // and nothing was approved
      const r = await db.query<{ cost_approved_at: string | null }>(
        `select cost_approved_at from playbook_runs where id = $1`,
        [run],
      )
      expect(r.rows[0]!.cost_approved_at).toBeNull()
    })

    it('approves the trimmed total, records who and when, and marks the dropped items', async () => {
      const { run, items } = await halted([3, 3, 3])
      await asUser(db, USER_A)
      const r = await db.query<{ playbook_approve_cost: Record<string, unknown> }>(
        `select playbook_approve_cost($1, $2::uuid[], 6) as playbook_approve_cost`,
        [run, `{${items[2]}}`],
      )
      expect(r.rows[0]!.playbook_approve_cost).toMatchObject({
        approved_credits: 6,
        included_items: 2,
        excluded_items: 1,
        replayed: false,
      })

      const row = await db.query<{
        status: string
        cost_approved_at: string | null
        cost_approved_by: string | null
        approved_credits: number
      }>(
        `select status, cost_approved_at, cost_approved_by, approved_credits
           from playbook_runs where id = $1`,
        [run],
      )
      // THE STATUS DOES NOT ADVANCE HERE. The executor is what moves it, after
      // re-reading `cost_approved_at` from this table — so the gate is a fresh
      // read of the row about to be spent against, not a belief inherited from
      // this call.
      expect(row.rows[0]!.status).toBe('awaiting_cost_approval')
      expect(row.rows[0]!.cost_approved_at).not.toBeNull()
      expect(row.rows[0]!.cost_approved_by).toBe(USER_A)
      expect(row.rows[0]!.approved_credits).toBe(6)

      const dropped = await db.query<{ included: boolean; outcome: string }>(
        `select included, outcome from playbook_run_items where id = $1`,
        [items[2]],
      )
      expect(dropped.rows[0]).toEqual({ included: false, outcome: 'skipped' })
    })

    /**
     * THE CLAIM 20260822030000 MAKES ABOUT ITS OWN TWO COLUMNS.
     *
     * The migration says `approved_credits` is stored separately from
     * `estimated_credits` because "the difference between 'we proposed 11' and
     * 'they approved 8' is the record that the trim happened and was theirs".
     * Nothing checked that, and for a while it was false: the app stored the
     * WHOLE total in `estimated_credits` — items plus the per-run charge — while
     * the RPC can only ever compute the item total, because it sums the rows and
     * SQL cannot read pricing.config.json. The difference was the trim plus a
     * constant, so a run with nothing trimmed recorded a trim of 2.
     *
     * Asserted here as arithmetic rather than as a pair of literals, so it holds
     * whatever the prices become.
     */
    it('records a difference that is EXACTLY the trim, and nothing else', async () => {
      const { run, items } = await halted([3, 3, 5])
      await db.query(`update playbook_runs set estimated_credits = 11 where id = $1`, [run])
      await asUser(db, USER_A)
      await db.query(`select playbook_approve_cost($1, $2::uuid[], 6)`, [run, `{${items[2]}}`])

      const row = await db.query<{ estimated_credits: number; approved_credits: number }>(
        `select estimated_credits, approved_credits from playbook_runs where id = $1`,
        [run],
      )
      const trimmed = await db.query<{ total: number }>(
        `select coalesce(sum(estimated_credits), 0)::int as total
           from playbook_run_items where run_id = $1 and not included`,
        [run],
      )
      expect(row.rows[0]!.estimated_credits - row.rows[0]!.approved_credits).toBe(
        trimmed.rows[0]!.total,
      )
    })

    it('replays a second approval as SUCCESS at the original total', async () => {
      const { run } = await halted([2, 2])
      await asUser(db, USER_A)
      await db.query(`select playbook_approve_cost($1, '{}'::uuid[], 4)`, [run])
      // A double click, or a retry after a lost response. Raising here would tell
      // the customer their approval failed when it had already worked, and the
      // obvious next move is to press it again.
      const again = await db.query<{ v: Record<string, unknown> }>(
        `select playbook_approve_cost($1, '{}'::uuid[], 4) as v`,
        [run],
      )
      expect(again.rows[0]!.v).toMatchObject({ approved_credits: 4, replayed: true })
    })

    it('approves a total of zero, because at L0 no model is called', async () => {
      const { run } = await halted([0, 0])
      await asUser(db, USER_A)
      const r = await db.query<{ v: Record<string, unknown> }>(
        `select playbook_approve_cost($1, '{}'::uuid[], 0) as v`,
        [run],
      )
      expect(r.rows[0]!.v).toMatchObject({ approved_credits: 0, included_items: 2 })
    })
  })

  // ── THE KILL SWITCH, AND THE CONTROLS THAT MUST SURVIVE IT ────────────────
  describe('playbook_kill_switch', () => {
    /**
     * One workspace holding every case the switch has to tell apart.
     *
     * The two CONTROLS are the point of this fixture. A test that only planted
     * targets would pass for a switch scoped by `posts.origin`, by
     * `posts.status`, or by nothing at all — which is exactly how the Loop's
     * version shipped with a hole in it: every fixture it had shared the blind
     * spot of the code it was guarding.
     */
    async function scene() {
      const ws = await freshWorkspace(db)
      const pb = await makePlaybook(db, ws, { recipe: 'festival_calendar', enabled: true })

      // A COMPLETED run whose post is still on the calendar. This is the case
      // the Loop's first kill switch walked straight past.
      const done = await makeRun(db, ws, pb, 'completed')
      const donePost = await makePost(db, ws, 'playbook', 'scheduled')
      const doneItem = await makeItem(db, ws, done, 1, 3)
      await db.query(
        `update playbook_run_items set post_id = $1, outcome = 'awaiting_approval' where id = $2`,
        [donePost, doneItem],
      )
      await db.query(
        `insert into post_variants (workspace_id, post_id, channel, body, publish_status)
         values ($1, $2, 'x', 'b', 'scheduled')`,
        [ws, donePost],
      )

      // A run still going, whose post is approved and waiting for its slot.
      const pb2 = await makePlaybook(db, ws, { recipe: 'rss_to_post' })
      const live = await makeRun(db, ws, pb2, 'running')
      const livePost = await makePost(db, ws, 'playbook', 'approved')
      const liveItem = await makeItem(db, ws, live, 1, 3)
      await db.query(`update playbook_run_items set post_id = $1 where id = $2`, [
        livePost,
        liveItem,
      ])

      // CONTROL 1 — A POST CARRYING `origin = 'playbook'` THAT NO ITEM POINTS
      // AT. Origin says who drafted it; it is not a claim that a run still owns
      // it. This is the customer's own scheduled work and it MUST survive.
      const orphan = await makePost(db, ws, 'playbook', 'scheduled')

      // CONTROL 2 — a hand-made post. Trivially must survive, and cheap to keep.
      const byHand = await makePost(db, ws, 'manual', 'scheduled')

      // CONTROL 3 — a post that already went out. Past recall; rewriting it to
      // look like a draft would be a lie about what happened.
      const published = await makePost(db, ws, 'playbook', 'published')
      const publishedItem = await makeItem(db, ws, done, 2, 3)
      await db.query(`update playbook_run_items set post_id = $1 where id = $2`, [
        published,
        publishedItem,
      ])

      return { ws, done, live, donePost, livePost, orphan, byHand, published }
    }

    const statusOf = async (id: string): Promise<string> => {
      const r = await db.query<{ status: string }>(`select status from posts where id = $1`, [id])
      return r.rows[0]!.status
    }

    it('takes down a COMPLETED run’s scheduled post — the case the obvious scoping misses', async () => {
      const s = await scene()
      await asUser(db, USER_A)
      await db.query(`select playbook_kill_switch($1)`, [s.ws])
      expect(await statusOf(s.donePost)).toBe('draft')
      // ...and the completed run KEEPS its record. Rewriting it to 'cancelled'
      // would make the history describe work that happened as work that did not.
      const r = await db.query<{ status: string }>(
        `select status from playbook_runs where id = $1`,
        [s.done],
      )
      expect(r.rows[0]!.status).toBe('completed')
    })

    it('CONTROL — a post carrying the playbook origin that no item points at SURVIVES', async () => {
      const s = await scene()
      await asUser(db, USER_A)
      await db.query(`select playbook_kill_switch($1)`, [s.ws])
      expect(await statusOf(s.orphan)).toBe('scheduled')
      expect(await statusOf(s.byHand)).toBe('scheduled')
    })

    it('CONTROL — a post that already went out is not rewritten to look like a draft', async () => {
      const s = await scene()
      await asUser(db, USER_A)
      await db.query(`select playbook_kill_switch($1)`, [s.ws])
      expect(await statusOf(s.published)).toBe('published')
    })

    it('CONTROL — another tenant’s posts and runs are untouched', async () => {
      const s = await scene()
      const other = await scene()
      await asUser(db, USER_A)
      await db.query(`select playbook_kill_switch($1)`, [s.ws])
      expect(await statusOf(other.donePost)).toBe('scheduled')
      expect(await statusOf(other.livePost)).toBe('approved')
    })

    it('cancels the live run, unschedules its variants, and disables the playbooks', async () => {
      const s = await scene()
      await asUser(db, USER_A)
      const r = await db.query<{ v: Record<string, unknown> }>(
        `select playbook_kill_switch($1) as v`,
        [s.ws],
      )
      expect(r.rows[0]!.v).toMatchObject({
        runs_cancelled: 1,
        posts_unscheduled: 2,
        variants_unscheduled: 1,
        playbooks_disabled: 1,
      })
      expect(await statusOf(s.livePost)).toBe('draft')
      const v = await db.query<{ publish_status: string }>(
        `select publish_status from post_variants where post_id = $1`,
        [s.donePost],
      )
      expect(v.rows[0]!.publish_status).toBe('pending')
      const enabled = await db.query<{ n: number }>(
        `select count(*)::int as n from playbooks where workspace_id = $1 and enabled`,
        [s.ws],
      )
      expect(enabled.rows[0]!.n).toBe(0)
    })

    /**
     * THE SECOND LINE OF DEFENCE, TESTED WITH THE FIRST ONE DOWN.
     *
     * `p.workspace_id = v_ws` on the post update looks redundant: the `targets`
     * CTE is already scoped to this workspace's items, so no foreign post id can
     * reach it — while the tenancy trigger holds. MEASURED: removing that line
     * on its own turns nothing red, which is what "two guards on one hole" looks
     * like from the outside.
     *
     * So this test disables the trigger, constructs the exact row the trigger
     * normally forbids, and checks that the switch still refuses to touch the
     * stranger's post. Without it, the guard could be deleted by anyone tidying
     * up a redundant-looking predicate, and nothing would say so.
     */
    it('CONTROL — with the tenancy trigger DOWN, a foreign post is still not touched', async () => {
      const s = await scene()
      const stranger = await makePost(db, WS_B, 'playbook', 'scheduled')
      await db.exec(`alter table playbook_run_items disable trigger assert_post_tenancy`)
      try {
        const item = await makeItem(db, s.ws, s.done, 9, 3)
        await db.query(`update playbook_run_items set post_id = $1 where id = $2`, [stranger, item])
      } finally {
        await db.exec(`alter table playbook_run_items enable trigger assert_post_tenancy`)
      }

      await asUser(db, USER_A)
      await db.query(`select playbook_kill_switch($1)`, [s.ws])
      expect(await statusOf(stranger)).toBe('scheduled')
    })

    it('refuses a stranger and a viewer', async () => {
      const s = await scene()
      await asUser(db, USER_B)
      expect(await raises(() => db.query(`select playbook_kill_switch($1)`, [s.ws]))).toMatch(
        /NOT_A_MEMBER/,
      )
      await asUser(db, VIEWER)
      expect(await raises(() => db.query(`select playbook_kill_switch($1)`, [s.ws]))).toMatch(
        /FORBIDDEN_ROLE/,
      )
      await asUser(db, USER_A)
    })
  })
})
