-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Ops · 13 · the ingest RPC (doc 13 §9.2, §9.6)
--
-- One transaction, because a function call IS one: scripts/ops-sync.mjs posts the
-- whole of ops/state to /api/admin/devops/ingest and the route calls this once.
-- Either the board, changelog, QA feed and session all move, or none of them do.
--
-- WHAT THIS FUNCTION CANNOT DO, BY CONSTRUCTION (doc 13 §16). It touches five
-- tables: ops_roadmap_items, ops_tasks, ops_changelog, ops_qa_runs, ops_sessions.
-- It does not mention ops_credit_requests, credit_ledger, app.apply_ledger_entry,
-- ops_admins or ops_beta_applications, and the payload schema in
-- packages/shared is `.strict()`, so a request carrying a sixth section is
-- rejected rather than partially applied. The worst an ingest-token leak buys is
-- fake dashboard rows.
--
-- IDEMPOTENCY. Roadmap items and tasks key on their natural code, so re-posting
-- the same state file converges rather than duplicating. Changelog entries and QA
-- runs are append-shaped and have no natural key, so the client supplies a
-- client_id and a repeat is DROPPED, not re-inserted — which is what makes
-- ops-sync safe to fire from a hook on every tool call.
--
-- moved_by is stamped 'claude' on every task this function writes, never read
-- from the payload. An agent cannot forge a human drag.
-- ─────────────────────────────────────────────────────────────────────────────

alter table ops_changelog add column client_id text;
create unique index ops_changelog_client_id_key on ops_changelog (client_id);

alter table ops_qa_runs add column client_id text;
create unique index ops_qa_runs_client_id_key on ops_qa_runs (client_id);

comment on column ops_changelog.client_id is
  'Client-generated idempotency key from ops-sync. NULL for entries written in the UI.';
comment on column ops_qa_runs.client_id is
  'Client-generated idempotency key from ops-sync. NULL for runs recorded in the UI.';

