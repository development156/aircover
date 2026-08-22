-- ─────────────────────────────────────────────────────────────────────────────
-- posts.origin learns 'radar'.
--
-- Radar-created drafts have nowhere honest to go. `posts_origin_check` does not
-- admit 'radar', so `actions/radar.ts` stores them as 'manual' — and 'manual'
-- is the value that means A PERSON WROTE THIS BY HAND. Two consequences, both
-- silent:
--
--   · "which posts did a person write themselves" counts machine drafts;
--   · the Loop's kill switch scopes by origin, so a draft it should be able to
--     reach is filed under the one value that says a human owns it.
--
-- ── THE FOUR-VALUE LIST IS THE WHOLE POINT ───────────────────────────────────
--
-- MEASURED against production 2026-08-22, read-only:
--
--   posts_origin_check
--     CHECK ((origin = ANY (ARRAY['manual'::text, 'plan_week'::text, 'playbook'::text])))
--
-- but the migration history ON THIS BRANCH declares only two:
--
--   20260718000004_content.sql:14
--     origin text not null default 'manual' check (origin in ('manual', 'plan_week'))
--
-- 'playbook' was added by wt-playbooks, which is applied to production and is
-- NOT merged here. A migration written from what this branch can see would say
-- ('manual','plan_week','radar') and SILENTLY NARROW production — dropping a
-- value the live database already admits, and breaking every playbook write the
-- moment it applied. The list below is therefore a strict superset of what the
-- server actually holds, not of what this tree believes.
--
-- Read the server before widening a constraint you did not write. The branch is
-- not the schema.
--
-- ADDITIVE and therefore safe to apply: every existing row satisfies the new
-- check because the new set contains the old one. No row is rewritten, no table
-- is scanned beyond the constraint validation, no data can be lost.
--
-- APPLY ORDER: after 20260822060100_radar_snapshots.sql.
--
-- REVERSING IT: only while no post carries 'radar' —
--
--   alter table posts drop constraint posts_origin_check;
--   alter table posts add constraint posts_origin_check
--     check (origin in ('manual', 'plan_week', 'playbook'));
--
-- and check first, because the down direction is not unconditional:
--
--   select count(*) from posts where origin = 'radar';   -- must be 0
-- ─────────────────────────────────────────────────────────────────────────────

alter table posts drop constraint posts_origin_check;

alter table posts
  add constraint posts_origin_check
  check (origin in ('manual', 'plan_week', 'playbook', 'radar'));

comment on column posts.origin is
  'Who or what created this post. ''manual'' means a person wrote it by hand and '
  'is the DEFAULT, so anything written by Sahoda must name itself: ''plan_week'' '
  '(the Loop''s weekly plan), ''playbook'' (a playbook run), ''radar'' (a draft '
  'proposed from a Radar change). The Loop''s kill switch scopes by this column, '
  'so a machine draft filed as ''manual'' is one the switch reads as human work.';
