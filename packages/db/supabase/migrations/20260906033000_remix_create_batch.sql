-- ─────────────────────────────────────────────────────────────────────────────
-- remix_create_batch — a Remix batch and its derivatives in ONE transaction
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ── THE DEFECT ───────────────────────────────────────────────────────────────
-- `lib/remix/store.ts createBatch` inserted `remix_batches`, then SEPARATELY
-- inserted `remix_derivatives`. Two round trips, no transaction: if the second
-- insert was refused — a duplicate (kind, channel), a format the CHECK rejects, a
-- lost connection — the batch row survived with no pieces. A planner then read a
-- batch that could never run and quoted a preview for nothing.
--
-- This makes the pair atomic. PostgREST runs a function call as a single
-- statement in its own transaction, so a raise anywhere below rolls the batch
-- insert back with it: a derivative that violates a constraint leaves NO batch.
--
-- ── SECURITY INVOKER, ON PURPOSE ─────────────────────────────────────────────
-- The function runs with the CALLER's privileges and RLS context, not the
-- definer's. `remix_batches` and `remix_derivatives` carry the standard tenant
-- policies (`app.apply_tenant_policies`), so every insert here is still checked
-- against `WITH CHECK (workspace_id in member_workspace_ids())` exactly as a
-- direct PostgREST insert would be. A member cannot write a batch, or a
-- derivative, into a workspace they do not belong to — the transaction just moved
-- inside one function, the boundary did not move at all. Nothing here is
-- SECURITY DEFINER, so nothing here can reach past the caller's own rows.
--
-- The `p_derivatives` payload is a jsonb array of `{kind, channel, format}`. Each
-- value lands in a column with a CHECK constraint, so an unknown kind, channel or
-- format is refused by the database rather than trusted from the client.
--
-- IF THIS IS WRONG: /remix cannot store a batch. No existing table, column,
-- policy or function is altered.
--
-- REVERSIBLE: drop function if exists
--   public.remix_create_batch(uuid, text, uuid, text, text, jsonb);
--
-- APPLY ORDER: after 20260821000002_remix.sql (the two tables).

create or replace function public.remix_create_batch(
  p_workspace_id uuid,
  p_created_by text,
  p_source_post_id uuid,
  p_source_title text,
  p_source_credit text,
  p_derivatives jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_deriv    jsonb;
begin
  insert into remix_batches (
    workspace_id, created_by, source_post_id, source_title, source_credit
  ) values (
    p_workspace_id, p_created_by, p_source_post_id, p_source_title, p_source_credit
  ) returning id into v_batch_id;

  for v_deriv in
    select value from jsonb_array_elements(coalesce(p_derivatives, '[]'::jsonb))
  loop
    insert into remix_derivatives (
      workspace_id, batch_id, kind, channel, format
    ) values (
      p_workspace_id,
      v_batch_id,
      v_deriv ->> 'kind',
      v_deriv ->> 'channel',
      v_deriv ->> 'format'
    );
  end loop;

  return v_batch_id;
end;
$$;

-- Reachable from the app's authenticated role and nobody else; RLS still governs
-- every row it touches.
revoke execute on function public.remix_create_batch(uuid, text, uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.remix_create_batch(uuid, text, uuid, text, text, jsonb)
  to authenticated;
