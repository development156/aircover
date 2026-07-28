/**
 * The destination guard. R-01, belt and braces.
 *
 * `SAHODA_ALLOW_LIVE_TESTS=1` gates the DOOR — it says "I may talk to a database". It says
 * nothing about WHICH database, and on 2026-07-28 that was the whole residual risk: there is
 * exactly one Supabase project in the account, so the obvious way to satisfy the flag is to
 * point it at production, where 26 real workspaces and 17 real users live.
 *
 * So the flag is necessary and not sufficient. This module refuses the destination
 * independently. If the resolved target names the production project ref, the suite ABORTS —
 * even with the flag set, even with valid credentials, even if someone typed it deliberately.
 *
 * Deny by identity, not by URL shape. The same database is reachable as
 * `db.<ref>.supabase.co` (direct), `aws-0-<region>.pooler.supabase.com` with a `postgres.<ref>`
 * username (session/transaction pooler), and `<ref>.supabase.co` (PostgREST). Matching on host
 * alone lets the pooler form straight through, which is exactly the form production uses.
 * The ref is the thing that identifies the tenant, so the ref is what is banned — anywhere in
 * the connection string.
 *
 * To run live tests, point at a Supabase BRANCH or a throwaway Postgres. If this ever has to
 * be relaxed, relax it by naming a new allowed ref — never by deleting the check.
 */

/**
 * Project refs that tests may never touch, whatever the flag says.
 *
 * `rloztdhzfliyvpvxsgjl` — "sahodalabs", ap-south-1. The ONE project: it serves production AND
 * is the linked dev database. Recorded here as a literal on purpose: reading it from the
 * environment would mean the environment could also unset it.
 */
export const FORBIDDEN_PROJECT_REFS: readonly string[] = Object.freeze(['rloztdhzfliyvpvxsgjl'])

/** Every env var that can name a database target for this repo's suites. */
const TARGET_VARS = [
  'SUPABASE_DB_URL',
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_PROJECT_REF',
] as const

export interface ForbiddenTarget {
  readonly variable: string
  readonly ref: string
}

/**
 * Which configured target, if any, points at a forbidden project.
 *
 * Substring match against the raw value: it catches the direct host, the pooler username
 * (`postgres.<ref>`), the PostgREST origin and a bare ref, without having to parse five URL
 * dialects correctly — and a parser that gets one dialect wrong fails open, which is the one
 * way this must not fail.
 */
export function findForbiddenTarget(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ForbiddenTarget | null {
  for (const variable of TARGET_VARS) {
    const value = env[variable]
    if (!value) continue
    for (const ref of FORBIDDEN_PROJECT_REFS) {
      if (value.includes(ref)) return { variable, ref }
    }
  }
  return null
}

/**
 * Called at import time by the shared test setup. Throws — which vitest reports as a failed
 * suite, not a skip, so it can never be mistaken for "there was nothing to run".
 */
export function assertTargetIsNotProduction(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  const hit = findForbiddenTarget(env)
  if (!hit) return

  throw new Error(
    [
      '',
      '  REFUSED: a test run is pointed at the PRODUCTION database.',
      '',
      `    ${hit.variable} names project ref ${hit.ref} (sahodalabs, ap-south-1) —`,
      '    the project serving 26 live workspaces and 17 real users.',
      '',
      '  SAHODA_ALLOW_LIVE_TESTS=1 permits talking to *a* database. It does not permit',
      '  talking to *this* one. Point at a Supabase branch or a throwaway Postgres.',
      '',
      '  See docs/audit/2026-07-27/04-risks-and-unknowns.md R-01.',
      '',
    ].join('\n'),
  )
}
