import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NOT_RESCHEDULABLE_STATUSES } from '@sahoda/shared'

/**
 * One rule, three places it is written down. This is what stops them drifting.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * A post whose schedule has SETTLED may not have that schedule moved. Four
 * statuses: published, failed, expired, publishing.
 *
 * ── WHERE IT LIVES ───────────────────────────────────────────────────────────
 *   · `@sahoda/shared` NOT_RESCHEDULABLE_STATUSES — the definition
 *   · `public.reschedule_post`          → POST_NOT_RESCHEDULABLE
 *   · `public.release_post_for_publish` → POST_NOT_RELEASABLE
 *
 * apps/web's `savePost` used to carry a fourth copy by hand, because it accepts
 * `scheduled_at` and is forbidden to touch `status`, so it cannot call either RPC —
 * it has to know the rule itself. It now imports the constant. The two SQL guards
 * cannot import anything, so this test is what binds them: it reads the guard back
 * out of the migration that defines each function and fails if either list stops
 * matching.
 *
 * ── WHY THE PARSE, RATHER THAN A LIVE CALL ───────────────────────────────────
 * Reading the SQL needs no database, so it runs in the credential-free cloud
 * sandbox and on every `turbo test` — the same reasoning as part one of
 * `migration_integrity.test.ts`. A live suite here would be skipped in exactly the
 * environments where a divergence would otherwise ship.
 *
 * The parse is written to fail LOUDLY rather than vacuously: if a function is
 * renamed, redefined in a later migration, or its guard reformatted past
 * recognition, the extraction assertions below go red instead of quietly matching
 * nothing. A guard test that cannot go red is worse than no test.
 */

const MIGRATIONS = resolve(import.meta.dirname, '../supabase/migrations')

/** The functions that restate the rule, and the error each one raises. */
const GUARDED_FUNCTIONS = [
  { fn: 'reschedule_post', raises: 'POST_NOT_RESCHEDULABLE' },
  { fn: 'release_post_for_publish', raises: 'POST_NOT_RELEASABLE' },
] as const

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

/** SQL with `--` comment lines removed, so a commented-out list cannot be matched. */
function uncommented(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
}

/**
 * The body of the LAST definition of `public.<fn>`, and the file it came from.
 *
 * Last, not first: `create or replace` means a later migration wins, and a test
 * reading the original would pass while the live function said something else.
 */
function lastDefinition(fn: string): { file: string; body: string } | null {
  const pattern = new RegExp(
    `\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`,
    'gi',
  )

  let found: { file: string; body: string } | null = null
  for (const file of migrationFiles()) {
    const sql = uncommented(readFileSync(resolve(MIGRATIONS, file), 'utf8'))
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(sql)) !== null) {
      // plpgsql bodies here are all `as $$ … $$;`. Take the text between the first
      // pair of dollar quotes that follows the signature.
      const open = sql.indexOf('$$', match.index)
      if (open === -1) continue
      const close = sql.indexOf('$$', open + 2)
      if (close === -1) continue
      found = { file, body: sql.slice(open + 2, close) }
    }
  }
  return found
}

/** Every quoted status in the function's `v_status in (…)` guard. */
function statusGuardList(body: string): string[][] {
  return [...body.matchAll(/\bv_status\s+in\s*\(([^)]*)\)/gi)].map((m) =>
    [...m[1]!.matchAll(/'([^']*)'/g)].map((s) => s[1]!),
  )
}

describe('the settled-schedule guard says the same thing in SQL and in TypeScript', () => {
  it('has a non-empty definition to compare against', () => {
    // Without this the whole suite would pass vacuously if the shared export were
    // emptied or renamed to something this file no longer imports.
    expect(NOT_RESCHEDULABLE_STATUSES.length).toBeGreaterThan(0)
  })

  // Deliberately NOT "defined exactly once": `create or replace` means a later
  // migration legitimately supersedes an earlier one, and `lastDefinition` reads the
  // last. This asserts only that there IS one to read — which is what stops a rename
  // from turning the comparisons below into a silent pass.
  it.each(GUARDED_FUNCTIONS)('public.$fn has a definition this test can read', ({ fn }) => {
    const found = lastDefinition(fn)
    expect(found, `no migration defines public.${fn} — was it renamed?`).not.toBeNull()
    expect(found!.body.length).toBeGreaterThan(0)
  })

  it.each(GUARDED_FUNCTIONS)('public.$fn guards on exactly one status list', ({ fn }) => {
    const found = lastDefinition(fn)!
    const guards = statusGuardList(found.body)
    // Two would mean the parse below is picking one of two rules at random. Zero
    // means the guard was reformatted, removed, or renamed off `v_status`.
    expect(guards, `expected one \`v_status in (…)\` in ${found.file}`).toHaveLength(1)
    expect(guards[0]!.length).toBeGreaterThan(0)
  })

  it.each(GUARDED_FUNCTIONS)(
    'public.$fn refuses exactly NOT_RESCHEDULABLE_STATUSES, raising $raises',
    ({ fn, raises }) => {
      const found = lastDefinition(fn)!
      const [guard] = statusGuardList(found.body)

      // Set equality, not subset, in BOTH directions: adding a status to either side
      // alone is a divergence. Sorted so the failure names the statuses rather than
      // reporting an order change.
      expect([...guard!].sort()).toEqual([...NOT_RESCHEDULABLE_STATUSES].sort())

      // The guard must still be the one that refuses. A list that matches while the
      // raise beneath it changed meaning would pass the comparison above.
      expect(found.body).toContain(raises)
    },
  )
})
