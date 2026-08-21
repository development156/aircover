-- ─────────────────────────────────────────────────────────────────────────────
-- K1 · knowledge_documents + knowledge_chunks — the brain keeps learning
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS MISSING TODAY.
-- The Brand Brain reads a website or a PDF ONCE, at onboarding, and never again.
-- Everything a business hands over afterwards — a new menu, a rate card, a
-- policy, an FAQ it wrote last week — has nowhere to go. `/brain/knowledge` says
-- so in as many words: "There is no library behind this screen." That sentence
-- is true and this file is what makes it false.
--
-- WHAT THIS FILE DOES. Two tables and four functions. `knowledge_documents` is
-- one row per thing the business gave us. `knowledge_chunks` is that thing cut
-- into passages a search can return and a model can be shown. The functions are
-- the only way either table is written.
--
-- ── WHY THERE IS NO EMBEDDING COLUMN, STATED PLAINLY ────────────────────────
-- Measured on this project 2026-08-22: `pg_extension` holds pgcrypto, uuid-ossp,
-- plpgsql, supabase_vault and pg_stat_statements. `vector` is AVAILABLE (0.8.2)
-- and NOT INSTALLED, and `packages/mesh` has no embedding provider of any kind.
-- A vector design would therefore need a new extension AND a new paid provider
-- before it could return a single row.
--
-- So retrieval here is Postgres full-text search: `tsv` below, a GIN index over
-- it, and PostgREST's `fts` operator, which is subject to exactly the same RLS
-- as every other read. It is worse than embeddings at finding a passage that
-- means the same thing in different words, and better at everything else that
-- matters right now — it is free, it is deterministic, it makes no model call,
-- and it cannot be wrong in a way nobody can reproduce.
--
-- Adding `embedding vector(N)` later is an ALTER TABLE and a backfill. Nothing
-- below has to change for it, and this comment is not a promise that it will.
--
-- ── WHY `to_tsvector('english'::regconfig, text)` AND NEVER `to_tsvector(text)` ─
-- The one-argument form reads `default_text_search_config` at call time, which
-- makes it STABLE, not IMMUTABLE — measured on this server: `pg_proc.provolatile`
-- is 's' for `to_tsvector(text)` and 'i' for `to_tsvector(regconfig, text)`. A
-- generated column REQUIRES an immutable expression, so the one-argument form
-- does not fail at query time or return odd results; it fails the `create table`
-- outright. The literal config is not a preference, it is the only form that
-- compiles.
--
-- IF THIS FILE IS WRONG: nothing that works today stops working. Both tables are
-- new, all four functions are new, and nothing in the running application reads
-- any of them. `/brain/knowledge` renders its coming-soon screen exactly as it
-- does now.
--
-- REVERSIBLE: yes — drop the four functions, then `knowledge_chunks`, then
-- `knowledge_documents`. Doing so discards the library records. The FILES
-- themselves live in storage and are not touched by this file at all, so nothing
-- a customer uploaded would be lost.
--
-- APPLY ORDER: `knowledge_documents` before `knowledge_chunks` before the
-- functions, which is why they are one file in this order. Independent of
-- everything else.


