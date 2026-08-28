import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  asMember,
  asRole,
  bootFullSchema,
  currentRole,
  probe,
  seedTwoWorkspaces,
  tenantTables,
  tenantViews,
} from './helpers/pglite-tenant'

/**
 * TENANT ISOLATION, ENFORCED, ON EVERY GATE RUN, WITH NO CREDENTIALS.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 * `rls.test.ts` holds 45 tests and `ops_rls.test.ts` holds 49. Both are
 * `describe.skipIf(!hasRlsEnv)`, and `hasRlsEnv` is false unless
 * SAHODA_ALLOW_LIVE_TESTS=1 — which nobody sets, correctly, because the only
 * Supabase project this repo has IS production, with real workspaces and real
 * users in it. So on 2026-08-20 the measured count of executing tests that
 * enforced an RLS policy was ZERO, and `turbo test` reported packages/db green
 * with 201 passed and 202 skipped.
 *
 * Those 94 are not deleted: against the live database they check things this
 * cannot, and they remain the right tool the day a disposable project exists.
 * What is wrong is a gate whose only RLS evidence is a suite that never runs.
 *
 * ── WHY IT IS DRIVEN BY THE CATALOG ──────────────────────────────────────────
 * The table list comes from `information_schema`, never from an array in this
 * file. A hand-written list is a list that stops being true — and the specific
 * way guards fail in this repo is by covering element [0] of a collection they
 * claim to cover in full. A new migration adding a `workspace_id` table joins
 * this suite the moment it lands, without anybody remembering to add it.
 *
 * ── THE THREE WAYS THIS COULD PASS WITHOUT PROVING ANYTHING ──────────────────
 * Each has an assertion of its own, before the isolation checks:
 *
 *   1. the role never dropped, so every policy was inert  → `is_superuser` is
 *      asserted `off` inside the transaction;
 *   2. nothing was seeded, so "B's rows are invisible" is trivially true →
 *      the seed report is asserted complete, and each table's row count is
 *      asserted 2 before it is filtered;
 *   3. the policy is missing, so everything is visible and the suite would
 *      notice — that is the case these tests are actually for.
 */

/** Two workspaces and one member each. Fixed ids so a failure names the row. */
const WS_A = '11111111-1111-1111-1111-111111111111'
const WS_B = '22222222-2222-2222-2222-222222222222'
const USER_A = 'user_aaaaaaaaaaaaaaaaaaaaaaaa'
const USER_B = 'user_bbbbbbbbbbbbbbbbbbbbbbbb'

/**
 * A THIRD workspace, belonging to neither member, used only by
 * `seedGuardedNonTenantTables`.
 *
 * MEASURED 2026-08-22, and the reason is worth keeping: seeding Radar's guard
 * fixture under WS_A instead made `a member of A cannot take a row out of
 * workspace B` FAIL — and fail with a security-shaped message about
 * competitor_subscriptions. It was a false alarm. That test infers theft from
 * "A can now see more than one row where it seeded one", so a second LEGITIMATE
 * row in A is indistinguishable from a stolen one. The fixture belongs to nobody,
 * so neither member's count moves and the inference stays sound.
 */
const WS_GUARD = '33333333-3333-3333-3333-333333333333'
const USER_GUARD = 'user_cccccccccccccccccccccccc'

let db: PGlite
let tables: string[]
let seeded: string[]
let serviceOnly: string[]
let operatorOnly: string[]

/**
 * A tenant table falls into exactly one of three groups, and only the first
 * owes an ordinary member a readable row.
 *
 *   tenant    — policy keyed on `app.member_workspace_ids()`. A member sees
 *               their workspace's rows and nobody else's.
 *   service   — RLS on, NO select policy for `authenticated` at all. Denies
 *               everything, which is the safe end of the lever and is what
 *               `ai_provider_logs` ("⚙ service-only") intends.
 *   operator  — policy keyed on `app.is_ops_admin()`. An ordinary member
 *               correctly sees nothing; a platform operator sees everything.
 *
 * Membership of the last two is DERIVED from pg_policies and then ASSERTED
 * against these lists. Deriving alone would be worse than useless: a table that
 * quietly lost its SELECT policy would be reclassified as "service" and excused
 * by the very check meant to catch it. Naming them means the reclassification
 * is what fails.
 */
