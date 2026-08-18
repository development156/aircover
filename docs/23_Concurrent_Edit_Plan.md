# Concurrent edit — two tabs, one post

**Status:** plan. No migration written, none run. The UI half is built and shipped
inert; the migration is the only remaining step.

## What happens today

Measured on the QA account, two tabs open on the same post, both in the create
flow's Content step:

| step | tab A | tab B | row |
|---|---|---|---|
| 1 | opens the post | opens the post | `""` |
| 2 | — | types "TAB B wrote this second.", blurs | `TAB B wrote this second.` |
| 3 | types "TAB A wrote this, unaware of B.", blurs | — | `TAB A wrote this, unaware of B.` |
| 4 | shows its own text, marked **Saved** | still shows its own text | A's |

B's work is gone. **B is never told**, and A never knew there was anything to
overwrite. Both tabs read "Saved".

The post EDITOR (`/posts/[id]`) does better on the canonical body: `use-autosave`
carries `detectConflict` and renders a divergence notice. It cannot do the same
for **variants**, and its own comment says why — `posts` has no version column, so
every `updated_at` a client sees is a post-write one and post-write timestamps
cannot say who overwrote whom. What it detects is "the row moved", not "you lost".

`post_variants` has no equivalent read at all. Nothing detects this.

## Why not fix it from timestamps

Because it would be a guess wearing a fact's clothes. `updated_at` after a write
is always your own write's timestamp; distinguishing "someone else wrote" from
"my own echo" needs a value the writer supplies and the database compares. That
is a compare-and-set, and it needs a column.

`resolve_brand_memory` already uses this shape (`p_expected_version`), so the
pattern is established in this codebase rather than invented for this.

## The migration (NOT RUN — for the founder to read first)

```sql
-- post_variants gains an optimistic-concurrency version.
-- Backfilled to 1 so existing rows are valid immediately.
alter table public.post_variants
  add column if not exists version integer not null default 1;

-- The write becomes a compare-and-set. Returns the row on success and
-- NOTHING on a version mismatch, so the caller can tell the two apart
-- without a second read.
create or replace function public.save_post_variant(
  p_post_id          uuid,
  p_workspace_id     uuid,
  p_channel          text,
  p_body             text,
  p_extras           jsonb,
  p_char_count       integer,
  p_expected_version integer
)
returns public.post_variants
language plpgsql
security invoker              -- RLS still decides. This is concurrency, not auth.
as $$
declare
  updated public.post_variants;
begin
  update public.post_variants
     set body       = p_body,
         extras     = p_extras,
         char_count = p_char_count,
         version    = version + 1,
         updated_at = now()
   where post_id      = p_post_id
     and workspace_id = p_workspace_id
     and channel      = p_channel
     and version      = p_expected_version   -- ← the whole mechanism
  returning * into updated;

  return updated;   -- NULL when the version did not match
end;
$$;
```

Two notes for review:

- `security invoker`, so RLS is unchanged and this grants nothing. A
  `security definer` version would move a tenant boundary for no reason.
- The `where` names `workspace_id` as well as `post_id`. The composite is what
  every other write in this repo scopes on; dropping it here to "simplify" would
  make the function the one place a post could be written cross-tenant.

## Call sites that must pass and handle a version

| site | today | after |
|---|---|---|
| `app/actions/posts.ts` → `saveVariant` | plain `update` | reads `version`, calls the RPC, returns `conflict` when it comes back NULL |
| `components/posts/use-variants.ts` → `write` | stores `error` | stores `conflict` and stops clearing `dirty` |
| `components/create/create-flow.tsx` → `persistVariant` | fire-and-forget | same, plus surfacing the notice |
| `components/posts/post-editor.tsx` | renders `error` | renders `VariantConflictNotice` |
| `lib/posts/read.ts` → `listVariants` | — | must select `version` so the client has one to send |

`savePost` (the canonical body) is deliberately **out of this plan**. It has its
own timestamp-based divergence notice today; giving `posts` the same column is a
second, larger change and the two should not be bundled.

## What the UI does when the CAS fails — the part that needed designing

The trap is obvious once stated: **a conflict notice must not become the second
way to lose work.** A dialog that says "this post changed, reload?" with an OK
button is exactly that — the customer presses it and their paragraph is gone.

So the rules:

1. **Never discard silently, and never discard on a click that could be a
   reflex.** The local text stays in the box. It is not replaced by theirs until
   the customer asks for it.
2. **Show both, name both.** "Yours" and "the saved version" — not "local" and
   "remote", which tells a shop owner nothing.
3. **Two verbs, both reversible in effect.** *Keep mine* re-sends with the fresh
   version and wins. *Use theirs* loads the other text into the box — and because
   it lands in the box rather than the row, the customer can still edit or undo
   before anything is written.
4. **No third option that does nothing.** No "dismiss". Dismissing leaves a
   variant that cannot save, and the writer would go on typing into a box whose
   contents can no longer land.
5. **The channel is named.** A conflict is per-variant; "your Instagram version"
   is actionable, "this post" is not.

This mirrors `use-autosave`'s existing `loadTheirs` / `keepMine` exactly, on
purpose: the editor and the create flow must not describe the same event
differently.

## What breaks if the migration ships without the UI half

`saveVariant` would return `{ ok: false, message: … }` for a version mismatch and
the writer would see a generic save error — with the box still dirty, the same
text, and a Retry that fails again for as long as the other tab holds the newer
version. That is worse than today: today they lose the work and do not know;
then they would keep it, be unable to save it, and not be told why.

**So the UI half ships first.** It is in the tree now, rendering off a shape
nothing currently produces.

## What was built ahead of the migration

- `SaveState` gained an optional `conflict` arm — additive, so every existing
  consumer that reads `message` is unchanged.
- `components/posts/variant-conflict-notice.tsx` renders it, with the five rules
  above.
- Unit tests drive it from a hand-built conflict result, which is the only way to
  reach it until the column exists.

## Test plan — two real browser contexts

A conflict is a race, so a single page proves nothing. The shape:

```
context A = await browser.newContext()   // separate storage state
context B = await browser.newContext()
both sign in as the seeded user and open /posts/<id>

A types "AAA" and saves            → row.version 1 → 2, A holds 2
B (still holding version 1) types "BBB" and saves
                                   → CAS matches nothing → conflict
assert B renders the notice, naming the channel
assert B's textarea still contains "BBB"          (rule 1)
assert the row still contains "AAA"               (nothing lost yet)
B presses "Keep mine"              → re-read version, re-send → row = "BBB"
assert A's next save now conflicts symmetrically
```

Two contexts, not two tabs in one: one storage state would let them share a
session cookie jar and mask a per-tab bug.

Until the column exists, the reachable half of this is the notice's own rendering,
which the unit tests cover.
