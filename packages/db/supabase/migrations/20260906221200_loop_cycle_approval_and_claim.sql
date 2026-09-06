-- ─────────────────────────────────────────────────────────────────────────────
-- M2 · The Loop — the create stage cannot run unapproved, and cannot run twice
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Two independent hardenings of `loop_cycles`, grouped because both defend the
-- boundary between "planned" and "spent" and both belong on this one table.
--
--
-- ── 1 · THE APPROVAL INVARIANT (the halt, enforced in the schema) ────────────
--
-- 20260820000300 made `awaiting_cost_approval` a real status and set the rule:
-- nothing advances to `creating` until `cost_approved_at` is set by a person.
-- That rule was enforced in THREE places — `loop_approve_cost`, the orchestrator,
-- and the `loop_cycles_awaiting_cost` index — but NOT in the table itself. So a
-- write that went around all three (a future job, a direct session, a bug in the
-- orchestrator) could set status = 'creating' with cost_approved_at still null,
-- and the create stage would spend a customer's credits against a preview nobody
-- approved. That is the single surprise the whole halt exists to prevent, so it
-- should be the database's refusal and not only the application's.
--
-- THE TERMINAL-STATUS LIST is `creating` and everything the machine reaches
-- AFTER it: `testing`, `staging`, `reported`. Taken verbatim from the status
-- CHECK in 20260820000300 (unchanged since — 20260828* added columns, not
-- statuses):
--
--     collecting → reflecting → planning → awaiting_cost_approval
--       → creating → testing → staging → reported     [+ cancelled | failed]
--
-- `cancelled` and `failed` are DELIBERATELY EXCLUDED, and the exclusion is
-- load-bearing: the kill switch (loop_kill_switch) cancels cycles sitting at
-- `awaiting_cost_approval`, which never had a cost_approved_at. If the CHECK
-- covered `cancelled`, pressing the kill switch on an unapproved cycle would
-- RAISE — the safest button in the product would fail on the commonest case. A
-- cycle can also `fail` before approval. So the invariant is only ever about the
-- forward, money-spending path.
--
-- Written as a NOT VALID constraint then VALIDATE, so the shape is enforced for
-- every future row immediately and the validation scan is explicit. It should
-- pass on existing data — by design a cycle only reaches `creating` through
-- `loop_approve_cost`, which sets cost_approved_at in the same statement — but
-- BEFORE applying, the human running this should confirm no legacy row violates
-- it:
--
--     select id, status, cost_approved_at
--       from loop_cycles
--      where status in ('creating', 'testing', 'staging', 'reported')
--        and cost_approved_at is null;
--
-- If that returns rows, STOP: they are cycles that spent against an unapproved
-- plan, and that is a finding to raise, not a constraint to weaken.
--
--
-- ── 2 · THE CONCURRENCY CLAIM (create_started_at) ────────────────────────────
--
-- The create stage reads the cycle's included briefs and writes a draft per
-- brief. Two create requests for the same cycle — a retry, a double dispatch, two
-- workers — each read the same briefs and each insert a full set of drafts, and
-- the customer gets two of everything AND is charged twice. Nothing today stops
-- that: the status is already `creating` for both, so a status check does not
-- discriminate.
--
-- `create_started_at` is the ATOMIC CLAIM. The create stage's first act becomes:
--
--     update loop_cycles
--        set create_started_at = now()
--      where id = $1 and create_started_at is null
--     returning id;
--
-- Exactly one concurrent request gets a row back — Postgres serializes the two
-- UPDATEs on the row lock, the first sets the column, the second's `is null`
-- predicate no longer matches and it returns zero rows and does nothing. The
-- loser makes no drafts and charges nothing. It is nullable because a cycle that
-- has not started creating has not been claimed, and that is its normal state
-- from `collecting` through `awaiting_cost_approval`.
--
--
-- IF THIS FILE IS WRONG: (1) the CHECK could refuse a legitimate transition — it
-- cannot, given the excluded endings and the forward path always carrying the
-- timestamp; or the column could be the wrong type. (2) is additive and touches
-- no existing read.
--
-- REVERSIBLE: yes — `alter table loop_cycles drop constraint
-- loop_cycles_create_needs_approval` and `drop column create_started_at`. The
-- column holds a claim timestamp that can be re-derived as null on a re-run;
-- dropping it loses nothing a cycle references.
--
-- APPLY ORDER: after 20260820000300_loop_cycles.sql.


-- ── 1 · approval invariant ───────────────────────────────────────────────────
alter table loop_cycles drop constraint if exists loop_cycles_create_needs_approval;
alter table loop_cycles
  add constraint loop_cycles_create_needs_approval
  check (
    status not in ('creating', 'testing', 'staging', 'reported')
    or cost_approved_at is not null
  ) not valid;
alter table loop_cycles validate constraint loop_cycles_create_needs_approval;

comment on constraint loop_cycles_create_needs_approval on loop_cycles is
  'The create stage and everything after it (creating/testing/staging/reported) '
  'is unreachable while cost_approved_at is null. cancelled/failed are excluded '
  'so the kill switch can cancel an unapproved cycle. See migration header.';


-- ── 2 · concurrency claim ────────────────────────────────────────────────────
alter table loop_cycles
  add column if not exists create_started_at timestamptz;

comment on column loop_cycles.create_started_at is
  'The atomic claim for the create stage. The stage runs '
  '`update loop_cycles set create_started_at = now() where id = $1 and '
  'create_started_at is null returning id`; exactly one concurrent request gets a '
  'row back, so two requests for the same cycle cannot both write drafts and '
  'double-charge. Null until the create stage first claims the cycle.';
