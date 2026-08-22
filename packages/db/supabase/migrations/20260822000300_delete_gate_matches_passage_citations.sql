-- ─────────────────────────────────────────────────────────────────────────────
-- K3 · the delete gate counts a PASSAGE-level citation too
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT WOULD HAVE BEEN WRONG.
-- `20260822000000` counts the Brand Brain fields that cite a document with an
-- exact match:
--
--     f.meta ->> 'source' = 'document:' || v_doc.id::text
--
-- That was right for the only citation shape that existed when it was written.
-- The Signal Resolution Console needs a narrower one — a field should be able to
-- show the PASSAGE it came from, not only the document — so a citation is now
-- written as
--
--     document:<uuid>#<ordinal>
--
-- and `= 'document:' || id` stops matching it. The consequence is the worst kind:
-- the gate would still be there, would still run, and would report
-- `brand_fields: 0` about a document every field in the brain came from. Nothing
-- would error. The owner would be told deleting it affects nothing, and it would
-- be deleted without the acknowledgement the whole function exists to demand.
--
-- A guard that cannot fire is not a guard, and this one would have been switched
-- off by a change in a completely different file.
--
-- WHAT THIS FILE DOES. Replaces the function with one whose predicate matches
-- the document id followed by NOTHING or by `#…`. Everything else in it — the
-- row lock, the pending-proposal count, the refusal, the cascade, the returned
-- storage path — is byte-identical to the version it replaces.
--
-- ── WHY `like` AND NOT `starts_with` OR A REGEX ─────────────────────────────
-- The pattern is anchored by construction: a uuid is 36 characters of hex and
-- hyphens, so `'document:' || id || '#%'` cannot be prefix-matched by a
-- different document's id. `like` keeps the predicate readable and needs no
-- escaping — a uuid contains no `%` or `_`.
--
-- IF THIS FILE IS WRONG: a delete is refused when it should not be (the safe
-- direction) or permitted when it should not be (the direction the test below
-- exists for). Both arms are asserted in
-- `packages/db/tests/knowledge_library.pglite.test.ts`.
--
-- REVERSIBLE: re-run the function body from 20260822000000.
--
-- APPLY ORDER: after 20260822000000_knowledge_library.sql.

create or replace function public.delete_knowledge_document(
  p_document_id  uuid,
  p_acknowledge  boolean default false
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc       knowledge_documents%rowtype;
  v_cite      text;
  v_fields    int := 0;
  v_proposals int := 0;
begin
  select * into v_doc from knowledge_documents where id = p_document_id for update;
  if not found then
    -- Not ours, or already gone. Deliberately indistinguishable.
    raise exception 'INVALID_DOCUMENT' using errcode = 'raise_exception';
  end if;
  perform app.assert_knowledge_member(v_doc.workspace_id);

  v_cite := 'document:' || v_doc.id::text;

  -- Brand Brain fields citing this document, at EITHER granularity:
  --   document:<uuid>          the document
  --   document:<uuid>#<n>      one passage of it
  -- Both are citations of this document and both must be counted, or the
  -- acknowledgement is skipped for exactly the fields that have the best
  -- evidence behind them.
  select count(*) into v_fields
    from brand_memory b,
         lateral jsonb_each(coalesce(b.payload -> 'field_meta', '{}'::jsonb)) as f(path, meta)
   where b.workspace_id = v_doc.workspace_id
     and b.status = 'active'
     and (f.meta ->> 'source' = v_cite or f.meta ->> 'source' like v_cite || '#%');

  select count(*) into v_proposals
    from memory_events e
   where e.workspace_id = v_doc.workspace_id
     and e.status = 'pending'
     and e.evidence_refs::text like '%' || v_doc.id::text || '%';

  if (v_fields + v_proposals) > 0 and not coalesce(p_acknowledge, false) then
    raise exception 'NEEDS_ACKNOWLEDGEMENT' using errcode = 'raise_exception';
  end if;

  delete from knowledge_documents where id = v_doc.id;

  return jsonb_build_object(
    'storage_path',      v_doc.storage_path,
    'brand_fields',      v_fields,
    'pending_proposals', v_proposals,
    'deleted',           true
  );
end;
$$;

revoke all on function public.delete_knowledge_document(uuid, boolean) from public;
revoke execute on function public.delete_knowledge_document(uuid, boolean) from anon;
grant execute on function public.delete_knowledge_document(uuid, boolean) to authenticated;