-- ── 1 of 7 ───────────────────────────────────────────────────────────────────
-- The library.
--
-- One row = one thing the business gave us, whatever shape it arrived in.
--
-- IF THIS IS WRONG: there is no library. Nothing existing is affected.
create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),

  -- Whose document it is. Every table in this database carries it and the
  -- security rules in section 4 are written against it.
  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- What the owner calls it. Defaulted from the filename or the page title at
  -- upload, and editable, because "menu-final-FINAL-v3.pdf" is not a name.
  title text not null,

  -- How it arrived. Three doors, and they are the three the coming-soon screen
  -- promised — a file, a page, and something typed or pasted.
  source_kind text not null check (source_kind in ('pdf', 'text', 'url')),

  -- WHERE IT CAME FROM, and this column is why the screen is worth having. The
  -- URL fetched, or the original filename, or the word 'typed'. It is `not null`
  -- deliberately: a fact with no source is the same thing as an invented fact
  -- that happens to be right, and you cannot tell them apart when it matters.
  source_ref text not null,

  -- Where the original sits in storage, for the doors that have an original.
  -- NULL for 'text' (nothing was uploaded) and for 'url' (the page is not ours
  -- to keep). The `media` bucket already stores objects under a folder named
  -- after the workspace, so `media/<workspace_id>/knowledge/<uuid>` is covered by
  -- the storage policies that already exist — no new storage rule is added by
  -- this file, which is the strongest available form of "the same scoping as
  -- assets": literally the same policy rows.
  storage_path text,

  mime text,
  bytes bigint,

  -- ── THE FOUR STATES, AND WHY 'indexing' IS ONE OF THEM ───────────────────
  -- `pending`  the row exists, nothing has been read yet
  -- `indexing` a read is underway. A REAL state, not a spinner: a 40-page PDF
  --            takes seconds to parse and the owner may reload in the middle of
  --            it. Without this the screen would have to choose between calling
  --            an unfinished document `failed` and calling it `indexed`.
  -- `indexed`  chunks exist for the CURRENT index_version and search can find it
  -- `failed`   the read did not produce usable text, and `failure_code` says why
  status text not null default 'pending'
    check (status in ('pending', 'indexing', 'indexed', 'failed')),

  -- WHY IT FAILED, as a code the application maps to a sentence. Constrained so
  -- that a typo becomes an error rather than a document that failed for a reason
  -- no screen has words for.
  failure_code text check (
    failure_code is null or failure_code in (
      'no_text',        -- opened fine, the words are inside the design
      'too_large',      -- above the ceiling the app enforces
      'unreadable',     -- the file did not parse as what it claimed to be
      'fetch_refused',  -- the address is one we will not fetch (SSRF guard)
      'fetch_failed',   -- the page did not answer
      'not_supported',  -- a kind we cannot read yet
      'interrupted'     -- Sahoda broke part-way. Our fault, and it says so.
    )
  ),

  -- The sentence shown to the owner, written by the application, in words a shop
  -- owner understands. Stored rather than derived so that a failure keeps its
  -- explanation even after the code that produced it has been rewritten.
  failure_detail text,

  -- ── THE COMPLETENESS WITNESS ─────────────────────────────────────────────
  -- Bumped by `index_knowledge_document` in the same transaction that writes the
  -- chunks. A chunk is served only when its `index_version` equals the one here,
  -- so a re-read that crashes half-way leaves chunks that NOTHING can return —
  -- they are not orphans to be cleaned up, they are simply not current.
  --
  -- Starts at 0, and 0 means "never successfully indexed". The first successful
  -- read writes 1.
  index_version int not null default 0,

  -- Facts about the CURRENT index_version. Written by the same function, in the
  -- same transaction, from the rows it just inserted — so the count on the screen
  -- is a count of rows that exist rather than a number somebody hoped was right.
  chunk_count int not null default 0,
  char_count int not null default 0,

  -- The hash of the extracted text. This is how a scheduled re-read of a URL can
  -- say "nothing changed" without re-indexing, and how the screen can tell an
  -- owner that two uploads are the same document.
  content_sha256 text,

  -- ── AN OBSERVATION, AND DELIBERATELY NOT A VERDICT ───────────────────────
  -- How many passages in this document contain text addressed to an assistant —
  -- "ignore your instructions", "you are now…", a fake system turn.
  --
  -- THIS IS NOT A SECURITY CONTROL AND THE SCREEN MUST NOT PRESENT IT AS ONE.
  -- `packages/research/src/quarantine.ts` carries the argument and cites the
  -- measurement: a 2025 joint OpenAI / Anthropic / Google DeepMind team bypassed
  -- twelve published prompt-injection defences with over 90% success. What holds
  -- the line here is architectural — text out of these tables reaches a model
  -- ONLY inside quarantine framing, on a task with no tools, whose output cannot
  -- express confirmation. A count of what a scanner happened to recognise is
  -- telemetry on top of that, and a zero here means "we did not recognise any",
  -- which is not the same claim as "there are none".
  --
  -- So: zero is never rendered as safety. `> 0` is rendered as an observation
  -- with the words quoted back.
  addressed_instructions int not null default 0,
  instruction_samples jsonb not null default '[]'::jsonb,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- When the CURRENT index_version was written. Distinct from `updated_at`,
  -- which moves when a title is edited. This codebase has a standing rule that a
  -- sync stamp proves a sync ran and never that anything was read, and collapsing
  -- the two would lose exactly that distinction.
  indexed_at timestamptz,

  -- Needed so `knowledge_chunks` below can point at both the document AND the
  -- customer in one link. Without this line the next table cannot be created.
  unique (id, workspace_id)
);

