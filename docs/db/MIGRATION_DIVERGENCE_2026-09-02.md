# Migration history divergence, measured 2026-09-02

Status: **report only**. Nothing in this document has been run against
production. It records what the two histories say, the exact statements a person
with the project ref would run to reconcile them, and what the schema-drift guard
needs afterwards so this cannot silently recur. Findings `live-supabase-1` and
`live-supabase-3`.

## The answer

Production has recorded **92** migration versions. The repository holds **96**
files that predate this fix (plus four `20260902…` files written this week, which
are new and expected to be unapplied). The two lists disagree in both directions:

| Set                                                | Count  | What it is                                                                                                  |
| -------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Local files whose version production never recorded | **22** | 18 are the SAME migrations applied under a fresh timestamp; 4 were never applied at all                   |
| Production versions with no local file             | **18** | every one is one of those 18 re-numbered files                                                              |
| Two local files sharing one version                | **1**  | `20260828100000_loop_reflect_reason.sql` and `20260828100000_studio_designs.sql`                            |
| Recorded version with a NULL name                  | **1**  | `20260820144500` (local file: `variant_formats_story_thread`)                                              |

MEASURED: the production list came from a read-only `list_migrations` call on
`rloztdhzfliyvpvxsgjl` (92 rows); the local list from `ls packages/db/supabase/migrations`.
The set differences were computed by a one-off node script over those two lists.

**In plain terms:** the database remembers 18 of our migrations under different
names than the files we keep, three migrations the shipped code depends on have
never reached the database, and one old file has never been applied. Until the
names are lined up, the normal push command refuses to run and every new lane
builds a database that is not quite production's. Lining them up is a one-time,
reversible bookkeeping change to one table, listed below.

## Why it happened

`apply_migration` (the Supabase MCP tool) records the DDL it applies under the
timestamp of the moment it ran, not the local filename's version. `LEARNINGS.md`
(2026-08-30) records the first observed instance: `studio_generations` landed as
`20260830172106` and was reconciled by one UPDATE on
`supabase_migrations.schema_migrations` back to `20260829210000`. That is why
`20260829210000` is the only late migration whose version matches; the other 18
were applied the same way and never reconciled.

