# 31 · The nightly metrics collector — a stopgap, described as one

**Date:** 2026-08-20 · **Branch:** `wt-collect` · every claim MEASURED unless marked INFERRED.

## Why this exists

`post_metric_snapshots` is the only table in the product whose contents cannot be recovered
later. Platforms report a post's CURRENT numbers and nothing else; whatever a post's reach was
last Tuesday is gone the moment Tuesday ends. Every night the collector does not run is a night
of history that no later request can fetch.

It has never run. MEASURED by run 30 against the live production alias and confirmed in git:

| | |
| --- | --- |
| `sahodalabs.vercel.app/api/cron/sweeps` | **401** — the route is in the build, its cron-secret guard fired |
| `sahodalabs.vercel.app/api/cron/metrics` | **404** — byte-identical to a path that was never written |
| `git show wt-web:apps/web/vercel.json` | declares `/api/cron/sweeps` only |

Production builds from `wt-web`. The metrics route and its cron entry were authored on the
`wt-ui-port → wt-design` lineage and have never been merged there, and Vercel cannot schedule a
path that is not in the deployed build. Merging is 79 commits and 410 files into the branch that
serves customers — a decision for a person, not a task.

`runMetricCapture` imports neither the Trigger.dev SDK nor anything from Next, so it runs as a
plain program. That is what `.github/workflows/metrics-nightly.yml` does.

## What runs, and where

| | |
| --- | --- |
| workflow | `.github/workflows/metrics-nightly.yml` |
| program | `apps/jobs/scripts/metric-capture.ts` (`pnpm --filter @sahoda/jobs run metrics:capture`) |
| schedule | `0 20 * * *` — 20:00 UTC, **01:30 IST** |
| repository | `IDIVASM/sahodalabs` |

**The hour is chosen against the UTC day, not the IST one**, because that is what the table is
keyed by: `post_metric_snapshots.measured_on` is a generated column,
`(measured_at AT TIME ZONE 'UTC')::date`. Four clear hours before the UTC rollover leaves room
for GitHub's own scheduling delay — a `schedule` trigger is best-effort and is regularly late by
10–30 minutes — without the run sliding into the next day's key and leaving a gap in this one.

## The two things that will surprise whoever maintains this

**1 · `schedule` fires only from the repository's DEFAULT branch.** `IDIVASM/sahodalabs`'s default
branch is `main`, which is an orphan "Initial commit" sharing no history with the working
lineage. So the workflow FILE lives on `main` to be armed at all, and the CODE it runs is fetched
by its checkout step from whatever `vars.METRICS_REF` names (default `wt-collect`). Moving the
collector to another branch is a repository-variable change, not a workflow edit.

**2 · `SUPABASE_DB_URL` must be the regional pooler.** MEASURED: `db.<ref>.supabase.co` publishes
**1 AAAA record and 0 A records**, and a GitHub-hosted runner has no IPv6 route — the direct host
hangs there exactly as it did on Vercel. The working host is
`aws-1-ap-south-1.pooler.supabase.com:6543`. Note `aws-1`, not `aws-0`: `aws-0` resolves, accepts
the connection, and answers `Tenant or user not found`, which reads like a credential problem and
is a region problem. The program prints which family it got as its first line and never prints
the value.

## Secrets

Set on `IDIVASM/sahodalabs` as Actions secrets. Names only — no value appears in the workflow
file, in the program's output, or in this document.

| secret | note |
| --- | --- |
| `SUPABASE_DB_URL` | **the pooler**, see above |
| `SUPABASE_SERVICE_ROLE_KEY` | required by `loadJobsEnv`, unused by this pass |
| `NEXT_PUBLIC_SUPABASE_URL` | required by `loadJobsEnv`, unused by this pass |
| `ZERNIO_API_KEY` | every target is read through Zernio |

## What it cannot do

Publish, reply, charge, or change a post. `metricCaptureDeps` wires only `createZernioReads`,
which has no method that writes to a platform, and `post_metric_snapshots` carries a
`block_mutations` trigger on UPDATE and DELETE — MEASURED on production — so the job cannot alter
a number it wrote yesterday even by accident.

It also never invents one. A metric the platform did not report produces **no row**, not a zero,
and a day with no rows is a gap. MEASURED after the first run: seven `(post, channel, day)`
combinations carry no row, including a LinkedIn post unreadable on two consecutive days.

## Delete it when the route merges

This is a stopgap and puts a second thing to remember in a second place. The day
`apps/web/src/app/api/cron/metrics/route.ts` reaches `wt-web`, the Vercel cron takes over and
this workflow should be **deleted**, not left running. Two collectors on one append-only table is
not harmful — the day-key conflict makes the second a no-op — but it is two things to keep true.
