-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Ops · 15 · categorise every ops_* write, and close one stray grant
--
-- `app.ops_human_write_functions()` backed a guard asserting that NOTHING on the
-- human write path may read ops_credit_requests, credit_ledger or
-- credit_balances, or call app.apply_ledger_entry. That was true when the human
-- write path was the board. Migration 14 added the maker-checker grant, which
-- reaches the ledger ON PURPOSE — so the guard's premise, not the guard, is what
-- needed changing.
--
-- Absorbing the credit functions into the same list would have silently weakened
-- the assertion for all fourteen. Instead there are two lists, and the test
-- requires every public ops_* function to appear in exactly one of them:
--
--   ops_human_write_functions()  MUST NOT reach credits — still asserted against
--                                pg_get_functiondef(), unchanged in strength
--   ops_credit_functions()       MAY reach the ledger, and is deliberately tiny
--                                and enumerated, so adding a fourth is a diff
--                                somebody has to justify
--
-- Nothing escapes categorisation, which is what the original guard was for.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function app.ops_human_write_functions() returns text[]
language sql
immutable
as $$
  select array[
    -- board (migration 13)
    'ops_task_move', 'ops_task_edit', 'ops_task_create',
    'ops_task_archive', 'ops_changelog_mark_copied',
    -- QA composer (migration 14)
    'ops_qa_draft_save', 'ops_qa_finalize', 'ops_qa_artifact_add', 'ops_qa_import',
    -- applications (migration 14)
    'ops_application_submit', 'ops_application_set_status', 'ops_application_link_user',
    -- team and roles (migration 14)
    'ops_admin_upsert', 'ops_admin_set_role', 'ops_admin_revoke'
  ];
$$;

/**
 * Everything permitted to TOUCH a credit table at all, reads included.
 *
 * ops_workspace_search only reads credit_balances, to show a current balance in
 * the picker — but it belongs here rather than in the list above, because the
 * assertion on that list is "does not mention credit tables anywhere" and
 * softening it to allow reads would weaken it for all fifteen. A short,
 * enumerated list is the point: a fifth entry is a diff somebody has to justify.
 */
create or replace function app.ops_credit_functions() returns text[]
language sql
immutable
as $$
  select array[
    'ops_credit_request_create',
    'ops_credit_request_verify',
    'ops_credit_request_deny',
    'ops_workspace_search'
  ];
$$;

revoke all on function app.ops_human_write_functions() from public, anon;
grant execute on function app.ops_human_write_functions() to authenticated;
revoke all on function app.ops_credit_functions() from public, anon;
grant execute on function app.ops_credit_functions() to authenticated;

-- Found by verifying the grant matrix after migration 14 rather than trusting
-- the push: this helper was created without an explicit grant and so kept
-- Postgres' default PUBLIC EXECUTE, unlike every sibling in the `app` schema.
-- Unreachable in practice — `app` is not exposed to PostgREST — but the whole
-- point of that schema is that its contents are not callable by a client, and
-- one member quietly opting out of that is how the rule stops being true.
revoke all on function app.ops_active_owner_count() from public, anon;
grant execute on function app.ops_active_owner_count() to authenticated;