const EXPECTED_SERVICE_ONLY = [
  'ai_provider_logs',
  /* Added deliberately 2026-08-23, which is what this list's own failure message
     asks for. `ledger_actor_redactions` records a decision about whether a
     workspace's identity may be shown on its financial record. It is Sahoda's
     decision record rather than the customer's content, nothing in `apps/web`
     reads or writes it, and a member who could read it would learn nothing
     about themselves they are not already told in the product.
     It is NOT invisible to the customer: the DPDP export names it, with the
     reason it cannot be included, exactly as `ai_provider_logs` is named. */
  'ledger_actor_redactions',
]
const EXPECTED_OPERATOR_ONLY = [
  'ops_credit_requests',
  // Added 2026-08-22 with migration 20260822160000. This guard failing is what
  // made it a decision rather than a side effect, which is the whole point of
  // naming the set instead of deriving it.
  //
  // `post_publish_logs` now carries BOTH policies: the member-scoped `t_select`
  // it always had, and an `app.is_ops_admin()` one. Permissive policies are
  // OR-ed, so a member's view is unchanged — VERIFIED live against production,
  // where a member reads their own 6 rows before and after while an operator
  // reads all 21 across 2 workspaces. Without the operator policy the failed
  // publishes were visible to nobody but the tenant they happened to, and
  // apps/web has no service-role client to fetch them with.
  'post_publish_logs',
  // Added 2026-08-25 with migration 20260825000000. Same reasoning as the line
  // above, and a stronger case: the Marketing Brain is HIDDEN from customers by
  // design (docs/51), so /admin is not a second window onto this table, it is
  // the only one. Both policies are permissive and therefore OR-ed, so a member
  // still reads exactly their own observations and an operator reads all of
  // them. This guard failing is what made the operator policy a decision.
  'marketing_observations',
  // Added 2026-08-28 with migration 20260828060000, and this guard failing is
  // again what made it a decision. `marketing_pass_runs` is the record of the
  // brain having LOOKED, so it inherits the reason above verbatim: the store is
  // hidden from customers, /admin is the only window, and an operator who
  // cannot see which workspaces the Sunday pass reached cannot tell a pass that
  // skipped a tenant from one that examined it and found nothing.
  'marketing_pass_runs',
]

/**
 * Give the append-only guard something to guard on the tables the tenant seeder
 * cannot reach.
 *
 * `seedTwoWorkspaces` walks `information_schema` for tables carrying a
 * `workspace_id`, which is the right rule for tenant isolation and the wrong one
 * for the append-only suite below. Radar's `competitor_snapshots` and
 * `competitor_changes` carry `app.block_mutations()` and deliberately have NO
 * `workspace_id` — they hang off a globally-shared competitor, which is what
 * makes one fetch serve every subscriber.
 *
 * MEASURED 2026-08-22: with no rows in them, both were reported as "empty, so
 * not covered". A FOR EACH ROW trigger cannot fire on an empty table, so a
 * DELETE matching nothing succeeds trivially and the guard would have been
 * recorded as absent — or, worse, as present when it was not.
 *
 * They are SEEDED rather than added to EXPECTED_UNPOPULATED, deliberately. That
 * list is for tables nothing can reach; using it to quiet a table that could
 * have been seeded is how a guarantee stops being checked while still being
 * claimed.
 */
