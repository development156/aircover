/**
 * THE RULE: an audit row names something, and the rows that matter still get
 * written.
 *
 * Both directions, because either alone is a worse system than the defect. A fix
 * that simply stopped writing would delete the only record that a Clerk account
 * was bound to an admin seat.
 *
 *   node scripts/mutation-check.mjs mutations/ops-audit-flood.mjs
 */
const F =
  'packages/db/supabase/migrations/20260823020100_clerk_webhook_stops_flooding_the_audit_log.sql'
const RUN = { cwd: 'packages/db', command: 'pnpm vitest run tests/ops_audit_flood.pglite.test.ts' }

export default {
  mutants: [
    {
      ...RUN,
      name: 'the write is unconditional again — the flood, restored',
      file: F,
      find: '  if app_id is not null or seat_id is not null then',
      replace: '  if true then',
    },
    {
      ...RUN,
      name: 'nothing is ever written — a seat can be bound with no record of it',
      file: F,
      find: '  if app_id is not null or seat_id is not null then',
      replace: '  if false then',
    },
    {
      ...RUN,
      name: 'only an application counts, so binding an admin seat goes unrecorded',
      file: F,
      find: '  if app_id is not null or seat_id is not null then',
      replace: '  if app_id is not null then',
    },
    {
      ...RUN,
      name: 'the row goes back to naming the empty string',
      file: F,
      find: '            coalesce(app_id::text, seat_id::text),',
      replace: "            coalesce(app_id::text, ''),",
    },
  ],
}
