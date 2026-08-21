-- ─────────────────────────────────────────────────────────────────────────────
-- M2 · The Loop — make `loop_briefs.channels` actually be a SET
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT THIS FIXES, AND WHY IT IS A SEPARATE FILE. 20260820000300 declared
-- `channels text[] not null default '{}'` and said in a comment that the writer
-- must de-duplicate through the one shared helper. A comment is not a constraint.
-- That file is applied, applied migrations are immutable, so the guarantee comes
-- as its own additive file.
--
-- ── WHY THIS IS WORTH A MIGRATION RATHER THAN A CODE REVIEW ──────────────────
-- `posts.channels` is the same shape read the same way, and treating it as a list
-- when it is a set has produced THREE separate shipped defects in this product in
-- two days — a post sent twice to one channel, a channel counted twice in a
-- total, a variant created twice for one platform. Every one of them was a
-- de-duplication that existed at one call site and not at the one that mattered.
--
-- `loop_briefs.channels` is read by the create stage (one draft per channel), by
-- the cost preview (a price per channel), and by the CMO Report (a count per
-- channel). A duplicate in this column is a double charge on the preview and a
-- second post to the same account. So the set-ness is enforced where every writer
-- must pass, rather than at whichever call site is remembered.
--
-- IF THIS FILE IS WRONG: briefs with duplicate or unknown channels can be stored.
-- Nothing existing breaks — no rows exist to violate it (the table was created
-- minutes ago and the constraint is validated against an empty table).
--
-- REVERSIBLE: yes — drop the constraint, then the function.
--
-- APPLY ORDER: after 20260820000300_loop_cycles.sql.


-- ── 1 of 2 ───────────────────────────────────────────────────────────────────
-- The predicate. A separate IMMUTABLE function because a CHECK constraint may not
-- contain a subquery, and counting distinct elements needs one.
--
-- Two conditions, and both matter:
--   · every element is a channel this product has. `<@` is array containment.
--   · no element appears twice. THIS is the half a type cannot express: text[]
--     and "set of channels" are the same type to Postgres and to TypeScript, and
--     the difference between them is exactly what keeps being lost.
--
-- Immutable is honest here: the answer depends only on the argument. That is what
-- lets it be used in a CHECK at all.
create or replace function app.is_channel_set(a text[]) returns boolean
language sql
immutable
as $$
  select a is not null
     and a <@ array['x', 'gbp', 'linkedin', 'instagram']::text[]
     and cardinality(a) = (select count(distinct e) from unnest(a) as e)
$$;


-- ── 2 of 2 ───────────────────────────────────────────────────────────────────
-- The constraint.
--
-- An EMPTY array passes, deliberately: a brief with no channel yet is a coherent
-- intermediate state (the plan stage writes the brief before it has decided
-- placement), and `cardinality('{}') = 0 = count(distinct …)` holds. What is
-- refused is a duplicate and an unknown name.
--
-- IF THIS IS WRONG in the loose direction: a brief could carry the same channel
-- twice, and the create stage would write two drafts and the preview would charge
-- for both.
alter table loop_briefs
  add constraint loop_briefs_channels_is_set check (app.is_channel_set(channels));
