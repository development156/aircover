-- ─────────────────────────────────────────────────────────────────────────────
-- A5b · attaching a library file to a post, and refusing to delete one in use
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT 20260819000400 LEFT UNFINISHED. It created `assets` (the library) and
-- `asset_usages` (the "used in" record) and stopped there, deliberately: nothing
-- read or wrote either table. Building the library screen turns up two things
-- that cannot be done from application code alone.
--
-- ── 1 · A LIBRARY FILE HAS TO REACH THE PUBLISHER ───────────────────────────
-- The publish path reads ONE table for a post's photos:
--
--     apps/jobs/src/publish/store.ts
--     select storage_path, mime, bytes from post_media
--       where post_id = $1 and workspace_id = $2
--
-- So writing an `asset_usages` row and nothing else would give the composer an
-- attached photo that is never sent — a success message over a publish that goes
-- out without the picture. Attaching therefore still writes `post_media`, and
-- this file adds the column that says WHICH library file that row came from.
--
-- The publisher's query is untouched and does not read the new column.
--
-- ── 2 · DELETING A LIBRARY FILE IS A DATA-LOSS PATH ─────────────────────────
-- `asset_usages.asset_id` cascades. So `delete from assets` SUCCEEDS today: the
-- file goes, the usage rows go with it, and a post scheduled for Thursday loses
-- its photo with nobody told. A check in the server action would not close it —
-- another caller, a bulk delete, or a race between the check and the delete all
-- walk straight past. The refusal belongs where every caller has to pass.
--
-- ── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────
-- It does not read, move, copy or delete a single existing row. All 23
-- `post_media` rows in this database keep working exactly as they do, with
-- `asset_id` null, which is the "uploaded straight to this post, not from the
-- library" case and stays supported indefinitely. See
-- `docs/28_Assets_and_post_media.md` for the coexistence plan.
--
-- IF THIS FILE IS WRONG: nothing that works today stops working. Every object it
-- creates is new, and the one column it adds is nullable with no default.
--
-- REVERSIBLE: yes —
--   drop trigger assets_refuse_delete_in_use on assets;
--   drop trigger post_media_sync_asset_usage_ins on post_media;
--   drop trigger post_media_sync_asset_usage_del on post_media;
--   drop function app.assert_asset_not_in_use();
--   drop function app.sync_asset_usage();
--   drop index asset_usages_asset_post_no_channel_uidx;
--   alter table post_media drop constraint post_media_asset_fk;
--   alter table post_media drop column asset_id;
-- Dropping them discards the link and the guard. No file and no post is lost.
--
-- APPLY ORDER: after 20260819000400_assets.sql. Independent of everything else.


-- ── 1 of 5 ───────────────────────────────────────────────────────────────────
-- Which library file a post attachment came from.
--
-- Nullable, and it stays nullable forever: a file uploaded straight onto a post
-- has no library entry, and that is a legitimate row rather than a gap to be
-- backfilled.
--
-- The foreign key names the CUSTOMER as well as the file, using the composite
-- key `20260819000400` created for exactly this. That is what makes it
-- impossible — not merely unlikely — for one customer's post to point at
-- another customer's file.
--
-- `on delete restrict` is the backstop under the trigger in section 4. The
-- trigger gives a person a sentence they can act on; this gives the DATABASE a
-- refusal that no code path can forget. Both are wanted: without the trigger the
-- refusal is an opaque constraint error, and without this a future caller that
-- disabled triggers would strip a post's photo.
--
-- IF THIS IS WRONG: attaching from the library cannot record where the file came
-- from, and the delete guard has no backstop. Existing rows are unaffected.
alter table post_media add column asset_id uuid;

alter table post_media add constraint post_media_asset_fk
  foreign key (asset_id, workspace_id) references assets (id, workspace_id)
  on delete restrict;

-- Every "where is this file used?" read and the guard below both start here.
create index post_media_asset_id_idx on post_media (asset_id);


