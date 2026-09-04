# Handoff — girija — wt-girija — 2026-09-04

**Branch** `wt-girija` at `b6e940bd`. Lane `wt-girija`. Pushed: **yes**, tracking
`origin/wt-girija`, working tree clean.

Continues `girija-wt-girija-2026-09-03.md`, which this file **retracts in part**.
No product code was written this session. It was verification, and the
verification found that the largest claim in yesterday's handoff was false.

**The lane's own commits are already in `wt-core`.** `171de658` is an ancestor of
`origin/wt-core`; another session merged it as `46e806ea` "merge wt-girija into
wt-core: the Studio composer, logo variants, and stamp outcomes". `wt-core` then
moved on and somebody pushed its head onto this lane's ref, so `wt-girija` now
carries four other lanes' work by fast-forward.

---

## What shipped

No feature. Two documents and a set of measurements. **MEASURED** throughout.

| What | Proof | Covered by |
| --- | --- | --- |
| Yesterday's handoff, corrected | `b6e940bd`, and this file | not test-covered; it is a document |
| Production schema verified against the CATALOG, not the migration ledger | table below | not test-covered; the query is quoted in "Anything retracted" |
| The lane's merge state established | `git merge-base --is-ancestor 171de658 origin/wt-core` exits 0 | — |
| Preview reachability established, both walls named | "What was NOT done" | — |
| A real defect found in `.github/workflows/gate.yml` | "Shared surfaces touched" | none — that is the point of reporting it |

---

## What was NOT done, and why

- **Studio was NOT checked end to end on preview, which is what I was asked to
  do.** Two independent walls, both MEASURED 2026-09-04:
  1. **Vercel deployment protection.** `/studio` on the lane preview returns
     **302 to `vercel.com/sso-api`**. The Vercel MCP fetcher, which exists to
     carry that auth, returns the same 302 with and without the `_vercel_share`
     token it mints itself.
  2. **Clerk.** Past that wall the route needs a signed-in user, and this
     sandbox's Chromium cannot complete any outbound HTTPS request.

  Keys ARE present locally (`.env`, `apps/web/.env.local`), so the blocker is the
  network and the SSO wall, not configuration. A local `pnpm dev` hits the same
  Clerk wall. **What I could establish is not the thing asked for**: the
  `wt-girija` deployment is READY and Vercel reports no runtime errors on the
  project in 24h. That is "it built and the database can hold the data". It is
  **not** "it works", and it must not be written up as if it were. Three sessions
  have now shipped to a screen nobody has looked at.
- **No GitHub Actions secret was written.** No tool in this session can: the
  GitHub MCP server exposes workflows, runs, files, PRs and secret *scanning*,
  with no create or update. Writing one needs the repository public key and a
  libsodium seal. Reading the values out of `apps/web/.env.local` was separately
  denied by the sandbox, which is the guard working.
- **`sahoda-staging` was NOT restored.** `restore_project` on
  `yoxmzwkxweasfaahhvpj` was **denied by the permission classifier** — not a tool
  gap and not a Supabase error. Restoring a paused project is billing-affecting,
  so the refusal is reasonable. It stays INACTIVE.
- **The `gate.yml` guard defect was NOT fixed**, deliberately. See below.
- **Playwright `@smoke` is UNRUN, not passed.** Unchanged and now doubly so: the
  sandbox cannot run it, and the CI job that was meant to substitute still has no
  repository secrets.

---

## Shared surfaces touched

**No code surface. One shared file was READ and found defective, and left
alone.**

| Surface | Change | Who breaks |
| --- | --- | --- |
| any `packages/*`, any token, any fixture | **none** | nobody |
| `.github/workflows/gate.yml` | **not modified — reporting a defect in it** | see below |

**The `smoke` job's guard under-checks, and it will bite the next person who
acts on it.** The guard step refuses on three secret names:

    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL

