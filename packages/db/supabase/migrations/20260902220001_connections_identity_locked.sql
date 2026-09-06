-- ─────────────────────────────────────────────────────────────────────────────
-- connections · a member may not rewrite WHICH account a connection is
--
-- ── THE HOLE ─────────────────────────────────────────────────────────────────
-- `conn_update` (20260718000005) lets any member UPDATE every column of their
-- workspace's `connections` rows, `external_account` included. Both publish-time
-- gates (`assert_account_in_workspace_profile`, `assert_account_for_scheduled_post`)
-- verify tenancy by RE-READING that same row: `external_account ->> 'id'` must
-- equal the candidate account and `->> 'profileId'` must equal the workspace's
-- Zernio profile. So a member of workspace A who learns workspace B's 24-hex
-- Zernio account id can PATCH /rest/v1/connections on their OWN row with
-- `{id: <B's account>, profileId: <A's profile>}`, and the gate approves it.
-- Zernio validates an accountId against the whole TEAM (doc 13 §3), so the
-- publisher then posts A's content to B's account with HTTP 200.
--
-- MEASURED 2026-09-02 in PGlite with the full migration set: the member UPDATE
-- affected 1 row and `assert_account_for_scheduled_post` RETURNED B's account id
-- instead of raising CROSS_TENANT_ACCOUNT.
--
-- ── THE GUARD ────────────────────────────────────────────────────────────────
-- A BEFORE UPDATE trigger that refuses any change to the identity columns
-- (`external_account`, `platform`, `workspace_id`) when the statement runs as a
-- PostgREST role (`anon`, `authenticated`). Nothing RLS-scoped in the product
-- writes these columns: the two sanctioned writers, `upsert_connection` and
-- `upsert_zernio_connection`, are SECURITY DEFINER, and inside a definer body
-- `current_user` is the function OWNER, not the caller, so they pass. The
-- reconcile sweep and the publisher connect with the postgres role and pass too.
--
-- Why `current_user` and not a GUC: a GUC set inside each RPC is one more thing
-- every future writer must remember, and a forgotten one fails OPEN if the
-- trigger is written "allow when set" or fails CLOSED on a legitimate writer
-- otherwise. The role is a fact Postgres maintains, a PostgREST caller cannot
-- change it, and it already distinguishes exactly the two classes of writer this
-- table has. Why a trigger and not a column-level GRANT: `grant all on all
-- tables` is what Supabase runs at project creation and what every harness
-- re-runs after the migrations, and it would silently re-widen a column grant.
--
-- `status`, `scopes`, `expires_at`, `last_checked_at` stay writable under the
-- existing policy: none of them is read by a tenancy gate.
--
-- ── THE PROOF ────────────────────────────────────────────────────────────────
-- packages/db/tests/connections_identity_locked.pglite.test.ts. Mutation: change
-- the role test below to `current_user in ('nobody')` and the member's rewrite is
-- accepted again, the gate returns B's account, and the suite goes red.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function app.connections_identity_locked() returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (
       new.external_account is distinct from old.external_account
       or new.platform is distinct from old.platform
       or new.workspace_id is distinct from old.workspace_id
     )
  then
    raise exception 'CONNECTION_IDENTITY_LOCKED' using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

comment on function app.connections_identity_locked() is
  'BEFORE UPDATE on connections: a PostgREST role (anon, authenticated) may not '
  'change external_account, platform or workspace_id. The publish gates verify '
  'tenancy by re-reading external_account, so a member-rewritten row would pass '
  'them. SECURITY DEFINER writers and the postgres role are unaffected: inside a '
  'definer body current_user is the owner.';

drop trigger if exists connections_identity_locked on connections;
create trigger connections_identity_locked
  before update on connections
  for each row execute function app.connections_identity_locked();
