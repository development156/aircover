-- ─────────────────────────────────────────────────────────────────────────────
-- Slice C · 05 · Inbox foundations — threads and messages
--
-- FSD M7: "Poll/webhook per platform → inbox_threads/messages (deduped by
-- platform message ID)". This is that pair of tables, plus the dedupe key that
-- makes re-polling safe.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────
-- It does not invent a source. There is no verified way to READ Google Business
-- Profile reviews today: Zernio publishes, and nothing in doc 13 or their
-- reachable surface documents a reviews endpoint. So these tables ship EMPTY and
-- the UI says so, rather than being seeded with plausible-looking reviews that
-- would be indistinguishable from real ones the moment anybody screenshotted them.
--
-- The schema is still worth having now: it fixes the shape, the tenant boundary
-- and the dedupe rule while they are cheap to change, so wiring an ingest later is
-- a writer, not a migration plus a rewrite of everything that read the old shape.
--
-- ── WHY A REPLY IS A MESSAGE AND NOT A COLUMN ────────────────────────────────
-- A reply drafted here and a reply that reached the platform are different facts,
-- and a nullable `reply_text` column cannot hold both. As its own message row with
-- a `direction` and a `platform_message_id`, an unsent draft is simply a row whose
-- platform id is still null — the same test that tells `.is-real` from a draft
-- everywhere else in this codebase: the presence of the platform's own identifier.
-- ─────────────────────────────────────────────────────────────────────────────

create table inbox_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,

  channel text not null check (channel in ('x', 'gbp', 'linkedin', 'instagram')),

  -- What kind of conversation this is. `review` carries a rating; the others do not.
  kind text not null default 'comment'
    check (kind in ('review', 'comment', 'mention', 'dm', 'question')),

  -- The platform's own id for the thread. THE dedupe key: a poll that runs twice
  -- must update one row rather than create a second, and this is what makes the
  -- unique index below meaningful.
  platform_thread_id text not null,

  -- Who it is from, as the platform describes them. No attempt to resolve a person
  -- across channels — that is a claim we cannot support.
  author_name text,
  author_handle text,

  -- 1–5 for a review, null for everything else. CHECK rather than a bare int so a
  -- 0-star or 7-star row cannot exist and quietly skew a ratings average.
  rating int check (rating is null or rating between 1 and 5),

  body text,
  permalink text,

  status text not null default 'open'
    check (status in ('open', 'snoozed', 'resolved')),
  -- Resolved threads reopen automatically on new inbound (FSD M7); the job that
  -- does that flips this back to 'open' and clears snoozed_until.
  snoozed_until timestamptz,
  assigned_to text,

  -- When the platform says it happened, which is NOT when we learned of it. Both
  -- are kept: an SLA timer measured from our own ingest would restart every time a
  -- poll was late, quietly hiding exactly the delay it exists to surface.
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The dedupe rule, per FSD M7. Scoped to the workspace as well as the channel:
  -- two workspaces can legitimately hold the same public review of the same place.
  unique (workspace_id, channel, platform_thread_id)
);

create index on inbox_threads (workspace_id, status, posted_at desc);
create index on inbox_threads (workspace_id, channel, kind);

comment on table inbox_threads is
  'One conversation from a platform — a review, comment, mention, DM or question. '
  'Deduped on (workspace_id, channel, platform_thread_id) so re-polling updates '
  'rather than duplicates. EMPTY until an ingest exists: no verified read API for '
  'GBP reviews is available, and seeding plausible rows would be indistinguishable '
  'from real ones.';

create table inbox_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  thread_id uuid not null references inbox_threads (id) on delete cascade,

  direction text not null check (direction in ('inbound', 'outbound')),

  body text not null,

  /**
   * The platform's id for this message, and the ONLY evidence it exists off our
   * own database. Null means drafted-not-sent — the same rule `.is-real` uses
   * everywhere else: a thing is real when the platform has named it.
   */
  platform_message_id text,
  sent_at timestamptz,

  -- Who wrote it. Null for inbound (the platform's author is on the thread) and a
  -- Clerk subject for an outbound reply a person composed.
  author_user_id text,

  created_at timestamptz not null default now(),

  -- Same dedupe discipline as threads, but only for messages the platform HAS
  -- named. Drafts are excluded by the WHERE clause: several drafts on one thread
  -- is a legitimate state, and NULLs are distinct in a unique index anyway, so
  -- without the predicate this index would silently permit exactly what it looks
  -- like it forbids.
  constraint inbox_messages_sent_has_id
    check ((sent_at is null) = (platform_message_id is null))
);

create unique index inbox_messages_platform_id_idx
  on inbox_messages (workspace_id, platform_message_id)
  where platform_message_id is not null;

create index on inbox_messages (thread_id, created_at);

comment on column inbox_messages.platform_message_id is
  'The platform''s own id. NULL means this reply was drafted here and never sent — '
  'the presence of this field is what distinguishes a draft from a real reply, and '
  'the CHECK keeps it inseparable from sent_at so neither can be set alone.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Members read their workspace's inbox. Writes are member-scoped too: unlike
-- `connections`, nothing here is a credential, and a reply draft is ordinary
-- content a member is entitled to create. What a member CANNOT do is claim a
-- message reached a platform — `platform_message_id` and `sent_at` are set by the
-- ingest under service_role, and the CHECK above stops either being set alone.

alter table inbox_threads enable row level security;
alter table inbox_messages enable row level security;

create policy inbox_threads_select on inbox_threads for select to authenticated
  using (workspace_id in (select app.member_workspace_ids()));

-- Update only: status, assignment and snoozing are member actions. INSERT stays
-- closed because a thread is something a platform told us about, not something a
-- member may invent — a hand-written "review" would be a fabricated record.
create policy inbox_threads_update on inbox_threads for update to authenticated
  using (workspace_id in (select app.member_workspace_ids()))
  with check (workspace_id in (select app.member_workspace_ids()));

create policy inbox_messages_select on inbox_messages for select to authenticated
  using (workspace_id in (select app.member_workspace_ids()));

create policy inbox_messages_insert on inbox_messages for insert to authenticated
  with check (
    workspace_id in (select app.member_workspace_ids())
    -- A member may write a DRAFT reply and nothing else. Both null by the CHECK's
    -- pairing, restated here so the policy alone is sufficient to reason about.
    and direction = 'outbound'
    and platform_message_id is null
    and sent_at is null
  );

create trigger set_updated_at before update on inbox_threads
  for each row execute function app.set_updated_at();
