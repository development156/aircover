import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A real Postgres, every migration applied, WITH ROW-LEVEL SECURITY ENFORCED.
 *
 * ── THE CLAIM THIS FILE EXISTS TO OVERTURN ───────────────────────────────────
 * `pglite-schema.ts` states, and has stated since it was written:
 *
 *     "Row-level security policies are CREATED here but not exercised: PGlite
 *      connects as a superuser, which bypasses them. Tests may assert that RLS
 *      is switched on — a structural fact — and must not claim a policy was
 *      enforced."
 *
 * The first sentence is true of the DEFAULT connection and false of what the
 * connection can be made to do. MEASURED 2026-08-20, in three statements:
 *
 *     begin;
 *     set local role authenticated;     -- current_user=authenticated, is_superuser=off
 *     select * from t;                  -- 2 rows seeded, 1 returned
 *
 * `set local role` drops the superuser bit for the rest of the transaction, and
 * Postgres then applies the policy exactly as it does behind PostgREST. The
 * rollback puts the superuser back, so seeding and asserting can share one
 * database.
 *
 * ── WHY THAT MATTERS MORE THAN A DOCSTRING CORRECTION ────────────────────────
 * "RLS ON EVERY TABLE" is the first line of this product's security model and
 * the only boundary there is: `lib/supabase/server.ts` refuses to build a
 * service-role client, so nothing in apps/web can go around a policy.
 *
 * On 2026-08-20 the number of EXECUTING tests that enforced a policy was ZERO.
 * `rls.test.ts` (45) and `ops_rls.test.ts` (49) are `describe.skipIf(!hasRlsEnv)`
 * and hasRlsEnv is false without SAHODA_ALLOW_LIVE_TESTS=1 — which is correct,
 * because the only Supabase project is production. Every `.pglite.test.ts` that
 * does run, runs as superuser. So the gate was green on ninety-four RLS tests
 * that never executed, and the property was unverified on every ordinary run.
 *
 * ── WHAT THIS PROVES, AND WHAT IT CANNOT ─────────────────────────────────────
 * Proves: the POLICIES IN THE MIGRATION FILES enforce tenant isolation, against
 * a real Postgres, with no credentials and no network, on every gate run.
 *
 * Cannot prove: that production's policies match these files (that is
 * `migration_integrity.test.ts`'s job and it needs a real connection), nor
 * anything about PostgREST's own behaviour above the database.
 */

const MIGRATIONS = resolve(import.meta.dirname, '../../supabase/migrations')

/** Everything Supabase creates before the first migration runs — ONE copy, on disk. */
const SUPABASE_PRELUDE = readFileSync(resolve(import.meta.dirname, 'supabase-prelude.sql'), 'utf8')

/** Every migration file, in apply order — the real ones, off disk. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/**
 * What Supabase grants `anon` and `authenticated` at PROJECT CREATION, before
 * any migration runs — and the single most misleading thing to leave out.
 *
 * A bare Postgres gives those roles no table privileges at all, so every read
 * comes back `permission denied for table x`. That is indistinguishable, at a
 * glance, from a policy doing its job, and a suite written without these grants
 * would report perfect tenant isolation while proving only that nobody had been
 * granted anything. MEASURED here first: `ai_provider_logs` denied a member of
 * its own workspace.
 *
 * Supabase's grant is deliberately broad — full CRUD to both roles — because in
 * its model the GRANT is not the boundary. RLS is. Reproducing the broad grant
 * is what makes the policy the only thing standing between the two tenants,
 * which is exactly the claim under test.
 */
const SUPABASE_GRANTS = `
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
`

/** A fresh in-memory Postgres with the WHOLE migration set applied. */
export async function bootFullSchema(): Promise<PGlite> {
  const db = await new PGlite({ extensions: { pgcrypto } })
  await db.exec(SUPABASE_PRELUDE)
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(resolve(MIGRATIONS, file), 'utf8'))
  }
  await db.exec(SUPABASE_GRANTS)
  return db
}

/**
 * One statement, in a savepoint, whose failure does not kill the transaction.
 *
 * Postgres aborts the WHOLE transaction on the first error — every later
 * statement returns "current transaction is aborted", so one denied table turns
 * the remaining twenty-nine assertions into the same error message and the run
 * says nothing about them. Each probe gets its own savepoint so a refusal is
 * DATA and not the end of the test.
 */