-- ── 2 of 5 ───────────────────────────────────────────────────────────────────
-- The uniqueness `20260819000400` INTENDED but did not get.
--
-- That file wrote `unique (asset_id, post_id, channel)` with the comment "one
-- file is used once per post per channel. Recording it twice would show a
-- duplicate photo in the post and inflate every count on the library screen."
--
-- It does not do that. Postgres treats NULLs as DISTINCT in a unique constraint
-- by default, and `channel` is null for the ordinary case — a file attached to
-- the post as a whole. So the constraint permits unlimited duplicate rows for
-- precisely the shape that occurs every time. Every usage count on the library
-- screen would drift upward on re-attach.
--
-- A partial unique index over the null-channel rows closes it. The original
-- constraint is left in place and still covers the per-channel rows; this is an
-- addition, not a correction of an applied migration.
--
-- IF THIS IS WRONG: usage counts can double-count. Nothing is lost.
create unique index asset_usages_asset_post_no_channel_uidx
  on asset_usages (asset_id, post_id)
  where channel is null;


-- ── 3 of 5 ───────────────────────────────────────────────────────────────────
-- `asset_usages` is maintained BY the attachment, never alongside it.
--
-- Two tables that must agree, written by two statements, is a pair that
-- eventually disagrees — and the disagreement is silent and one-directional: a
-- usage row left behind after a detach makes the delete guard refuse a file that
-- nothing uses, and a missing one makes it allow a file that a scheduled post
-- needs. The second is the data-loss direction.
--
-- So there is ONE write path. Application code inserts `post_media`; the usage
-- record follows from it here. A caller that forgets cannot exist.
--
-- `position` is read from the post's existing attachments so a swipeable set
-- keeps the order the writer added them in. It counts `post_media`, which is the
-- table the publisher orders by, rather than counting usages — those two differ
-- whenever a post mixes library files with direct uploads, and the publisher's
-- order is the one a reader will see.
--
-- SECURITY DEFINER with a pinned search_path: every value written is taken from
-- the `post_media` row that has ALREADY passed that table's own RLS check, so
-- this can add no access the caller did not have. It is definer-rights only so
-- that the usage record cannot fail for a caller whose role differs from the
-- one that owns the tables.
--
-- IF THIS IS WRONG: the "used in" record is incomplete and the delete guard is
-- weaker than it claims. Nothing existing is affected.
create or replace function app.sync_asset_usage() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.asset_id is null then return new; end if;

    insert into asset_usages (workspace_id, asset_id, post_id, channel, position)
    values (
      new.workspace_id,
      new.asset_id,
      new.post_id,
      -- Null: the file belongs to the post as a whole. `post_media` has no
      -- channel column, so claiming one would be an invention.
      null,
      (select count(*) from post_media m
        where m.post_id = new.post_id and m.workspace_id = new.workspace_id
          and m.id <> new.id)
    )
    -- Re-attaching the same file to the same post is not an error; it is the
    -- same fact stated twice. The index in section 2 is what makes this reachable.
    on conflict do nothing;

    return new;
  end if;

  if old.asset_id is null then return old; end if;

  -- Scoped to this post AND this workspace: the same file is legitimately used
  -- by other posts, and their usage records are none of this row's business.
  delete from asset_usages u
   where u.asset_id = old.asset_id
     and u.post_id = old.post_id
     and u.workspace_id = old.workspace_id
     and u.channel is null
     -- The last attachment of this file to this post is the one that clears the
     -- usage. Two attachments of one file to one post cannot occur through the
     -- library (section 2 forbids the duplicate usage row), but a direct insert
     -- can create two `post_media` rows, and removing one of them must not
     -- report the post as no longer using the file.
     and not exists (
       select 1 from post_media m
        where m.asset_id = old.asset_id
          and m.post_id = old.post_id
          and m.workspace_id = old.workspace_id
          and m.id <> old.id
     );

  return old;
end;
$$;

revoke all on function app.sync_asset_usage() from public;

create trigger post_media_sync_asset_usage_ins
  after insert on post_media
  for each row execute function app.sync_asset_usage();

create trigger post_media_sync_asset_usage_del
  after delete on post_media
  for each row execute function app.sync_asset_usage();


