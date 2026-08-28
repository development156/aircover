/**
 * THE ONE QUERY THE SUNDAY TICK RUNS, kept in a file a test can execute.
 *
 * ── WHY IT LIVES ALONE, AND NOT INLINE WHERE IT IS USED ──────────────────────
 * It used to be a template literal inside `runScheduledLoopCycles`, and on
 * 2026-08-23 it shipped naming a relation that does not exist:
 * `loop_autonomy`, where the table is `loop_channel_autonomy`. The MIGRATION
 * FILE is called `20260820000200_loop_autonomy.sql`, which is where the short
 * name comes from, and every other reader in the tree spells the table
 * correctly (lib/loop/read.ts, actions/loop-dial.ts, actions/loop-create.ts,
 * lib/playbooks/store.ts, lib/privacy/export-manifest.ts).
 *
 * MEASURED against production 2026-08-28, running the subselect verbatim:
 *
 *     ERROR:  42P01: relation "loop_autonomy" does not exist
 *
 * So the query raised, `runScheduledLoopCycles` threw before `assess()` was
 * reached even once, and the route could only answer `{ ok: false, error:
 * 'LOOP_CRON_FAILED' }`. The commit that broke it is the commit whose whole
 * purpose was to make the Loop say why it will not plan for you.
 *
 * WHETHER THE SCHEDULE FIRED IS NOT OBSERVABLE from a session — the heartbeat
 * lives in Redis. The database corroborates rather than proves: the newest
 * cycle any workspace has started 2026-08-23 10:31 UTC and the breaking commit
 * landed 11:55 UTC the same day. Nothing has been planned since.
 *
 * ── NOTHING WAS WATCHING, AND THAT IS THE PART WORTH FIXING ──────────────────
 * `run-loop-resources.test.ts` stubs the pool with `{ query: vi.fn() }` and
 * feeds every test hand-written rows, so the SQL string was never parsed by a
 * database anywhere in this repository. A string that is never sent to Postgres
 * is not covered by a test that asserts what the code does with its result.
 *
 * Exported from here so `loop-facts-sql.pglite.test.ts` can run THIS text
 * against the real migrations. A copy of the query in a test proves the copy.
 */

/**
 * Every workspace, with the facts `assess()` needs. A LEFT JOIN throughout,
 * deliberately: a workspace that has never opened the Loop has no
 * `loop_settings` row, and `never_enabled` is the reason that most needs
 * saying. An inner join would hide exactly the workspaces the query exists for.
 *
 * Parameters: $1 iso_year, $2 iso_week, $3 row limit.
 */
export const LOOP_FACTS_SQL = `select w.id as workspace_id,
                s.paused,
                s.weekly_budget_credits,
                b.balance_total - b.balance_held as available_credits,
                c.id     as open_cycle_id,
                c.status as open_cycle_status,
                (select coalesce(json_agg(json_build_object('platform', k.platform, 'status', k.status)), '[]')
                   from connections k where k.workspace_id = w.id) as connections,
                (select coalesce(json_agg(json_build_object('channel', d.channel, 'level', d.level)), '[]')
                   from loop_channel_autonomy d where d.workspace_id = w.id) as dial,
                bm.payload as brain_payload
           from workspaces w
           -- The ACTIVE brain only, and at most one of them: the partial unique
           -- index brand_memory_one_active guarantees there is never a second,
           -- and a superseded row would describe a business as it was described
           -- before somebody corrected it.
           left join lateral (
             select b.payload
               from brand_memory b
              where b.workspace_id = w.id and b.status = 'active'
              limit 1
           ) bm on true
           left join loop_settings  s on s.workspace_id = w.id
           left join credit_balances b on b.workspace_id = w.id
           left join loop_cycles    c on c.workspace_id = w.id
                                     and c.iso_year = $1 and c.iso_week = $2
                                     and c.status not in ('cancelled', 'failed')
          order by w.id
          limit $3`
