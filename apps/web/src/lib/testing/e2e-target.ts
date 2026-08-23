/**
 * Which database is the end-to-end suite about to write to?
 *
 * ## The finding this exists for
 *
 * `apps/web/e2e/fixtures/seeded-user.ts` mints a Clerk user, signs it in through
 * the real app, and lets the app create a workspace. The app reads
 * `apps/web/.env.local`. Every `.env` in this repository — MEASURED 2026-08-22
 * across 87 files in 75 worktrees — names project ref `rloztdhzfliyvpvxsgjl`,
 * which is the ONE Supabase project and is production. So every `pnpm gate`,
 * every `playwright test`, every screenshot run has been creating and deleting
 * workspaces in the database that holds real customers. An audit lane watched
 * three of them appear and vanish mid-run and could account for each by name.
 *
 * Nothing was wrong with any individual file. There was simply nothing anywhere
 * that said out loud which database the run had chosen.
 *
 * ## Why this is not `forbidden-target.ts`
 *
 * `packages/db/tests/helpers/forbidden-target.ts` refuses this ref outright, and
 * that is right for the suites it guards: they are opt-in behind
 * `SAHODA_ALLOW_LIVE_TESTS` and SKIP when it is unset, so refusing costs nothing.
 *
 * The e2e suite has no such default. It drives a browser against a running app,
 * and the app has exactly one database. A flat refusal here does not protect
 * production; it deletes the gate. So this asks a different question.
 *
 * ## A positive check, not an inequality
 *
 * `ref !== SOMETHING` fails OPEN on every input the author did not imagine — an
 * unset variable, a URL dialect the regex missed, two variables disagreeing.
 * This one has to name its destination before it will let anything run:
 *
 *   · a value that mentions Supabase but yields no ref  → REFUSE (unidentifiable)
 *   · no Supabase target configured at all              → REFUSE (nothing to run against)
 *   · two variables naming DIFFERENT projects           → REFUSE (split target)
 *   · the identified ref is a guarded one               → REFUSE unless acknowledged
 *                                                         by its EXACT ref
 *   · anything else                                     → allow
 *
 * Every one of those decisions is printed, pass or refuse, by
 * `describeTargetDecision`. A guard that certifies silently is a guard nobody
 * can audit — and this file is imported at the top of `playwright.config.ts`,
 * which is evaluated before the web server starts and before the first request.
 *
 * ## The acknowledgement is a ref, not a boolean
 *
 * `SAHODA_E2E_ACK_TARGET=1` would be satisfiable by anyone who read the error and
 * wanted it to go away. `SAHODA_E2E_ACK_TARGET=rloztdhzfliyvpvxsgjl` cannot be
 * typed without naming the project you are about to write to, and it stops
 * working the moment the target changes — which is exactly when a stale
 * acknowledgement would be most dangerous.
 *
 * It MUST be declared on the `test:smoke` task in `turbo.json`. Turborepo 2.x
 * defaults to `envMode: "strict"` and strips anything undeclared, so without that
 * line an acknowledged run would be refused anyway and the suite would be
 * unrunnable. That is the same mechanism that once stole `E2E_PORT`.
 *
 * Pure module: environment in, decision out. No I/O, no `process.env` default
 * beyond the caller's, so the tests drive it directly.
 */

/**
 * Project refs that require an explicit acknowledgement before a browser suite
 * may write to them.
 *
 * `rloztdhzfliyvpvxsgjl` — "sahodalabs", ap-south-1. The ONE project: it serves
 * production AND is the linked dev database.
 *
 * A literal on purpose. Read from the environment, the environment could also
 * unset it, and an empty guard list passes everything.
 *
 * This is the FOURTH copy of this ref in the repository — the other three are in
 * `packages/db`, `apps/jobs` and `packages/billing`, which cannot import each
 * other's test helpers. `e2e-target.test.ts` reads all four files and fails if
 * they ever disagree, so the duplication is checked rather than merely regretted.
 */
export const GUARDED_PROJECT_REFS: readonly string[] = Object.freeze(['rloztdhzfliyvpvxsgjl'])

/** The variable a deliberate operator sets, to the exact ref they are accepting. */
export const ACK_VARIABLE = 'SAHODA_E2E_ACK_TARGET'

/**
 * Every variable that can name this app's database.
 *
 * `NEXT_PUBLIC_SUPABASE_URL` is what the running app uses; `SUPABASE_DB_URL` is
 * what a fixture's direct connection uses; `SUPABASE_SERVICE_ROLE_KEY` is not
 * here because a key names no project. All of them are read, not just the first
 * one found, because two of them disagreeing is itself a defect worth refusing.
 */
