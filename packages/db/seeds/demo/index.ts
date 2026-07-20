import { pathToFileURL } from 'node:url'
import type { PoolClient } from 'pg'
import { errorMessage, formatTable, readOptions } from './cli'
import {
  createContext,
  databaseUrl,
  DEFAULT_NAMESPACE,
  pinnedClock,
  resolveNamespace,
  type SeedModule,
  type SeedOptions,
  type SeedTableResult,
} from './context'
import { idFactory } from './ids'
import { openPool } from './pgpool'
import { seedBrand } from './brand'
import { seedConnections } from './connections'
import { seedLedger } from './ledger'
import { seedOps } from './ops'
import { seedPlanner } from './planner'
import { seedPosts } from './posts'
import { seedSite } from './site'
import { seedWorkspace } from './workspace'

/**
 * Chai & Chapters demo seed — orchestrator.
 *
 * Everything runs in ONE transaction on ONE connection. A module that throws halfway
 * (a shared-schema drift, a ledger arithmetic assertion, a constraint) must leave the
 * database exactly as it found it: a half-seeded demo workspace is worse than none,
 * because it looks real enough to present from and is wrong in ways nobody notices
 * until the room does.
 */

/**
 * Dependency order, not alphabetical. Each entry needs ids minted by an earlier one:
 *
 *   workspace  → the row everything else FKs to
 *   brand      → brand.v1 / brand.v2 (ledger + ops reference them)
 *   posts      → post.* ids (planner soft-links them, ledger + ops reference them)
 *   site       → site id (ledger + ops reference it)
 *   connections→ connection.* ids (ops references them; posts writes connection_id, but
 *                that column has no FK, so posts running first is safe)
 *   planner    → FK to posts (id), plus its own tenancy assertion over those ids
 *   ledger     → reads brand.v1, site and all eight post ids as object_ref
 *   ops        → references post / site / brand / connection / subscription ids
 *
 * Strictly sequential by design. The ledger takes a row lock on credit_balances and its
 * entries only read correctly in story order, so this loop must never become a
 * Promise.all.
 */
const MODULES: readonly (readonly [string, SeedModule])[] = [
  ['workspace', seedWorkspace],
  ['brand', seedBrand],
  ['posts', seedPosts],
  ['site', seedSite],
  ['connections', seedConnections],
  ['planner', seedPlanner],
  ['ledger', seedLedger],
  ['ops', seedOps],
]

export interface SeedSummary {
  readonly namespace: string
  readonly workspaceId: string
  readonly slug: string
  /** Synthetic `created_by` on every row, and the one users_profile the seed owns. */
  readonly ownerId: string
  /** Real Clerk subjects added as owners, so a signed-in presenter sees the workspace. */
  readonly memberIds: readonly string[]
  readonly tables: readonly SeedTableResult[]
  readonly balanceTotal: number
  readonly balanceHeld: number
  /** True when the run clock is not the current instant — a re-run, or a supplied clock. */
  readonly clockPinned: boolean
  /** The single instant every timestamp in this run derives from. */
  readonly seededAt: Date
}

/**
 * Resolve the run clock BEFORE the context exists, because the context bakes it into
 * `ctx.now` and every module derives its timestamps from that.
 *
 * On a first seeding there is no workspace row, so this reads nothing and `pinnedClock`
 * hands back `new Date()` — the demo's timeline starts now. On a re-run it reads the
 * ORIGINAL `settings->>'seeded_at'`, so no timestamp moves and `periodKey` cannot roll into
 * a fresh monthly-grant key. `pinnedClock`'s doc comment carries the full argument for why
 * a fresh clock silently corrupts a re-seed.
 *
 * An explicit `options.now` wins: a caller passing a clock is making a deliberate choice
 * and this must not quietly override it.
 */
async function resolveClock(
  client: PoolClient,
  options: SeedOptions,
): Promise<{ now: Date; pinned: boolean }> {
  if (options.now) return { now: options.now, pinned: true }

  const workspaceId = idFactory(resolveNamespace(options))('workspace')
  const { rows } = await client.query<{ seeded_at: string | null }>(
    `select settings ->> 'seeded_at' as seeded_at from workspaces where id = $1`,
    [workspaceId],
  )
  const seededAt = rows[0]?.seeded_at ?? null
  return { now: pinnedClock(seededAt), pinned: seededAt !== null }
}

