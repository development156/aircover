-- ─────────────────────────────────────────────────────────────────────────────
-- A4 · templates — saved starting points for a post
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT THIS IS FOR. A shop writes the same shapes of post over and over: the
-- weekly offer, the new-arrival photo, the festival greeting. A template is a
-- saved starting point so the writer begins from their own last good version
-- instead of a blank box.
--
-- IF THIS FILE IS WRONG: nothing breaks. No screen reads this table yet.
--
-- REVERSIBLE: yes, by `drop table public.templates`. That discards whatever
-- templates customers have saved, so it is reversible in structure and not in data.
--
-- APPLY ORDER: independent. Nothing in this batch depends on it.
--
--
-- ── THE ONE DECISION IN THIS FILE: WHOSE TEMPLATES ARE THESE? ────────────────
-- The choice was between templates that belong to one customer's workspace, and a
-- shared library that Sahoda ships to everybody. THIS FILE CHOOSES WORKSPACE-OWNED,
-- and the reason is not taste:
--
--   · Every table in this database carries a `workspace_id` and every security rule
--     is written as "you may see rows whose workspace is one of yours". A shared
--     row would have to leave that column empty — and an empty workspace does not
--     match "one of yours", so a shared template would be invisible to every
--     customer rather than visible to all of them. Making it work would mean a
--     second, different security rule on this one table, which is the kind of
--     exception that later gets copied onto a table where it leaks real data.
--
--   · A starter library does not need a table. It is a fixed list that ships with
--     the application and can be copied into a customer's own templates the moment
--     they use one — at which point it is theirs, editable, and covered by the
--     ordinary rules.
--
-- So: one customer's templates are private to that customer, full stop, and a
-- shared starter set is a code change rather than a schema change.


-- ── 1 of 3 ───────────────────────────────────────────────────────────────────
-- The table.
--
-- IF THIS IS WRONG: templates cannot be saved. Nothing else is affected — no post,
-- no publish, no credit.
create table templates (
  id uuid primary key default gen_random_uuid(),

  -- Whose it is. Deleting a workspace takes its templates with it.
  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- What the writer calls it, in a list. "Friday offer", "New arrival".
  name text not null check (length(trim(name)) > 0),

  -- Which channel it is written for, or empty for one that suits any of them.
  -- Empty is a real answer here, not a missing one: a greeting works everywhere.
  channel text check (channel is null or channel in ('x', 'gbp', 'linkedin', 'instagram')),

  -- The words. May be empty — a template can legitimately be a shape with the
  -- specifics left blank.
  body text not null default '',

  -- Anything channel-specific the template also remembers: suggested hashtags, a
  -- Google button type. Same free-form shape the post versions already use, so a
  -- template can be applied by copying rather than translating.
  extras jsonb,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Two templates with the same name in one workspace is a list nobody can read.
  -- Different workspaces may of course use the same names.
  unique (workspace_id, name)
);


-- ── 2 of 3 ───────────────────────────────────────────────────────────────────
-- The index the security rule needs. Without it, every read of this table scans
-- all of it for every customer.
--
-- IF THIS IS WRONG: nothing incorrect, only slower.
create index on templates (workspace_id);


-- ── 3 of 3 ───────────────────────────────────────────────────────────────────
-- Security, and the timestamp that keeps itself up to date.
--
-- Members of a workspace may create, read, change and delete their own templates —
-- full access, because a template is the customer's own writing and there is no
-- reason for the server to be the only one allowed to touch it. Every rule is
-- scoped to `workspace_id`, so one customer can never see another's.
--
-- IF THIS IS WRONG in the loose direction: one customer could read another's saved
-- writing. That is the failure worth checking twice before applying.
select app.apply_tenant_policies('templates');

create trigger set_updated_at before update on templates
  for each row execute function app.set_updated_at();
