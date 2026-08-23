/**
 * THE RULE: the last-owner guard counts owners WHO CAN SIGN IN, in the database
 * and on the screen, and the two agree.
 *
 * Every mutant restores the shipped behaviour exactly. The first is the live
 * defect: production reported 5 active owners while 4 people could sign in.
 *
 *   node scripts/mutation-check.mjs mutations/ops-last-owner.mjs
 */
export default {
  mutants: [
    {
      name: 'the database counts unlinked seats as owners — the live defect',
      cwd: 'packages/db',
      command: 'pnpm vitest run tests/ops_last_owner.pglite.test.ts',
      file: 'packages/db/supabase/migrations/20260823020000_ops_owner_count_requires_a_linked_user.sql',
      find: '     and user_id is not null;\n$$;',
      replace: '     ;\n$$;',
    },
    {
      name: 'revoke stops exempting a seat that grants nobody anything',
      cwd: 'packages/db',
      command: 'pnpm vitest run tests/ops_last_owner.pglite.test.ts',
      file: 'packages/db/supabase/migrations/20260823020000_ops_owner_count_requires_a_linked_user.sql',
      find: "  if seat.role = 'owner' and seat.status = 'active'\n     and seat.user_id is not null\n     and app.ops_active_owner_count() <= 1 then",
      replace:
        "  if seat.role = 'owner' and seat.status = 'active'\n     and app.ops_active_owner_count() <= 1 then",
    },
    {
      name: 'set_role stops exempting a seat that grants nobody anything',
      cwd: 'packages/db',
      command: 'pnpm vitest run tests/ops_last_owner.pglite.test.ts',
      file: 'packages/db/supabase/migrations/20260823020000_ops_owner_count_requires_a_linked_user.sql',
      find: "  if seat.role = 'owner' and p_role <> 'owner' and seat.status = 'active'\n     and seat.user_id is not null",
      replace: "  if seat.role = 'owner' and p_role <> 'owner' and seat.status = 'active'",
    },
    {
      name: 'the screen counts unlinked seats as owners again',
      cwd: 'apps/web',
      command: 'pnpm vitest run src/components/admin/team-view.test.tsx',
      file: 'apps/web/src/components/admin/team-view.tsx',
      find: "admin.status === 'active' && admin.role === 'owner' && admin.user_id !== null,",
      replace: "admin.status === 'active' && admin.role === 'owner',",
    },
    {
      name: 'the row-level last-owner test drops the user_id clause',
      cwd: 'apps/web',
      command: 'pnpm vitest run src/components/admin/team-view.test.tsx',
      file: 'apps/web/src/components/admin/team-view.tsx',
      find: "                  admin.status === 'active' &&\n                  admin.user_id !== null &&",
      replace: "                  admin.status === 'active' &&",
    },
    {
      name: 'the unlinked seat is no longer labelled as unable to sign in',
      cwd: 'apps/web',
      command: 'pnpm vitest run src/components/admin/team-view.test.tsx',
      file: 'apps/web/src/components/admin/team-view.tsx',
      find: "{admin.user_id === null && admin.status === 'active' ? (",
      replace: '{false ? (',
    },
  ],
}
