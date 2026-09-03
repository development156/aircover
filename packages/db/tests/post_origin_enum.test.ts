import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PostInsertSchema, PostOriginSchema } from '@sahoda/shared'

/**
 * THE ENUM AND THE COLUMN MUST ADMIT THE SAME FOUR VALUES.
 *
 * This is the seam that hid a whole feature. `20260822090000_posts_origin_radar.sql`
 * widened `posts_origin_check` to admit 'radar' and is applied to production;
 * `PostOriginSchema` was left at three values, so `PostInsertSchema` refused
 * every draft Radar built, before any database call. Two artifacts each held
 * half of one fact, and nothing read both — which is the shape this repository
 * has been bitten by repeatedly, so the guard is a comparison rather than a
 * restatement: it reads the migration's own SQL.
 *
 * MEASURED 2026-09-03: with 'radar' absent from the enum, the first test below
 * fails and the second reports the value the column admits and the schema does
 * not.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * It reads ONE migration file, by name, and only its `check (origin in (…))`
 * form. So it is blind to: a LATER migration that widens or narrows the same
 * constraint (the comparison would still pass against the stale file); the same
 * constraint written as `= ANY (ARRAY[…])`, which is how Postgres itself prints
 * it back and which the regex does not match; and the constraint as PRODUCTION
 * actually holds it, since nothing here connects to a database. The last one is
 * the gap that matters: this file proves the enum agrees with a file on disk,
 * never with the server. `schema_drift.pglite.test.ts` is the guard for that,
 * and `docs/db/MIGRATION_DIVERGENCE_2026-09-02.md` records that its snapshot is
 * behind today.
 */

const MIGRATIONS = resolve(import.meta.dirname, '../supabase/migrations')

/** Every value inside the check constraint the migration declares, in file order. */
function originsDeclaredInSql(): string[] {
  const sql = readFileSync(join(MIGRATIONS, '20260822090000_posts_origin_radar.sql'), 'utf8')
  // The statement, not the commentary: comment lines in this file quote the OLD
  // three-value constraint verbatim, so a scan of the whole text would read the
  // history as the present and pass while the statement said something else.
  const statements = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
  const check = /check\s*\(\s*origin\s+in\s*\(([^)]*)\)/i.exec(statements)
  if (check === null) throw new Error('no origin check constraint found in the migration')
  return [...check[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
}

describe('posts.origin', () => {
  it('admits exactly the values the applied migration declares', () => {
    expect([...PostOriginSchema.options].sort()).toEqual([...originsDeclaredInSql()].sort())
  })

  it('accepts a Radar draft, which it refused until 2026-09-03', () => {
    const draft = PostInsertSchema.safeParse({
      workspace_id: '3f1c8a52-1d3e-4b7a-9c0f-2a5e7d9b4c11',
      created_by: 'user_2abcDEF',
      body: 'Their prices moved. Here is ours.',
      channels: ['instagram'],
      origin: 'radar',
    })

    // Asserting the SENTENCE the failure would carry, not merely `success`: a
    // schema that started rejecting for some unrelated reason would otherwise
    // keep this test green in the wrong way.
    expect(draft.success ? [] : draft.error.issues.map((i) => i.path.join('.'))).toEqual([])
    expect(draft.success).toBe(true)
  })

  it('still refuses an origin nobody declared', () => {
    expect(PostOriginSchema.safeParse('radar_v2').success).toBe(false)
  })
})
