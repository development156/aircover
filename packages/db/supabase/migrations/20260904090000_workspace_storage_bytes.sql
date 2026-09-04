-- Workspace storage usage: one number, computed, never stored.
--
-- WHAT THIS FILE DOES. Adds `public.workspace_storage_bytes(uuid)`, which returns
-- the total bytes one workspace is holding across every bucket it can write to.
-- It is the read behind the Storage panel in Settings and behind the pre-upload
-- refusal in the three upload actions.
--
-- WHY A FUNCTION AND NOT A COLUMN. A `workspaces.storage_bytes_used` counter has
-- to be kept in step by triggers on four tables across insert AND delete, it drifts
-- silently the first time one is missed, and it needs a backfill before it means
-- anything. The sum below needs none of that: every writer in the application has
-- recorded the byte count on the same request since each table was created, so the
-- number is exact from the first call. Store the LIMIT (it lives in
-- `packages/shared/src/billing/storage.ts`); compute the USAGE.
--
-- WHY FOUR SUMS AND NOT ONE VIEW OVER ALL ROWS. Two of these tables hold rows that
-- point at bytes another table already counted, and a naive union double-counts
-- them:
--
--   * `post_media` with `asset_id is not null` is a library asset ATTACHED to a
--     post, or a crop attached to one. The object is not copied — `assets.ts`
--     says so in capitals — so the bytes are already in `assets` or
--     `asset_derivatives`. Only `asset_id is null` is a direct upload.
--   * `knowledge_documents` with `storage_path is null` is the url or text door.
--     Nothing was stored, and `bytes` there describes text we hold in a column.
--
-- WHY TRASHED ASSETS COUNT. `assets.deleted_at` is a tombstone; the object stays
-- in the bucket ("The bytes are untouched either way", 20260827090000). A quota
-- that ignored the trash would tell someone holding 900 MB of trashed files that
-- they were empty, and then refuse their next upload for no reason they can see.
-- The Settings panel names the trash for this reason.
--
-- WHICH DIRECTION THE ERROR POINTS. Every delete path in the application removes
-- the ROW first and the object second, best effort. So an object whose removal
-- failed stops being counted while it still occupies the bucket: this function can
-- under-report, never over-report. A customer is never locked out for bytes they
-- cannot see, which is the right way round for the mistake to fall.
--
-- SECURITY. `security definer`, because the sum has to read four tables and a
-- member may hold no direct select on a future one. Membership is therefore checked
-- FIRST and explicitly, against the same `workspace_members` predicate
-- `app.apply_tenant_policies` uses. `search_path` is pinned: a definer function with
-- a mutable search_path is the exposure `schema_drift.pglite.test.ts` already flags
-- on `charge_if_affordable`, and this one is not going to repeat it.
--
-- NOT APPLIED. `supabase db push` is a founder action (CLAUDE.md). Until this runs,
-- `readStorageUsage` in apps/web catches Postgres 42883 (undefined_function) and
-- reports that the figure is unavailable — it never reports zero, because "we could
-- not read your usage" and "you have used nothing" are different claims.

create or replace function public.workspace_storage_bytes(p_workspace_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_total bigint;
begin
  -- The caller must be a member. Not a convenience: this function reads past RLS,
  -- so this predicate IS the tenant boundary for it.
  if not exists (
    select 1
      from workspace_members
     where workspace_id = p_workspace_id
       and user_id = auth.jwt() ->> 'sub'
  ) then
    raise exception 'not a member of this workspace'
      using errcode = '42501';
  end if;

  select
      coalesce((select sum(a.bytes) from assets a
                 where a.workspace_id = p_workspace_id), 0)
    + coalesce((select sum(d.bytes) from asset_derivatives d
                 where d.workspace_id = p_workspace_id), 0)
    + coalesce((select sum(m.bytes) from post_media m
                 where m.workspace_id = p_workspace_id
                   and m.asset_id is null), 0)
    + coalesce((select sum(k.bytes) from knowledge_documents k
                 where k.workspace_id = p_workspace_id
                   and k.storage_path is not null), 0)
  into v_total;

  return coalesce(v_total, 0);
end;
$$;

comment on function public.workspace_storage_bytes(uuid) is
  'Total bytes one workspace holds in storage. Counts trashed assets, because trashing removes no bytes. Excludes post_media rows that point at an asset and knowledge rows with no stored file, both of which would double-count.';

revoke all on function public.workspace_storage_bytes(uuid) from public;
grant execute on function public.workspace_storage_bytes(uuid) to authenticated;
