# The 2026-08-19 migration batch — what to run, in what order

Six migration files were written on 2026-08-19. **None of them has been applied.** Nothing in
that run connected to the database, and no tool capable of applying a migration was used.

This page is what to read before running any of them. It is written for the person applying
them, not for the person who wrote them.

## The short version

They are **independent**. Each one runs against the database exactly as it is today, and none
of them needs any of the others. The order below is a suggestion based on what is most worth
having first — it is not a dependency chain, and nothing breaks if you run them in a different
order or apply only some of them.

That claim is not a promise on trust: `packages/db/tests/migration_batch_applies.pglite.test.ts`
applies each file **on its own** against a fresh copy of the current schema, and fails if any of
them ever grows a dependency on a sibling.

The only ordering that matters is **inside** two of the files, and both keep their two tables in
one file precisely so that ordering cannot be got wrong.

## The order

| #   | File                                       | What it unlocks                                              | Reversible                     |
| --- | ------------------------------------------ | ------------------------------------------------------------ | ------------------------------ |
| A2  | `20260819000100_post_metric_snapshots.sql` | Starts keeping a history of your numbers. **Run this first.** | Structure yes, data no         |
| A1  | `20260819000000_post_variant_version_cas.sql` | Stops two tabs silently overwriting each other's writing   | Yes, cleanly                   |
| A3  | `20260819000200_post_variant_format.sql`   | Records what kind of post each channel version is             | Yes, cleanly                   |
| A4  | `20260819000300_templates.sql`             | Saved starting points for a post                              | Structure yes, data no         |
| A5  | `20260819000400_assets.sql`                | A real media library, and a record of where each file is used | Structure yes, files untouched |
| A6  | `20260819000500_campaigns.sql`             | Grouping posts under one named push                           | Structure yes, data no         |

**A2 is listed first even though its file name sorts second**, and that is the one piece of
advice on this page that is time-sensitive — with the caveat below about what actually starts
the clock. Sahoda currently asks the platforms for your numbers
every time a screen opens, shows them, and keeps nothing. Every day that table does not exist is
a day of history that can never be recovered — no platform will tell you what a post's reach was
last Tuesday. Everything else on this list can wait a month at no cost. That one cannot.

"Reversible, data no" means the table can be dropped and nothing will break, but whatever was
collected or saved in it is gone and cannot be rebuilt.

## What each one does, and what it costs if it is wrong

Each file explains itself in full — every statement has a plain-English line above it saying
what it does and what breaks if it is wrong. This is the summary.

**A1 · concurrent edit.** Two people editing the same channel's copy currently overwrite each
other with no warning and both screens say "Saved". This adds a counter to each version and a
save that refuses when the counter has moved, so the second writer is shown both versions and
asked which to keep. The screen half is already built and inert; this is the last step. If it is
wrong, saving channel copy stops working — nothing is deleted and nothing is published.

**A2 · metric history.** One row per post, per channel, per number, per day. Written by a
background job, read by the "Performance over time" card. The application checks for the table
at runtime, so before it exists the analytics page renders exactly as it does today. If it is
wrong, no history is collected and nothing else is affected.

> **Applying A2 does not start the collecting on its own, and this is the one thing on this
> page you must not skip.** The job that fills the table is written and tested
> (`apps/jobs/src/metrics/`), but **nothing runs it yet.** Background jobs in this repo were
> written for a service (Trigger.dev) that has never been deployed from here; the two jobs that
> genuinely run are invoked by a scheduled web request instead
> (`apps/web/src/app/api/cron/sweeps/route.ts`, every five minutes).
>
> This job cannot simply join that five-minute tick: it makes one request per published channel
> and stores one row per DAY, so running it 288 times a day would spend the whole rate limit to
> write nothing 287 of those times. It needs its own scheduled request, roughly daily.
>
> **What that means for you:** apply A2 whenever you like — it is safe, and it is what unblocks
> everything else. But the clock only starts when the daily runner is wired, so that wiring is
> the actual urgent item, not the migration. Until then the table sits empty and the analytics
> card correctly says nothing has been measured yet. Wiring it is about an hour's work and needs
> a decision from you, because it adds a scheduled job to the deployment.

**A3 · format.** One column recording whether a version is meant to be a photo, a set, a video,
or text alone. **Applying it is safe and changes nothing.** The warning is in the file and worth
repeating: publishing hard-codes a single photo today
(`packages/publishing/src/adapters/zernio.ts:222`), so a screen offering "Video" built before
that line changes would save the choice, show it back, and post a photo anyway. The column is
the easy part.

**A4 · templates.** Saved starting points, private to each workspace. The file explains why they
are workspace-owned rather than a shared library, and why a starter set does not need a table.

**A5 · assets.** Two tables: the library, and a record of where each file is used. **Nothing
happens to the photos already attached to your posts.** They are not read, moved, copied or
deleted; existing posts keep working unchanged. Bringing them into the library later is a
separate decision, and nothing here makes it harder.

**A6 · campaigns.** Grouping posts under a named push. The file is deliberately blunt that the
table is roughly a tenth of what "campaigns" means to a customer — budgets are their own build
because money needs the same care the credit ledger already gets, and paid ads on Meta and
Google sit behind review queues nobody here controls. Apply it if grouping posts is worth having
on its own. It is, and it is honest. Do not read it as campaigns being nearly done.

## What was deliberately not done

Three things the standing rules in `packages/db/CLAUDE.md` ask for on a new table are **not** in
this batch, and each is left out for a reason rather than forgotten:

- **A row schema in `packages/shared` for each new table.** That package is a frozen contract in
  this repo. The two columns the application already needs — the edit counter and, later, the
  format — are read at the render edge instead, which is the pattern this repo already uses for
  exactly this situation.
- **A cross-account test run through a real signed-in client.** Those tests need a live database
  and are off unless explicitly switched on. What IS proven, by executing the migration files
  against a real Postgres engine, is that every new table has its protection switched on, that
  every rule names the customer, and that the indexes those rules need exist.
- **A runner for A2's job.** See the note under A2.

## Two things to expect

**A `format` column and a `version` column that nothing seems to use.** That is correct and
temporary. The application was built to work both before and after these land: it checks at
runtime whether the column is there and behaves as it does today when it is not. Applying a
migration switches the new behaviour on; it does not require a deployment first.

**One test suite goes red until these are applied.** `packages/db/tests/migration_integrity.test.ts`
compares every table and function the migration files declare against what is actually in the
live database, so six unapplied files will show as six missing objects. That check only runs when
someone deliberately opts into live tests (`SAHODA_ALLOW_LIVE_TESTS=1`); the ordinary `pnpm gate`
never runs it. It is expected, it is the check doing its job, and it clears itself the moment the
files are applied.

## How to apply one

They are ordinary migration files in `packages/db/supabase/migrations/`. Applying them is
`supabase db push` from `packages/db`, which sends every unapplied file. **To apply only some of
them, move the rest out of the directory first** — `db push` has no way to be told to skip one,
and it will send everything it finds that the database has not seen.

Read the file before you run it. Each one is written to be read.