async function seedGuardedNonTenantTables(): Promise<void> {
  // Through the real RPC, because it is the only sanctioned write path and a
  // hand-built row could have a shape the product can never produce.
  const sub = (
    await db.query<{ out: { source_ids: string[] } }>(
      `select app.radar_subscribe($1::uuid, 'Guard fixture',
              '[{"kind":"instagram","locator":"guardfixture"}]'::jsonb, $2) as out`,
      [WS_GUARD, USER_GUARD],
    )
  ).rows[0]!.out
  const sourceId = sub.source_ids[0]!

  // TWO snapshots, a day apart: a change is DERIVED from a pair, so one row
  // would leave `competitor_changes` empty and back where this started.
  const snap = async (hash: string, offsetDays: number) =>
    (
      await db.query<{ id: string }>(
        `insert into competitor_snapshots (source_id, payload, content_hash, captured_at)
         values ($1::uuid, '{"kind":"social","handle":"guardfixture","posts":[]}'::jsonb, $2,
                 now() - ($3 || ' days')::interval)
         returning id`,
        [sourceId, hash, String(offsetDays)],
      )
    ).rows[0]!.id

  const from = await snap('guard-1', 1)
  const to = await snap('guard-2', 0)
  await db.query(
    `insert into competitor_changes
       (source_id, from_snapshot_id, to_snapshot_id, change_kind, day_span, summary)
     values ($1::uuid, $2::uuid, $3::uuid, 'audience_moved', 1, 'Guard fixture.')`,
    [sourceId, from, to],
  )
}

beforeAll(async () => {
  db = await bootFullSchema()
  tables = await tenantTables(db)

  // The two workspaces and their memberships come first: every policy resolves
  // through `app.member_workspace_ids()`, which reads `workspace_members`.
  await db.exec(`
    insert into workspaces (id, name, slug, created_by) values
      ('${WS_A}', 'Alpha', 'alpha', '${USER_A}'),
      ('${WS_B}', 'Beta', 'beta', '${USER_B}');
    insert into workspace_members (workspace_id, user_id, role) values
      ('${WS_A}', '${USER_A}', 'owner'), ('${WS_B}', '${USER_B}', 'owner');
  `)

  // Created AFTER the two under test and never joined by either member — see the
  // note on WS_GUARD. It exists only to own the append-only guard fixture.
  await db.exec(`
    insert into workspaces (id, name, slug, created_by) values
      ('${WS_GUARD}', 'Guard', 'guard', '${USER_GUARD}');
    insert into workspace_members (workspace_id, user_id, role) values
      ('${WS_GUARD}', '${USER_GUARD}', 'owner');
  `)

  const report = await seedTwoWorkspaces(db, WS_A, WS_B, { [WS_A]: USER_A, [WS_B]: USER_B })
  seeded = report.seeded

  await seedGuardedNonTenantTables()

  // Read from pg_policies, so the classification tracks the migration files
  // rather than anyone's memory of them.
  const selectPolicies = (
    await db.query<{ tablename: string; qual: string | null }>(
      `select tablename, qual from pg_policies
       where schemaname = 'public'
         and (cmd = 'SELECT' or cmd = 'ALL')
         and 'authenticated' = any(roles)`,
    )
  ).rows
  const readable = new Set(selectPolicies.map((r) => r.tablename))
  const opsGated = new Set(
    selectPolicies.filter((r) => (r.qual ?? '').includes('is_ops_admin')).map((r) => r.tablename),
  )
  serviceOnly = tables.filter((t) => !readable.has(t))
  operatorOnly = tables.filter((t) => opsGated.has(t))

  if (report.unseeded.length > 0) {
    // Printed, not swallowed: a table the seeder cannot reach is a table this
    // suite does not cover, and that must be visible in the run's output rather
    // than inferred from a count.
    console.log(
      `[rls] ${report.unseeded.length} tenant table(s) not seeded:\n` +
        report.unseeded.map((u) => `    ${u.table} — ${u.reason}`).join('\n'),
    )
  }
}, 120_000)

