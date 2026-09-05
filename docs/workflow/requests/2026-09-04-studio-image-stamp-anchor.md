# Migration request — Studio image stamp anchor

**Raised by** girija, lane `wt-girija`, 2026-09-04.
**File** `packages/db/supabase/migrations/20260904160000_studio_image_stamp_anchor.sql`
**Needs** somebody with `supabase db push` on project `rloztdhzfliyvpvxsgjl`.

## What it asks for

Two nullable text columns on `studio_generation_images`, each with one check
constraint and a comment. No index, no trigger, no policy, no backfill. Nothing
is dropped, nothing is rewritten, and no existing row changes.

| Column | Type | Why |
| --- | --- | --- |
| `stamped_anchor` | `text` | The corner the mark ACTUALLY landed in. Checked against the four `STAMP_ANCHORS` (`bottom-right` etc.). NULL means "not recorded" |
| `stamp_anchor_moved_reason` | `text` | Why it differs from the corner asked for. `busy` or `unreadable`. NULL means it did not move |

## Why it is needed

Commit 29c31c21 gave the renderer `corner-choice.ts`: it measures all four
corners of the finished picture and may move the mark off the customer's chosen
corner, either because that corner is too busy behind the mark or because the
mark would not clear contrast there. `stamp.ts` already carries the fact out on
`StampResult.anchorChoice`.

**Nothing told the customer.** A control that says "bottom-right" could produce
a picture stamped top-left, with the logo visibly in a corner nobody chose and
no explanation anywhere. That is the silent-override defect this project's rules
exist to prevent.

The result screen reads PERSISTED state, so the move has to be a column and not
an in-session note. Each picture in a batch of four is measured on its own and
can land in a different corner, so the columns sit on `studio_generation_images`
(per image), exactly where `stamp_outcome` already sits and for the same reason.

## A note on the two anchor columns across two tables

The remix migration (`20260904140000`) adds a `stamp_anchor` column to the PARENT
`studio_generations`, recording the corner the customer ASKED for. This file adds
`stamped_anchor` to the CHILD `studio_generation_images`, recording the corner
the mark actually LANDED in. Different tables, different questions, and the two
are independent: apply either order.

## Risk

**Low, and reversible.** Both columns are nullable, additive text with a check.
No foreign key, so no set-null action to index and no cross-tenant pointer to
guard by trigger. The table's RLS, its append-only `block_mutations` trigger and
its `workspace_id` tenancy are all untouched, and the new columns are covered by
the SELECT/INSERT policies already on the table. The file carries a ROLLBACK
block.

## No backfill, deliberately

No press before this file could have recorded a move: `corner-choice.ts` did not
exist and the fact reached no column. Every existing row is correctly NULL, which
the reader shows as honest silence about placement. The corner a picture drawn
last week landed in cannot be re-measured from today's picture, so guessing a
value for an old row would assert something about a run that never happened.

## What happens if it is not applied

The build proceeds and degrades honestly, the way the rest of this code already
does with `42703`:

- generation, charging and stamping all still work, and the picture is still
  stamped in whichever corner the renderer chose;
- the generate action writes the image row with these two columns and, on
  `42703`, re-writes it WITHOUT them but STILL WITH `stamped_asset_id` and
  `stamp_outcome` (both already applied in production), so the logo link is never
  lost while this migration is pending;
- a read uses `select *`, which omits an absent column rather than erroring, so
  the result screen simply says nothing about a move rather than guessing one.

So this is not a blocker for the build. It is the difference between a result
screen that can explain a moved logo and one that shows a mark in an unexplained
corner.

## Also still unapplied, from the same lane

`20260904140000_studio_remix_lineage_and_stamp_settings.sql`, per its own request
doc (`2026-09-04-studio-remix-columns.md`). This file is independent of it.