-- ONE ROW PER ADDRESS. A partial index rather than a table constraint because it
-- applies only to the URL door: two uploads of the same PDF are two documents
-- (the owner may genuinely have two editions), but ten rows for one page is ten
-- copies of one thing, and a re-read should replace rather than accumulate.
create unique index knowledge_documents_one_row_per_url
  on knowledge_documents (workspace_id, source_ref)
  where source_kind = 'url';


-- ── 2 of 7 ───────────────────────────────────────────────────────────────────
-- The passages.
--
-- A file list is not a knowledge library. This is the table that makes the
-- difference: one row is one passage, small enough to hand to a model and large
-- enough to mean something on its own.
--
-- APPEND-ONLY (section 5). A re-read writes a NEW index_version beside the old
-- one rather than editing it, so what the brain was actually shown on the day it
-- learned something is still there to be read afterwards.
--
-- IF THIS IS WRONG: nothing can be searched or retrieved. Nothing existing is
-- affected.
create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  document_id uuid not null,

  -- Which read of the document this passage belongs to. See `index_version` above.
  index_version int not null,

  -- Position within that read, from 0. This is what a citation points at and what
  -- puts two adjacent passages back in order on screen.
  ordinal int not null,

  text text not null,

  -- Worked out by the database rather than supplied, so it can never disagree
  -- with the column beside it.
  char_count int generated always as (length(text)) stored,

  -- What search actually matches on. `english` is spelled as a literal regconfig
  -- because the one-argument form is STABLE and a generated column requires
  -- IMMUTABLE — see the header. It is also what makes the config a FACT about the
  -- stored row rather than a property of whoever happens to be querying.
  --
  -- ONE HONEST LIMITATION: 'english' stems English. A Hindi or Tamil menu is
  -- still searchable — the tokens are stored and matched — but without stemming,
  -- so a word only matches its own form. That is a real limit on a product built
  -- for Indian small businesses and it is written here rather than discovered.
  tsv tsvector generated always as (to_tsvector('english'::regconfig, text)) stored,

  created_at timestamptz not null default now(),

  -- One passage per position per read. This is what makes the indexing function
  -- safe to run twice: a retry that got half-way cannot produce two rows for one
  -- position and quietly double a count.
  unique (document_id, index_version, ordinal),

  -- Both the document AND the customer, so a passage can never be attached to a
  -- document in someone else's account. The same composite every other child
  -- table in this schema uses, and the line that makes a cross-account mix-up
  -- impossible rather than merely unlikely.
  foreign key (document_id, workspace_id)
    references knowledge_documents (id, workspace_id) on delete cascade
);


-- ── 3 of 7 ───────────────────────────────────────────────────────────────────
-- The indexes the security rules and the two real questions need: "show me my
-- library" and "which passages mention this word?".
--
-- The `workspace_id` indexes are required by the policies in section 4, which
-- filter on it on EVERY read; without them every read scans the whole table.
--
-- The GIN index is what makes full-text search a search rather than a scan. It
-- is built over `tsv` — the generated column — and a query must match against
-- that column to use it. Matching against `text` makes PostgREST wrap it in
-- `to_tsvector(text)` at query time, which is a different expression and will not
-- use this index.
--
-- IF THESE ARE WRONG: nothing is incorrect, the library is just slow.
create index on knowledge_documents (workspace_id);
create index on knowledge_documents (workspace_id, status);
create index on knowledge_chunks (workspace_id);
create index on knowledge_chunks (document_id, index_version);
create index on knowledge_chunks using gin (tsv);


