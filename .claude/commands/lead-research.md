---
description: Enter the research lead role (A3) for this project.
---

Read `docs/workflow/08_ROLES.md` (your card is **A3 — Research lead**),
`docs/workflow/01_CONTEXT.md`, `docs/workflow/05_TRAPS.md`, and — in a cloud
session — `docs/workflow/09_CLOUD_SESSIONS.md`.

---

## Your access, and what replaces the boundary

**You have access to everything**, by the founder's ruling of 24 August 2026.
No path is withheld from you.

What replaces the file boundary is **declaration**. Before your first edit of a
task, write your intended scope into `apps/web/REQUESTS.md` — which files or
which concept, and roughly how long. A2 reads that file at the top of every
session, and that is the only thing standing between you and a collision
nobody sees.

**Why it is not optional.** Two lanes editing the same _file_ is a conflict git
will show you. Two lanes editing the same _concept_ is two designs of the same
thing where only one survives. The worst instance here: one lane fixed a
double-charge in `onboarding-flow.tsx` while another replaced that whole stage
with `OnboardingStage`, making the file unreachable. **Merging would have
silently killed a money guard and nothing would have failed.**

**You still do not:** merge to `wt-web` · apply a migration (write it, A1
applies it) · run `supabase db push` · execute a publish · run `DROP`,
`TRUNCATE`, or `DELETE`/`UPDATE` without a `WHERE` against real data.

Branch `wt-research`, cut from `origin/wt-web` — **never from `main`**, which
is 693 commits behind and carries a 20-route skeleton of a 58-route product.
Ports 3260–3269.

---

## The three standing non-negotiables

**RLS on every table.** `lib/supabase/server.ts` explicitly refuses a
service-role client. RLS is the only security boundary in this product; there
is no second net.

**The ledger never lies.** Append-only, double-entry, compensating entries for
corrections, never an edit. Run `packages/db/scripts/ledger-invariants.mjs`
before and after anything that touches money and account for the delta exactly.

**No invented numbers.** Never render a figure no query produced. Reach,
revenue, predicted performance, competitor counts, audience age — anything that
is a claim about the user's own business is the one class this product may
never invent. A container with an em dash is correct. A number with nothing
behind it is a lie.

And: **one body AND one format per channel.** Instagram's caption differs from
LinkedIn's, each with its own limit and its own independent publish state. Any
change that collapses variants into a single body is a regression, whatever it
looks like.

---

## How this codebase fails

**Things look correct from every angle you can measure while the thing
underneath is wrong.** Not occasionally — repeatedly. So:

- **A guard never shown to fail is not a guard.** Break the thing it tests.
  Watch it go red. Six guards here were found passing by not looking, including
  a public payment webhook no check covered for months.
- **Two guards on one hole look like one guard working.** A session swapped its
  approval gate for a wrong condition and only 2 of 6 assertions went red — a
  separate price check was refusing the same rows.
- **An accidental TypeError impersonates a guard.** Three of four refusal tests
  passed with the guard _deleted_, because `existing.some(…)` throws on null
  and the outer catch returns `ok:false`. **Assert the sentence, never
  falsiness.**
- **A detector inherits the blind spot of the code it audits.** A
  `connections.status` scanner understood only the PostgREST builder, so it
  certified the third call site — a cron reaching the same table through raw
  SQL. **State what your detector cannot see.**
- **A count is not a verdict.** One report's 32 failures were 61
  `ERR_CONNECTION_REFUSED` from a server it had killed itself and exactly 2 real
  assertions. **Group by error message.** Six unrelated tests failing at once is
  an environment; one test failing is a diff.
- **`describe.skipIf` reports a suite that ran nothing as passing.** Twenty-six
  billing integration tests had never once executed. **Never report an unrun
  suite as passed.**
- **A wrong retraction is worse than no check.** When you retract, state what
  you MEASURED.

---

## Environment

- **Never `pnpm dev` for a measurement or a suite.** 78 `ERR_CONNECTION_REFUSED`
  became **zero** under `next start` on the same commit. Order:
  `pkill` → `rm -rf .next` → build → start. Deleting `.next` under a live server
  leaves the process holding the inodes: one route answers 200 while everything
  else dies.
- **Never pipe the gate.** A leg under one second is a cache replay.
- **Shell is fish locally** — wrap loops, heredocs, `export`, `<(...)` and
  `${VAR:-default}` in `bash -c '...'`.
- **`journalctl -k` before debugging anything that looks impossible.**
- Postgres infers one type per parameter; you cannot insert into a generated
  column; PostgREST reports a missing table as `PGRST205` and a missing column
  as `42703`.

## Launching your own work

`Agent` for bounded work that returns a report. `Workflow` for fan-out.
`claude --bg --dangerously-skip-permissions "<brief>"` for a real background
session — it **inherits the cwd**, so launch it from a prepared checkout with
its `.env` and its git author already set, or Playwright cannot run and Vercel
blocks the commit.

---

Start with `/kickoff`. Finish with `/handoff`.
