-- ─────────────────────────────────────────────────────────────────────────────
-- public.resolve_brand_memory — the Brand Brain write path (requested by wt-web).
--
-- brand_memory carries a READ-ONLY tenant policy (app.apply_tenant_read_policy →
-- t_select only): members may read their brain, and every write is server-side by
-- design so a member can never destroy the living memory. apps/web has no
-- service-role client, so this SECURITY DEFINER function is the one
-- client-reachable write — same shape and security model as
-- public.bootstrap_workspace.
--
-- It persists one resolved BrandMemoryPayload as a new version: supersede the
-- current active row, insert the next version as active, return the row.
--
-- Security model (mirrors bootstrap_workspace):
--   · identity comes from auth.jwt()->>'sub' only — never from arguments;
--   · owned by the migration role, so it bypasses RLS exactly like the other
--     definer helpers (the sanctioned server-side write path);
--   · lives in `public` so PostgREST exposes it, but EXECUTE is revoked from
--     public/anon and granted to authenticated only;
--   · every argument is validated here — any signed-in user can call it directly
--     with arbitrary arguments, so the guards are the trust boundary.
--
-- Invariants that look like easy "optimisations" but each break silently:
--   · guards run BEFORE the advisory lock — otherwise any authenticated stranger
--     can make the server take an arbitrary workspace's lock (cross-tenant DoS);
--   · membership resolves p_workspace_id into v_ws_id and NOTHING below reads the
--     argument again, so a cross-tenant write is structurally impossible;
--   · the role test is an ALLOWLIST — a denylist would silently grant write access
--     to any role added to workspace_members.role later;
--   · max(version) counts ALL statuses: the CHECK admits 'draft' and
--     unique (workspace_id, version) is unconditional, so an active-only max
--     collides with any draft row;
--   · supersede BEFORE insert — the reverse trips brand_memory_one_active
--     (partial unique index: at most one active row per workspace);
--   · do NOT attach app.block_mutations() to brand_memory. The supersede is a real
--     top-level UPDATE (pg_trigger_depth() = 1), so the cascade escape hatch would
--     not fire and every resolve would die with restrict_violation;
--   · the supersede does not set updated_at — the set_updated_at BEFORE UPDATE
--     trigger on brand_memory already does, and a manual assignment would be dead
--     code that drifts;
--   · the function must stay VOLATILE under READ COMMITTED: marking it STABLE (or
--     running it under REPEATABLE READ) would freeze the post-lock reads to the
--     pre-lock snapshot and collide versions.
--
-- Idempotency is content-based, so it needs no new column: re-submitting the
-- payload that is already active replays that row instead of burning a version
-- (rage-clicking Finish yields one version). The one identical-content transition
-- that DOES mint a version is upgrading away from a demo fallback
-- (source 'system' → 'resolved'|'manual'), because provenance is the change.
-- A replay may return another member's created_by — that is deliberate; scoping
-- the replay per user would reintroduce the double-submit version burn across
-- devices.
--
-- Error vocabulary (all SQLSTATE P0001; consumers substring-match the message):
--   AUTH_REQUIRED · INVALID_WORKSPACE · INVALID_SOURCE · INVALID_PAYLOAD
--   NOT_A_MEMBER  · FORBIDDEN_ROLE    · VERSION_CONFLICT
-- Returns: { brand_memory: <row>, version: int, replayed: bool }
--   `replayed: true` is a SUCCESS with different copy, never a failure.
--
-- Any future writer of brand_memory (revert, calibration apply) MUST take the same
-- advisory-lock key: 'resolve_brand:' || workspace_id.
-- ─────────────────────────────────────────────────────────────────────────────

-- max(version) per workspace is on the hot path of every resolve; the base table
-- only indexes (workspace_id).
create index if not exists brand_memory_workspace_version_idx
  on brand_memory (workspace_id, version desc);

