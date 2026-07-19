import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * How stale a fixture must be before a sweep may remove it. A whole suite runs in
 * well under a minute, so an hour is nowhere near a healthy concurrent run — but it
 * is a heuristic, not a guarantee: a run parked at a breakpoint past an hour would
 * have its live fixtures swept. That trade is deliberate. The alternative, never
 * sweeping, is what left eight workspaces stranded in the shared dev DB.
 */
const SWEEP_AFTER_MS = 60 * 60 * 1000

/** Only `user_<suite>_` prefixes may be swept — see sweepStaleFixtures. */
const PREFIX_SHAPE = /^user_[a-z]+_$/

/** Escape LIKE metacharacters so `_` matches a literal underscore, not any character. */
function literalPrefix(prefix: string): string {
  return `${prefix.replace(/[\\%_]/g, '\\$&')}%`
}

/**
 * Recovery sweep for suites whose cleanup is afterAll-only. A run killed mid-suite
 * (Ctrl-C, crash, timeout kill) never reaches its hooks and strands every fixture it
 * created. Nothing stranded here can POISON a later run — each suite scopes its slugs
 * and user ids with `Date.now()` — so this clears litter rather than repairing
 * breakage. The one suite where strays DID break later runs, ledger.test.ts, is the
 * one that needs no prefix matching: it uses a single fixed `created_by`.
 *
 * Two safety properties, because the failure mode of a too-broad sweep is deleting a
 * real user's workspace on a SHARED database:
 *
 *  1. The prefix must look like `user_<suite>_`. That rejects `''`, `'user_'` and any
 *     other widening typo outright, so an over-broad sweep cannot be written by
 *     accident — it throws instead of running.
 *  2. LIKE metacharacters in the prefix are escaped. `_` is a single-character
 *     WILDCARD in SQL LIKE, so an unescaped `'user_boot_%'` also matches `userXbootY…`
 *     — including real Clerk subjects, which are `user_<base58>`. Escaping makes the
 *     underscores literal and the prefix genuinely anchored.
 *
 * `users_profile` is swept too and is NOT reachable from the workspace cascade: it is
 * keyed on `user_id` with no FK to workspaces, so bootstrap's stranded profile rows
 * survive their workspaces being deleted. `user_boot_prof` is currently exactly that —
 * a profile with no workspace at all.
 */
export async function sweepStaleFixtures(svc: SupabaseClient, prefix: string): Promise<void> {
  if (!PREFIX_SHAPE.test(prefix)) {
    throw new Error(`sweep prefix must match ${PREFIX_SHAPE} (got ${JSON.stringify(prefix)})`)
  }
  const pattern = literalPrefix(prefix)
  const cutoff = new Date(Date.now() - SWEEP_AFTER_MS).toISOString()

  // workspaces cascade to every tenant-scoped fixture hanging off them
  await svc.from('workspaces').delete().like('created_by', pattern).lt('created_at', cutoff)
  await svc.from('users_profile').delete().like('user_id', pattern).lt('created_at', cutoff)
}
