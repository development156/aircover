# 28 · How `assets` and `post_media` coexist

**Status:** ruling. Written 2026-08-20, with the library screen built and in front of the
author. Supersedes the note in `20260819000400_assets.sql` that deferred this decision
("whoever builds the library screen decides when, or whether, to retire the old path").

**Scope of this document:** it decides the *shape*. It deliberately does not migrate a single
existing row, and section 5 says why that is the right order.

---

## 1. What each table is

| | `post_media` | `assets` |
|---|---|---|
| owned by | one post (`post_id` NOT NULL) | the workspace |
| answers | "what is on this post?" | "what photos do we have?" |
| has a kind | no — only a nullable `mime` | yes, `kind` CHECK (image/video/document) |
| reusable | no. Same photo on 3 posts = 3 rows, 3 uploads | yes. One row, many usages |
| back-reference | none | `asset_usages` |
| **read by the publisher** | **yes** | **no** |

That last row is the whole engineering constraint. `apps/jobs/src/publish/store.ts` runs:

```sql
select storage_path, mime, bytes from post_media
 where post_id = $1 and workspace_id = $2
 order by created_at
```

It is the only media query in the publish path. Nothing else decides what goes out.

---

## 2. The ruling: `post_media` stays, and gains a pointer

`post_media` remains **the attachment table** — the single answer to "what is on this post",
and the single thing the publisher reads. `assets` is **the library** — the single answer to
"what do we have". They are not two implementations of one idea; they are two different
questions that happen to be about the same bytes.

Migration `20260820000000_asset_attachments.sql` adds one nullable column:

```sql
alter table post_media add column asset_id uuid;
alter table post_media add constraint post_media_asset_fk
  foreign key (asset_id, workspace_id) references assets (id, workspace_id)
  on delete restrict;
```

- `asset_id` **null** — uploaded straight onto this post. Exactly what every row was before.
- `asset_id` **set** — came from the library. `storage_path` is the *library's own object*;
  the bytes are **not copied**, which is the entire economy of having a library.

`asset_usages` is written by a trigger on `post_media`, never by application code. Two tables
that must agree, written by two statements, is a pair that eventually disagrees — and the
disagreement is silent and asymmetric: a stale usage row refuses a delete that was safe, a
missing one permits a delete that was not. The second is the data-loss direction, so there is
one write path and a caller that forgets cannot exist.

### Three alternatives considered and rejected

**(a) Write only `asset_usages`, leave `post_media` alone.** Rejected: the publisher does not
read `asset_usages`, so the composer would show an attached photo that never goes out — a
success message over a post that publishes without its picture.

**(b) Copy the bytes into a per-post object on attach.** Rejected: it makes the library a
gallery of things you copy rather than things you use, doubles storage for the logo that goes
on every post, and breaks the "used in" read, which is the only thing standing between a
delete button and someone's scheduled post.

**(c) Teach the publish path to read `asset_usages`.** Rejected *for now*: it changes the
blast radius from "one nullable column" to "the query that decides what goes out", it would
have to merge two sources per post, and it buys nothing a pointer does not. Reconsider only
if per-channel media (`asset_usages.channel`, which exists and is always null today) is
actually built — that is the one feature `post_media` genuinely cannot express, because it has
no channel column.

---

## 3. What is NOT migrated, and why not in this session

The 23 existing `post_media` rows in production keep `asset_id = null`. Nothing reads them
differently, nothing moves, nothing is deleted.

Backfilling them into the library would have to guess which of several identical uploads are
"the same photo". The only evidence available is `storage_path` (a fresh uuid per upload, so
never equal), and byte length + dimensions — which match for two genuinely different photos
far more often than anyone expects. **A wrong guess merges two customers' distinct files into
one library entry**, and from that moment the delete gate is protecting the wrong post. A
migration should not guess.

It is also not urgent. Nothing is lost by waiting: both tables keep working, and the decision
can be made at any time because nothing here is destructive.

### If a backfill is ever wanted, this is the shape

1. **Hash first, guess never.** Read each object's bytes, take a SHA-256, and treat equal
   hashes as one file. That is evidence rather than a heuristic. It costs one storage read per
   row, which at 23 rows is nothing and at 23,000 is a job.
2. **Per workspace, never across.** Two workspaces with byte-identical logos are two files.
   The composite key already makes the wrong answer unrepresentable; keep it that way.
3. **Insert, then point.** Create the `assets` row, then `update post_media set asset_id = …`.
   The trigger writes `asset_usages` on insert only, so a backfill must write the usage rows
   itself — or, better, be run as delete-and-reinsert of the `post_media` row inside one
   transaction so the trigger stays the only writer.
4. **Additive and re-runnable.** A row that already has an `asset_id` is skipped. Running it
   twice must be a no-op.
5. **Nothing is deleted.** Not the objects, not the rows. A backfill that removes the old path
   is two changes wearing one name.

---

## 4. Which table to use, for whoever reads this next

- Adding a picture to a post → **insert `post_media`**. From the library, set `asset_id` and
  reuse the library's `storage_path`. From a fresh upload, leave `asset_id` null.
- Asking what is on a post → **`post_media`**. Never `asset_usages`; it does not know about
  direct uploads.
- Asking what the workspace has → **`assets`**.
- Asking where a file is used → **`asset_usages`**, which the trigger keeps true.
- Deleting a library file → **`deleteAsset`**, never a bare `delete from assets`. The trigger
  refuses in the dangerous cases regardless, but the action is what produces a sentence.
- Removing a photo from a post → **`detachMedia`**. It removes the storage object **only** for
  a direct upload. For a library file it removes the attachment and leaves the file.

---

## 5. What would make this ruling wrong

- **Per-channel media ships.** `asset_usages.channel` exists and is always null today. If a
  post ever carries a different photo per channel, `post_media` cannot express it and option
  (c) becomes the right answer.
- **Video or documents ship.** Both are in the `assets.kind` CHECK and neither can be uploaded
  today, because every channel's `mediaTypes` lists four image types and `sniffImage` reads
  exactly those four. A video path would need its own sniffer and its own publish handling, and
  that is where the two tables should be re-examined rather than extended by reflex.
- **The publisher gains a second media source.** If anything other than
  `apps/jobs/src/publish/store.ts` starts deciding what goes out, the "one table the publisher
  reads" property is gone and this whole document needs rewriting rather than amending.