describe('the harness is capable of failing', () => {
  it('finds tenant tables from the catalog, and more than a handful', () => {
    // 30 when written. The floor catches a broken query, not a schema change.
    expect(tables.length).toBeGreaterThan(20)
  })

  it('drops superuser inside the transaction, so policies actually apply', async () => {
    const outside = await currentRole(db)
    expect(outside.superuser).toBe('on')

    const inside = await asMember(db, USER_A, (tx) => currentRole(tx))
    expect(inside.user).toBe('authenticated')
    // The whole method rests on this line. As superuser every assertion below
    // would pass against a database with no policies at all.
    expect(inside.superuser).toBe('off')
  })

  it('seeded both workspaces into every tenant table', () => {
    expect(seeded.sort()).toEqual(tables.sort())
  })

  it('sees BOTH workspaces’ rows as superuser, so the filtering below is a policy and not an empty table', async () => {
    // Per workspace, not a total: `workspace_members` legitimately holds the
    // membership row written above AND the seeder's, and a total of 2 would
    // also be satisfied by two rows in one workspace and none in the other —
    // which is the exact shape that would make every isolation check below
    // pass while proving nothing.
    const missing: string[] = []
    for (const table of tables) {
      for (const [ws, label] of [
        [WS_A, 'A'],
        [WS_B, 'B'],
      ] as const) {
        const rows = await db.query<{ n: number }>(
          `select count(*)::int as n from public."${table}" where workspace_id = $1`,
          [ws],
        )
        if ((rows.rows[0]?.n ?? 0) < 1) missing.push(`${table} (workspace ${label})`)
      }
    }
    expect(missing, 'Not seeded, so nothing below tests them.').toEqual([])
  })
})

/**
 * THE APPEND-ONLY GUARANTEE, OVER EVERY TABLE THAT CLAIMS IT.
 *
 * "THE LEDGER NEVER LIES. Append-only, compensating entries" is one of this
 * product's stated non-negotiables, and `app.block_mutations()` is what enforces
 * it — a trigger that raises on a direct UPDATE or DELETE even for service_role,
 * while letting a cascade through so a workspace can still be offboarded.
 *
 * MEASURED 2026-08-20: dropping that trigger from `credit_ledger` left every
 * executing test in apps/jobs and packages/billing green. The only running test
 * that covered the guard at all was
 * `post_metric_snapshots.pglite.test.ts` — for `post_metric_snapshots`, one
 * table of several. `ledger.test.ts` covers `credit_ledger` and is
 * `describe.skipIf(!hasLedgerEnv)`, so it has never run.
 *
 * The trigger list is read from `pg_trigger`, not written here, for the reason
 * this repo keeps rediscovering: a guard that covers element [0] of a collection
 * it claims to cover in full is how five of these were found passing.
 */