The run step immediately below passes **six**, adding
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_DB_URL`. `scripts/cloud-setup.sh`'s `ENV_REQUIRED` names the first two
of those as required for the app to boot at all. So somebody who adds exactly the
three the guard names **clears the guard and then dies inside the suite** with
the opaque failure the guard exists to prevent. The guard's own header records
that it was rewritten twice because "add them" was not specific enough; it is one
name-list short of being right.

Left unfixed because `.github` is shared, the founder was mid-decision on it, and
a half-understood edit during a conversation is worse than a clear report. It is
a small, well-scoped fix.

---

## Contract, migration or money

- **`packages/shared`: untouched.**
- **Money: untouched.**
- **Migrations: none written. Four were CONFIRMED APPLIED that yesterday's
  handoff said were not.** See "Anything retracted". No `apply_migration` call
  was made — there was nothing left to apply, and re-running DDL already in place
  is risk with no upside.
- **Two facts that decide the CI-database question**, both MEASURED:
  - `e2e/global-setup.ts` **already refuses a `pk_live_` key** and demands
    `pk_test_`. "Use a Clerk test instance for CI" needs no code change; it is
    enforced in code.
  - **A Clerk test instance is not a test database.** The suite mints a user and
    lets the app create a workspace and a credit ledger in whatever
    `NEXT_PUBLIC_SUPABASE_URL` names, and there is exactly one ACTIVE project:
    production `rloztdhzfliyvpvxsgjl`. `lib/testing/e2e-target.ts` documents this
    as a measured finding — test workspaces have been appearing and vanishing in
    the customer database on every local run. Enabling CI smoke against
    production would make that automatic rather than occasional.

---

## Guards written, and the mutation that proved each

**None. No guard was written this session, and none is claimed.**

Stated explicitly because an empty section reads as an omission, and because the
one rule in this repository is that a guard never shown to fail is not a guard.
Nothing here was shown to fail, so nothing here is a guard.

---

## Anything retracted

**"FOUR migrations remain UNAPPLIED" — the top item of yesterday's handoff and
the thing I told the founder twice — is WRONG.** All four are applied to
production, and so are the four `20260902220001-4` that arrived from `wt-core`.

MEASURED 2026-09-04 against project `rloztdhzfliyvpvxsgjl` by reading
`information_schema`, `pg_trigger`, `pg_constraint`, `pg_indexes` and
`pg_class.relrowsecurity` — **not** `list_migrations`, because I had edited
`20260831150000` after its first run and a recorded version says nothing about a
later edit:

| Object | State |
| --- | --- |
| `workspaces.logo_asset_id`, `.logo_asset_id_dark` | present, `uuid` |
| `asset_logo_facts` | present, **RLS enabled** |
| `studio_generation_images.stamped_asset_id`, `.stamp_outcome` | present |
| `stamp_outcome` check constraint | `'stamped','no_logo','logo_unreadable','failed','skipped'` — **including `skipped`**, so my later edit did land |
| `studio_generation_images_stamped_same_tenant` | present |
| `workspaces_logo_dark_same_tenant` | present |
| both partial indexes | present |

Consequences: the `42703` fallbacks in `app/actions/studio.ts` and
`lib/brand/logo-bytes.ts` are **dead paths in production**, and the dark logo
mark is live rather than silently dropped.

**How the error happened, because it will happen again.** Somebody applied them
between the 09-01 handoff and now. I repeated "UNAPPLIED" from my own earlier
report without re-measuring, across two sessions and three messages. The rule
this project already has covers it: a claim about shared state must be
re-measured at the moment it is made, never carried forward from a previous
report. **My own handoff was the source I trusted.**

**Second retraction, smaller.** `git merge origin/wt-core` **fast-forwarded** the
local branch onto the trunk, which would have turned this lane into a copy of
`wt-core`. I reset to `171de658` before pushing. Nothing was lost. Recorded
because a fast-forward is silent and looks exactly like a successful merge.

---

## What the next session in THIS lane should pick up

1. **Get a human being to open `/studio` and look at it**, in both themes.
   https://sahodalabs-git-wt-girija-development-4417s-projects.vercel.app/studio
   Three sessions have shipped to this screen unseen. Everything below is
   smaller.
2. **Restore `sahoda-staging` (`yoxmzwkxweasfaahhvpj`) and apply the migration
   set to it**, then point CI at it with `ack_target=yoxmzwkxweasfaahhvpj`. I was
   one permission short. This is what stops the smoke suite writing test
   workspaces into the customer database.
3. **Fix the `gate.yml` guard's name list** — three checked, six needed.
4. **Six repository secrets**, Settings → Secrets and variables → Actions →
   **Secrets** tab → Repository secrets, from a Clerk **test** instance. Note
   `development156/sahodalabs` is a **PUBLIC** repository (MEASURED —
   `githubRepoVisibility` on every deployment record), which is an additional
   reason not to put the production pair there.
5. **Build one of the four Coming soon controls, or delete the label.** A label
   that stays a label for a month is worse than an absence.
6. **Re-seed the design canvas** — `Main.dc.html` draws four states, the code has
   five since `skipped` landed.
7. **`packages/db/tests/live-guard.test.ts` still prints a production database
   URL and password on failure**, wherever a repo-root `.env` exists. Open since
   2026-08-31.

---

## Gate

Run on `b6e940bd`, which is the fast-forwarded head carrying four other lanes'
work — a combination this lane had not gated before.

| Leg | Command | Result |
| --- | --- | --- |
| turbo typecheck + lint + test | `pnpm -w exec turbo run typecheck lint test --force --concurrency=1` | **PASS** — 27 tasks, 27 successful, 0 cached, 11m3s. Web unit inside it: 630 files passed, 3 skipped, **8,143 passed**, 13 skipped, 0 failed, 288s |
| format | `npx prettier --check .` | **PASS** — `All matched files use Prettier code style!` |
| `packages/db` live legs | not run | **UNRUN** — one shared live database, nothing in it changed by this lane |
| Playwright `@smoke` | not run | **UNRUN** — see "What was NOT done" |
| Vercel | deployment for the lane branch | **PASS** — READY, and no runtime errors on the project in 24h |

Forced (`--force`), because a leg under one second is a cache replay and
verifies nothing.