-- ── 4 of 5 ───────────────────────────────────────────────────────────────────
-- THE GUARD. A file a committed post depends on cannot be deleted.
--
-- This restates, in SQL, the rule in `packages/shared/src/assets/delete-gate.ts`.
-- Two languages stating one rule is a drift risk, and it is accepted knowingly:
-- the alternative is a guard that lives only in one server action, which is a
-- guard exactly one caller has. `packages/db/tests/asset_delete_gate.pglite.test.ts`
-- runs both against the same list of statuses so a change to either fails.
--
-- WHAT LOCKS. The post will go out, is going out, or has gone out —
--   posts.status in (scheduled, publishing, published, partial)
--   or any post_variants.publish_status in (scheduled, publishing, published)
-- `partial` is the easy one to miss: it means live on at least one channel.
-- `approved` deliberately does not lock; approving is not scheduling, nothing is
-- queued, and an approved post that loses a photo is one someone can still fix.
--
-- The variant check is not redundant. The dispatcher moves a variant to
-- `publishing` before it settles the parent post, so for the seconds during
-- which the bytes are actually being read, the post row alone still says
-- `scheduled` — or, mid-flight, something the parent has not caught up with.
--
-- WHAT THE MESSAGE SAYS. The post's TITLE, not its id. An id is not a name and
-- tells the reader to go looking for something they have never seen. An untitled
-- post is described as untitled. At most three are named and the rest counted,
-- so a file used by forty posts produces a sentence rather than a wall.
--
-- Raised as `restrict_violation` (SQLSTATE 23001) so a caller can branch on the
-- code rather than parsing prose, and carries the message in ERRCODE-safe form:
-- post titles are customer text, so they are interpolated with `format('%L')`-free
-- concatenation into the MESSAGE only, never into executed SQL.
--
-- IF THIS IS WRONG in the loose direction: someone's scheduled post silently
-- loses its photo. In the strict direction: a file that could have been deleted
-- is refused, and the person is told why. Those are not symmetric, which is why
-- the ambiguous statuses lock.
create or replace function app.assert_asset_not_in_use() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  locked_total int;
  named text;
begin
  with locked as (
    select
      p.id,
      p.title,
      case
        when p.status in ('published', 'partial') then 'already published'
        when p.status = 'publishing' then 'publishing right now'
        when p.status = 'scheduled' then 'scheduled to go out'
        when exists (select 1 from post_variants v
                      where v.post_id = p.id and v.publish_status = 'published')
          then 'already published on a channel'
        when exists (select 1 from post_variants v
                      where v.post_id = p.id and v.publish_status = 'publishing')
          then 'publishing on a channel right now'
        else 'scheduled on a channel'
      end as reason,
      p.created_at
    from asset_usages u
    join posts p on p.id = u.post_id and p.workspace_id = u.workspace_id
    where u.asset_id = old.id
      and (
        p.status in ('scheduled', 'publishing', 'published', 'partial')
        or exists (
          select 1 from post_variants v
           where v.post_id = p.id
             and v.workspace_id = p.workspace_id
             and v.publish_status in ('scheduled', 'publishing', 'published')
        )
      )
  ),
  ordered as (
    -- Oldest first, so the same file produces the same sentence on every attempt.
    select *, row_number() over (order by created_at, id) as rn from locked
  )
  select
    (select count(*) from locked),
    string_agg(
      case
        when coalesce(btrim(o.title), '') = '' then 'an untitled post'
        else '“' || o.title || '”'
      end || ' (' || o.reason || ')',
      ', ' order by o.rn
    )
  into locked_total, named
  from ordered o
  where o.rn <= 3;

  if locked_total is null or locked_total = 0 then
    return old;
  end if;

  if locked_total > 3 then
    named := named || ', and ' ||
      case when locked_total - 3 = 1 then '1 more post'
           else (locked_total - 3)::text || ' more posts' end;
  end if;

  raise exception
    'This file is used by % that cannot lose it: %. Remove it from % first, or keep the file.',
    case when locked_total = 1 then 'a post' else locked_total::text || ' posts' end,
    named,
    case when locked_total = 1 then 'that post' else 'those posts' end
    using errcode = 'restrict_violation';
end;
$$;

revoke all on function app.assert_asset_not_in_use() from public;

-- BEFORE, so it runs ahead of the cascade that would otherwise have already
-- removed the very `asset_usages` rows this reads.
create trigger assets_refuse_delete_in_use
  before delete on assets
  for each row execute function app.assert_asset_not_in_use();


-- ── 5 of 5 ───────────────────────────────────────────────────────────────────
-- Documentation that travels with the schema rather than only in a file.
comment on column post_media.asset_id is
  'The library entry this attachment came from, or null for a file uploaded '
  'straight onto the post. Never backfilled — a direct upload legitimately has '
  'no library entry. The publisher does not read this column.';

comment on function app.assert_asset_not_in_use() is
  'Refuses to delete a library file that a scheduled, publishing, published or '
  'partial post depends on, naming those posts by title. Restates '
  'packages/shared/src/assets/delete-gate.ts in SQL so the rule holds for every '
  'caller, not only the server action.';
