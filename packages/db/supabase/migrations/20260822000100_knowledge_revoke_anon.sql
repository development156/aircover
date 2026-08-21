-- ─────────────────────────────────────────────────────────────────────────────
-- K1a · the knowledge functions stop being callable by a signed-out request
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT WAS WRONG. `20260822000000_knowledge_library.sql` ends with
--
--     revoke all on function public.create_knowledge_document(…) from public;
--     grant  execute on function public.create_knowledge_document(…) to authenticated;
--
-- which reads as "signed-in callers only" and is not. MEASURED against the
-- project immediately after that file was applied:
--
--     has_function_privilege('anon', …, 'EXECUTE')
--       resolve_brand_memory       false
--       resolve_memory_event       false
--       upsert_connection          false
--       create_knowledge_document  TRUE      ← and the other four
--
-- `revoke … from public` removes the grant held by the PUBLIC pseudo-role. It
-- does not remove a grant held DIRECTLY by `anon`, and Supabase's default
-- privileges hand `anon` EXECUTE on new functions in `public`. So the revoke ran,
-- reported success, and left the door it was written to close.
--
-- ── THIS IS NOT A LIVE HOLE, AND IT IS STILL WORTH CLOSING ──────────────────
-- Every one of the five calls `app.assert_knowledge_member` before it touches a
-- row, and that function raises AUTH_REQUIRED when `auth.jwt() ->> 'sub'` is null
-- — which is exactly what a request carrying only the anon key presents. So a
-- signed-out caller is refused today, by the function body.
--
-- What is missing is the SECOND refusal that three sibling functions already
-- have. The standing rule in this repo is the other way round — two guards
-- standing on one hole look like one guard working — and the inverse is just as
-- true: shipping one guard where the house standard is two leaves the next reader
-- unable to tell which of the two was meant to be load-bearing.
--
-- `delete_asset` has the same gap and is NOT changed here. It is `security
-- invoker`, so an anon caller is refused by RLS rather than by a membership
-- check, and it belongs to another lane. Recorded rather than quietly fixed.
--
-- IF THIS FILE IS WRONG: the library screen stops working for signed-in users.
-- It is checked below by asserting the resulting privileges rather than assuming
-- them.
--
-- REVERSIBLE: yes — `grant execute … to anon` restores exactly what was there.
--
-- APPLY ORDER: after 20260822000000_knowledge_library.sql.

revoke execute on function public.create_knowledge_document(uuid, text, text, text, text, text, bigint) from anon;
revoke execute on function public.start_knowledge_indexing(uuid) from anon;
revoke execute on function public.index_knowledge_document(uuid, text[], text, int, jsonb) from anon;
revoke execute on function public.fail_knowledge_document(uuid, text, text) from anon;
revoke execute on function public.delete_knowledge_document(uuid, boolean) from anon;

-- ── THE ASSERTION, RUN AT APPLY TIME ────────────────────────────────────────
-- A revoke that targets nothing succeeds silently — which is the exact failure
-- this file exists to correct. So the file refuses to commit unless the
-- privileges it was written to produce are the privileges that now hold.
do $$
declare
  v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('create_knowledge_document', 'start_knowledge_indexing',
                       'index_knowledge_document', 'fail_knowledge_document',
                       'delete_knowledge_document')
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  if v_bad is not null then
    raise exception
      'knowledge functions still reachable by anon, or unreachable by authenticated: %', v_bad;
  end if;
end;
$$;
