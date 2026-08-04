-- ─────────────────────────────────────────────────────────────────────────────
-- Slice C · 03 · `partial` — the status that had nowhere to be recorded
--
-- The dispatcher has two branches that reach a post which published on SOME
-- channels and not others (apps/jobs/src/dispatch/classify.ts): past grace with
-- work outstanding and something already live, and every channel settled with at
-- least one published and at least one failed. Both return
-- `hold('partial-needs-per-channel-ui')`.
--
-- A hold is not a resting state. Every subsequent sweep re-reads the post, reaches
-- the same branch and holds again — forever. The post never leaves the candidate
-- query and its owner never gets an answer.
--
-- The reason it was written that way is sound and is quoted from the classifier:
-- "until apps/web can say 'went out on X, did not go out on Google' there is no
-- honest badge for it, so it waits rather than being flattened to `failed`."
-- Flattening to `failed` would tell someone their post did not go out when it is
-- live on Instagram right now. Flattening to `published` hides a channel that
-- silently did not.
--
-- So the fix is not to pick one of the two lies. It is to add the state that is
-- true, and to build the per-channel breakdown that makes it readable. This
-- migration is the first half.
--
-- ── WHY A NEW STATUS AND NOT A DERIVED VIEW ──────────────────────────────────
-- `posts.status` is what the dispatcher's gate reads, what the planner filters on
-- and what the badge renders. A post that is partly out must leave
-- DISPATCHABLE_STATUSES — otherwise the sweep keeps picking it up — and there is
-- no way to express "no longer dispatchable" in a derived view.
-- ─────────────────────────────────────────────────────────────────────────────

alter table posts drop constraint if exists posts_status_check;

alter table posts add constraint posts_status_check
  check (status in (
    'idea','draft','review','approved','scheduled','publishing',
    'published',
    -- Live on at least one channel, and definitively NOT going out on at least
    -- one other. Terminal: the dispatcher must not pick it up again, because the
    -- channels that failed have already had their attempt.
    'partial',
    'failed','expired'
  ));

comment on column posts.status is
  'Content lifecycle (FSD 0.5). `partial` means live on at least one channel and '
  'not going out on another — recorded rather than flattened, because ''failed'' '
  'would deny a post that is live and ''published'' would hide a channel that '
  'never went out. Terminal, like published and failed.';
