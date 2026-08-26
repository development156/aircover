-- ─────────────────────────────────────────────────────────────────────────────
-- THE MARKETING BRAIN · 1 of 1 · marketing_observations
--
-- One table. It holds what Sahoda has NOTICED about a workspace's own marketing:
-- typed, evidenced, computed, never written by a person and never shown to one
-- as something they can edit.
--
-- ── WHY A SECOND BRAIN AND NOT FIFTEEN MORE BRAND FIELDS ─────────────────────
-- docs/51 is the decision record. The short form: the Brand Brain holds what a
-- founder SAYS their brand is, and every leaf of it is a sentence a person wrote
-- or approved. This table holds what the numbers say their marketing IS doing,
-- and no person wrote any of it. Put a computed fact in a founder's field and a
-- weekly job can silently overwrite the founder's own voice; the two need
-- different lifetimes, different permissions and different arbitration, so they
-- get different tables. An observation reaches the Brand Brain only as a
-- PROPOSAL through `propose_memory_event`, which requires a human click.
--
-- ── WHY IT IS APPEND-ONLY-ISH AND KEYED BY DAY ───────────────────────────────
-- Recomputing a week must not append a second copy of the same finding, or the
-- report grows a duplicate every time the cron retries. The unique key below
-- makes a re-run an UPDATE of one row. It is (workspace, kind, subject, day)
-- rather than (workspace, kind, day) because one kind can hold several subjects
-- at once — tone drift on exclamation marks is a different finding from tone
-- drift on sentence length, computed on the same Sunday.
--
-- ── EVIDENCE IS NOT NULLABLE, AND THE CHECK IS THE REASON ────────────────────
-- The product's whole claim against an agency is "here is where this came from".
-- A row with no arithmetic behind it is an assertion, which is the thing an
-- agency already does better. The check refuses `{}` at the database, not in a
-- zod schema an app-side caller could route around.
-- ─────────────────────────────────────────────────────────────────────────────

create table marketing_observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- The closed set from packages/shared/src/brain/observations.ts. Kept in step
  -- with it by `check-constraints.test.ts`, which reads both.
  kind text not null check (kind in ('tone_drift')),

  -- What the observation is about, in machine terms. Part of the identity key.
  subject text not null check (length(btrim(subject)) between 1 and 80),

  -- The finding as one sentence. COMPUTED, never phrased by a model: see the
  -- comment at the foot of this file for why that is a security property and not
  -- a style preference.
  claim text not null check (length(btrim(claim)) between 1 and 240),

  -- The arithmetic. `data` is the numbers with their labels, `postIds` the rows
  -- they came from, `windowDays` the span. Shape enforced in shared; the check
  -- here refuses only the empty object, which is the failure that matters.
  evidence jsonb not null check (evidence ? 'data' and evidence ? 'postIds'),

  -- The day the computation ran, not the day the data covers. A cron that runs
  -- late still writes the day it ran, so a gap in this column is a gap in the
  -- schedule and reads as one.
  computed_on date not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Recompute updates; it never duplicates.
  unique (workspace_id, kind, subject, computed_on)
);

create index on marketing_observations (workspace_id, computed_on desc);

-- ── SECURITY ─────────────────────────────────────────────────────────────────
-- Members of the workspace may READ their own observations. Nobody may write
-- from a client, ever: every row here is arithmetic over the customer's own
-- data, and a customer able to insert one could put a fabricated "Sahoda
-- noticed" sentence in front of their own team — or, with a wrong workspace id,
-- in front of somebody else's.
--
-- There are no insert, update or delete policies below. That is not an
-- omission. With RLS enabled and no policy for a command, the command is denied
-- to `authenticated` no matter what the client sends; the weekly job writes over
-- the service role, which bypasses RLS. `marketing_observations_anon.pglite.test.ts`
-- proves both halves by trying them.
alter table marketing_observations enable row level security;

create policy t_select on marketing_observations for select to authenticated
  using (workspace_id in (select app.member_workspace_ids()));

-- ── AND THE OPERATOR CAN LOOK ────────────────────────────────────────────────
-- A store nobody can inspect is a store nobody can debug, and this one is
-- HIDDEN from customers by design: there is no /brain page listing it, so the
-- only window onto "what has the Marketing Brain actually written" is /admin.
-- Without this policy that window shows an operator their own workspace and
-- nothing else, which is exactly how `post_publish_logs` came to hold seven
-- failed publishes visible to nobody (migration 20260822160000).
--
-- `app.is_ops_admin()` is SECURITY DEFINER over `ops_admins` and false for every
-- caller who is not in it, so this widens nothing for a customer. Two permissive
-- SELECT policies OR together: a member still sees their own rows through
-- `t_select`, an operator sees all of them through this one.
create policy ops_select on marketing_observations
  for select
  to authenticated
  using (app.is_ops_admin());

comment on table marketing_observations is
  'The Marketing Brain. Computed observations about a workspace''s own marketing. '
  'Written only by the weekly job over the service role; read-only to members; '
  'never edited by a person. Reaches the Brand Brain only via propose_memory_event.';

comment on column marketing_observations.claim is
  'Computed, never generated. The sentence is assembled by arithmetic in '
  'lib/brain/observe, which imports no mesh and holds no model port, so there is '
  'no path by which this column states something no row supports. A model-phrased '
  'claim about a customer''s own business is the one fabrication this product '
  'cannot detect after the fact, because it reads exactly like a true one.';