export const TARGET_VARIABLES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_DB_URL',
  'DATABASE_URL',
  'SUPABASE_PROJECT_REF',
] as const

/** A Supabase project ref is exactly twenty lowercase letters. */
const REF = '[a-z]{20}'

/**
 * The shapes the SAME project is reachable by. Host-only matching would let the
 * pooler form through, and the pooler form is what production actually uses.
 */
const REF_PATTERNS: readonly RegExp[] = [
  // https://<ref>.supabase.co · db.<ref>.supabase.co · <ref>.supabase.in
  new RegExp(`(?:^|[/@.])(${REF})\\.supabase\\.(?:co|in|net)`),
  // postgresql://postgres.<ref>:password@aws-1-ap-south-1.pooler.supabase.com
  new RegExp(`postgres\\.(${REF})[:@]`),
  // A bare ref, as SUPABASE_PROJECT_REF carries it.
  new RegExp(`^(${REF})$`),
]

/** Does this value claim to be a Supabase target at all? */
function mentionsSupabase(value: string): boolean {
  return /supabase/i.test(value)
}

/**
 * The project ref this value names, or null.
 *
 * Null has two very different meanings and the caller must keep them apart: a
 * local Postgres DSN names no Supabase project and is fine; a value that says
 * `supabase` but yields nothing is a target we failed to parse, and a parser
 * that fails open is the one thing this must not be.
 */
export function extractProjectRef(value: string): string | null {
  for (const pattern of REF_PATTERNS) {
    const match = pattern.exec(value.trim())
    if (match?.[1]) return match[1]
  }
  return null
}

export interface TargetReading {
  /** Variable → the project ref it names. Only variables that named one. */
  readonly named: ReadonlyArray<{ variable: string; ref: string }>
  /** Variables that mention Supabase but whose project could not be identified. */
  readonly unidentifiable: readonly string[]
  /** Variables set to something that is not a Supabase target at all. */
  readonly nonSupabase: readonly string[]
  /** The distinct refs found, in the order first seen. */
  readonly distinctRefs: readonly string[]
}

/** Read the environment. No judgement yet — that is `decideTarget`. */
export function readTarget(env: Readonly<Record<string, string | undefined>>): TargetReading {
  const named: { variable: string; ref: string }[] = []
  const unidentifiable: string[] = []
  const nonSupabase: string[] = []

  for (const variable of TARGET_VARIABLES) {
    const value = env[variable]
    if (!value || value.trim() === '') continue

    const ref = extractProjectRef(value)
    if (ref) named.push({ variable, ref })
    else if (mentionsSupabase(value)) unidentifiable.push(variable)
    else nonSupabase.push(variable)
  }

  const distinctRefs = [...new Set(named.map((n) => n.ref))]
  return { named, unidentifiable, nonSupabase, distinctRefs }
}

export type TargetOutcome =
  | 'allowed-unguarded'
  | 'allowed-acknowledged'
  | 'refused-unidentifiable'
  | 'refused-no-target'
  | 'refused-split-target'
  | 'refused-unacknowledged'

export interface TargetDecision {
  readonly outcome: TargetOutcome
  readonly allowed: boolean
  /** The ref the run would use, when exactly one was identified. */
  readonly ref: string | null
  readonly reading: TargetReading
}

/**
 * Decide. Refusal is the default for every branch that is not positively
 * understood, which is why the `allowed` cases are the short ones.
 */
export function decideTarget(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TargetDecision {
  const reading = readTarget(env)
  const at = (outcome: TargetOutcome, ref: string | null, allowed: boolean): TargetDecision => ({
    outcome,
    allowed,
    ref,
    reading,
  })

  // Checked FIRST. A variable we could not parse might be the production one,
  // and every later branch would be reasoning about an incomplete picture.
  if (reading.unidentifiable.length > 0) return at('refused-unidentifiable', null, false)
  if (reading.distinctRefs.length === 0) return at('refused-no-target', null, false)
  if (reading.distinctRefs.length > 1) return at('refused-split-target', null, false)

  const ref = reading.distinctRefs[0]!
  if (!GUARDED_PROJECT_REFS.includes(ref)) return at('allowed-unguarded', ref, true)

  // Guarded. The acknowledgement must name THIS ref — see the header.
  return env[ACK_VARIABLE]?.trim() === ref
    ? at('allowed-acknowledged', ref, true)
    : at('refused-unacknowledged', ref, false)
}