describe('every append-only table refuses a direct mutation', () => {
  let guarded: string[]

  beforeAll(async () => {
    guarded = (
      await db.query<{ tablename: string }>(
        `select distinct rel.relname as tablename
         from pg_trigger t
         join pg_class rel on rel.oid = t.tgrelid
         join pg_proc p on p.oid = t.tgfoid
         join pg_namespace n on n.oid = rel.relnamespace
         where n.nspname = 'public' and p.proname = 'block_mutations'
         order by 1`,
      )
    ).rows.map((r) => r.tablename)
  })

  /**
   * EVERY table that carries `app.block_mutations()`, named.
   *
   * ── WHY THIS LIST EXISTS WHEN THE REST OF THE FILE IS CATALOG-DRIVEN ────────
   * `guarded` is derived from `pg_trigger`, and derivation alone has a hole this
   * suite could not see: DROP a table's trigger and the table simply LEAVES the
   * list, so it is never probed and everything stays green. MEASURED 2026-08-22 —
   * `mutations/rls-enforced.mjs` dropped the guard from `competitor_snapshots` and
   * all twelve tests passed. `credit_ledger` survived the same mutant only
   * because one line named it; the other eleven tables could lose their
   * append-only guarantee in silence.
   *
   * This is the same argument the file already makes for EXPECTED_SERVICE_ONLY
   * and EXPECTED_OPERATOR_ONLY — "Deriving alone would be worse than useless: a
   * table that quietly lost its SELECT policy would be reclassified as service
   * and excused by the very check meant to catch it" — applied to the one list it
   * had not been applied to.
   *
   * A NEW append-only table failing this assertion is the correct outcome, not an
   * inconvenience: adding a row here is how a table joins the guarantee
   * deliberately rather than by accident.
   *
   * ── AND WHAT THIS LIST IS *NOT* ─────────────────────────────────────────────
   * It is not production's list. Production carries TWO more —
   * `knowledge_chunks` and `zernio_webhook_events` — MEASURED against the live
   * catalog on 2026-08-22. That is not drift: peer lanes applied those migrations
   * to the shared project while their files live on their own branches, so this
   * branch cannot see them. The list is built from THIS branch's migration files,
   * which is the only thing the suite can execute against. Expect it to grow by
   * two at merge, and treat a failure here after a merge as the reminder it is.
   */
  const EXPECTED_GUARDED = [
    'ai_provider_logs',
    'audience_snapshots',
    'audit_logs',
    'competitor_changes',
    'competitor_snapshots',
    'credit_ledger',
    'invoices',
    // Added deliberately at integration, 2026-08-22, which is what this list's
    // own failure message asks for. Both arrived from lanes that branched before
    // this guard existed, and both are genuinely append-only by their
    // migration's own argument:
    //   knowledge_chunks       "a record of what the brain was shown is only
    //                          worth keeping if it cannot be revised afterwards"
    //                          (20260822000000_knowledge_library.sql:294)
    //   zernio_webhook_events  a redelivery must not be able to rewrite what the
    //                          first delivery said
    //                          (20260821000000_zernio_webhook_events.sql:232)
    // `knowledge_documents` deliberately has NO trigger — a document is a living
    // row — so it is correctly absent from this list.
    'knowledge_chunks',
    // Added deliberately 2026-08-28, which is what this list's own failure
    // message asks for. `loop_autopilot_log` records what autopilot decided
    // BEFORE it acted, on the one path where nobody was watching. A cancellation
    // is a new row rather than an edit, so the fact that a post was going out at
    // 09:00 stays true after somebody stops it — an audit trail that can rewrite
    // its own history is not one
    // (20260828130000_loop_autopilot_log.sql).
    'loop_autopilot_log',
    'ops_audit_log',
    'post_metric_snapshots',
    'post_publish_logs',
    'zernio_webhook_events',
  ]

  it('finds every guarded table, and none has quietly dropped out', () => {
    // Named explicitly: the ledger is the table the guarantee is ABOUT, and a
    // query that silently stopped returning it would leave this suite green
    // while covering only the incidental ones.
    expect(guarded).toContain('credit_ledger')
    expect(
      [...guarded].sort(),
      'A table missing from the left-hand side has LOST app.block_mutations() and ' +
        'silently left this suite’s coverage. One appearing on the right has gained ' +
        'it — add it above, deliberately.',
    ).toEqual([...EXPECTED_GUARDED].sort())
  })

  /**
   * A guarded table with no rows proves nothing, and would report a pass.
   *
   * `app.block_mutations()` is a FOR EACH ROW trigger: a DELETE matching zero
   * rows never fires it and succeeds trivially. MEASURED — `ops_audit_log` came
   * back as "delete was ALLOWED" purely because it was empty, which reads as a
   * defect and is not one. It carries no `workspace_id`, so the tenant seeder
   * never reaches it.
   *
   * Declared rather than filtered silently: a table that has rows today and none
   * tomorrow would otherwise drop out of coverage without a word.
   */
  const EXPECTED_UNPOPULATED = ['ops_audit_log']

  it('every guarded table has a row to guard, except the declared ones', async () => {
    const empty: string[] = []
    for (const table of guarded) {
      const n = await db.query<{ n: number }>(`select count(*)::int as n from public."${table}"`)
      if ((n.rows[0]?.n ?? 0) === 0) empty.push(table)
    }
    expect(
      empty.sort(),
      'A FOR EACH ROW trigger cannot fire on an empty table, so these are NOT covered ' +
        'by the refusal test below — whatever it reports about them.',
    ).toEqual([...EXPECTED_UNPOPULATED].sort())
  })

  /**
   * A column this table really has, that a self-assignment can name.
   *
   * The statement used to be `set workspace_id = workspace_id`, which was true of
   * every guarded table until Radar's two arrived without one. On those, Postgres
   * would have rejected the UPDATE with "column does not exist" — and the `catch`
   * below would have counted that as the GUARD REFUSING. A table with no trigger
   * at all would have passed this test for the same reason. The primary key is
   * read from the catalog so the statement is always about the trigger.
   */
  async function selfAssignableColumn(table: string): Promise<string> {
    const { rows } = await db.query<{ attname: string }>(
      `select a.attname
         from pg_index i
         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
        where i.indrelid = $1::regclass and i.indisprimary
        limit 1`,
      [table],
    )
    const column = rows[0]?.attname
    if (!column) throw new Error(`${table} has no primary key to self-assign`)
    return column
  }

  it('refuses UPDATE and DELETE on every one of them', async () => {
    const permissive: string[] = []
    for (const table of guarded.filter((t) => !EXPECTED_UNPOPULATED.includes(t))) {
      const column = await selfAssignableColumn(table)
      for (const statement of [
        `update public."${table}" set "${column}" = "${column}"`,
        `delete from public."${table}"`,
      ]) {
        await db.exec('begin')
        try {
          await db.query(statement)
          permissive.push(`${table}: ${statement.split(' ')[0]} was ALLOWED`)
        } catch {
          // Refused, which is the point.
        } finally {
          // Rolled back either way: a permitted mutation must not be left behind
          // to change what the next assertion sees.
          await db.exec('rollback')
        }
      }
    }
    expect(
      permissive,
      'These tables carry app.block_mutations() and accepted a direct mutation anyway. ' +
        'For credit_ledger that is the ledger silently becoming rewritable.',
    ).toEqual([])
  })
})

