-- loop_autopilot_log — every unattended attempt, written BEFORE it is made ----
--
-- ── WHY THIS TABLE EXISTS AT ALL ─────────────────────────────────────────────
-- Autopilot is the one path where nobody was watching. An event nobody logged
-- and nobody saw is undetectable afterwards: the post is on the platform, the
-- customer did not write it, and there is no record of what decided to.
--
-- Written BEFORE dispatch, not after. A row written after a successful publish
-- records the successes and loses exactly the events worth having — the crash
-- mid-dispatch, the refusal, the attempt that timed out somewhere unknown. The
-- decision is the thing being logged, and the decision happens first.
--
-- ── EVERY ROW NAMES WHAT IT ACTED ON, AND THAT IS A CONSTRAINT ───────────────
-- MEASURED against production 2026-08-28: `ops_audit_log` holds 17,556 rows and
-- 16,915 of them — 96.3% — have an empty `target_id`. It is a log of the fact
-- that something happened, which is the same information as no log.
--
-- That happened because naming the target was a convention. Here it is NOT
-- NULL with a CHECK, on every column that identifies the act: the post, the
-- variant, the channel, and the account it would have gone to. A row that
-- cannot say what it acted on cannot be written.
--
-- ── APPEND-ONLY, LIKE THE LEDGER ────────────────────────────────────────────
-- `app.block_mutations` refuses UPDATE and DELETE even to service_role, and
-- allows cascaded deletes so a workspace can still be offboarded. A cancellation
-- is a NEW ROW, never an edit to the announcement: the fact that a post was
-- going out at 09:00 stays true after somebody stops it, and an audit trail that
-- rewrites its own history is not one.

create table loop_autopilot_log (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- ── WHAT IT ACTED ON. All four NOT NULL, deliberately. ───────────────────
  -- No FK on post_id/variant_id: this row must outlive the post it describes.
  -- A deleted post is precisely the case where somebody is asking "what went out
  -- and who decided", and a cascade would erase the answer with the question.
  post_id    uuid not null,
  variant_id uuid not null,
  channel    text not null check (channel in ('x','gbp','linkedin','instagram','facebook','telegram')),

  -- The account it would publish to, as `assert_account_for_scheduled_post`
  -- spells it. Non-empty by CHECK: '' is the value that made ops_audit_log
  -- useless, and a default of '' is how it got there.
  account_id text not null check (length(trim(account_id)) > 0),

  -- The brief the post came from. NULLABLE and it is the only nullable
  -- identifier here: a post can reach autopilot without a brief behind it (a
  -- person wrote it, set the channel to L3 and let the schedule take it), and a
  -- NOT NULL here would either refuse that row or invite a fake uuid in it.
  brief_id uuid references loop_briefs (id) on delete set null,
  cycle_id uuid references loop_cycles (id) on delete set null,

  -- ── WHAT WAS DECIDED, AND WHY ────────────────────────────────────────────
  -- 'announced' is written when the cancel window opens; 'dispatched' when the
  -- window closed and the post was handed to the publish path; 'refused' when a
  -- guardrail stopped it; 'cancelled' when a person stopped it in the window.
  --
  -- 'dispatched' does NOT mean published. The publish path has its own log
  -- (`post_publish_logs`) and its own failures, and claiming a platform outcome
  -- this table never observed is the kind of confident wrong answer this
  -- codebase keeps finding.
  decision text not null check (decision in ('announced','dispatched','refused','cancelled')),

  -- Which guardrail refused, by name, when one did. NULL for the other three.
  -- The names come from `AUTOPILOT_REFUSALS` in
  -- apps/web/src/lib/loop/autopilot-refusals.ts and a test adjudicates the two
  -- lists against each other.
  refusal_reason text,

  -- ── THE CANCEL WINDOW, AS STORED FACTS ───────────────────────────────────
  -- `dispatch_after` is when the window closes. A dispatcher that publishes
  -- before it has published inside somebody's cancel window, and the row is what
  -- proves which happened.
  announced_at   timestamptz not null default now(),
  dispatch_after timestamptz,

  actor text not null default 'autopilot',
  meta  jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  -- An announcement without a window is a post with no way to stop it.
  constraint autopilot_announced_has_window
    check (decision <> 'announced' or dispatch_after is not null),
  -- A refusal that does not say which guardrail refused is the ops_audit_log
  -- defect wearing a different column name.
  constraint autopilot_refusal_has_reason
    check (decision <> 'refused' or (refusal_reason is not null and length(trim(refusal_reason)) > 0))
);

create index loop_autopilot_log_workspace_id_idx on loop_autopilot_log (workspace_id, created_at desc);
create index loop_autopilot_log_post_idx on loop_autopilot_log (workspace_id, post_id, variant_id);
-- The dispatcher's own question: what is announced, not yet cancelled, and due?
create index loop_autopilot_log_pending on loop_autopilot_log (dispatch_after)
  where decision = 'announced';

select app.apply_tenant_read_policy('loop_autopilot_log');

create trigger block_mutations before update or delete on loop_autopilot_log
  for each row execute function app.block_mutations();

comment on table loop_autopilot_log is
  'Every unattended publish attempt, written before dispatch. Append-only: a cancellation is a new row, never an edit to the announcement.';
