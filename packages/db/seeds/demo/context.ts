import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import type { PoolClient } from 'pg'
import { idFactory } from './ids'

// Secrets live in the repo-root .env (same contract as tests/helpers/env.ts).
loadEnv({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true })

/**
 * The value written to `workspaces.settings->>'demo_seed'`. The teardown refuses to
 * delete any workspace whose settings do not carry exactly this marker, so a typo or
 * a hand-edited id can never turn the destroy command into a mass delete.
 */
export const DEMO_MARKER = 'sahoda:demo:chai-and-chapters'

/** Default id namespace. `--namespace` (or SEED_DEMO_NAMESPACE) overrides it for tests. */
export const DEFAULT_NAMESPACE = 'chai-and-chapters'

/**
 * `created_by` for every demo row, and the owner of the one `users_profile` row the seed
 * writes.
 *
 * Deliberately NOT `user_`-prefixed: the test fixture sweep (tests/helpers/sweep.ts)
 * deletes workspaces whose `created_by` starts with `user_<suite>_`, and a demo workspace
 * older than an hour must never be collectable by it.
 *
 * Namespace-derived rather than a single constant, because `users_profile` has no
 * `workspace_id` and no FK, so it is NOT reached by the workspace cascade — destroy.ts has
 * to delete it by user id. With one shared owner id, tearing down a throwaway
 * `--namespace` run (what the test suite does) would delete the profile row belonging to
 * the real demo workspace. One owner per namespace makes every run's teardown disjoint.
 */
export function demoOwnerId(namespace: string): string {
  return `demo_seed_${namespace}`
}

/** The owner id of the default (real) demo workspace. */
export const DEMO_OWNER_ID = demoOwnerId(DEFAULT_NAMESPACE)

export interface SeedCtx {
  /** Runs inside the seed's single transaction. Returns rows. */
  readonly sql: <T = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ) => Promise<T[]>
  /** Deterministic id for a label, scoped to this run's namespace. */
  readonly id: (label: string) => string
  readonly workspaceId: string
  /** Synthetic demo owner — the stable `created_by` on every row. */
  readonly ownerId: string
  /**
   * Real Clerk subjects (from SEED_DEMO_MEMBER_IDS) added as owners alongside the
   * synthetic one, so a signed-in presenter actually SEES the workspace under RLS.
   */
  readonly memberIds: readonly string[]
  readonly namespace: string
  /** Slug base — workspace slug and site slug derive from it (both are globally unique). */
  readonly slug: string
  /** One fixed clock for the whole run, so every relative timestamp agrees. */
  readonly now: Date
  readonly log: (message: string) => void
}

export interface SeedTableResult {
  readonly table: string
  readonly rows: number
}

/** Every content module has this shape; index.ts runs them in dependency order. */
export type SeedModule = (ctx: SeedCtx) => Promise<readonly SeedTableResult[]>

export interface SeedOptions {
  readonly namespace?: string
  readonly quiet?: boolean
  /**
   * The run clock. `runSeed` passes the workspace's ORIGINAL `settings->>'seeded_at'`
   * whenever the workspace already exists, which is what makes a re-run a true no-op —
   * see `pinnedClock()` for why a fresh clock silently corrupts a re-seed.
   */
  readonly now?: Date
}

/**
 * Resolve the clock for this run: the first seeding's instant if there was one, else now.
 *
 * A fresh `new Date()` on every run looks harmless and is not. Two things break.
 *
 *  1. `periodKey(now)` feeds `monthlyGrantKey` and the `campaign_plan` debit label. Cross a
 *     month boundary and both become NEW idempotency keys, so a re-run applies a SECOND
 *     1500-credit grant and a second 25-credit debit. The ledger's closing assertion is
 *     computed from PRICING, so it then fails and rolls the whole seed back — the seed
 *     would work all month and then break permanently, blaming pricing drift for a clock
 *     rollover.
 *  2. The four append-only tables (credit_ledger, post_publish_logs, audit_logs,
 *     ai_provider_logs) are `do nothing` on re-run, so their timestamps are frozen at run
 *     one, while every mutable table's are refreshed. Re-seed a month later and a post
 *     claims it published 3 days ago while its own publish log, its audit entry, and its
 *     wallet debit all still sit 33 days back.
 *
 * Pinning the clock fixes both: nothing moves, and the seed is genuinely idempotent. The
 * cost is that the demo's relative timing ages. `destroy` then `seed` re-freshens it, which
 * is the documented way to get "published 3 days ago" back.
 */
export function pinnedClock(seededAt: string | null | undefined): Date {
  if (!seededAt) return new Date()
  const parsed = new Date(seededAt)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `workspaces.settings->>'seeded_at' is not a date: ${JSON.stringify(seededAt)}. ` +
        'Re-running against it would re-date the demo; destroy the workspace and seed again.',
    )
  }
  return parsed
}

/** Parsed from `SEED_DEMO_MEMBER_IDS` — comma-separated Clerk subjects, blanks dropped. */
function readMemberIds(): readonly string[] {
  const raw = process.env.SEED_DEMO_MEMBER_IDS ?? ''
  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  ]
}

export function databaseUrl(): string {
  const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? ''
  if (!url) {
    throw new Error(
      'SUPABASE_DB_URL (or DATABASE_URL) is required — the seed calls app.apply_ledger_entry(), ' +
        'which is service-role-only and not exposed through PostgREST.',
    )
  }
  return url
}

export function resolveNamespace(options: SeedOptions = {}): string {
  const ns = options.namespace ?? process.env.SEED_DEMO_NAMESPACE ?? DEFAULT_NAMESPACE
  if (!/^[a-z0-9][a-z0-9-]{0,54}$/.test(ns)) {
    throw new Error(`invalid namespace ${JSON.stringify(ns)} — expected [a-z0-9-], max 55 chars`)
  }
  return ns
}

export function createContext(client: PoolClient, options: SeedOptions = {}): SeedCtx {
  const namespace = resolveNamespace(options)
  const id = idFactory(namespace)
  const quiet = options.quiet ?? false

  return {
    sql: async <T = Record<string, unknown>>(text: string, params: readonly unknown[] = []) => {
      const result = await client.query(text, params as unknown[])
      return result.rows as T[]
    },
    id,
    workspaceId: id('workspace'),
    ownerId: demoOwnerId(namespace),
    memberIds: readMemberIds(),
    namespace,
    slug: `${namespace}-demo`,
    now: options.now ?? new Date(),
    log: (message: string) => {
      if (!quiet) process.stdout.write(`  ${message}\n`)
    },
  }
}