create or replace function public.ops_ingest(p_payload jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roadmap int := 0;
  v_tasks int := 0;
  v_changelog int := 0;
  v_qa int := 0;
  v_archived int := 0;
  v_session boolean := false;
  v_codes text[];
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'OPS_INGEST_BAD_PAYLOAD' using errcode = 'raise_exception';
  end if;

  -- Roadmap ------------------------------------------------------------------
  with src as (
    select * from jsonb_to_recordset(coalesce(p_payload -> 'roadmap', '[]'::jsonb))
      as x(code text, stage text, title text, weight int, status text,
           target_date date, sort int)
  ), up as (
    insert into ops_roadmap_items (code, stage, title, weight, status, target_date, sort)
    select code, stage, title, coalesce(weight, 1), coalesce(status, 'todo'),
           target_date, coalesce(sort, 0)
    from src
    on conflict (code) do update set
      stage = excluded.stage,
      title = excluded.title,
      weight = excluded.weight,
      status = excluded.status,
      target_date = excluded.target_date,
      sort = excluded.sort,
      updated_at = now()
    returning 1
  )
  select count(*) into v_roadmap from up;

  -- Tasks --------------------------------------------------------------------
  -- The lifecycle stamps are set on FIRST arrival in a column and never moved
  -- again (coalesce keeps the existing value). A card that goes done → review →
  -- done keeps the moment it first reached review, which is what "age in column"
  -- and any later cycle-time question actually want.
  with src as (
    select * from jsonb_to_recordset(coalesce(p_payload -> 'tasks', '[]'::jsonb))
      as x(code text, title text, detail text, doc_ref text, roadmap_code text,
           board_column text, assignee text, blocked boolean, blocked_reason text,
           archived boolean, pr_ref text, commit_sha text, sort int)
  ), norm as (
    select code, title, detail, doc_ref, roadmap_code,
           coalesce(board_column, 'todo') as board_column,
           coalesce(assignee, 'claude') as assignee,
           coalesce(blocked, false) as blocked,
           blocked_reason,
           coalesce(archived, false) as archived,
           pr_ref, commit_sha, coalesce(sort, 0) as sort
    from src
  ), up as (
    insert into ops_tasks (
      code, title, detail, doc_ref, roadmap_code, board_column, assignee, blocked,
      blocked_reason, archived, pr_ref, commit_sha, sort, moved_by,
      started_at, review_at, done_at
    )
    select code, title, detail, doc_ref, roadmap_code, board_column, assignee, blocked,
           blocked_reason, archived, pr_ref, commit_sha, sort, 'claude',
           case when board_column in ('in_progress', 'review', 'done') then now() end,
           case when board_column in ('review', 'done') then now() end,
           case when board_column = 'done' then now() end
    from norm
    on conflict (code) do update set
      title = excluded.title,
      detail = excluded.detail,
      doc_ref = excluded.doc_ref,
      roadmap_code = excluded.roadmap_code,
      board_column = excluded.board_column,
      assignee = excluded.assignee,
      blocked = excluded.blocked,
      blocked_reason = excluded.blocked_reason,
      archived = excluded.archived,
      pr_ref = coalesce(excluded.pr_ref, ops_tasks.pr_ref),
      -- A sha is evidence. Once a commit has been recorded against a card, a
      -- later payload that has forgotten it must not erase it.
      commit_sha = coalesce(excluded.commit_sha, ops_tasks.commit_sha),
      sort = excluded.sort,
      moved_by = 'claude',
      started_at = coalesce(ops_tasks.started_at, excluded.started_at),
      review_at = coalesce(ops_tasks.review_at, excluded.review_at),
      done_at = coalesce(ops_tasks.done_at, excluded.done_at),
      updated_at = now()
    returning 1
  )
  select count(*) into v_tasks from up;

  -- Changelog ----------------------------------------------------------------
  -- author is deliberately not in the column list: the BEFORE INSERT trigger
  -- derives it from the sequence (doc 13 §8). A client that tried to set it
  -- could not — the payload schema has no such field.
  with src as (
    select * from jsonb_to_recordset(coalesce(p_payload -> 'changelog', '[]'::jsonb))
      as x(client_id text, title text, summary_plain text, details_tech text,
           kind text, task_codes text[], tourable boolean, happened_at timestamptz)
  ), up as (
    insert into ops_changelog (
      client_id, title, summary_plain, details_tech, kind, task_codes, tourable, happened_at
    )
    select client_id, title, summary_plain, details_tech, coalesce(kind, 'changed'),
           coalesce(task_codes, '{}'), coalesce(tourable, false),
           coalesce(happened_at, now())
    from src
    on conflict (client_id) do nothing
    returning 1
  )
  select count(*) into v_changelog from up;

  -- QA runs ------------------------------------------------------------------
  with src as (
    select * from jsonb_to_recordset(coalesce(p_payload -> 'qa', '[]'::jsonb))
      as x(client_id text, task_code text, kind text, suite text, status text,
           summary_plain text, details text, actor text, duration_ms int,
           started_at timestamptz, finished_at timestamptz)
  ), up as (
    insert into ops_qa_runs (
      client_id, task_code, kind, suite, status, summary_plain, details, actor,
      duration_ms, started_at, finished_at
    )
    select client_id, task_code, coalesce(kind, 'auto'), suite, status,
           summary_plain, details, coalesce(actor, 'claude'), duration_ms,
           coalesce(started_at, now()), finished_at
    from src
    on conflict (client_id) do nothing
    returning 1
  )
  select count(*) into v_qa from up;

  -- Session heartbeat --------------------------------------------------------
  if jsonb_typeof(p_payload -> 'session') = 'object' then
    insert into ops_sessions (session_id, label, tasks_touched, status, last_heartbeat_at)
    values (
      p_payload -> 'session' ->> 'session_id',
      p_payload -> 'session' ->> 'label',
      coalesce(
        (select array_agg(value)
         from jsonb_array_elements_text(p_payload -> 'session' -> 'tasks_touched')),
        '{}'
      ),
      coalesce(p_payload -> 'session' ->> 'status', 'working'),
      now()
    )
    on conflict (session_id) do update set
      label = coalesce(excluded.label, ops_sessions.label),
      tasks_touched = excluded.tasks_touched,
      status = excluded.status,
      last_heartbeat_at = now(),
      updated_at = now();
    v_session := true;
  end if;

  -- Full reconcile (doc 13 §9.7) ---------------------------------------------
  -- Tasks that have vanished from the repo are ARCHIVED, never deleted. The
  -- board is derived; the repo is the source of truth; and a card that stops
  -- being mentioned is still a thing that happened.
  if coalesce((p_payload ->> 'full')::boolean, false) then
    select coalesce(array_agg(code), '{}') into v_codes
    from jsonb_to_recordset(coalesce(p_payload -> 'tasks', '[]'::jsonb)) as x(code text);

    update ops_tasks
      set archived = true, updated_at = now()
      where archived = false and not (code = any (v_codes));
    get diagnostics v_archived = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'roadmap', v_roadmap,
    'tasks', v_tasks,
    'changelog', v_changelog,
    'qa', v_qa,
    'archived', v_archived,
    'session', v_session
  );
end;
$$;

-- Not reachable by any browser session. The route that calls this authenticates
-- with a constant-time compare against DEVOPS_INGEST_TOKEN and then uses the
-- service role; there is no path from a signed-in admin's JWT to this function.
revoke execute on function public.ops_ingest(jsonb) from public, anon, authenticated;
grant execute on function public.ops_ingest(jsonb) to service_role;