export async function probe<T>(
  tx: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[] } | { denied: string }> {
  await tx.exec('savepoint probe')
  try {
    const result = await tx.query<T>(sql, params)
    await tx.exec('release savepoint probe')
    return { rows: result.rows }
  } catch (error) {
    await tx.exec('rollback to savepoint probe')
    return { denied: error instanceof Error ? error.message.split('\n')[0]! : String(error) }
  }
}

/**
 * Run `fn` as a signed-in Supabase user and undo everything it did.
 *
 * `set local role` is what makes the policies apply — as superuser they are
 * inert. The rollback is not tidiness: without it the role change and any write
 * would leak into the next assertion, and a suite that seeds once cannot afford
 * that.
 */
export async function asRole<T>(
  db: PGlite,
  role: 'authenticated' | 'anon',
  claims: Record<string, unknown>,
  fn: (tx: PGlite) => Promise<T>,
): Promise<T> {
  await db.exec('begin')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await db.exec(`set local role ${role}`)
    return await fn(db)
  } finally {
    await db.exec('rollback')
  }
}

/**
 * A signed-in member of one workspace. The claim name is `sub`, because that is
 * what `app.member_workspace_ids()` reads.
 */
export function asMember<T>(
  db: PGlite,
  userId: string,
  fn: (tx: PGlite) => Promise<T>,
): Promise<T> {
  return asRole(db, 'authenticated', { sub: userId, role: 'authenticated' }, fn)
}

/** Confirms the role really dropped — a policy is inert against a superuser. */
export async function currentRole(db: PGlite): Promise<{ user: string; superuser: string }> {
  const row = (
    await db.query<{ user: string; superuser: string }>(
      `select current_user as "user", current_setting('is_superuser') as superuser`,
    )
  ).rows[0]
  if (!row) throw new Error('could not read the current role')
  return row
}

// ── THE GENERIC SEEDER ───────────────────────────────────────────────────────

type Column = {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
  udt_name: string
  is_identity: string
  identity_generation: string | null
}

/** Every `public` table carrying a `workspace_id` — read from the catalog, never listed by hand. */
export async function tenantTables(db: PGlite): Promise<string[]> {
  const rows = (
    await db.query<{ table_name: string }>(
      `select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'workspace_id'
       order by table_name`,
    )
  ).rows
  return rows.map((r) => r.table_name)
}

/**
 * Candidate values for one column, cheapest-first.
 *
 * A LADDER rather than one guess, because the interesting columns are guarded
 * by CHECK constraints this seeder has no business understanding: an enumerated
 * `channel`, a 24-hex `profile_id`, a status vocabulary. Reading each constraint
 * and reasoning about it would put a second, weaker copy of the schema in this
 * file. Offering candidates and letting POSTGRES reject them keeps the database
 * the only authority — and a column no candidate satisfies fails loudly in
 * `seedTwoWorkspaces` rather than silently seeding nothing.
 */
function candidates(column: Column, checkLiterals: string[], nth: number): string[] {
  // EVERY candidate varies with `nth`. The two workspaces' rows collide on any
  // UNIQUE column otherwise, and a collision is unrecoverable here: the ladder
  // only walks forward, so once it has stepped off the one good value chasing a
  // duplicate-key error it never comes back. MEASURED: credit_ledger and
  // zernio_profiles both failed this way, seventeen attempts deep, and the
  // error at the end named a CHECK constraint that had nothing to do with it.
  const hex = `0123456789abcdef0123456${nth}` // 24 lowercase hex — Zernio ObjectId shape
  const text = [
    ...checkLiterals.map((l) => `'${l.replace(/'/g, "''")}'`),
    `'${hex}'`,
    `'probe-${nth}'`,
  ]
  switch (column.data_type) {
    case 'uuid':
      return [`'${String(nth).repeat(8)}-0000-4000-8000-${String(nth).repeat(12)}'::uuid`]
    case 'text':
    case 'character varying':
      return text
    case 'boolean':
      return ['false']
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'numeric':
    case 'double precision':
    case 'real':
      // Negative and zero are in the ladder because `credit_ledger` carries an
      // `amount_sign` CHECK tying the sign to the entry kind — a positive-only
      // guess can never satisfy a SPEND row.
      return [String(nth), `-${nth}`, '0']
    case 'jsonb':
      return [`'{}'::jsonb`]
    case 'json':
      return [`'{}'::json`]
    case 'timestamp with time zone':
    case 'timestamp without time zone':
      return ['now()']
    case 'date':
      return ['current_date']
    case 'ARRAY':
      return [`'{}'`]
    default:
      return ['null']
  }
}

