/**
 * THE 16 apps/jobs INTEGRATION TESTS: DO THEY NOW CATCH WHAT THEY CLAIM?
 *
 * `publishStore.integration.test.ts` (9) and `holds.integration.test.ts` (7)
 * were `describe.skipIf(!hasLedgerEnv)` and had never executed. publishStore's
 * own header says it is "the only thing that catches drift between
 * post_publish_logs' DDL and the row this job writes" — so the mutants below
 * introduce exactly that drift, in the schema the suites now run against.
 *
 * Every mutant lands in the test helper. None touches
 * `packages/db/supabase/migrations` (applied, immutable, wt-db's alone).
 */
const ANCHOR = `  const pool = {
    pglite,`

export default {
  cwd: '.',
  command: 'pnpm --filter @sahoda/jobs exec vitest run tests/',
  mutants: [
    {
      name: 'post_publish_logs loses a column the job writes — the drift this file exists for',
      file: 'apps/jobs/tests/helpers/db-under-test.ts',
      find: ANCHOR,
      replace: `  await pglite.exec(\`alter table post_publish_logs drop column mode\`) // MUTANT
${ANCHOR}`,
    },
    {
      name: 'the ledger function is replaced by one that grants nothing',
      file: 'apps/jobs/tests/helpers/db-under-test.ts',
      find: ANCHOR,
      replace: `  await pglite.exec(\`create or replace function app.apply_ledger_entry(
    uuid, text, int, text, text, text, text, numeric, uuid, int, text, jsonb)
    returns jsonb language sql as $m$ select '{"entry":{"id":null,"balance_after":0},"replayed":false}'::jsonb $m$\`) // MUTANT
${ANCHOR}`,
    },
    {
      name: 'the schema is never applied — the suites face an empty database',
      file: 'apps/jobs/tests/helpers/db-under-test.ts',
      find: "    await pglite.exec(readFileSync(resolve(MIGRATIONS, file), 'utf8'))",
      replace: '    void file // MUTANT: apply nothing',
      // This one breaks the FIXTURE, not the code, so the correct outcome is a
      // suite that cannot boot and therefore runs no assertions. Declared,
      // because the harness otherwise refuses to call a zero-assertion run a kill
      // — and it is right to, for every other mutant here.
      expectsNoTests: true,
    },
    // ── TWO MUTANTS DELIBERATELY NOT LISTED ──────────────────────────────
    //
    // Both were written, both SURVIVED, and in each case the MUTANT was wrong
    // rather than the tests. Recorded because "3 mutants, 3 killed" invites the
    // question of what was tried and discarded.
    //
    //   removing the Supabase GRANTs — these suites connect as PGlite's
    //   superuser and never `set role`, exactly as the job does through a
    //   service-role pool, so table privileges cannot affect them. The grants
    //   were inert setup and have been deleted from the helper rather than left
    //   there looking like coverage. They ARE load-bearing in packages/db's
    //   harness, which drops to `authenticated`; rls-enforced.mjs kills that one.
    //
    //   dropping credit_ledger's append-only trigger — out of scope for these
    //   two files, which test the publish store's column mapping and the hold
    //   reaper. It was a real gap in the repo, just not here: NO executing test
    //   covered it. Now covered, and killed, in rls-enforced.mjs.
  ],
}
