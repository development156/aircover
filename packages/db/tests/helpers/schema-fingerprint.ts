/**
 * ONE description of "what shape is this database", computed identically for
 * production and for the PGlite the test suites build out of the migration
 * directory.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `pglite-tenant.ts` builds its schema by reading `supabase/migrations`. That is
 * only as good as the directory, and on 2026-08-23 the directory was WRONG: two
 * migrations that production had applied and recorded had lost their files in
 * the August history squash. Every PGlite suite ran against a schema missing a
 * column production has — and passed, because nothing compared the two.
 *
 * ── THE SHAPE OF THE CHECK, AND WHY IT IS A SNAPSHOT ─────────────────────────
 * The obvious version connects to production and diffs. It would never run: the
 * gate has no database credentials, so the check would be `describe.skipIf(...)`
 * and a skipped assertion reports as a pass. This repo already lost seven tables
 * from its DPDP export that way.
 *
 * So it is split in two:
 *   · an OPS step, run by a person with credentials, that captures production's
 *     fingerprint into a committed file — `schema-snapshot.prod.json`;
 *   · a GATE step, needing nothing, that builds PGlite from the migrations
 *     production says it has applied and compares against that file.
 *
 * The gate leg therefore runs on every single run, in the cloud sandbox
 * included, and fails on drift in either direction.
 *
 * ── WHAT IS COMPARED, AND WHAT IS DELIBERATELY NOT ───────────────────────────
 * Compared: tables (and whether RLS is on), columns (type, nullability,
 * default), indexes (by Postgres's own `indexdef`), policies (by name and
 * command), and the NAMES of functions.
 *
 * Not compared: function BODIES. `pg_get_functiondef` renders differently
 * between server versions, so a body diff would report drift on every PGlite
 * upgrade and teach everyone to ignore it. A guard that cries wolf is worse than
 * one with a stated limit — the limit is stated here.
 *
 * Also not compared: anything outside `public` and `app`. `auth`, `storage`,
 * `realtime` and `graphql` belong to Supabase, are absent from PGlite by
 * definition, and are not what the migration directory claims to build.
 */

/** Anything with a `.query(sql)` that answers `{ rows }` — pg and PGlite both do. */
export interface Queryable {
  query(sql: string): Promise<{ rows: unknown[] }>
}

export interface SchemaFingerprint {
  tables: Record<string, string>
  columns: Record<string, string>
  indexes: Record<string, string>
  policies: Record<string, string>
  functions: string[]
}

const SCOPE = `('public', 'app')`

/**
 * `column_default` is normalised, because the two servers spell the same default
 * differently often enough to drown the signal: whitespace, and the `::text`
 * style casts Postgres adds when it re-renders an expression it parsed.
 */
function normalizeDefault(value: string | null): string {
  if (value === null) return '-'
  return value
    .replace(/\s+/g, ' ')
    .replace(/'([^']*)'::(character varying|text|bpchar)/g, "'$1'")
    .trim()
}

function normalizeIndexDef(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/ USING btree /i, ' USING btree ')
    .trim()
}

export async function fingerprint(db: Queryable): Promise<SchemaFingerprint> {
  const out: SchemaFingerprint = {
    tables: {},
    columns: {},
    indexes: {},
    policies: {},
    functions: [],
  }

  const tables = (
    await db.query(`
      select n.nspname as schema, c.relname as name, c.relrowsecurity as rls
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ${SCOPE} and c.relkind = 'r'
       order by 1, 2`)
  ).rows as { schema: string; name: string; rls: boolean }[]
  for (const t of tables) out.tables[`${t.schema}.${t.name}`] = t.rls ? 'rls' : 'NO RLS'

  const columns = (
    await db.query(`
      select table_schema as schema, table_name as tbl, column_name as col,
             data_type as typ, is_nullable as nullable, column_default as def
        from information_schema.columns
       where table_schema in ${SCOPE}
       order by 1, 2, 3`)
  ).rows as Record<string, string | null>[]
  for (const c of columns) {
    out.columns[`${c.schema}.${c.tbl}.${c.col}`] =
      `${c.typ} | null=${c.nullable} | default=${normalizeDefault(c.def ?? null)}`
  }

  const indexes = (
    await db.query(`
      select schemaname as schema, indexname as name, indexdef as def
        from pg_indexes where schemaname in ${SCOPE} order by 1, 2`)
  ).rows as Record<string, string>[]
  for (const i of indexes) out.indexes[`${i.schema}.${i.name}`] = normalizeIndexDef(i.def ?? '')

  const policies = (
    await db.query(`
      select schemaname as schema, tablename as tbl, policyname as name, cmd
        from pg_policies where schemaname in ${SCOPE} order by 1, 2, 3`)
  ).rows as Record<string, string>[]
  for (const p of policies) out.policies[`${p.schema}.${p.tbl}.${p.name}`] = p.cmd ?? ''

  // ── EXTENSION-OWNED OBJECTS ARE NOT DRIFT ─────────────────────────────────
  // Supabase installs pgcrypto into the `extensions` schema; PGlite's pgcrypto
  // lands in `public`. Comparing bare names reported 23 crypto functions as
  // differences on a database where nothing had actually drifted — noise that
  // would have taught everyone to ignore this check by its second run. What an
  // extension owns is recorded in pg_depend with deptype 'e', so it can be
  // excluded exactly rather than by matching on name prefixes.
  const functions = (
    await db.query(`
      select n.nspname || '.' || p.proname as name
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ${SCOPE}
         and not exists (
           select 1 from pg_depend d
            where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
         )
       order by 1`)
  ).rows as { name: string }[]
  out.functions = [...new Set(functions.map((f) => f.name))].sort()

  return out
}

export interface Drift {
  kind: 'tables' | 'columns' | 'indexes' | 'policies' | 'functions'
  key: string
  production: string | null
  migrations: string | null
}

/** Every difference, both directions, as sentences rather than a boolean. */
export function drift(production: SchemaFingerprint, migrations: SchemaFingerprint): Drift[] {
  const found: Drift[] = []
  for (const kind of ['tables', 'columns', 'indexes', 'policies'] as const) {
    const a = production[kind]
    const b = migrations[kind]
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      if (a[key] !== b[key]) {
        found.push({ kind, key, production: a[key] ?? null, migrations: b[key] ?? null })
      }
    }
  }
  const pf = new Set(production.functions)
  const mf = new Set(migrations.functions)
  for (const key of [...new Set([...pf, ...mf])].sort()) {
    if (pf.has(key) !== mf.has(key)) {
      found.push({
        kind: 'functions',
        key,
        production: pf.has(key) ? 'present' : null,
        migrations: mf.has(key) ? 'present' : null,
      })
    }
  }
  return found
}

export function describeDrift(items: Drift[]): string {
  return items
    .map(
      (d) =>
        `  ${d.kind.padEnd(9)} ${d.key}\n` +
        `      production : ${d.production ?? '(absent)'}\n` +
        `      migrations : ${d.migrations ?? '(absent)'}`,
    )
    .join('\n')
}