async function seedInTransaction(client: PoolClient, options: SeedOptions): Promise<SeedSummary> {
  // The clock read happens inside the transaction so it sees the same snapshot the writes
  // do, and so a concurrent destroy cannot land between the read and the first insert.
  await client.query('begin')
  try {
    const clock = await resolveClock(client, options)
    const ctx = createContext(client, { ...options, now: clock.now })

    let tables: readonly SeedTableResult[] = []
    for (const [name, seed] of MODULES) {
      const results = await seed(ctx)
      // Attributed to the module that wrote them, so a surprising count in the printed
      // table can be traced to one file without re-running.
      tables = [...tables, ...results]
      if (results.length === 0) ctx.log(`${name}: no tables reported`)
    }

    const [balance] = await ctx.sql<{ total: number; held: number }>(
      `select balance_total::int as total, balance_held::int as held
         from credit_balances
        where workspace_id = $1`,
      [ctx.workspaceId],
    )
    if (!balance) throw new Error('no credit_balances row after seeding — the ledger did not run')

    await client.query('commit')

    return {
      namespace: ctx.namespace,
      workspaceId: ctx.workspaceId,
      slug: ctx.slug,
      ownerId: ctx.ownerId,
      memberIds: ctx.memberIds,
      tables,
      balanceTotal: balance.total,
      balanceHeld: balance.held,
      clockPinned: clock.pinned,
      seededAt: ctx.now,
    }
  } catch (error) {
    // Rollback failures must not mask the real cause, so this one is swallowed on purpose:
    // if the connection is already dead the transaction is aborted anyway.
    await client.query('rollback').catch(() => undefined)
    throw error
  }
}

/** Seed the demo workspace. Exported so the test suite can drive it without a subprocess. */
export async function runSeed(options: SeedOptions = {}): Promise<SeedSummary> {
  const url = databaseUrl()
  // Validate before connecting: a bad namespace should fail in milliseconds, not after
  // a TLS handshake.
  resolveNamespace(options)

  const pool = openPool(url)
  const client = await pool.connect()
  try {
    return await seedInTransaction(client, options)
  } finally {
    client.release()
    await pool.end()
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const USAGE = 'usage: pnpm --filter @sahoda/db seed:demo [--namespace=<ns>] [--quiet]'

/**
 * The exact command that removes what this run just created, namespace included — the
 * printed summary is where someone looks when they want the demo gone, and a command
 * they have to edit is a command that gets edited wrong.
 */
export function destroyCommand(namespace: string): string {
  const suffix = namespace === DEFAULT_NAMESPACE ? '' : ` --namespace=${namespace}`
  return `pnpm --filter @sahoda/db seed:demo:destroy${suffix}`
}

const MS_PER_DAY = 86_400_000

/**
 * Say out loud whether the run used a pinned clock, and how stale the demo's timeline has
 * become. The pinning is what makes a re-run a true no-op, but the price is that "published
 * 3 days ago" drifts further into the past every day after the FIRST seeding. Printing the
 * age turns "why does the demo look stale" into a command the operator can just run.
 */
function clockLine(summary: SeedSummary): string {
  if (!summary.clockPinned) return '  clock       fresh, the demo timeline starts now'

  const days = Math.floor((Date.now() - summary.seededAt.getTime()) / MS_PER_DAY)
  const age = days < 1 ? 'seeded earlier today' : `${days} day${days === 1 ? '' : 's'} old`
  return (
    `  clock       pinned to the first seeding (${age}), so no timestamp moved\n` +
    '              destroy and seed again to refresh the timeline (command below)'
  )
}

function printSummary(summary: SeedSummary): void {
  const held = summary.balanceHeld === 0 ? 'none held' : `${summary.balanceHeld} held`
  const presenters =
    summary.memberIds.length > 0
      ? summary.memberIds.join(', ')
      : 'none (set SEED_DEMO_MEMBER_IDS to see this workspace signed in)'

  process.stdout.write(
    [
      '',
      `  seeded ${summary.slug}`,
      `  workspace   ${summary.workspaceId}`,
      `  namespace   ${summary.namespace}`,
      `  owner       ${summary.ownerId}`,
      `  presenters  ${presenters}`,
      clockLine(summary),
      '',
      formatTable(summary.tables),
      '',
      `  credits     ${summary.balanceTotal} available, ${held}`,
      '',
      '  to remove it:',
      `    ${destroyCommand(summary.namespace)}`,
      '',
    ].join('\n'),
  )
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2), USAGE, resolveNamespace)
  if (!options) {
    process.exitCode = 1
    return
  }

  // Preflight. The seed calls app.apply_ledger_entry(), which is service-role-only and
  // not exposed through PostgREST, so there is no fallback path worth attempting.
  try {
    databaseUrl()
  } catch (error) {
    process.stderr.write(
      `\n  cannot seed: ${errorMessage(error)}\n` +
        '  Set SUPABASE_DB_URL in the repo-root .env (the direct Postgres connection\n' +
        '  string from Supabase → Project settings → Database).\n\n',
    )
    process.exitCode = 1
    return
  }

  try {
    const summary = await runSeed(options)
    if (!options.quiet) printSummary(summary)
  } catch (error) {
    process.stderr.write(
      `\n  seed failed: ${errorMessage(error)}\n` +
        '  Nothing was written: the whole seed runs in one transaction and it rolled back.\n\n',
    )
    process.exitCode = 1
  }
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await main()
}
