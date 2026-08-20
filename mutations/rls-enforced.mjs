/**
 * IS THE NEW RLS SUITE ACTUALLY ENFORCING ANYTHING?
 *
 * `rls_tenant_isolation.pglite.test.ts` claims to prove tenant isolation against
 * a real Postgres. Every way that claim could be hollow is a mutant here, and
 * each one has a precise failure mode that green output would not distinguish:
 *
 *   · the role never drops       → every policy is inert, all 30 tables "pass"
 *   · a policy is missing        → the table is wide open, and a suite that only
 *                                  asserts "I can see my own rows" would agree
 *   · the GRANTs are absent      → every read is `permission denied`, which
 *                                  looks exactly like perfect isolation
 *   · the policy is widened      → the classic cross-tenant leak
 *
 * NOTHING HERE EDITS A MIGRATION. Every mutant lands in the test helper, so a
 * crashed run can never leave `packages/db/supabase/migrations` modified — those
 * files are applied and immutable, and only wt-db may touch them.
 */
const RUN = 'pnpm --filter @sahoda/db exec vitest run tests/rls_tenant_isolation.pglite.test.ts'

export default {
  cwd: '.',
  command: RUN,
  mutants: [
    {
      name: 'the role never drops — every policy is inert',
      file: 'packages/db/tests/helpers/pglite-tenant.ts',
      find: '    await db.exec(`set local role ${role}`)',
      replace: '    void role // MUTANT: stay superuser',
    },
    {
      name: 'anon and authenticated are granted nothing — denial masquerading as isolation',
      file: 'packages/db/tests/helpers/pglite-tenant.ts',
      find: '  await db.exec(SUPABASE_GRANTS)\n  return db',
      replace: '  void SUPABASE_GRANTS // MUTANT: no table privileges at all\n  return db',
    },
    {
      name: 'posts loses its tenant SELECT policy — the table denies its own owner',
      file: 'packages/db/tests/helpers/pglite-tenant.ts',
      find: '  await db.exec(SUPABASE_GRANTS)\n  return db',
      replace:
        '  await db.exec(SUPABASE_GRANTS)\n  await db.exec(`drop policy t_select on posts`) // MUTANT\n  return db',
    },
    {
      name: 'posts is readable by every signed-in user — a cross-tenant leak',
      file: 'packages/db/tests/helpers/pglite-tenant.ts',
      find: '  await db.exec(SUPABASE_GRANTS)\n  return db',
      replace:
        '  await db.exec(SUPABASE_GRANTS)\n' +
        '  await db.exec(`drop policy t_select on posts;\n' +
        '    create policy t_select on posts for select to authenticated using (true)`) // MUTANT\n' +
        '  return db',
    },
    {
      name: 'membership resolves to EVERY workspace — the leak one function down',
      file: 'packages/db/tests/helpers/pglite-tenant.ts',
      find: '  await db.exec(SUPABASE_GRANTS)\n  return db',
      replace:
        '  await db.exec(SUPABASE_GRANTS)\n' +
        '  await db.exec(`create or replace function app.member_workspace_ids() returns setof uuid\n' +
        '    language sql stable security definer set search_path = public as $m$\n' +
        '      select id from workspaces $m$`) // MUTANT\n' +
        '  return db',
    },
    {
      // Replaces an earlier mutant that added a default value to `asRole`'s
      // `role` parameter. It SURVIVED, and correctly: every call site passes the
      // role explicitly, so the default is unreachable and the code was never
      // broken — an equivalent mutant, not a hole. This one breaks something
      // real: a table readable by the signed-out role.
      name: 'posts is readable by anon — the signed-out reader walks in',
      file: 'packages/db/tests/helpers/pglite-tenant.ts',
      find: '  await db.exec(SUPABASE_GRANTS)\n  return db',
      replace:
        '  await db.exec(SUPABASE_GRANTS)\n' +
        '  await db.exec(`create policy anon_read on posts for select to anon using (true)`) // MUTANT\n' +
        '  return db',
    },
  ],
}
