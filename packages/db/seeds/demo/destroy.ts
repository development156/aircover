import { pathToFileURL } from 'node:url'
import type { PoolClient } from 'pg'
import { errorMessage, formatTable, readOptions } from './cli'
import {
  databaseUrl,
  demoOwnerId,
  DEMO_MARKER,
  resolveNamespace,
  type SeedOptions,
  type SeedTableResult,
} from './context'
import { idFactory } from './ids'
import { openPool } from './pgpool'

/**
 * Chai & Chapters demo seed — teardown.
 *
 * This file still imports NOTHING from ./index, nothing from the eight content modules
 * (workspace, brand, posts, site, connections, planner, ledger, ops), and nothing from
 * @sahoda/shared. You reach for destroy precisely when the seed is broken; a teardown that
 * fails to load because posts.ts parses a drifted zod schema at import time is a teardown
 * that is missing at the exact moment it is needed.
 *
 * It does import four leaves, none of which the drift that sent you here can break:
 * ./ids (node:crypto), ./pgpool (node:fs + pg), ./cli (node:util), and ./context for the
 * marker, owner id and namespace validation — that one loads dotenv and ./ids, nothing
 * more, and the teardown cannot function without the marker anyway. The line is drawn at
 * "can this import fail while the seed is broken", not at "did this file write the rows".
 */

/**
 * The safety rule, and the only rule that really matters here.
 *
 * tests/helpers/sweep.ts learned this the hard way: on a SHARED dev database the failure
 * mode of a too-broad delete is destroying a real person's workspace. Its answer was to
 * refuse any prefix that did not look like `user_<suite>_`, and to escape LIKE
 * metacharacters so `_` could not act as a wildcard.
 *
 * This teardown takes the stricter version of the same lesson: there is no pattern at
 * all. It computes ONE uuid from the namespace, SELECTs that single row, and refuses to
 * delete it unless `settings->>'demo_seed'` equals DEMO_MARKER exactly. No LIKE, no
 * prefix, no `created_by` heuristic, no "delete where settings->>'demo' is true". A
 * workspace that this seed did not write cannot be reached by this file, whatever is
 * passed on the command line.
 */
const MARKER_MISMATCH =
  'refusing to delete: this workspace is not a Chai & Chapters demo seed. Its ' +
  `settings->>'demo_seed' is %ACTUAL% but the teardown only deletes ${DEMO_MARKER}. ` +
  'Nothing was deleted. If this id belongs to real data, that is the point.'

/**
 * Counted before the delete, purely to report what went. Every one of these cascades from
 * `workspaces` (see the `on delete cascade` on their workspace_id FK), and the append-only
 * tables among them — credit_ledger, post_publish_logs, audit_logs, ai_provider_logs —
 * permit the cascaded delete because app.block_mutations() returns early when
 * pg_trigger_depth() > 1 (20260718000001_helpers.sql). A direct DELETE on any of them
 * would raise restrict_violation; the cascade does not.
 */
const CASCADED_TABLES = [
  'workspace_members',
  'subscriptions',
  'workspace_themes',
  'tour_progress',
  'brand_memory',
  'memory_events',
  'posts',
  'post_variants',
  'post_media',
  'post_publish_logs',
  'planner_events',
  'sites',
  'site_pages',
  'site_sections',
  'leads',
  'connections',
  'credit_ledger',
  'credit_balances',
  'audit_logs',
  'ai_provider_logs',
] as const

export interface DestroySummary {
  readonly deleted: boolean
  readonly namespace: string
  readonly workspaceId: string
  /** The slug found on the row, or null when there was nothing to delete. */
  readonly slug: string | null
  readonly ownerId: string
  /** Row counts gathered BEFORE the delete — afterwards there is nothing left to count. */
  readonly tables: readonly SeedTableResult[]
}

/**
 * One round trip for all the counts. Only the `from <table>` half is interpolated, because
 * identifiers cannot be bound as parameters — and those come from the frozen local
 * CASCADED_TABLES literal above, never from input. Every VALUE binds, including the label
 * each branch selects: `select '<table>' as tbl` was the last place in this seed where a
 * value reached SQL as text, so a grep for interpolated values now lands on nothing. The
 * `::text` cast is required — Postgres cannot infer a bare parameter's type in a select
 * list.
 *
 * connection_secrets is counted through its parent: it has no workspace_id of its own and
 * cascades via connection_id. The seed writes none (no fake tokens), so this should always
 * report 0 — and if it ever does not, the teardown says so out loud.
 */
async function countRows(
  client: PoolClient,
  workspaceId: string,
): Promise<readonly SeedTableResult[]> {
  // $1 is the workspace id, so the label for CASCADED_TABLES[i] is $(i + 2).
  const parts = CASCADED_TABLES.map(
    (table, index) =>
      `select $${index + 2}::text as tbl, count(*)::int as n ` +
      `from ${table} where workspace_id = $1`,
  )
  const secrets =
    `select $${CASCADED_TABLES.length + 2}::text as tbl, count(*)::int as n ` +
    'from connection_secrets s join connections c on c.id = s.connection_id ' +
    'where c.workspace_id = $1'

  const { rows } = await client.query<{ tbl: string; n: number }>(
    [...parts, secrets].join(' union all '),
    [workspaceId, ...CASCADED_TABLES, 'connection_secrets'],
  )
  return rows
    .filter((row) => row.n > 0)
    .map((row) => ({ table: row.tbl, rows: row.n }))
    .sort((a, b) => a.table.localeCompare(b.table))
}