-- ── 4 of 7 ───────────────────────────────────────────────────────────────────
-- Security. Members READ their own library and write nothing directly.
--
-- READ-ONLY, and this is the decision the whole feature rests on. Full CRUD would
-- let a member rewrite the passages their Brand Brain was built from — which
-- destroys the one thing this screen exists to guarantee, that a stored fact can
-- be traced to the document it came from. Every write goes through one of the
-- functions in sections 6 and 7, each of which checks membership itself.
--
-- The same argument `brand_memory` and `memory_events` already make, and the same
-- helper they already use.
--
-- IF THIS IS WRONG in the strict direction: the library screen shows nothing.
-- IF THIS IS WRONG in the loose direction: one customer could read another's
-- documents. Worth reading twice before applying.
select app.apply_tenant_read_policy('knowledge_documents');
select app.apply_tenant_read_policy('knowledge_chunks');


-- ── 5 of 7 ───────────────────────────────────────────────────────────────────
-- Nothing may edit or delete a passage once it is written — not a member, not a
-- function, not the service account. A record of what the brain was shown is only
-- worth keeping if it cannot be revised afterwards.
--
-- Deleting a whole DOCUMENT still removes its passages: `app.block_mutations`
-- returns early when `pg_trigger_depth() > 1`, and a cascade from the parent
-- arrives at depth 2. That is how `post_metric_snapshots` already behaves and it
-- is what makes the delete in section 7 possible at all.
--
-- CONSEQUENCE THE INDEXING FUNCTION MUST RESPECT, and does: a re-read cannot
-- delete the previous passages, so it writes a new `index_version` beside them.
--
-- `knowledge_documents` gets NO such trigger, on purpose. A document is a living
-- row: its status moves, its title is editable, and its failure is recorded on it.
create trigger block_mutations before update or delete on knowledge_chunks
  for each row execute function app.block_mutations();

create trigger set_updated_at before update on knowledge_documents
  for each row execute function app.set_updated_at();


-- ── 6 of 7 ───────────────────────────────────────────────────────────────────
-- THE WRITES.
--
-- ── WHY THESE ARE FUNCTIONS AND NOT A SERVICE-ROLE INSERT ───────────────────
-- `apps/web/src/lib/ops/service-rpc.ts` confines the service-role key to the ops
-- console, and `service-rpc.test.ts` asserts that its client is never exported.
-- That containment is deliberate: the service key bypasses RLS entirely, so every
-- new caller of it is a new way for a workspace boundary to be crossed by
-- accident. These functions are the alternative the rest of this schema already
-- uses — `security definer`, membership checked in the function, execute granted
-- to `authenticated` only.
--
-- ── WHY `security definer` AND NOT `invoker` ────────────────────────────────
-- The tables are read-only under RLS (section 4), so an invoker-rights function
-- could not write at all. Definer rights are what make the write possible, and
-- the membership check immediately below is what stops them being a way to write
-- into someone else's library. Every function here performs that check before it
-- touches a row, and none of them accepts a workspace id it has not verified.

