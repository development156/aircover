/**
 * THE RULE: a reconciliation pass may not hide its own failure.
 *
 * `runReconcileSweep` caught every error with `catch {}` and counted it into one
 * shared number. A pass in which all 25 connections and all 25 publishes threw
 * returned the counters of an idle tick beside `failed: 50`, the cron route
 * answered 200, and "Zernio is not provisioned", "Zernio returned 500 fifty
 * times" and "the database refused every write" were the same report.
 *
 * Six ways to put that back, each of which some test must notice. The last three
 * are the other half of the rule: what the body says must stay sayable in public,
 * because the cron route returns this report whole on a URL anyone can request.
 *
 *   node scripts/mutation-check.mjs mutations/reconcile-failures.mjs
 */
export default {
  cwd: 'apps/jobs',
  command: 'pnpm vitest run src/reconcile/sweep.test.ts',
  mutants: [
    {
      name: 'the cause is discarded at the catch, as it was before',
      file: 'apps/jobs/src/reconcile/sweep.ts',
      find: "      fail('connection', stage, error)",
      replace: '      report.failed += 1',
    },
    {
      name: 'a pass where everything failed reports itself clean',
      file: 'apps/jobs/src/reconcile/sweep.ts',
      find: '  report.outcome = outcomeOf(report)',
      replace: "  report.outcome = 'clean'",
    },
    {
      name: 'report mode counts writes it never made',
      file: 'apps/jobs/src/reconcile/sweep.ts',
      find:
        '      report.wouldUpdate += 1\n' +
        "      if (deps.mode === 'on') {\n" +
        "        stage = 'write'\n" +
        '        await deps.applyAccountFacts(connection, facts)\n' +
        '        report.connectionsUpdated += 1\n' +
        '      }',
      replace:
        '      report.wouldUpdate += 1\n' +
        '      report.connectionsUpdated += 1\n' +
        "      if (deps.mode === 'on') {\n" +
        "        stage = 'write'\n" +
        '        await deps.applyAccountFacts(connection, facts)\n' +
        '      }',
    },
    {
      name: 'a failure to write our own row is blamed on the platform',
      file: 'apps/jobs/src/reconcile/failures.ts',
      find: "  return { code: stage === 'write' ? 'write-failed' : 'read-failed', status: null }",
      replace: "  return { code: 'read-failed', status: null }",
    },
    {
      name: "the provider's error code is repeated into the body unchecked",
      file: 'apps/jobs/src/reconcile/failures.ts',
      find: "    return { code: SAFE_CODE.test(error.code) ? error.code : 'zernio-error', status: error.status }",
      replace: '    return { code: error.code, status: error.status }',
    },
    {
      name: 'the error message reaches the public response body',
      file: 'apps/jobs/src/reconcile/failures.ts',
      find: "  if (error instanceof ZernioNotProvisionedError) return { code: 'not-provisioned', status: null }",
      replace: '  if (error instanceof Error) return { code: error.message, status: null }',
    },
  ],
}
