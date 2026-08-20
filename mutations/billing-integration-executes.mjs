/**
 * THE 26 BILLING INTEGRATION TESTS: DO THEY NOW ACTUALLY CHECK ANYTHING?
 *
 * They were `describe.skipIf(!LIVE_DB_URL)` and had never executed. Making them
 * execute is worth nothing on its own — a suite can run and still assert past
 * whatever it is handed. Each mutant below breaks one thing the suites claim to
 * cover, in the DATABASE they now run against.
 *
 * Every mutant lands in `pglite-pool.ts`, the test helper. None touches
 * `packages/db/supabase/migrations` (applied and immutable, wt-db's alone) and
 * none touches `packages/shared` (frozen contracts, and three peer sessions are
 * live against it).
 */
const RUN = 'pnpm --filter @sahoda/billing exec vitest run'
const ANCHOR = `  const pool = {
    pglite,`

export default {
  cwd: '.',
  mutants: [
    {
      name: 'the plans table drifts from PLAN_CATALOG by one credit',
      file: 'packages/billing/src/test-helpers/pglite-pool.ts',
      find: ANCHOR,
      replace: `  await pglite.exec(\`update plans set monthly_credits = monthly_credits + 1\`) // MUTANT
${ANCHOR}`,
      command: `${RUN} src/entitlements/entitlements.integration.test.ts`,
    },
    {
      name: 'a plan disappears from the plans table',
      file: 'packages/billing/src/test-helpers/pglite-pool.ts',
      find: ANCHOR,
      replace: `  await pglite.exec(\`delete from plans where id <> 'free'\`) // MUTANT
${ANCHOR}`,
      command: `${RUN} src/entitlements/entitlements.integration.test.ts`,
    },
    {
      name: 'a plan’s stored limits stop being a valid PlanLimits',
      file: 'packages/billing/src/test-helpers/pglite-pool.ts',
      find: ANCHOR,
      replace: `  await pglite.exec(\`update plans set limits = '{}'::jsonb\`) // MUTANT
${ANCHOR}`,
      command: `${RUN} src/entitlements/entitlements.integration.test.ts`,
    },
    {
      name: 'the ledger stops enforcing idempotency — a replay charges twice',
      file: 'packages/billing/src/test-helpers/pglite-pool.ts',
      find: ANCHOR,
      replace: `  await pglite.exec(\`alter table credit_ledger drop constraint credit_ledger_idempotency_key_key\`) // MUTANT
${ANCHOR}`,
      command: `${RUN} src/withCredits.integration.test.ts src/webhooks/`,
    },
    {
      name: 'the webhook event store loses its uniqueness — an event processes twice',
      file: 'packages/billing/src/test-helpers/pglite-pool.ts',
      find: ANCHOR,
      replace: `  await pglite.exec(\`alter table billing_webhook_events drop constraint if exists billing_webhook_events_provider_event_id_key\`) // MUTANT
${ANCHOR}`,
      command: `${RUN} src/webhooks/webhooks.integration.test.ts`,
    },
    {
      name: 'the schema is never applied — the suites face an empty database',
      file: 'packages/billing/src/test-helpers/pglite-pool.ts',
      find: "    await pglite.exec(readFileSync(resolve(MIGRATIONS, file), 'utf8'))",
      replace: '    void file // MUTANT: apply nothing',
      command: `${RUN} src/withCredits.integration.test.ts`,
    },
  ],
}