/** Literals a CHECK on this exact column mentions, in the order the DDL wrote them. */
function literalsFor(defs: string[], column: string): string[] {
  const out: string[] = []
  for (const def of defs) {
    // The column name must appear as a whole word — `channel` must not match
    // `channel_id` — and the definition must not be about a DIFFERENT column,
    // which is why each definition is filtered before its literals are taken.
    if (!new RegExp(`\\b${column}\\b`).test(def)) continue
    for (const m of def.matchAll(/'([^']*)'/g)) if (m[1]) out.push(m[1])
  }
  return out
}

export type SeedReport = {
  seeded: string[]
  unseeded: { table: string; reason: string }[]
}

/**
 * One row per workspace in every tenant table.
 *
 * Runs as superuser with `disable trigger all`, so foreign keys and append-only
 * guards are out of the way. That is deliberate and it is the honest scope: this
 * seeder exists to give the POLICY something to filter, and a policy does not
 * read a foreign key. Referential integrity is proven by the suites that insert
 * real rows through real functions — never by this one.
 */
export async function seedTwoWorkspaces(
  db: PGlite,
  workspaceA: string,
  workspaceB: string,
  /**
   * The member each workspace's rows belong to.
   *
   * Needed because several policies are narrower than "same workspace":
   * `tour_progress` reads `user_id = auth.jwt() ->> 'sub'` ON TOP of membership,
   * so a row seeded with an arbitrary user_id is invisible to its own workspace
   * — and the table then looks broken when it is behaving exactly as written.
   * Filling `user_id` from the member makes that table genuinely covered rather
   * than excused.
   */
  memberOf: Record<string, string> = {},
): Promise<SeedReport> {
  const tables = await tenantTables(db)

  const allTables = (
    await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`,
    )
  ).rows
  for (const { tablename } of allTables) {
    await db.exec(`alter table public."${tablename}" disable trigger all`)
  }

  const checkDefs = new Map<string, string[]>()
  for (const row of (
    await db.query<{ t: string; def: string }>(
      `select rel.relname as t, pg_get_constraintdef(c.oid) as def
       from pg_constraint c
       join pg_class rel on rel.oid = c.conrelid
       join pg_namespace n on n.oid = rel.relnamespace
       where c.contype = 'c' and n.nspname = 'public'`,
    )
  ).rows) {
    checkDefs.set(row.t, [...(checkDefs.get(row.t) ?? []), row.def])
  }

  const report: SeedReport = { seeded: [], unseeded: [] }

  /**
   * Triggers go back on before this function returns — see the finally below.
   *
   * MEASURED: leaving them off silently disarmed `app.block_mutations()` on all
   * eleven append-only tables, so a suite asserting "the ledger refuses a direct
   * UPDATE" found that it did not. The seeder had globally weakened the database
   * every later assertion runs against, which is a harness telling its own tests
   * what to conclude.
   */

  for (const table of tables) {
    const columns = (
      await db.query<Column>(
        `select column_name, data_type, is_nullable, column_default, udt_name,
                is_identity, identity_generation
         from information_schema.columns
         where table_schema = 'public' and table_name = $1
         order by ordinal_position`,
        [table],
      )
    ).rows

    let failure: string | null = null
    for (const [workspace, nth] of [
      [workspaceA, 1],
      [workspaceB, 2],
    ] as const) {
      // Already has a row for this workspace? Then it is seeded, and inserting a
      // second would fail on a legitimate unique constraint and be reported as a
      // gap that does not exist — `workspace_members` gets its rows from the
      // membership setup, before this seeder ever runs.
      const existing = await db.query<{ n: number }>(
        `select count(*)::int as n from public."${table}" where workspace_id = $1`,
        [workspace],
      )
      if ((existing.rows[0]?.n ?? 0) > 0) continue
      const names: string[] = []
      const ladders: string[][] = []
      for (const column of columns) {
        if (column.column_name === 'workspace_id') {
          names.push('workspace_id')
          ladders.push([`'${workspace}'::uuid`])
          continue
        }
        const member = memberOf[workspace]
        if (column.column_name === 'user_id' && member !== undefined) {
          names.push('"user_id"')
          ladders.push([`'${member}'`])
          continue
        }
        // GENERATED ALWAYS refuses any value at all.
        if (column.is_identity === 'YES' && column.identity_generation === 'ALWAYS') continue
        // Nullable or defaulted: let the database decide, it knows better.
        if (column.is_nullable === 'YES' || column.column_default !== null) continue
        names.push(`"${column.column_name}"`)
        ladders.push(
          candidates(column, literalsFor(checkDefs.get(table) ?? [], column.column_name), nth),
        )
      }

      // Walk the ladder one column at a time: fix everything else at its first
      // candidate, advance only the column the database is complaining about.
      const chosen = ladders.map(() => 0)
      let cursor = 0
      let inserted = false
      let lastError = ''
      let lastSql = ''
      const trail: string[] = []
      // Bounded: at most one advance per candidate across all columns. Every
      // iteration either advances a ladder or breaks, so this terminates.
      const budget = ladders.reduce((sum, l) => sum + l.length, 0) + 1
      for (let attempt = 0; attempt < budget && !inserted; attempt += 1) {
        const values = ladders.map((ladder, i) => ladder[chosen[i] ?? 0] ?? 'null')
        // Kept so a failure reports the statement it actually ran. A seeder that
        // says only "check constraint violated" sends the next hour into
        // guessing which of eleven columns it was.
        lastSql = `insert into public."${table}" (${names.join(', ')}) values (${values.join(', ')})`
        try {
          await db.exec(lastSql)
          inserted = true
        } catch (error) {
          lastError = error instanceof Error ? error.message.split('\n')[0]! : String(error)
          if (trail.length < 6) trail.push(`${values.join(', ')}  ->  ${lastError}`)
          // Which column did it object to? A NOT NULL or type error names the
          // column outright; a CHECK names only its constraint, and Postgres
          // spells those `<table>_<column>_check`, so the column is recoverable
          // from the name. When neither works — `amount_sign`, a constraint
          // named after the rule rather than the column — fall through to the
          // round-robin below rather than giving up, which is what left
          // credit_ledger and zernio_profiles unseeded on the first attempt.
          const constraint = /constraint "([^"]+)"/.exec(lastError)?.[1] ?? ''
          let advanced = false
          for (let i = 0; i < names.length && !advanced; i += 1) {
            const bare = names[i]!.replace(/"/g, '')
            const at = chosen[i] ?? 0
            const named =
              new RegExp(`\\b${bare}\\b`).test(lastError) ||
              // Postgres names its own constraints `<table>_<column>_check` and
              // `<table>_<column>_key`. Neither name matches `\b<column>\b`,
              // because the surrounding underscores are word characters — so
              // without these two the offending column is never identified and
              // the round-robin advances an innocent one.
              constraint === `${table}_${bare}_check` ||
              constraint === `${table}_${bare}_key`
            if (!named || at + 1 >= ladders[i]!.length) continue
            chosen[i] = at + 1
            advanced = true
          }
          if (!advanced) {
            // Round-robin from where the last advance left off, so every column
            // gets a turn instead of the first one absorbing the whole budget.
            for (let step = 0; step < ladders.length && !advanced; step += 1) {
              const i = (cursor + step) % ladders.length
              const at = chosen[i] ?? 0
              if (at + 1 >= ladders[i]!.length) continue
              chosen[i] = at + 1
              cursor = (i + 1) % ladders.length
              advanced = true
            }
          }
          if (!advanced) break
        }
      }
      if (!inserted) {
        failure = `${lastError}\n${trail.map((t) => `        tried: ${t}`).join('\n')}`
        break
      }
    }

    if (failure === null) report.seeded.push(table)
    else report.unseeded.push({ table, reason: failure })
  }

  // Re-arm everything the seeding turned off. Not in a `finally` around the loop
  // but here, after it: a half-seeded database is still one that must not be
  // handed to an assertion with its guards down.
  for (const { tablename } of allTables) {
    await db.exec(`alter table public."${tablename}" enable trigger all`)
  }

  return report
}
