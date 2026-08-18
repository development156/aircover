-- ─────────────────────────────────────────────────────────────────────────────
-- A1 · Concurrent edit — stop two tabs silently overwriting each other
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS BROKEN TODAY, in one paragraph.
-- Two people (or one person in two tabs) open the same post and edit the same
-- channel's copy. Both press save. The second save overwrites the first, both
-- screens say "Saved", and the first writer's words are gone with no warning.
-- Measured on the QA account and written up in docs/23_Concurrent_Edit_Plan.md.
--
-- WHAT THIS FILE DOES ABOUT IT.
-- It gives each channel's copy a counter. A save now says "I am changing the
-- copy I read, which was number 4." If the stored copy has moved on to number 5,
-- the save is refused instead of applied, and the screen shows both versions and
-- asks which to keep. Nothing is ever thrown away by the database.
--
-- IF THIS FILE IS WRONG: saves of channel copy stop working. Nothing is deleted
-- and nothing is published — the worst case is that the editor cannot save until
-- the function is corrected. No other table is touched.
--
-- NO NEW TABLE, so there is no new row-level security to enable here. The table
-- being changed, `post_variants`, already has row-level security switched on and
-- policies scoped to `workspace_id` (migration 20260718000004_content.sql). This
-- file does not weaken them: the function below runs as the CALLER, so the same
-- policies decide what it may touch.
--
-- APPLY ORDER: independent. Nothing else in this batch depends on it and it
-- depends on nothing but the original content tables. See docs/24_Migration_Batch.md.


-- ── 1 of 3 ───────────────────────────────────────────────────────────────────
-- Adds the counter. Every row that exists right now is given the number 1, so
-- nothing has to be backfilled by hand and every existing post keeps working the
-- instant this runs.
--
-- IF THIS IS WRONG: the column does not appear, and the application carries on
-- exactly as it does today — the code checks for this column at runtime and uses
-- the old save path when it is missing. Safe to run twice.
alter table public.post_variants
  add column if not exists version integer not null default 1;


-- ── 2 of 3 ───────────────────────────────────────────────────────────────────
-- The save itself, rewritten as "change it ONLY IF it still looks like what I
-- read". This is the entire mechanism. Returns the saved row when it worked and
-- returns NO ROW AT ALL when someone else got there first, so the application can
-- tell the two apart without asking a second question.
--
-- IF THIS IS WRONG: channel copy cannot be saved through the new path. The
-- application falls back to the old path only when the function is ABSENT, so a
-- function that exists but is broken would surface as a save error on screen —
-- visible immediately, and losing nothing.
--
-- REVERSIBLE: yes, and cleanly. `drop function public.save_post_variant(...)`
-- puts the application back on its old save path with no data change.
--
-- THREE DELIBERATE DIFFERENCES from the SQL printed in docs/23_Concurrent_Edit_Plan.md,
-- written out here so a founder diffing the two files finds no surprises:
--
--   (a) `returns setof` instead of `returns public.post_variants`. The plan says
--       the function must return "NOTHING" on a clash. A function declared to
--       return one row and returning nothing hands back an empty value, and an
--       empty value travelling over the API can arrive looking like a row whose
--       every field is blank — which would read as a SUCCESSFUL save of empty
--       text. `setof` returns zero rows, which cannot be mistaken for anything.
--
--   (b) An arm for the case where the row does not exist yet. Today's save
--       creates the row if it is missing (it is an "upsert"). The plan's SQL only
--       ever updates, so with the plan's SQL exactly as printed, the FIRST time
--       anyone wrote copy for a channel it would be reported as a conflict. The
--       new arm is still a compare-and-set — creating is a save against "no row
--       yet", and if two tabs both try to create at the same moment, the second
--       one correctly gets the conflict.
--
--   (c) `p_is_linked`. Today's save writes this column, and a function that left
--       it out would silently stop writing it. `is_linked` is currently written
--       and read by nothing, so no behaviour changes either way — it is carried
--       so that this migration changes concurrency and NOTHING else.
--
-- `security invoker` means the function has no powers of its own: row-level
-- security still decides which rows the caller may see and change. This is a
-- concurrency fix, not a permissions change, and it grants nobody anything.
create or replace function public.save_post_variant(
  p_post_id          uuid,
  p_workspace_id     uuid,
  p_channel          text,
  p_body             text,
  p_extras           jsonb,
  p_char_count       integer,
  p_expected_version integer,
  p_is_linked        boolean default false
)
returns setof public.post_variants
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- No version supplied = "I believe this channel has no copy yet, create it."
  -- `on conflict do nothing` means: if a row appeared in the meantime, create
  -- nothing and return nothing — which the caller reads as a conflict, correctly.
  if p_expected_version is null then
    return query
    insert into public.post_variants
      (workspace_id, post_id, channel, body, extras, char_count, is_linked, version)
    values
      (p_workspace_id, p_post_id, p_channel, p_body, p_extras, p_char_count, p_is_linked, 1)
    on conflict (post_id, channel) do nothing
    returning *;
    return;
  end if;

  -- A version was supplied = "change the copy I read." The `version =` line at
  -- the end of the WHERE is the whole mechanism: if the stored number has moved,
  -- this statement matches no rows, changes nothing, and returns nothing.
  --
  -- `workspace_id` is in the WHERE as well as `post_id`. Every other write in
  -- this codebase scopes on that pair, and dropping it "to simplify" would make
  -- this the one place a post could be written from the wrong account.
  return query
  update public.post_variants
     set body       = p_body,
         extras     = p_extras,
         char_count = p_char_count,
         is_linked  = p_is_linked,
         version    = version + 1
   where post_id      = p_post_id
     and workspace_id = p_workspace_id
     and channel      = p_channel
     and version      = p_expected_version
  returning *;
end;
$$;


-- ── 3 of 3 ───────────────────────────────────────────────────────────────────
-- Who may call it. Signed-in members only — the same rule every other function in
-- this database follows. The signature is spelled out in full because otherwise
-- these two lines silently apply to nothing.
--
-- IF THIS IS WRONG: either nobody can save channel copy (too strict), or a
-- signed-out visitor could call the function — which still could not read or
-- change anything, because row-level security is underneath it and the function
-- runs as the caller. Being strict here is the safe direction, and it is what is
-- written.
revoke all on function
  public.save_post_variant(uuid, uuid, text, text, jsonb, integer, integer, boolean)
  from public, anon;
grant execute on function
  public.save_post_variant(uuid, uuid, text, text, jsonb, integer, integer, boolean)
  to authenticated;
