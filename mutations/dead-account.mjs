/**
 * THE RULE: a dead account is out of the loop permanently, and a live one keeps
 * the deadline the T-7 warning is derived from.
 *
 * Both are one UPDATE and one WHERE clause, and neither is meaningful without the
 * other: `applyAccountFacts` moves a flagged connection to `expired`, and
 * `listConnectionsToCheck` only ever reads `active`. Break either and the sweep
 * re-polls a revoked account every five minutes forever, or the connections page
 * warns about nothing because the column it reads was never written.
 *
 * The statements are exercised on a real Postgres (PGlite, in-process) rather than
 * asserted as strings — the publish lease next door was a right-looking predicate
 * that could never match, for weeks.
 *
 *   node scripts/mutation-check.mjs mutations/dead-account.mjs
 */
export default {
  cwd: 'apps/jobs',
  command:
    'pnpm vitest run src/reconcile/store.pglite.test.ts src/publish/runPublishPost.test.ts ' +
    'src/publish/tokens.test.ts',
  mutants: [
    {
      name: 'a flagged account stays active and keeps being published to',
      file: 'apps/jobs/src/reconcile/store.ts',
      find: "              status = case when $3::boolean then 'expired' else status end",
      replace: '              status = status',
    },
    {
      name: 'an expired connection is polled again on every tick, forever',
      file: 'apps/jobs/src/reconcile/store.ts',
      find: "        where c.status = 'active'",
      replace: '        where c.status is not null',
    },
    {
      name: 'the health write replaces external_account instead of merging it',
      file: 'apps/jobs/src/reconcile/store.ts',
      find: '          set external_account = external_account\n                || jsonb_build_object(',
      replace: '          set external_account = (jsonb_build_object(',
    },
    {
      name: 'a response with no expiry blanks the only input to the T-7 warning',
      file: 'apps/jobs/src/reconcile/store.ts',
      find: '              expires_at = coalesce($5::timestamptz, expires_at),',
      replace: '              expires_at = $5::timestamptz,',
    },
    {
      name: 'a publish against a dead account is retryable, so it retries forever',
      file: 'apps/jobs/src/publish/runPublishPost.ts',
      find: "    return { status: 'failed', classification: 'permanent', code, message, reconnectRequired }",
      replace:
        "    return { status: 'failed', classification: 'transient', code, message, reconnectRequired }",
    },
    {
      name: 'the resolver lets a publish through on an expired connection',
      file: 'apps/jobs/src/publish/tokens.ts',
      find: "    if (connection.status !== 'active') {",
      replace: '    if (false) {',
    },
  ],
}
