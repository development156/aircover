-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Ops · 12 · qa-artifacts bucket (doc 13 §3, §16)
--
-- Private bucket for QA screenshots, path qa/{run_id}/{uuid}.{ext}. Unlike the
-- media/brand-assets buckets in migration 09, this one is platform-scope: there
-- is no workspace_id in the object path to key on, so the predicate is
-- app.is_ops_admin() instead of the folder-prefix membership cast.
--
-- The size and mime limits are declared on the bucket as well as checked in the
-- upload action, because a limit that only exists in application code is a limit
-- that disappears the first time someone calls storage directly.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qa-artifacts',
  'qa-artifacts',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy ops_qa_artifacts_read on storage.objects for select to authenticated
  using (bucket_id = 'qa-artifacts' and app.is_ops_admin());

create policy ops_qa_artifacts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'qa-artifacts' and app.is_ops_admin());

create policy ops_qa_artifacts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'qa-artifacts' and app.is_ops_admin());
