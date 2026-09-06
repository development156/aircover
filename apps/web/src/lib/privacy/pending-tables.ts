import { readdirSync, readFileSync } from 'node:fs'

/**
 * "INVENTED" AND "WRITTEN BUT NOT APPLIED" ARE DIFFERENT FACTS.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `export-drift.test.ts` compares the privacy export manifest against the LIVE
 * database and fails on a manifest entry with no table behind it. That is the
 * right check: a typo, or a table somebody renamed, would otherwise mean a
 * customer's export silently omits their data.
 *
 * But it cannot tell that defect from a normal state of this project. Migrations
 * here are applied BY HAND — `db push = ASK` — so a table routinely exists in
 * the migration files for hours or days before it exists in production. During
 * that window the manifest must already name it (the pglite suite, which runs
 * against this branch's migrations, insists) while production does not have it
 * (the drift suite, which runs against production, insists it does not).
 *
 * MEASURED 2026-08-28: production holds 52 workspace-owned tables and this
 * branch's migrations create 53. `docs/38` has carried a paragraph about exactly
 * this state, naming a different table, for three separate revisions.
 *
 * ── WHY IT IS DERIVED AND NOT A HAND-WRITTEN ALLOWLIST ───────────────────────
 * A list of "tables we know are pending" is a list somebody has to remember to
 * empty, and the failure mode when they do not is a permanently excused phantom
 * — the guard quietly stops guarding. Reading the migration files instead means
 * the allowance exists exactly while the migration does, and a manifest entry
 * for a table NO migration creates is still a phantom, which is the defect the
 * check was written for.
 *
 * WHAT IT CANNOT SEE: it matches `create table <name>` in the migration text, so
 * a table created by a function, by dynamic SQL, or under a quoted identifier
 * with unusual casing is invisible to it and would be reported as invented. That
 * is the safe direction to be wrong in.
 */
export function tablesCreatedByMigrations(migrationsDir: string): ReadonlySet<string> {
  const names = new Set<string>()
  for (const file of readdirSync(migrationsDir)) {
    if (!file.endsWith('.sql')) continue
    const sql = readFileSync(`${migrationsDir}/${file}`, 'utf8')
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi,
    )) {
      if (m[1]) names.add(m[1].toLowerCase())
    }
  }
  return names
}

/**
 * Every table this repo's migrations give a `workspace_id` column — the same
 * fact `export-manifest.ts`'s header says was read off `information_schema`
 * by hand, and the same one `packages/db/tests/helpers/pglite-tenant.ts`'s
 * `tenantTables` reads off a REAL Postgres catalog after every migration has
 * actually run. This is the credential-free, apps/web-side version of that
 * question: no database, no PGlite boot, just the migration text — the same
 * trade `tablesCreatedByMigrations` above already makes.
 *
 * ── WHY A SECOND SCAN, NOT ONE ────────────────────────────────────────────────
 * `create table` bodies are read the same way `tablesCreatedByMigrations`
 * reads table names — reusing that function's file-by-file loop rather than
 * opening a second reader for the same directory. What it adds is the ONE
 * shape that function is blind to and this guard cannot afford to be: a table
 * that gains `workspace_id` LATER, through `alter table … add column`. No
 * migration in this repo does that today (checked 2026-09-06), which is
 * exactly when a detector that cannot see the shape is cheapest to write
 * wrong, because nothing here will exercise it — see the test file for the
 * mutation that proves this branch, not just the create-table one.
 *
 * ── THE DIRECTION THIS IS SAFE TO BE WRONG IN, AND IT IS THE OPPOSITE ONE ────
 * `tablesCreatedByMigrations`'s own header says under-matching is the safe
 * failure, because a table it misses reads as "invented" and FAILS the drift
 * test — loud. This function feeds a guard that reads it the other way: a
 * table missing from THIS set is a table that guard never checks at all,
 * which is silent. So this is written to over-match rather than under-match —
 * a `workspace_id` mentioned in a `check` constraint or a comment inside a
 * `create table` body is included even though it does not own the column,
 * because a human confirming a false alarm costs a minute and a silently
 * uncovered tenant table costs an export.
 *
 * ── WHAT IT STILL CANNOT SEE ──────────────────────────────────────────────────
 * A column added inside a `do $$ … $$` block, by a function, or by dynamic
 * SQL; a table under a QUOTED identifier with unusual casing, or qualified by
 * any schema other than the bare name or an explicit `public.` (both of those
 * two are handled — MEASURED against the literal `create table public.x (…)`
 * form, which the bare-name regex alone does not match); a column added by
 * `rename column … to workspace_id` rather than `add column`; or a statement
 * whose `;` terminator sits inside a string literal. All of these fail toward
 * invisibility, same as `tablesCreatedByMigrations`, and are not corrected for
 * here.
 */
export function tablesWithWorkspaceId(migrationsDir: string): ReadonlySet<string> {
  const names = new Set<string>()
  for (const file of readdirSync(migrationsDir)) {
    if (!file.endsWith('.sql')) continue
    const sql = readFileSync(`${migrationsDir}/${file}`, 'utf8')

    // CREATE TABLE name ( …body up to the closing `);` on its own line… )
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi,
    )) {
      const name = m[1]
      if (!name) continue
      const bodyStart = m.index + m[0].length
      const bodyEnd = sql.indexOf('\n);', bodyStart)
      const body = bodyEnd === -1 ? sql.slice(bodyStart) : sql.slice(bodyStart, bodyEnd)
      if (/\bworkspace_id\b/i.test(body)) names.add(name.toLowerCase())
    }

    // ALTER TABLE name … ADD COLUMN … workspace_id …  — anywhere before the
    // statement's own terminating `;`, so a multi-column ADD or a wrapped
    // line is still read.
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?([^;]*);/gi,
    )) {
      const name = m[1]
      const clause = m[2] ?? ''
      if (name && /\badd\s+column\b[^;]*\bworkspace_id\b/i.test(clause)) {
        names.add(name.toLowerCase())
      }
    }
  }
  return names
}

export interface PhantomSplit {
  /** In the manifest, in no migration, and not in the database. A real defect. */
  invented: string[]
  /** In the manifest and in a migration, but not yet applied to the database. */
  pending: string[]
}

/**
 * Split the manifest entries that have no live table into the two kinds.
 *
 * `invented` is what the drift test must still fail on. `pending` is reported
 * rather than asserted, because a session cannot apply a migration and failing
 * for it would make the suite red for a state the project deliberately has.
 */
export function splitPhantoms(
  inManifest: readonly string[],
  inDb: readonly string[],
  createdByMigrations: ReadonlySet<string>,
): PhantomSplit {
  const live = new Set(inDb)
  const invented: string[] = []
  const pending: string[] = []
  for (const table of inManifest) {
    if (live.has(table)) continue
    if (createdByMigrations.has(table)) pending.push(table)
    else invented.push(table)
  }
  return { invented, pending }
}
