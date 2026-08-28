-- ─────────────────────────────────────────────────────────────────────────────
-- The workspace profile goes when the workspace is erased
-- ─────────────────────────────────────────────────────────────────────────────
--
-- THE SECOND HALF OF 20260826200000. Split off because it needs
-- `workspaces.deleted_at`, which `20260823000000_dpdp_erasure` adds and which
-- MEASURED 2026-08-26 is NOT present in production: `dpdp_erasure` is in this
-- repository and has never been applied. This file therefore CANNOT be applied
-- before that one, and `create trigger ... update of deleted_at` says so by
-- failing rather than by silently doing nothing.
--
-- APPLY ORDER: after 20260823000000_dpdp_erasure and after 20260826200000.
--
-- REVERSIBLE: yes.
--   drop trigger if exists workspaces_clear_profile_on_erase on public.workspaces;
--   drop function if exists public.clear_workspace_profile_on_erase();
--
-- RLS: no new table and no new policy.

--
-- WHY THIS IS NOT OPTIONAL. `public.erase_workspace` (20260823000000, step 8)
-- redacts `name`, `slug`, `created_by` and blanks `settings`. The one workspace
-- that holds a timezone today holds it INSIDE `settings`, so today that value
-- is erased. 20260826200000 copies it into a column, and without this file the
-- copy would survive an erasure the original did not — a deletion promise
-- quietly weakened by a migration that was not about deletion at all.
--
-- WHY A TRIGGER AND NOT AN EDIT TO `erase_workspace`. That function belongs to
-- another lane's migration, which this one does not edit, and replacing it
-- would mean
-- restating roughly 150 lines that walk 47 foreign keys and guard the financial
-- record. Restating that to add four assignments is the larger risk by a wide
-- margin. This fires on the same UPDATE, inside the same transaction.
--
-- `deleted_at` going from NULL to set is the erasure and happens once. A row
-- already erased does not re-enter this, and no ordinary workspace update
-- reaches it.

create or replace function public.clear_workspace_profile_on_erase()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.timezone       := null;
    new.business_model := null;
    new.regime         := null;
    new.locale         := null;
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_clear_profile_on_erase on public.workspaces;
create trigger workspaces_clear_profile_on_erase
  before update of deleted_at on public.workspaces
  for each row
  execute function public.clear_workspace_profile_on_erase();