-- One shared membership check, so the rule is written once.
create or replace function app.assert_knowledge_member(p_workspace_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user text;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;
  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;
  if not exists (
    select 1 from workspace_members m
     where m.workspace_id = p_workspace_id and m.user_id = v_user
  ) then
    -- A non-member gets NOT_A_MEMBER whether or not the workspace exists. Telling
    -- a caller that a workspace they cannot see EXISTS is a disclosure.
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  return v_user;
end;
$$;

-- CREATE. Registers a document before anything has been read from it, so the
-- screen can show it as `pending` from the moment the upload lands rather than
-- appearing only once the parse finishes.
--
-- Errors: AUTH_REQUIRED · INVALID_WORKSPACE · NOT_A_MEMBER · INVALID_SOURCE_KIND
create or replace function public.create_knowledge_document(
  p_workspace_id uuid,
  p_title        text,
  p_source_kind  text,
  p_source_ref   text,
  p_storage_path text default null,
  p_mime         text default null,
  p_bytes        bigint default null
) returns knowledge_documents
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user text;
  v_row  knowledge_documents%rowtype;
begin
  v_user := app.assert_knowledge_member(p_workspace_id);

  if p_source_kind is null or p_source_kind not in ('pdf', 'text', 'url') then
    raise exception 'INVALID_SOURCE_KIND' using errcode = 'raise_exception';
  end if;
  -- `~ '[^[:space:]]'` and not `btrim(...) = ''` — see the note in
  -- `index_knowledge_document`: one-argument btrim strips spaces only.
  if p_title is null or p_title !~ '[^[:space:]]' then
    raise exception 'INVALID_TITLE' using errcode = 'raise_exception';
  end if;
  if p_source_ref is null or p_source_ref !~ '[^[:space:]]' then
    raise exception 'INVALID_SOURCE' using errcode = 'raise_exception';
  end if;

  -- THE URL DOOR REPLACES; THE FILE DOORS ACCUMULATE. Re-reading a page the
  -- library already holds must not leave two rows for one address, and the
  -- partial unique index in section 1 would refuse the insert. `on conflict`
  -- turns that refusal into the intended behaviour — the existing row is put back
  -- into `pending` and re-read — rather than into an error the screen has to
  -- explain. Two uploads of the same PDF stay two documents: an owner may
  -- genuinely hold two editions, and merging them would be a guess.
  insert into knowledge_documents (
    workspace_id, title, source_kind, source_ref, storage_path, mime, bytes,
    status, created_by
  )
  values (
    -- Two-argument btrim, naming every whitespace character. The one-argument
    -- form would leave a trailing newline on a pasted title.
    p_workspace_id, btrim(p_title, E' \t\r\n'), p_source_kind, btrim(p_source_ref, E' \t\r\n'),
    p_storage_path, p_mime, p_bytes, 'pending', v_user
  )
  on conflict (workspace_id, source_ref) where source_kind = 'url'
  do update set
    title          = excluded.title,
    status         = 'pending',
    failure_code   = null,
    failure_detail = null
  returning * into v_row;

  return v_row;
end;
$$;

-- MARK A READ AS UNDERWAY. Separate from the create so that a retry of a failed
-- document is visible as `indexing` rather than silently sitting at `failed`
-- while work happens.
create or replace function public.start_knowledge_indexing(p_document_id uuid)
returns knowledge_documents
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_row knowledge_documents%rowtype;
begin
  select * into v_row from knowledge_documents where id = p_document_id;
  if not found then
    raise exception 'INVALID_DOCUMENT' using errcode = 'raise_exception';
  end if;
  perform app.assert_knowledge_member(v_row.workspace_id);

  update knowledge_documents
     set status = 'indexing', failure_code = null, failure_detail = null
   where id = p_document_id
  returning * into v_row;

  return v_row;
end;
$$;

-- INDEX. The whole read, in ONE transaction.
--
-- ── WHY ATOMIC IS THE POINT OF THIS FUNCTION ────────────────────────────────
-- Written as three round trips — bump the version, insert the passages, flip the
-- status — a crash between the second and the third leaves a document at
-- `indexing` whose passages search would happily return, with a chunk_count that
-- does not match how many rows exist. Here the version bump, every passage and
-- the status move commit together or none of them do.
--
-- The `index_version` filter in section 7's reads is the second guard on the same
-- hole, and the two are NOT the same guard twice: this one stops a partial write
-- from being committed, and that one stops any passage of a superseded read from
-- being served even though it committed perfectly well.
--
-- `p_chunks` arrives as a text[] rather than as jsonb because every element is a
-- passage of plain text and jsonb would mean escaping and re-parsing each one.
-- The ordinal is the array position, so the caller cannot supply a gap.
--
-- Errors: AUTH_REQUIRED · INVALID_DOCUMENT · NOT_A_MEMBER · NO_CHUNKS
-- Returns: { document_id, index_version, chunk_count, char_count }
create or replace function public.index_knowledge_document(
  p_document_id          uuid,
  p_chunks               text[],
  p_content_sha256       text default null,
  p_addressed_instructions int default 0,
  p_instruction_samples  jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc     knowledge_documents%rowtype;
  v_version int;
  v_count   int;
  v_chars   int;
begin
  -- `for update` holds the document for the rest of the transaction, so two
  -- concurrent reads of the same document cannot both claim the same version.
  select * into v_doc from knowledge_documents where id = p_document_id for update;
  if not found then
    raise exception 'INVALID_DOCUMENT' using errcode = 'raise_exception';
  end if;
  perform app.assert_knowledge_member(v_doc.workspace_id);

  if p_chunks is null or array_length(p_chunks, 1) is null then
    -- A read that produced no passages is a FAILURE, and it has its own function
    -- with its own reason. Recording it as a successful index of nothing would
    -- put a document in the library that search can never return.
    raise exception 'NO_CHUNKS' using errcode = 'raise_exception';
  end if;

  v_version := v_doc.index_version + 1;

  -- Every passage, from the array, with the ordinal taken from the array position.
  -- `char_count` and `tsv` are GENERATED columns and are deliberately absent from
  -- this column list: naming them here is an error, not a value.
  insert into knowledge_chunks (workspace_id, document_id, index_version, ordinal, text)
  select v_doc.workspace_id, v_doc.id, v_version, t.ordinality - 1, t.chunk
    from unnest(p_chunks) with ordinality as t(chunk, ordinality)
    -- ── WHY A CHARACTER CLASS AND NOT `btrim(t.chunk) <> ''` ──────────────
    -- MEASURED 2026-08-22, by a test written to prove this line worked:
    -- PostgreSQL's ONE-ARGUMENT `btrim(text)` strips SPACES ONLY. Not tabs, not
    -- newlines. So `btrim(E'\n') = E'\n'`, a passage of pure whitespace passed
    -- the check, and the library gained a chunk that search would return as a
    -- hit containing nothing — with `chunk_count` claiming a passage that says
    -- nothing. `~ '[^[:space:]]'` is what "not blank" actually means: it holds
    -- only if at least one character is not whitespace of any kind.
   where t.chunk ~ '[^[:space:]]';

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'NO_CHUNKS' using errcode = 'raise_exception';
  end if;

  -- Counted from the rows that were actually inserted, not from the input array.
  -- Blank passages are skipped above, so the two can differ, and the number on
  -- the screen has to be the number of rows a search can return.
  select coalesce(sum(c.char_count), 0) into v_chars
    from knowledge_chunks c
   where c.document_id = v_doc.id and c.index_version = v_version;

  update knowledge_documents
     set status                  = 'indexed',
         index_version           = v_version,
         chunk_count             = v_count,
         char_count              = v_chars,
         content_sha256          = p_content_sha256,
         addressed_instructions  = greatest(coalesce(p_addressed_instructions, 0), 0),
         instruction_samples     = coalesce(p_instruction_samples, '[]'::jsonb),
         failure_code            = null,
         failure_detail          = null,
         indexed_at              = now()
   where id = v_doc.id;

  return jsonb_build_object(
    'document_id',   v_doc.id,
    'index_version', v_version,
    'chunk_count',   v_count,
    'char_count',    v_chars
  );
end;
$$;

-- FAIL. A read that did not work, recorded with the reason, in the owner's words.
--
-- Errors: AUTH_REQUIRED · INVALID_DOCUMENT · NOT_A_MEMBER · INVALID_FAILURE_CODE
create or replace function public.fail_knowledge_document(
  p_document_id uuid,
  p_code        text,
  p_detail      text
) returns knowledge_documents
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_row knowledge_documents%rowtype;
begin
  select * into v_row from knowledge_documents where id = p_document_id;
  if not found then
    raise exception 'INVALID_DOCUMENT' using errcode = 'raise_exception';
  end if;
  perform app.assert_knowledge_member(v_row.workspace_id);

  if p_code is null or p_code not in (
    'no_text', 'too_large', 'unreadable', 'fetch_refused',
    'fetch_failed', 'not_supported', 'interrupted'
  ) then
    raise exception 'INVALID_FAILURE_CODE' using errcode = 'raise_exception';
  end if;
  if p_detail is null or p_detail !~ '[^[:space:]]' then
    -- A failure with no sentence is a red badge a shop owner cannot act on.
    raise exception 'INVALID_FAILURE_DETAIL' using errcode = 'raise_exception';
  end if;

  -- A FAILED RE-READ DOES NOT TAKE THE PREVIOUS READ DOWN WITH IT. `index_version`
  -- is untouched here, so the passages from the last successful read are still
  -- current and search still returns them. The document says it could not be
  -- refreshed; it does not pretend to be empty.
  update knowledge_documents
     set status = 'failed', failure_code = p_code,
         failure_detail = btrim(p_detail, E' \t\r\n')
   where id = p_document_id
  returning * into v_row;

  return v_row;
end;
$$;


-- ── 7 of 7 ───────────────────────────────────────────────────────────────────
-- DELETING A DOCUMENT, AND SAYING WHAT IT COSTS FIRST.
--
-- ── WHY THE IMPACT IS COMPUTED HERE AND NOT IN THE SERVER ACTION ────────────
-- The ruling from the media library (20260820000100_delete_asset_rpc.sql) is that
-- a delete gate is a database function and never a check in the application: read
-- the impact, then delete, in two round trips, and anything that changes in
-- between is decided on stale facts. The same applies exactly here — a Brand Brain
-- version written between the read and the delete would cite a document that no
-- longer exists, and the screen would have promised the owner it affected nothing.
--
-- So the count and the delete happen in ONE transaction, and the caller cannot get
-- one without the other.
--
-- ── WHAT "AFFECTS" MEANS, PRECISELY ─────────────────────────────────────────
-- Two things cite a document, and both are counted:
--   · fields in the ACTIVE Brand Brain whose `payload.field_meta.<path>.source`
--     is `document:<this id>` — values already in the brain that came from here;
--   · PENDING `memory_events` whose `evidence_refs` name this document — proposals
--     an owner has not yet decided on.
--
-- Deleting does NOT retract either one. A fact the brain learned stays learned:
-- unlearning it silently would be a second, larger surprise, and the owner may
-- well have deleted the file precisely because the fact is now theirs. What the
-- delete does is break the CITATION, and that is exactly what the screen has to
-- say out loud before it happens — which is why this refuses without
-- `p_acknowledge` when the count is above zero.
--
-- It does not remove the object from storage. Postgres cannot, and a transaction
-- that could would be one that deletes a customer's file and then rolls back the
-- row pointing at it. The caller removes the object AFTER this commits, using the
-- path returned here.
--
-- Errors: AUTH_REQUIRED · INVALID_DOCUMENT · NOT_A_MEMBER · NEEDS_ACKNOWLEDGEMENT
-- Returns: { storage_path, brand_fields, pending_proposals, deleted }
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

  -- Brand Brain fields citing this document. The active row is locked first, so a
  -- concurrent resolve cannot add a citation after this count is taken.
  select count(*) into v_fields
    from brand_memory b,
         lateral jsonb_each(coalesce(b.payload -> 'field_meta', '{}'::jsonb)) as f(path, meta)
   where b.workspace_id = v_doc.workspace_id
     and b.status = 'active'
     and f.meta ->> 'source' = v_cite;

  -- Proposals still waiting on a decision.
  select count(*) into v_proposals
    from memory_events e
   where e.workspace_id = v_doc.workspace_id
     and e.status = 'pending'
     and e.evidence_refs::text like '%' || v_doc.id::text || '%';

  if (v_fields + v_proposals) > 0 and not coalesce(p_acknowledge, false) then
    -- Refused rather than truncated. A caller that forgets to ask cannot delete
    -- anything the brain is standing on.
    raise exception 'NEEDS_ACKNOWLEDGEMENT' using errcode = 'raise_exception';
  end if;

  -- The passages go with it, by cascade, which `app.block_mutations` permits
  -- because a cascade arrives at trigger depth 2.
  delete from knowledge_documents where id = v_doc.id;

  return jsonb_build_object(
    'storage_path',      v_doc.storage_path,
    'brand_fields',      v_fields,
    'pending_proposals', v_proposals,
    'deleted',           true
  );
end;
$$;


-- EXECUTE is revoked from the world and granted to signed-in callers only. Each
-- signature is spelled in full: PostgreSQL matches on argument types, and a
-- partial spelling silently targets nothing.
revoke all on function app.assert_knowledge_member(uuid) from public;

revoke all on function public.create_knowledge_document(uuid, text, text, text, text, text, bigint) from public;
grant execute on function public.create_knowledge_document(uuid, text, text, text, text, text, bigint) to authenticated;

revoke all on function public.start_knowledge_indexing(uuid) from public;
grant execute on function public.start_knowledge_indexing(uuid) to authenticated;

revoke all on function public.index_knowledge_document(uuid, text[], text, int, jsonb) from public;
grant execute on function public.index_knowledge_document(uuid, text[], text, int, jsonb) to authenticated;

revoke all on function public.fail_knowledge_document(uuid, text, text) from public;
grant execute on function public.fail_knowledge_document(uuid, text, text) to authenticated;

revoke all on function public.delete_knowledge_document(uuid, boolean) from public;
grant execute on function public.delete_knowledge_document(uuid, boolean) to authenticated;

-- ── THE READ EVERY CALLER SHOULD USE ─────────────────────────────────────────
--
-- WHY A VIEW AND NOT A CONVENTION. The rule that keeps a superseded passage out
-- of search is `chunk.index_version = document.index_version`, and until this
-- view existed that rule lived only in whoever wrote the query. Nothing refused a
-- reader who forgot it, and the way it fails is silent and expensive: last
-- month's price returned as current, cited to a document that no longer says it.
--
-- A mutation test on 2026-08-22 made the gap explicit — every other guarantee in
-- this file could be broken and watched to go red, and this one could not,
-- because it was not in the file at all. So it is now.
--
-- `security_invoker = true` is what keeps it honest: without it a view runs with
-- its OWNER's rights and would hand every workspace's passages to anybody who
-- could select from it — a view is exactly how an RLS boundary gets bypassed by
-- accident. With it, the two policies underneath apply to the caller as usual.
--
-- IF THIS IS WRONG in the loose direction: one customer reads another's passages.
-- Worth reading twice.
create view knowledge_current_chunks with (security_invoker = true) as
  select c.id,
         c.workspace_id,
         c.document_id,
         c.ordinal,
         c.text,
         c.char_count,
         c.tsv,
         c.created_at,
         d.title          as document_title,
         d.source_kind    as document_source_kind,
         d.source_ref     as document_source_ref,
         d.addressed_instructions
    from knowledge_chunks c
    join knowledge_documents d
      on d.id = c.document_id
     and d.workspace_id = c.workspace_id
     and d.index_version = c.index_version
   where d.status = 'indexed';

grant select on knowledge_current_chunks to authenticated;

comment on view knowledge_current_chunks is
  'The only passages that should ever be searched or shown to a model: those '
  'belonging to a document''s CURRENT index_version, on a document that indexed '
  'successfully. security_invoker, so the caller''s own RLS still applies.';

comment on table knowledge_documents is
  'One row per thing the business gave Sahoda to learn from — a file, a page or '
  'something typed. Read-only to members; every write goes through the functions '
  'in this migration, each of which checks workspace membership itself.';

comment on table knowledge_chunks is
  'Passages of a document, cut small enough to hand to a model and searched with '
  'Postgres full-text search over the generated `tsv` column. Append-only: a '
  're-read writes a new index_version beside the old one, and only passages whose '
  'index_version matches the document''s are ever served.';