/**
 * A VIEW IS THE QUIETEST WAY TO LOSE ALL OF THE ABOVE.
 *
 * Everything in this file proves that the POLICIES hold. A view over the same
 * tables runs, by default, with the rights of whoever created it — so it hands
 * over every workspace's rows while each policy underneath still reads exactly
 * as written in the migration. Nothing about the view's own definition shows it.
 *
 * MEASURED 2026-08-22 on `knowledge_current_chunks`, the first `public` view in
 * this schema to carry a `workspace_id`: with `security_invoker = true` removed,
 * a member of workspace B read workspace A's passages through it. With it, zero.
 *
 * Catalog-driven for the same reason the rest of the suite is: the next such
 * view joins this check the moment it lands.
 */
describe('a view cannot be the way around a policy', () => {
  it('every workspace-scoped view runs as the caller, not as its owner', async () => {
    const views = await tenantViews(db)
    const asOwner = views.filter((v) => !v.security_invoker).map((v) => v.view_name)
    expect(
      asOwner,
      'These views run with their creator’s rights and bypass every policy above.',
    ).toEqual([])
  })
})

describe('every tenant table refuses the other workspace', () => {
  /** Tables an ordinary member is NOT meant to read — see the three groups above. */
  const excused = (table: string): boolean =>
    serviceOnly.includes(table) || operatorOnly.includes(table)

  /** Rows of `workspace` this caller can actually see in `table`, or a refusal. */
  async function visible(tx: PGlite, table: string, workspace: string) {
    return probe<{ n: number }>(
      tx,
      `select count(*)::int as n from public."${table}" where workspace_id = $1`,
      [workspace],
    )
  }

  it('the service-only and operator-only sets are exactly the declared ones', () => {
    // These two sets are what the visibility check below excuses. If either
    // grows, a table has lost its member SELECT policy — which reads, in the
    // app, as a permanently empty screen and never as an error.
    expect(serviceOnly.sort(), 'RLS on and no member SELECT policy').toEqual(
      [...EXPECTED_SERVICE_ONLY].sort(),
    )
    expect(operatorOnly.sort(), 'SELECT policy gated on app.is_ops_admin()').toEqual(
      [...EXPECTED_OPERATOR_ONLY].sort(),
    )
  })

  it('a member of A reads A’s rows and never B’s', async () => {
    const leaks: string[] = []
    const invisible: string[] = []

    await asMember(db, USER_A, async (tx) => {
      for (const table of tables) {
        const mine = await visible(tx, table, WS_A)
        const theirs = await visible(tx, table, WS_B)
        // A refusal is a refusal — stronger than an empty result, never a leak.
        if ('rows' in theirs && (theirs.rows[0]?.n ?? 0) > 0) {
          leaks.push(`${table} (${theirs.rows[0]?.n} of B’s rows)`)
        }
        if (excused(table)) continue
        if ('denied' in mine) invisible.push(`${table} — ${mine.denied}`)
        else if ((mine.rows[0]?.n ?? 0) === 0) invisible.push(`${table} — 0 own rows visible`)
      }
    })

    expect(
      leaks,
      'A member of workspace A can read these tables’ rows belonging to workspace B. ' +
        'Every one is a cross-tenant read of live customer data.',
    ).toEqual([])
    expect(
      invisible,
      'A member of workspace A cannot read their OWN rows in these tables. Either the ' +
        'policy is too tight, or the table has RLS on and no SELECT policy at all — ' +
        'which denies everything and looks, from the app, exactly like an empty account.',
    ).toEqual([])
  })

  it('a member of B reads B’s rows and never A’s — the mirror, so neither direction is assumed', async () => {
    const leaks: string[] = []
    const invisible: string[] = []
    await asMember(db, USER_B, async (tx) => {
      for (const table of tables) {
        const theirs = await visible(tx, table, WS_A)
        const mine = await visible(tx, table, WS_B)
        if ('rows' in theirs && (theirs.rows[0]?.n ?? 0) > 0) leaks.push(table)
        if (excused(table)) continue
        if ('rows' in mine && (mine.rows[0]?.n ?? 0) === 0) invisible.push(table)
      }
    })
    expect(leaks, 'Workspace B can read workspace A’s rows in these tables.').toEqual([])
    expect(invisible, 'Workspace B cannot read its own rows in these tables.').toEqual([])
  })

  it('an anonymous caller reads nothing at all', async () => {
    const readable: string[] = []
    await asRole(db, 'anon', {}, async (tx) => {
      for (const table of tables) {
        const all = await probe<{ n: number }>(
          tx,
          `select count(*)::int as n from public."${table}"`,
        )
        if ('rows' in all && (all.rows[0]?.n ?? 0) > 0) {
          readable.push(`${table} (${all.rows[0]?.n} rows)`)
        }
      }
    })
    expect(
      readable,
      'These tables are readable without signing in. `anon` holds the same table GRANTs ' +
        'as `authenticated` on Supabase, so RLS is the only thing refusing it.',
    ).toEqual([])
  })

  it('a member of A cannot take a row out of workspace B', async () => {
    const stolen: string[] = []
    await asMember(db, USER_A, async (tx) => {
      for (const table of tables) {
        await probe(tx, `update public."${table}" set workspace_id = $1 where workspace_id = $2`, [
          WS_A,
          WS_B,
        ])
        // The theft succeeded only if A can now see two rows where it seeded one.
        const mine = await visible(tx, table, WS_A)
        if ('rows' in mine && (mine.rows[0]?.n ?? 0) > 1) stolen.push(table)
      }
    })
    expect(stolen, 'A member of workspace A moved workspace B’s rows into A.').toEqual([])
  })
})
