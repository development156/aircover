-- ─────────────────────────────────────────────────────────────────────────────
-- THE MARKETING BRAIN · marketing_pass_runs — the record of having LOOKED.
--
-- `marketing_observations` holds what the brain found. This holds the far more
-- common case: it looked, and it had nothing to say, and here is why per kind.
--
-- ── THE PROBLEM THIS EXISTS TO CLOSE ─────────────────────────────────────────
-- The weekly pass already computes a reason for every workspace that produces
-- nothing — `too_few_posts`, `window_too_short`, `no_metrics`, and eighteen
-- others across five computers. It counts them into an HTTP response and throws
-- the response away. So a customer with an empty report cannot tell a product
-- that is working and waiting from a cron that stopped in March, and neither
-- can an operator. docs/55 step 10.
--
-- ── WHY A TABLE AND NOT AN UPSTASH KEY ───────────────────────────────────────
-- `lib/cron/heartbeat-store.ts` puts "did this job run" in Redis and its
-- reasoning is correct for that question: one number per job, overwritten
-- forever, never read historically. This question is the opposite on all three
-- counts. It is per workspace, it is per week, and its whole value is the
-- history — docs/55: the record of not knowing is the asset a competitor
-- starting today cannot copy, and the only way to ever tell a customer that
-- Sahoda has been watching since March and first had enough to speak in June.
-- A key with a 30-day TTL cannot hold that.
--
-- ── ONE ROW PER WORKSPACE PER PASS, AND A THROW WRITES NOTHING ───────────────
-- The unique key makes a re-run of the same Sunday an UPDATE, exactly as
-- `marketing_observations` does and for the same reason: a retried cron must not
-- grow duplicates. A workspace whose pass THREW writes no row at all, which is
-- deliberate and is enforced in the runner rather than here: "we could not look"
-- and "we looked and were waiting" are different facts, and recording the first
-- as the second would let a broken reader read on screen as patience.
-- ─────────────────────────────────────────────────────────────────────────────

create table marketing_pass_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- The day the pass ran, not the day the data covers. Same convention as
  -- `marketing_observations.computed_on`, so a gap in this column is a gap in
  -- the schedule and reads as one.
  computed_on date not null,

  -- `{ "<kind>": "<reason>" }` — one entry per computer that produced nothing.
  -- An object and not an array so a kind cannot appear twice with two verdicts,
  -- which is a state no pass can produce and no screen could render.
  --
  -- The check refuses a JSON scalar or array. It deliberately does NOT enumerate
  -- the reasons: those live beside the computers that emit them, five files that
  -- change independently, and a CHECK listing them would turn every new decline
  -- reason into a migration — the cost that `kind` pays on purpose because a
  -- wrong kind is a wrong CLAIM, and a wrong reason is only a wrong silence.
  declines jsonb not null default '{}'::jsonb
    check (jsonb_typeof(declines) = 'object'),

  -- How many observations this workspace produced in this pass. Zero is the
  -- normal case and is a real measurement, not an absence: with it, `declines`
  -- can be read as the complete account of the pass.
  written integer not null default 0 check (written >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Re-running a Sunday updates; it never duplicates.
  unique (workspace_id, computed_on)
);

create index on marketing_pass_runs (workspace_id, computed_on desc);

-- ── SECURITY ─────────────────────────────────────────────────────────────────
-- Identical to `marketing_observations`, and for the same reasons in the same
-- order. Members read their own rows. Nobody writes from a client: a customer
-- able to insert here could fabricate a record of Sahoda having examined their
-- workspace on a day it never ran, which is a lie about the product's own
-- diligence rendered in the product's own voice.
--
-- There are no insert, update or delete policies below and that is not an
-- omission: with RLS on and no policy for a command, the command is denied to
-- `authenticated`. The weekly pass writes over the service role, which bypasses
-- RLS. `marketing_pass_runs.pglite.test.ts` proves both halves by attempting
-- them rather than assuming them.
alter table marketing_pass_runs enable row level security;

create policy t_select on marketing_pass_runs for select to authenticated
  using (workspace_id in (select app.member_workspace_ids()));

-- The operator window, for the reason migration 20260825000000 gives: this store
-- is hidden from customers by design, so /admin is the only place anyone can see
-- what the pass actually did. Two permissive SELECT policies OR together.
create policy ops_select on marketing_pass_runs
  for select
  to authenticated
  using (app.is_ops_admin());

comment on table marketing_pass_runs is
  'One row per workspace per weekly Marketing Brain pass: when it looked, what '
  'it wrote, and why each computer produced nothing. Written only by the weekly '
  'job over the service role; read-only to members. A pass that THREW writes no '
  'row, so a missing row means "we could not look" and never "we were waiting".';

comment on column marketing_pass_runs.declines is
  'Kind to reason, for the computers that produced nothing this pass. The reason '
  'is what the screen turns into a sentence, so that an empty report can say '
  'what it is waiting for instead of saying nothing twice.';
