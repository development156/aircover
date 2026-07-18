-- ─────────────────────────────────────────────────────────────────────────────
-- Phase-A · 09 · storage buckets + per-tenant policies
-- Private buckets; object path prefix = workspace_id. Access is gated by the
-- same membership helper as table RLS. Signed URLs are used for rendering.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('media', 'media', false), ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

-- Members may read/write objects only under their own workspace_id/ path prefix.
create policy tenant_media_read on storage.objects for select to authenticated
  using (
    bucket_id in ('media', 'brand-assets')
    and nullif((storage.foldername(name))[1], '')::uuid in (select app.member_workspace_ids())
  );

create policy tenant_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('media', 'brand-assets')
    and nullif((storage.foldername(name))[1], '')::uuid in (select app.member_workspace_ids())
  );

create policy tenant_media_update on storage.objects for update to authenticated
  using (
    bucket_id in ('media', 'brand-assets')
    and nullif((storage.foldername(name))[1], '')::uuid in (select app.member_workspace_ids())
  );

create policy tenant_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('media', 'brand-assets')
    and nullif((storage.foldername(name))[1], '')::uuid in (select app.member_workspace_ids())
  );
