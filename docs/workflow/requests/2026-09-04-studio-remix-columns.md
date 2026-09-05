# Migration request — Studio remix lineage and stamp settings

**Raised by** girija, lane `wt-girija`, 2026-09-04.
**File** `packages/db/supabase/migrations/20260904140000_studio_remix_lineage_and_stamp_settings.sql`
**Needs** somebody with `supabase db push` on project `rloztdhzfliyvpvxsgjl`.

## What it asks for

Four nullable columns on `studio_generations`, one index, one tenancy trigger,
two check constraints. Nothing is dropped, nothing is rewritten, and no existing
row changes.

| Column | Type | Why |
| --- | --- | --- |
| `remixed_from` | `uuid` → `studio_generations(id)` | The version lineage. NULL means "stands on its own" |
| `stamp_enabled` | `boolean` | Whether the logo was ASKED for on this press |
| `stamp_anchor` | `text` | Which corner. Checked against the four `STAMP_ANCHORS` |
| `stamp_size_step` | `text` | Which size. Checked against `small`/`medium`/`large` |

## Why it is needed

Studio is gaining a remix view: opening a picture refills the composer from the
row that made it, and pressing Draw again either joins that picture's versions
or starts a new picture from the same starting point.

**Almost everything that needs is already stored** — `prompt_given`, `model_id`,
`mode`, `format_id`, `width`, `height`, `requested_count`,
`reference_asset_ids`, `brand_signals`, `seed`. MEASURED against the live
catalog on 2026-09-04. Two things are not, and **they fail in different ways**:

- **The lineage cannot be reconstructed at all.** Nothing in the schema can
  express "a version of that one", so every press is a peer and a shop owner
  sees nine near-identical tiles instead of one idea with nine versions.
- **The stamp settings can be reconstructed WRONGLY**, which is worse.
  `StampOptions` is a per-request input that is never persisted.
  `studio_generation_images.stamp_outcome` records what HAPPENED, not what was
  asked for. So a remix restoring "everything" would fall back to today's
  default corner and size: right for most pictures, wrong for every one drawn
  with a different corner.

That second failure is one this project has already met. The result screen shows
**"Exact placement: coming soon"** behind a lock instead of a measurement,
precisely because nothing recorded the anchor. These columns are what turn that
lock into a fact.

## Risk

**Low, and reversible.** Every column is nullable and additive. Nothing reads
them until `apps/web` changes, so applying this file alone changes no behaviour
on any screen. Generation, charging, stamping and the result screen are
untouched. The file carries a ROLLBACK block.

The one thing worth a second look before applying is the **trigger**,
`app.studio_generations_remix_same_tenant`. It fires `before insert or update of
remixed_from` and raises when a parent belongs to another workspace. It follows
`app.workspaces_logo_same_tenant` exactly, and it exists because a composite
foreign key cannot be used here: `on delete set null` would try to null
`workspace_id`, which is the tenancy key and `not null`.

## No backfill, deliberately

Neither pair is backfilled and the reasons differ.

`remixed_from`: no press before this file could have been a remix, so every
existing row is correctly NULL.

The stamp columns: the settings were genuinely not captured. They could be
guessed from `stamp_outcome` — a row saying `stamped` was presumably enabled —
but `stamped` says the mark went on, not which corner it went in, and
`DEFAULT_STAMP_OPTIONS` is exactly the guess this file exists to stop.

## What happens if it is not applied

The build proceeds and degrades honestly, the way the rest of this code already
does with `42703`:

- the main make screen (direction A) does not touch these columns at all and is
  unaffected;
- the remix view refills the prompt, model, approach, size, count and references
  from what IS stored, and **says on screen that logo placement resets to your
  current default** rather than restoring a corner nobody chose;
- the remix control still works, but every press is a peer, so there are no
  version groups in the history.

So this is not a blocker for the build. It is the difference between a remix
that remembers and one that half-remembers and says so.

## Also still unapplied, from the same lane

Nothing. The four migrations this lane raised earlier (`20260831090000`,
`20260831120000`, `20260831150000`, `20260902000000`) were confirmed applied to
production on 2026-09-04 by reading the catalog rather than the migration
ledger.