async function destroyInTransaction(
  client: PoolClient,
  namespace: string,
): Promise<DestroySummary> {
  const workspaceId = idFactory(namespace)('workspace')
  const ownerId = demoOwnerId(namespace)

  const found = await client.query<{ slug: string; marker: string | null }>(
    `select slug, settings ->> 'demo_seed' as marker from workspaces where id = $1`,
    [workspaceId],
  )
  const row = found.rows[0]

  if (!row) {
    // "Nothing to delete" used to return immediately, which leaked the profile row.
    // users_profile has no workspace_id and no FK, so the workspace cascade never reaches
    // it: if the workspace went away by some other route (Studio, an offboarding path, a
    // manual repair) the profile outlives it, and tests/helpers/sweep.ts cannot collect it
    // either because its PREFIX_SHAPE only matches `user_<suite>_`. Left alone it is
    // unreachable AND unsweepable — the litter the sweep exists to end. Safe to delete
    // unconditionally: `demo_seed_<namespace>` is synthetic, the namespace charset excludes
    // `_`, and Clerk subjects are `user_<base58>`, so this id can never name a real person.
    // ctx.memberIds are NOT touched here or anywhere: real people, real profiles.
    const orphan = await client.query('delete from users_profile where user_id = $1', [ownerId])
    return {
      deleted: false,
      namespace,
      workspaceId,
      slug: null,
      ownerId,
      tables: orphan.rowCount ? [{ table: 'users_profile', rows: orphan.rowCount }] : [],
    }
  }

  if (row.marker !== DEMO_MARKER) {
    throw new Error(MARKER_MISMATCH.replace('%ACTUAL%', JSON.stringify(row.marker)))
  }

  const tables = await countRows(client, workspaceId)

  // The marker is re-asserted inside the DELETE itself, not just in the SELECT above.
  // Between the two statements the row could in principle be rewritten; re-checking here
  // means the guard is enforced by the same statement that does the damage.
  const deleted = await client.query(
    `delete from workspaces where id = $1 and settings ->> 'demo_seed' = $2`,
    [workspaceId, DEMO_MARKER],
  )
  if (deleted.rowCount !== 1) {
    throw new Error(
      `expected to delete exactly 1 workspace, deleted ${deleted.rowCount ?? 0}. ` +
        'The row changed underneath the guard; rolling back and deleting nothing.',
    )
  }

  // users_profile has no workspace_id and no FK to workspaces, so the cascade does NOT
  // reach it (the same gap tests/helpers/sweep.ts documents). It is deleted here by exact
  // user id — never by prefix, and never for ctx.memberIds: those are real Clerk subjects
  // whose profile rows belong to real people who merely presented the demo.
  const profiles = await client.query('delete from users_profile where user_id = $1', [ownerId])

  return {
    deleted: true,
    namespace,
    workspaceId,
    slug: row.slug,
    ownerId,
    tables: [
      ...tables,
      { table: 'workspaces', rows: 1 },
      { table: 'users_profile', rows: profiles.rowCount ?? 0 },
    ],
  }
}

/** Remove the demo workspace for a namespace. Exported so tests can tear down directly. */
export async function destroySeed(options: SeedOptions = {}): Promise<DestroySummary> {
  const url = databaseUrl()
  const namespace = resolveNamespace(options)

  const pool = openPool(url)
  const client = await pool.connect()
  try {
    await client.query('begin')
    try {
      const summary = await destroyInTransaction(client, namespace)
      await client.query('commit')
      return summary
    } catch (error) {
      // A refusal must leave nothing changed, including the counts round trip.
      await client.query('rollback').catch(() => undefined)
      throw error
    }
  } finally {
    client.release()
    await pool.end()
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const USAGE = 'usage: pnpm --filter @sahoda/db seed:demo:destroy [--namespace=<ns>] [--quiet]'

function printSummary(summary: DestroySummary): void {
  if (!summary.deleted) {
    // An orphaned profile row is reported rather than removed silently: if one was here,
    // the workspace went away by some route other than this command, and that is worth
    // knowing.
    const orphans = summary.tables.reduce((sum, row) => sum + row.rows, 0)
    const swept =
      orphans > 0 ? `  removed ${orphans} orphaned users_profile row (${summary.ownerId}).\n` : ''
    process.stdout.write(
      `\n  nothing to delete: no workspace ${summary.workspaceId} ` +
        `(namespace ${summary.namespace}).\n${swept}\n`,
    )
    return
  }

  process.stdout.write(
    [
      '',
      `  deleted ${summary.slug ?? summary.workspaceId}`,
      `  workspace   ${summary.workspaceId}`,
      `  namespace   ${summary.namespace}`,
      '',
      formatTable(summary.tables),
      '',
      '  to seed it again:',
      '    pnpm --filter @sahoda/db seed:demo',
      '',
    ].join('\n'),
  )
}

async function main(): Promise<void> {
  // Flags are validated before anything connects. An unknown flag must never fall through
  // to the DEFAULT namespace here: `--namespcae=e2e-run-1` silently becoming "destroy the
  // real demo" is exactly the accident this file exists to make impossible. `strict: true`
  // in cli.ts is what enforces that.
  const options = readOptions(process.argv.slice(2), USAGE, resolveNamespace)
  if (!options) {
    process.exitCode = 1
    return
  }

  try {
    databaseUrl()
  } catch (error) {
    process.stderr.write(
      `\n  cannot destroy: ${errorMessage(error)}\n` +
        '  Set SUPABASE_DB_URL in the repo-root .env.\n\n',
    )
    process.exitCode = 1
    return
  }

  try {
    const summary = await destroySeed(options)
    if (!options.quiet) printSummary(summary)
  } catch (error) {
    process.stderr.write(`\n  destroy failed: ${errorMessage(error)}\n\n`)
    process.exitCode = 1
  }
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await main()
}
