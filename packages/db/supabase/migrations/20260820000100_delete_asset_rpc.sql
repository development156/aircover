-- ─────────────────────────────────────────────────────────────────────────────
-- A5c · deleting a library file in ONE transaction, so the gate cannot be raced
-- ─────────────────────────────────────────────────────────────────────────────
--
-- THE HOLE THIS CLOSES. `deleteAsset` in apps/web did three things in three
-- round trips:
--
--   1. read where the file is used
--   2. delete the `post_media` rows for the posts that were unlocked in (1)
--   3. delete the `assets` row, which the trigger refuses if anything still locks it
--
-- Step 2 acts on the answer from step 1. If a post is SCHEDULED in between —
-- someone else in the workspace, or the same person in another tab — step 2 has
-- already removed that post's photo by the time step 3 asks whether it was
-- allowed to. The trigger added in 20260820000000 then finds nothing locking the
-- file and lets the delete through. The guard did its job on stale facts.
--
-- The window is milliseconds, and "milliseconds" is not an argument: the whole
-- reason the refusal was put in the database rather than in the server action is
-- that windows exist. This closes it by doing all three inside ONE transaction
-- and taking a row lock on the posts before deciding about them.
--
-- ── WHY `public` AND NOT `app` ──────────────────────────────────────────────
-- PostgREST exposes the `public` schema; `app` holds the helpers no client may
-- call. This one is called BY a client (the library screen's server action), so
-- it lives where `bootstrap_workspace` and `upsert_connection` live and follows
-- the same `grant execute … to authenticated` pattern.
--
-- ── WHY `security invoker` ──────────────────────────────────────────────────
-- Definer rights would make this function a way to delete any workspace's files.
-- Invoker rights mean every statement inside is subject to the same RLS the
-- caller already faces, so the function can do nothing the caller could not do
-- one statement at a time. It is not a privilege escalation; it is an ATOMICITY
-- wrapper, and that is all it is allowed to be.
--
-- ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
-- It does not decide whether the person WANTS the unlocked posts detached. That
-- is a question, it is asked on the screen before this is ever called, and
-- `p_detach` carries the answer. Called with `p_detach = false`, a file that any
-- post uses is refused — so a caller that forgets to ask cannot detach anything.
--
-- It does not remove the object from storage. Postgres cannot, and a transaction
-- that could would be a transaction that deletes a customer's file and then rolls
-- back the row pointing at it. The caller removes the object AFTER this commits,
-- using the path returned here.
--
-- IF THIS IS WRONG: the library's delete button stops working. Nothing existing
-- breaks — the trigger and the foreign key from 20260820000000 are untouched and
-- still refuse on their own.
--
-- REVERSIBLE: `drop function public.delete_asset(uuid, boolean);`
--
-- APPLY ORDER: after 20260820000000_asset_attachments.sql.


create or replace function public.delete_asset(p_asset_id uuid, p_detach boolean default false)
returns text
language plpgsql
-- INVOKER on purpose. See the header.
security invoker
set search_path = public, pg_temp
as $$
declare
  v_path text;
  v_locked int;
begin
  -- 1 · The file, under the caller's own RLS. `for update` holds it for the rest
  --     of the transaction so two concurrent deletes cannot both proceed.
  select a.storage_path into v_path
    from assets a
   where a.id = p_asset_id
     for update;

  if v_path is null then
    -- Not ours, or already gone. The two are deliberately indistinguishable:
    -- telling a caller that a file they cannot see EXISTS is a disclosure.
    raise exception 'That file is not in your library.'
      using errcode = 'no_data_found';
  end if;

  -- 2 · Lock every post that uses it, BEFORE reading their statuses.
  --
  -- This is the line that closes the race. A concurrent transaction moving one
  -- of these posts to `scheduled` now blocks until this one finishes, so the
  -- statuses read below cannot change underneath the decision made from them.
  perform 1
     from posts p
     join asset_usages u on u.post_id = p.id and u.workspace_id = p.workspace_id
    where u.asset_id = p_asset_id
      for update of p;

  -- 3 · How many of them may not lose the file. Same predicate as
  --     `app.assert_asset_not_in_use` and as `decideAssetDelete` in
  --     packages/shared — three statements of one rule, held together by
  --     `packages/db/tests/asset_delete_gate.pglite.test.ts`.
  select count(*) into v_locked
    from asset_usages u
    join posts p on p.id = u.post_id and p.workspace_id = u.workspace_id
   where u.asset_id = p_asset_id
     and (
       p.status in ('scheduled', 'publishing', 'published', 'partial')
       or exists (
         select 1 from post_variants v
          where v.post_id = p.id
            and v.workspace_id = p.workspace_id
            and v.publish_status in ('scheduled', 'publishing', 'published')
       )
     );

  -- Left to the trigger rather than raised here, so there is exactly ONE place
  -- the refusal sentence is composed. Falling through means the trigger fires on
  -- the delete below and names the posts.
  if v_locked = 0 and p_detach then
    -- 4 · Detach from the posts that are still being written. Every one of them
    --     was read under the lock taken in step 2.
    delete from post_media m
     where m.asset_id = p_asset_id;
  end if;

  -- 5 · The delete. The BEFORE DELETE trigger refuses if anything locks the file;
  --     the `on delete restrict` foreign key refuses if an attachment remains.
  delete from assets where id = p_asset_id;

  return v_path;
end;
$$;

revoke all on function public.delete_asset(uuid, boolean) from public;
grant execute on function public.delete_asset(uuid, boolean) to authenticated;

comment on function public.delete_asset(uuid, boolean) is
  'Deletes a library file and, when p_detach is true, its attachments to posts '
  'that are still being written — atomically, with the posts row-locked, so the '
  '"used in" decision cannot be raced by a concurrent schedule. Returns the '
  'storage path so the caller can remove the object after the commit. '
  'SECURITY INVOKER: it grants no access the caller did not already have.';
