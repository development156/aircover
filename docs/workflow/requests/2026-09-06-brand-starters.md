# Migration request — brand starters

**Raised by** girija, lane `wt-girija`, 2026-09-06.
**File** `packages/db/supabase/migrations/20260906221300_brand_starters.sql`
**Needs** somebody with `supabase db push` on project `rloztdhzfliyvpvxsgjl`.

## What it asks for

One new table, `brand_starters`, with an index and two RLS policies. Nothing is
dropped, nothing is altered, and no existing row changes. `brand_memory` is
neither read nor written by this file.

| Column | Type | Why |
| --- | --- | --- |
| `workspace_id` | `uuid` → `workspaces(id)` | Tenancy, cascade on delete |
| `brand_version` | `int` | The `brand_memory.version` the sentences were written from |
| `starters` | `jsonb` | An array of 3 to 8 `{label, prompt}` pairs, checked |
| `model_id` | `text` | What wrote them |

Each idea is a pair rather than one plain sentence: a short chip label for the
screen and the full prompt sentence for the box behind it. The CHECK still
asserts an array of 3 to 8, which an array of `{label, prompt}` objects
satisfies exactly as an array of strings would.

## Why it is needed

`/studio` offers five starter ideas and they are the same five for every
workspace: a plate of samosas, a cup of chai, a shopfront at dusk. They are
`PROMPT_STARTERS`, hardcoded for a food-and-shopfront business. **MEASURED from
a founder screenshot, 2026-09-06:** a sales-training workspace and a design
consultancy were both offered them.

The founder's words were that it makes the product read as something thrown
together rather than a system that knows the business, and that is the right
diagnosis. The starters are the first thing a customer reads on that screen and
they currently prove Sahoda has not looked at their brand.

**`buildPromptStarters(signals)` already exists, is tested, and is not wired.**
Wiring it is a genuine improvement and it is NOT the fix. It substitutes the
customer's own words into sentences that still assume a physical product on a
counter, so a design consultancy is invited to photograph its company
description "on a plain surface with soft morning light". A template cannot know
what a business is photographable as.

So the sentences are written by a model, once, from the resolved Brand Brain.
Not per page load: that would put a model call on the critical path of a screen
that must paint immediately, and charge somebody for looking at a screen.

## The one thing worth a second look

**`brand_version`, and why this is not a column on `workspaces`.** A re-resolved
brain produces a new version, and starters written from the old one describe a
business as it used to be described. The read matches the ACTIVE version and
finds nothing when they differ, so stale starters retire themselves. Same rule
the stamp columns and `asset_logo_facts` both needed: a cached derivation must
name the exact input it came from, or it outlives it silently.

## Why not inside `brand_memory.payload`

That payload's shape is guarded by `public.resolve_brand_memory`, which
dual-accepts v1 and v2 because seven live brains are v1 and a stricter guard
would make every one of them unsaveable. Adding a key there means editing the
most delicate function in this schema and making a Studio convenience part of
what a Brand Brain IS. Starters are derived from a brand; they are not one of
its facts.

## Risk

**Low, and reversible.** A new table nothing reads until `apps/web` changes. No
existing table, function, policy or row is touched. The file carries a ROLLBACK
block, and dropping it loses only the written starters.

RLS is enabled with member SELECT and INSERT policies matching every other table
in this schema. There is deliberately no UPDATE and no DELETE policy: a set
belongs to one brand version and is never edited in place.

## No backfill, deliberately

No workspace has starters until its brain is next resolved. The read finds no
row for the active version and the screen falls back to what it shows today, so
nobody sees an empty box and nobody is charged for a call they did not ask for.

## What happens if it is not applied

The Studio keeps showing the generic five, exactly as it does now. Nothing
breaks and nothing degrades: this is additive, and the code that reads it treats
"no row" as the normal first-run state rather than as an error.

**So this is not a blocker for the screen. It is the difference between a
starter list that knows the business and one that does not.**

## Also still unapplied, from this lane

- `20260904140000_studio_remix_lineage_and_stamp_settings.sql` — the remix
  toggle stays LOCKED until this lands
- `20260904160000_studio_image_stamp_anchor.sql` — the logo placement note stays
  behind its "coming soon" lock until this lands

All three are additive and could go in one push.
