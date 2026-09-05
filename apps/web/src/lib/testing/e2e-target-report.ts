import {
  ACK_VARIABLE,
  GUARDED_PROJECT_REFS,
  STAGING_PROJECT_REF,
  type TargetDecision,
  decideTarget,
} from './e2e-target'

/**
 * What the runner prints about its own destination, on EVERY run.
 *
 * Separate from `e2e-target.ts` so the decision stays a pure function of the
 * environment and the sentences stay a pure function of the decision. Both are
 * testable without a browser, a server or a database.
 *
 * ── WHY IT PRINTS WHEN IT PASSES ─────────────────────────────────────────────
 * A guard that only speaks when it refuses cannot be distinguished from a guard
 * that is not wired in. This repository has shipped that exact mistake more than
 * once — a mutation harness that recorded a suite which emitted zero assertions
 * as SURVIVED, and an append-only probe that read "column does not exist" as the
 * guard refusing. So the banner states the target it PARSED, which variable it
 * came from, and what it decided, whichever way it went. If the banner is
 * missing from a run's output, the guard did not run.
 */

const RULE = '─'.repeat(74)

/** The lines to print. Pure — the caller does the I/O. */
export function describeTargetDecision(decision: TargetDecision): string[] {
  const { reading, ref, outcome } = decision
  const sources = reading.named.map((n) => n.variable).join(', ')

  const head = ['', RULE, '  E2E TARGET CHECK', RULE]

  const parsed = [
    `  parsed ref     ${ref ?? '(none identified)'}`,
    `  named by       ${sources || '(no variable named a Supabase project)'}`,
    ...(reading.unidentifiable.length > 0
      ? [`  UNIDENTIFIED   ${reading.unidentifiable.join(', ')}`]
      : []),
    ...(reading.nonSupabase.length > 0
      ? [`  non-Supabase   ${reading.nonSupabase.join(', ')}`]
      : []),
    `  guarded refs   ${GUARDED_PROJECT_REFS.join(', ')}`,
    `  decision       ${outcome}`,
    RULE,
    '',
  ]

  return [...head, ...parsed]
}

/**
 * The sentence a refusal ends with — long, because the person reading it is
 * about to decide whether to override it and needs the consequence, not a code.
 */
export function refusalMessage(decision: TargetDecision): string {
  const { outcome, ref, reading } = decision

  switch (outcome) {
    case 'refused-unidentifiable':
      return [
        'REFUSED: the e2e target could not be identified.',
        '',
        `  These name a Supabase host but no project ref could be read from them: ${reading.unidentifiable.join(', ')}.`,
        '  A harness that cannot say which database it is about to write to must not write to one.',
        '  Fix the value, or teach REF_PATTERNS in src/lib/testing/e2e-target.ts the dialect it missed.',
      ].join('\n')

    case 'refused-no-target':
      return [
        'REFUSED: no Supabase target is configured.',
        '',
        '  The app cannot serve a signed-in page without one, so every spec would fail at',
        '  navigation and read as a broken app. Set NEXT_PUBLIC_SUPABASE_URL in apps/web/.env.local.',
      ].join('\n')

    case 'refused-split-target':
      return [
        'REFUSED: the run is pointed at two different Supabase projects.',
        '',
        reading.named.map((n) => `    ${n.variable} → ${n.ref}`).join('\n'),
        '',
        '  The app would write to one and the fixtures would read and clean up the other, so a',
        '  passing run would leave rows behind in a database nothing is watching.',
      ].join('\n')

    case 'refused-production':
      return [
        `REFUSED: this run would write to project ${ref}, which is production.`,
        '',
        '  That database holds real workspaces and real customers. The e2e fixtures do not read;',
        '  they CREATE. Every spec file mints a Clerk user, signs it in, and lets the app create a',
        '  workspace, a credit ledger and whatever rows the spec exercises, then deletes them',
        '  again. A run that fails halfway leaves the rest behind.',
        '',
        `  ${ACK_VARIABLE} does not unlock this and there is no flag that does. Until 2026-09-04`,
        '  it did, because production was the only database in this account and refusing outright',
        '  would have deleted the suite rather than protected anything. There is a second database',
        '  now, so the acknowledgement is gone: point the run at staging instead.',
        '',
        `    NEXT_PUBLIC_SUPABASE_URL=https://${STAGING_PROJECT_REF}.supabase.co \\`,
        '      SUPABASE_DB_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\',
        '      pnpm --filter @sahoda/web test:smoke',
        '',
        `  Staging is ref ${STAGING_PROJECT_REF} ("sahoda-staging", ap-south-1). It is unguarded`,
        '  here, so it needs no acknowledgement at all. Every variable in TARGET_VARIABLES has to',
        '  agree — two of them naming different projects is refused as a split target, which is',
        '  the mistake to expect when only one gets changed.',
        '',
        '  If you believe an e2e run genuinely has to touch production, that is a change to this',
        '  file and a conversation, not an environment variable.',
      ].join('\n')

    case 'refused-unacknowledged':
      return [
        `REFUSED: this run would write to project ${ref}, which is guarded.`,
        '',
        '  The e2e fixtures do not read; they CREATE. Every spec file mints a Clerk user, signs it',
        '  in, and lets the app create a workspace, a credit ledger and whatever rows the spec',
        '  exercises, then deletes them again.',
        '',
        '  If that is what you intend, say so by naming the project:',
        '',
        `    ${ACK_VARIABLE}=${ref} pnpm --filter @sahoda/web test:smoke`,
        '',
        `  ${ACK_VARIABLE} must equal the ref exactly. It is declared on the test:smoke task in`,
        '  turbo.json, so it survives strict env mode and joins the cache key — an acknowledged',
        '  run can never be replayed as an unacknowledged one.',
      ].join('\n')

    default:
      return `REFUSED: ${outcome}`
  }
}

/**
 * Print the banner, then throw if the target was refused.
 *
 * Called at MODULE SCOPE from `playwright.config.ts`, which Playwright evaluates
 * before it starts the web server and before `globalSetup` — so the refusal
 * lands before the first request rather than after a five-minute compile.
 */
export function assertE2ETargetAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
  log: (line: string) => void = console.log,
): void {
  const decision = decideTarget(env)
  for (const line of describeTargetDecision(decision)) log(line)
  if (!decision.allowed) throw new Error(refusalMessage(decision))
}
