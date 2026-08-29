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
      /create\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi,
    )) {
      if (m[1]) names.add(m[1].toLowerCase())
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
