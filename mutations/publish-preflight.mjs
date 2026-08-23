/**
 * THE RULE: the workspace a publish runs against is derived from the POST, never
 * taken from the caller — and when the derivation refuses, the adapter is never
 * reached at all.
 *
 * These guards were already written and already green. That is exactly when a
 * mutation run is worth the most: a suite nobody has tried to break is a suite
 * nobody knows the strength of. Every mutant below is a plausible edit, not a
 * vandalism — the kind a lane makes while adding a channel.
 *
 *   node scripts/mutation-check.mjs mutations/publish-preflight.mjs
 *
 * ── ONE MUTANT WAS REMOVED, AND IT DID SURVIVE ──────────────────────────────
 * "the variant no longer has to belong to this workspace" — deleting
 * `and v.workspace_id = v_ws_id` — passed every test. It is an EQUIVALENT mutant:
 * `post_variants` carries `foreign key (post_id, workspace_id) references
 * posts (id, workspace_id)`, so the pairing it guards against cannot be stored in
 * the first place. That is now MEASURED rather than argued —
 * `cross_tenant_publish.pglite.test.ts` tries the insert and asserts the database
 * refuses it — and the day a migration drops that FK, that test goes red and this
 * mutant becomes worth restoring.
 */
const LIVE = 'packages/db/supabase/migrations/20260804010000_zernio_all_channels.sql'
const DB = {
  cwd: 'packages/db',
  command: 'pnpm vitest run tests/cross_tenant_publish.pglite.test.ts',
}

export default {
  mutants: [
    {
      ...DB,
      name: 'the account id is looked up before it is validated',
      file: LIVE,
      find: "  if p_account_id is null or p_account_id !~ '^[0-9a-f]{24}$' then",
      replace: '  if p_account_id is null then',
    },
    {
      ...DB,
      name: 'the connection lookup drops its workspace filter — the cross-tenant read',
      file: LIVE,
      find: '  where c.workspace_id                     = v_ws_id',
      replace: '  where (c.workspace_id                    = v_ws_id or true)',
    },
    {
      ...DB,
      // WIDENED rather than disabled, and the reason is worth keeping: replacing
      // the condition with `if false` deleted the literal `'approved'` from the
      // installed definition, and this suite's beforeAll asserts that literal is
      // present (it guards against a silent revert to the older function). The
      // whole suite then errored in beforeAll and ran ZERO assertions — which the
      // harness now refuses to score, rather than counting the non-zero exit as a
      // kill. A mutant has to leave the fixture able to boot.
      name: 'a draft post becomes publishable — a replayed or reverted job goes out',
      file: LIVE,
      find: "  if v_status not in ('approved', 'scheduled', 'publishing') then",
      replace: "  if v_status not in ('approved', 'scheduled', 'publishing', 'draft') then",
    },
    {
      cwd: 'apps/jobs',
      command: 'pnpm vitest run src/publish/runPublishPost.test.ts',
      name: 'a pre-flight refusal no longer stops the run before the adapter',
      file: 'apps/jobs/src/publish/runPublishPost.ts',
      find: "    return fail(preflightCodeOf(e) ?? 'CONNECTION_UNAVAILABLE', messageOf(e), null)",
      replace: '    void e // MUTANT: fall through to the adapter',
    },
  ],
}