`supabase db push` compares the two version lists prefix-wise (INFERRED from the
CLI's `FindPendingMigrations`, not executed here). Remote versions absent locally,
or local files older than the remote head, make it refuse outright and ask for
`supabase migration repair`. So the repo currently cannot push at all; only the
MCP tool can apply DDL, and every use widens the gap.

## The 18 re-numbered migrations

Same name, same body, different version. Local file on the left, what production
recorded on the right.

| Local file                                            | Recorded in production as |
| ----------------------------------------------------- | ------------------------- |
| `20260824200000_reprice_plans_from_business_model_deck` | `20260829105627`          |
| `20260825000000_marketing_observations`               | `20260825201932`          |
| `20260826090000_generated_body_draft_capture`         | `20260826145342`          |
| `20260826120000_asset_folder_system`                  | `20260826174909`          |
| `20260826120001_widen_channels_facebook_telegram`     | `20260826204148`          |
| `20260826160000_channel_return_observation_kind`      | `20260826160404`          |
| `20260826170000_audience_growth_observation_kind`     | `20260826161548`          |
| `20260826180000_format_effect_observation_kind`       | `20260826165419`          |
| `20260826180001_widen_connection_platforms`           | `20260826204348`          |
| `20260826200000_workspace_timezone_and_intake`        | `20260826201023`          |
| `20260827060000_folder_names_normalize_nfc`           | `20260827112410`          |
| `20260827090000_assets_trash`                         | `20260827112432`          |
| `20260827140000_assets_content_hash`                  | `20260827160143`          |
| `20260828060000_marketing_pass_runs`                  | `20260829105647`          |
| `20260828100000_loop_reflect_reason`                  | `20260829105658`          |
| `20260828100000_studio_designs`                       | `20260829105727`          |
| `20260828120000_loop_autopilot_l3`                    | `20260829105803`          |
| `20260828130000_loop_autopilot_log`                   | `20260829105822`          |

Note the production ORDER differs from the local order in three places
(`channel_return`/`audience_growth`/`format_effect` were applied before
`asset_folder_system`; `reprice_plans` was applied on the 29th, after everything
from the 25th to the 27th). Each file is self-contained, so the order did not
change the schema; it matters only for choosing which direction to reconcile.

## The 4 files production has never applied

| Local file                                  | Situation                                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260805000000_clerk_id_remap.sql`         | Predates the remote head by 24 days. A plain `db push` neither errors on it nor applies it. Needs an explicit decision (below).                |
| `20260831090000_workspaces_logo_asset_id.sql` | Shipped code reads what it adds (`apps/web/src/app/actions/brand-logo.ts`, `studio.ts`, `components/onboarding/stage/use-build.ts`).        |
| `20260831120000_asset_logo_facts.sql`       | Same.                                                                                                                                         |
| `20260831150000_studio_stamped_asset.sql`   | Same.                                                                                                                                         |

And the four `20260902220001…220004` files written this week, which are new,
unapplied, and expected to be.

## Reconciliation: what a person with the ref would run

Two directions are possible. **Direction A (rename the files) is recommended**:
it touches production's history table not at all, the file bodies stay
byte-identical, and git records the moves. Direction B rewrites 18 rows of
production's history table and is listed for completeness.

### Direction A: rename the 18 local files to the versions production recorded

Run from the repository root. Content unchanged; `git mv` keeps history.

```sh
cd packages/db/supabase/migrations
git mv 20260824200000_reprice_plans_from_business_model_deck.sql 20260829105627_reprice_plans_from_business_model_deck.sql
git mv 20260825000000_marketing_observations.sql                 20260825201932_marketing_observations.sql
git mv 20260826090000_generated_body_draft_capture.sql           20260826145342_generated_body_draft_capture.sql
git mv 20260826120000_asset_folder_system.sql                    20260826174909_asset_folder_system.sql
git mv 20260826120001_widen_channels_facebook_telegram.sql       20260826204148_widen_channels_facebook_telegram.sql
git mv 20260826160000_channel_return_observation_kind.sql        20260826160404_channel_return_observation_kind.sql
git mv 20260826170000_audience_growth_observation_kind.sql       20260826161548_audience_growth_observation_kind.sql
git mv 20260826180000_format_effect_observation_kind.sql         20260826165419_format_effect_observation_kind.sql
git mv 20260826180001_widen_connection_platforms.sql             20260826204348_widen_connection_platforms.sql
git mv 20260826200000_workspace_timezone_and_intake.sql          20260826201023_workspace_timezone_and_intake.sql
git mv 20260827060000_folder_names_normalize_nfc.sql             20260827112410_folder_names_normalize_nfc.sql
git mv 20260827090000_assets_trash.sql                           20260827112432_assets_trash.sql
git mv 20260827140000_assets_content_hash.sql                    20260827160143_assets_content_hash.sql
git mv 20260828060000_marketing_pass_runs.sql                    20260829105647_marketing_pass_runs.sql
git mv 20260828100000_loop_reflect_reason.sql                    20260829105658_loop_reflect_reason.sql
git mv 20260828100000_studio_designs.sql                         20260829105727_studio_designs.sql
git mv 20260828120000_loop_autopilot_l3.sql                      20260829105803_loop_autopilot_l3.sql
git mv 20260828130000_loop_autopilot_log.sql                     20260829105822_loop_autopilot_log.sql
```

This also resolves the `20260828100000` collision: the two files get the two
distinct versions production gave them.

**Before renaming, re-run the PGlite suite** (`pnpm --filter @sahoda/db test`).
The renames change the APPLY ORDER the PGlite harness uses (it sorts filenames),
to production's order. If any file depends on a later-numbered one the suite
will say so; the three `*_observation_kind` files moving ahead of
`asset_folder_system` and `reprice_plans` moving to the 29th are the places to
look. INFERRED from the file names, not tested: none of them reference each
other's objects.

Then, still nothing applied, ask the CLI what it thinks is pending. It must list
exactly `20260805000000` (see below), the three `20260831…` files and the four
`20260902…` files:

```sh
supabase --workdir packages/db migration list --linked
```

### Direction B: record the local versions in production's history instead

Only if the files must keep their names. Each statement is one row in
`supabase_migrations.schema_migrations`; run in one transaction, and take the
`name` along so the NULL-name row is not repeated.

```sql
begin;
update supabase_migrations.schema_migrations set version = '20260824200000' where version = '20260829105627' and name = 'reprice_plans_from_business_model_deck';
update supabase_migrations.schema_migrations set version = '20260825000000' where version = '20260825201932' and name = 'marketing_observations';
update supabase_migrations.schema_migrations set version = '20260826090000' where version = '20260826145342' and name = 'generated_body_draft_capture';
update supabase_migrations.schema_migrations set version = '20260826120000' where version = '20260826174909' and name = 'asset_folder_system';
update supabase_migrations.schema_migrations set version = '20260826120001' where version = '20260826204148' and name = 'widen_channels_facebook_telegram';
update supabase_migrations.schema_migrations set version = '20260826160000' where version = '20260826160404' and name = 'channel_return_observation_kind';
update supabase_migrations.schema_migrations set version = '20260826170000' where version = '20260826161548' and name = 'audience_growth_observation_kind';
update supabase_migrations.schema_migrations set version = '20260826180000' where version = '20260826165419' and name = 'format_effect_observation_kind';
update supabase_migrations.schema_migrations set version = '20260826180001' where version = '20260826204348' and name = 'widen_connection_platforms';
update supabase_migrations.schema_migrations set version = '20260826200000' where version = '20260826201023' and name = 'workspace_timezone_and_intake';
update supabase_migrations.schema_migrations set version = '20260827060000' where version = '20260827112410' and name = 'folder_names_normalize_nfc';
update supabase_migrations.schema_migrations set version = '20260827090000' where version = '20260827112432' and name = 'assets_trash';
update supabase_migrations.schema_migrations set version = '20260827140000' where version = '20260827160143' and name = 'assets_content_hash';
update supabase_migrations.schema_migrations set version = '20260828060000' where version = '20260829105647' and name = 'marketing_pass_runs';
update supabase_migrations.schema_migrations set version = '20260828100000' where version = '20260829105658' and name = 'loop_reflect_reason';
-- studio_designs CANNOT take 20260828100000: loop_reflect_reason holds it. Give
-- the FILE a new version instead (git mv to 20260828100001_studio_designs.sql)
-- and record that:
update supabase_migrations.schema_migrations set version = '20260828100001' where version = '20260829105727' and name = 'studio_designs';
update supabase_migrations.schema_migrations set version = '20260828120000' where version = '20260829105803' and name = 'loop_autopilot_l3';
update supabase_migrations.schema_migrations set version = '20260828130000' where version = '20260829105822' and name = 'loop_autopilot_log';
-- 18 rows expected. Check before committing:
select count(*) from supabase_migrations.schema_migrations;   -- still 92
commit;
```

The equivalent through the CLI, which writes the same table, is one
`supabase migration repair --status reverted <old>` followed by
`--status applied <new>` per row. The SQL is shown because it is auditable in a
single transaction; the CLI form is eighteen pairs of non-transactional calls.

### Either direction: the NULL name

Production's row `20260820144500` has `name = NULL`; the local file is
`variant_formats_story_thread`. Harmless to the CLI (it matches on version), but
the drift snapshot prints "(no name recorded)" for it. Optional, one row:

```sql
update supabase_migrations.schema_migrations
   set name = 'variant_formats_story_thread'
 where version = '20260820144500' and name is null;
```

### Either direction: decide `20260805000000_clerk_id_remap.sql`

It predates the remote head, so a plain push skips it silently. Three honest
options, one of which must be chosen and written down:

| Option                      | Statement                                                                                           | When                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| It was applied by hand      | `supabase migration repair --status applied 20260805000000`                                        | If the remap it performs is already visible in production data    |
| It must still run           | `supabase db push --include-all` (applies every unrecorded file, in order)                          | Only after the 18 renames, and only if its body is safe to replay |
| It is obsolete              | `git rm` with the reason in the commit message, then `supabase migration repair --status reverted 20260805000000` if the CLI still lists it | If the Clerk id remap is no longer needed |

Which one is true is not knowable from the repository: it requires reading
production's `workspace_members.user_id` shape. Not done here.

### Then apply the three 20260831 files, through ONE path

After the history is repaired, `supabase migration list --linked` shows the
three `20260831…` files (and this week's `20260902…` ones) as pending and
`supabase db push` applies them in order, recording each under its file's
version. Do not use `apply_migration` for them: it would create three more
re-numbered rows and put this document back where it started.

Note that five of the re-numbered files use bare `create table` with no `if not
exists` (`marketing_observations`, `asset_folder_system`, `marketing_pass_runs`,
`studio_designs`, `loop_autopilot_log`). That is why direction A must come
first: a push that does not know they are applied would try to re-create tables
that exist and abort. Once recorded under the right versions they are never
replayed.

## What the schema-drift guard needs (`live-supabase-3`)

`packages/db/tests/schema_drift.pglite.test.ts` is the guard for exactly this and
is green today because it compares against `packages/db/schema-snapshot.prod.json`,
whose `recordedVersions` has **68** entries ending at `20260822160000`. Every one of
those 68 exists on disk, so "a file for every recorded version" and "one file per
version" both pass while 18 recorded versions have no file and one version has
two. MEASURED: `node -e` over the snapshot printed 68 / last three
`20260822060100, 20260822090000, 20260822160000`; the file has no `capturedAt`.

Three things, in order:

1. **Refresh the snapshot after the repair, not before.**
   `pnpm --filter @sahoda/db exec tsx scripts/capture-schema-snapshot.ts` reads
   `supabase_migrations.schema_migrations` in a `begin read only` transaction and
   writes 92 (then 95, then 99) versions. Refreshed BEFORE the renames it would go
   red on 18 missing files and the collision, which is the guard doing its job and
   also a gate nobody can pass until the repair lands. The diff of that commit is
   the review.
2. **A staleness assertion, so a 24-migration blind spot cannot reopen.** The
   test needs one more `it`: the newest version in `snapshot.recordedVersions`
   must be no older than the newest local file's version by more than an explicit
   allowlist of pending files (today: the three `20260831…` and the four
   `20260902…`). A snapshot that is behind by anything else fails with the
   names. Prove it once by checking in a snapshot missing one recorded version
   and watching it go red, then restore.
3. **A `capturedAt` field** in the snapshot, written by the capture script and
   printed by the failure message, so "how stale" is read off the file rather
   than reconstructed from git log.

None of the three is done in this change: 1 needs the ref, 2 and 3 edit a test
and a script that were outside this task's file allowlist (`packages/db/tests/**`
is inside it, but the assertion is meaningless until 1 has run, and a guard
written against a snapshot known to be wrong is a guard shown green by not
looking).

## What was not done, and why

- Nothing was applied, repaired, renamed or pushed. The task is report-only and
  the ref is production.
- The production list was read once, read-only, through `list_migrations`; no SQL
  was run against the project.
- `20260805000000_clerk_id_remap.sql` is not classified: that needs a read of
  production data.

## Needs a decision

- Direction A (rename 18 files) or B (rewrite 18 history rows). A is
  recommended.
- What `20260805000000_clerk_id_remap.sql` is: applied, pending, or obsolete.