create or replace function public.resolve_brand_memory(
  p_workspace_id     uuid,
  p_payload          jsonb,
  p_source           text default 'resolved',  -- resolved | manual | system
  p_expected_version int default null           -- optimistic check; null = skip
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  -- abuse ceiling only: a real payload is ~2 KB, the demo fallback ~1.2 KB.
  -- Kept tight because brand_memory feeds the mesh brand-context prefix that is
  -- prepended to EVERY model call for the workspace — an oversized brain would
  -- bill provider tokens forever against a fixed credit price.
  c_max_bytes constant int := 32768;
  c_max_list  constant int := 40;
  v_user    text;
  v_source  text;
  v_key     text;
  v_ws_id   uuid;
  v_role    text;
  v_cur     brand_memory%rowtype;
  v_row     brand_memory%rowtype;
  v_found   boolean;
  v_version int;
begin
  -- 1) identity from the JWT, never from arguments
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;

  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;

  -- 2) boundary validation. Every guard is NULL-total: PostgREST forwards an
  --    explicit JSON null verbatim (only an OMITTED argument takes the default),
  --    and comparisons against NULL are NULL — never true — so a bare
  --    `jsonb_typeof(x) <> 'object'` would wave a null payload straight through
  --    to a raw 23502. Hence coalesce / is null / is distinct from throughout.
  v_source := coalesce(p_source, 'resolved');
  if v_source not in ('resolved', 'manual', 'system') then
    raise exception 'INVALID_SOURCE' using errcode = 'raise_exception';
  end if;

  if p_payload is null
     or jsonb_typeof(p_payload) is distinct from 'object'
     or pg_column_size(p_payload) > c_max_bytes then
    raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
  end if;

  -- the six top-level sections of BrandMemoryPayloadSchema (@sahoda/shared)
  foreach v_key in array array[
    'voice', 'brand_persona', 'customer_persona', 'hook', 'taboo', 'alignment'
  ] loop
    if jsonb_typeof(p_payload -> v_key) is distinct from 'object' then
      raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
    end if;
  end loop;

  -- Shape-check the parts the frozen zod contract pins, so a malformed brain can
  -- never become `active` and silently break every read that parses it. The
  -- jsonb_typeof guard must precede jsonb_array_length — the latter raises 22023
  -- on a non-array. Fixed-length arrays are exactly 3 (resolve.ts); the two
  -- open-ended lists are capped because mesh interpolates them into the prefix.
  if jsonb_typeof(p_payload #> '{voice,signature_phrases}') is distinct from 'array'
     or jsonb_array_length(p_payload #> '{voice,signature_phrases}') <> 3
     or jsonb_typeof(p_payload #> '{brand_persona,core_values}') is distinct from 'array'
     or jsonb_array_length(p_payload #> '{brand_persona,core_values}') <> 3
     or jsonb_typeof(p_payload #> '{hook,sample_hooks}') is distinct from 'array'
     or jsonb_array_length(p_payload #> '{hook,sample_hooks}') <> 3
     or jsonb_typeof(p_payload #> '{voice,banned_phrases}') is distinct from 'array'
     or jsonb_array_length(p_payload #> '{voice,banned_phrases}') > c_max_list
     or jsonb_typeof(p_payload #> '{taboo,red_lines}') is distinct from 'array'
     or jsonb_array_length(p_payload #> '{taboo,red_lines}') > c_max_list
     or coalesce(p_payload #>> '{alignment,signal_lock}', '') not in ('strong', 'moderate', 'weak')
  then
    raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
  end if;

  -- 3) membership + role allowlist. A non-member gets NOT_A_MEMBER whether or not
  --    the workspace exists — no existence oracle. From here on: v_ws_id only.
  select m.workspace_id, m.role into v_ws_id, v_role
  from workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor', 'approver') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  -- 4) serialize resolves for this workspace so two concurrent Finish clicks
  --    cannot race on max(version) or leave two active rows
  perform pg_advisory_xact_lock(hashtextextended('resolve_brand:' || v_ws_id::text, 0));

  select * into v_cur from brand_memory
  where workspace_id = v_ws_id and status = 'active';
  v_found := found;  -- `found` is clobbered by the next statement; latch it

  -- 5) optimistic concurrency: the Refine step is minutes long, so a stale second
  --    tab could otherwise overwrite a newer brain with no error at all.
  --    0 (or null) means "I expect no active brain yet".
  if p_expected_version is not null
     and coalesce(v_cur.version, 0) <> p_expected_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'raise_exception';
  end if;

  -- 6) content idempotency. jsonb equality (not text/md5) so a client that
  --    re-serialised the row it just received still matches: jsonb normalises key
  --    order, whitespace and duplicate keys at parse time. Array order stays
  --    significant, which is correct — reordered signature_phrases is a real edit.
  if v_found
     and v_cur.payload = p_payload
     and not (v_cur.source = 'system' and v_source <> 'system') then
    return jsonb_build_object(
      'brand_memory', to_jsonb(v_cur),
      'version', v_cur.version,
      'replayed', true
    );
  end if;

  -- 7) next version across ALL statuses, supersede, then insert
  select coalesce(max(version), 0) + 1 into v_version
  from brand_memory where workspace_id = v_ws_id;

  update brand_memory set status = 'superseded'
  where workspace_id = v_ws_id and status = 'active';

  begin
    insert into brand_memory (workspace_id, version, status, payload, source, created_by)
    values (v_ws_id, v_version, 'active', p_payload, v_source, v_user)
    returning * into v_row;
  exception when unique_violation then
    -- the advisory lock only serialises callers who take it; a service-role seed
    -- or a future writer that skips it must not surface a raw 23505 to a browser
    raise exception 'VERSION_CONFLICT' using errcode = 'raise_exception';
  end;

  return jsonb_build_object(
    'brand_memory', to_jsonb(v_row),
    'version', v_row.version,
    'replayed', false
  );
end;
$$;

-- Client-reachable by design — but only for signed-in members. The signature must
-- be spelled in full or the revoke/grant silently targets nothing. The
-- service_role grant is inert today (no JWT ⇒ AUTH_REQUIRED); it mirrors
-- bootstrap_workspace and must NOT be "fixed" with a p_actor argument — identity
-- stays JWT-derived.
revoke all on function public.resolve_brand_memory(uuid, jsonb, text, int)
  from public, anon;
grant execute on function public.resolve_brand_memory(uuid, jsonb, text, int)
  to authenticated, service_role;
