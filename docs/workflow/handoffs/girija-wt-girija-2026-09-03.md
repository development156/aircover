# Handoff — girija — wt-girija — 2026-09-03

**Branch** `wt-girija` at `9d7d9313`. Lane `wt-girija`. Pushed: **yes**, tracking
`origin/wt-girija`, working tree clean apart from this file. Carried by **draft
PR #39** (`development156/sahodalabs#39`), base `wt-core`.

Vercel on `9d7d9313`: **success** (MEASURED, commit status API, 2026-09-03).

Four commits since the 2026-09-01 handoff at `6ecbcc57`:

| SHA | What |
| --- | --- |
| `b2a56db5` | the result screen, and the column that lets it tell the truth |
| `55728713` | the Studio route's perf budget, raised by exactly what this lane added |
| `630e0b24` | the rest of the artboard, with the unbuilt parts labelled |
| `9d7d9313` | two logo variants, per-press stamp controls, and the seam between them |

---

## What shipped

All **MEASURED** (named test passing at `9d7d9313`) unless marked otherwise.

| What | Proof | Covered by |
| --- | --- | --- |
| Five answers to "why does this picture look like this", no shared sentence | `lib/studio/stamp-copy.ts` | `stamp-copy.test.ts` — `'no two answers share a sentence'` |
| `stamp_outcome` recorded at WRITE time, never derived at read time | `app/actions/studio.ts`, migration `20260831150000` step 2 | `app/actions/studio.stamp.test.ts` |
| `stampGeneratedPicture` answers a reason instead of `null` | `lib/studio/stamp-generated.ts` — `StampResult` | `stamp-generated.test.ts`, six assertions retargeted not deleted |
| Result strip shows the STAMPED copy where one exists, with its age | `lib/studio/canvas.ts` — `canvasPictures(cards, now)` | `canvas.test.ts` |
| The four unbuilt artboard controls are on screen, labelled Coming soon | `components/studio/studio-workbench.tsx` | `studio-workbench.test.tsx` — coming-soon is a `<span>`, never `<button disabled>` |
| Credits readout, inline add-a-picture tile, six-across history grid | same | same, 254 lines of new tests |
| A workspace can hold TWO logos, light and dark | `lib/brand/set-logo-variant.ts`, migration `20260902000000` | `logo-dark.test.ts`, `workspaces_logo_asset_id_dark.pglite.test.ts` |
| The mark is chosen from the backdrop's own luminance | `lib/brand/logo-variant-pick.ts`, `lib/studio/stamp.ts` (`alt`) | `logo-variant-pick.test.ts`, `stamp.test.ts` |
| Per-press stamp controls: on/off, corner, size | `packages/shared/src/studio/generation.ts` — `StampOptionsSchema` | `generation.test.ts`, `studio-workbench.test.tsx` |
| Turning the stamp off records `skipped`, not `null` | `app/actions/studio.ts` | `studio.stamp.test.ts` — `.toBe('skipped')` **and** `.not.toBeNull()` |
| The topbar renders the dark mark where the surface is dark | `components/shell/topbar.tsx` → `brand-mark.tsx` → `brand-panel.tsx` | `brand-panel` tests |

---

## What was NOT done, and why

- **Playwright `@smoke` is UNRUN, not passed.** Unchanged from 2026-09-01:
  Chromium in this sandbox cannot complete any outbound HTTPS request and every
  `@smoke` spec signs in through Clerk. The `smoke` CI job cannot substitute —
  MEASURED 2026-08-29, it exits at its own guard step in 17s because **no
  repository secrets are configured at all**. Reported, never worked around.
- **`packages/db` suite UNRUN.** One `packages/db` file was added this session
  (`20260902000000_workspaces_logo_asset_id_dark.sql` and its pglite test); the
  pglite test runs in-process and passed inside the web run. The live-database
  legs were not run — that database is shared and overlapping runs strand
  fixtures for other lanes.
- **FOUR migrations remain UNAPPLIED.** `supabase db push` needs a person. Every
  read and write works with the columns absent by answering Postgres `42703`, so
  on production today the stamping runs, the picture is stored, and the link and
  the outcome are both dropped. **The dark mark therefore never gets used in
  production until they are applied.**
- **`export-drift` SKIPPED inside the web run**, and said so loudly:
  `SUPABASE_DB_URL` is set but `db.rloztdhzfliyvpvxsgjl.supabase.co` does not
  resolve from this sandbox. `export_manifest.pglite.test.ts` covers the
  migration FILES with no credentials and passed; only the skipped one can speak
  for production. Recorded, not worked around.
- **I have never seen any of this rendered in a browser.** Every visual claim
  here rests on jsdom and on offline renders of the artboards. The Vercel build
  is green; nobody has opened the page.
- **The four Coming soon controls are labelled, not built.** Leave out, Same
  again, Follow how closely, Tidy my words. Nothing in `lib/studio` implements
  any of them; the label exists so the gap is trackable rather than invisible.
- **The design canvas is now behind the app.** `Main.dc.html` draws four states;
  the code has five since `skipped` was added. Offered, not requested, not done.

---

## Shared surfaces touched

**Not "none" — read this before pulling.**

| Surface | Change | Who breaks |
| --- | --- | --- |
| `packages/shared/src/studio/generation.ts` | **+`StampOutcomeSchema`** (5 values incl. `skipped`), **+`StampOptionsSchema`**, `STAMP_ANCHORS`, `STAMP_SIZE_STEPS`, `DEFAULT_STAMP_OPTIONS`. Additive. | Nobody. A lane adding a sixth outcome must add a branch to `stamp-copy.ts` — `stamp-copy.test.ts` refuses a value with no answer. |
| `packages/shared/src/db/identity.ts` | `WorkspaceSchema` gained `logo_asset_id_dark`. Additive, nullable. | Nobody. |
| `packages/shared/src/db/studio-generations.ts` | image row gained `stamp_outcome`, `.default(null)`. Additive. | Nobody. |
| `stampGeneratedPicture` return | `StampedPicture \| null` → **`StampResult`** (a discriminated union, never null, never throws). | **`app/actions/studio.ts` only.** A lane calling it and testing `toBeNull()` fails. |
| `stampLogo` input | optional `alt: { bytes, facts }` and `sizeStep`. Additive. | Nobody. |
| `StudioWorkbench` props | **`signals` and `balance` are REQUIRED**, carried from 2026-09-01 plus `balance` new. | **Constructors, not readers.** Optional-with-default would silently claim an empty Brand Brain or a zero wallet. |
| `apps/web/scripts/perf/js-budget.json` | `/(app)/studio` 761123 → 770560, hand-edited, single entry. | Nobody. **Never run `PERF_BUDGET_WRITE=1`** — it rewrites all 82 routes. |
| `lib/brand/logo-bytes.ts` | `readBrandLogoBytesVariants` added; `readBrandLogoBytes` kept. | A lane mocking `readBrandLogoBytes` and asserting a read count — the code now reads through the other door. That exact defect was found in this session's own mocks. |

---

## Contract, migration or money

- **Four migrations, all UNAPPLIED**: `20260831090000_workspaces_logo_asset_id`,
  `20260831120000_asset_logo_facts`, `20260831150000_studio_stamped_asset`
  (extended to 5 steps this session, adding `stamp_outcome` and its check
  constraint), `20260902000000_workspaces_logo_asset_id_dark` (new — column,
  tenancy trigger `app.workspaces_logo_dark_same_tenant`, partial index,
  rollback block).
- **Money: no change.** Stamping is local compute and charges nothing. Turning
  it off changes no price, and the copy says so in its own sentence rather than
  leaving the reader to assume it.
- **`packages/shared` contracts: additive only.** No field removed, no field
  made required on a schema another lane parses.

---

## Guards written, and the mutation that proved each

Every one **watched go red**, then restored. MEASURED.

**`lib/studio/stamp-copy.test.ts`**
1. never-attempted rendered as "no logo yet" → red
2. an unreadable logo told to ADD one → red
3. a failure offering a remedy → red
4. the version toggle offered when only one picture exists → red
5. `no_logo` and `logo_unreadable` collapsed into one sentence → red
6. `skipped` sharing the never-attempted sentence → red

**`app/actions/studio.stamp.test.ts`**
7. the skip recorded as `null` instead of `'skipped'` → red

**`components/studio/studio-workbench.test.tsx`**
8. an unread balance rendered as zero → red
9. coming-soon shipped as `<button disabled>` → red
10. the composer losing its own upload route → red
11. the history strip dropping the age → red
12. the strip showing the unstamped picture where a stamped one exists → red

**`lib/studio/stamp.test.ts`** and `logo-variant-pick.test.ts`
13. `alt` not reaching the compositor → red
14. the chosen corner ignored → red
15. the size step dropped → red
16. the swap disabled → red
17. the swap always-on → red
18. **"never swaps to the dark mark" SURVIVED first time.** Every test asserted
    plumbing; none asserted pixels. Closed with a guard comparing
    `plated === false` (two marks, dark picture) against `plated === true`
    (one mark, same picture), red in **both** directions.

---

## Anything retracted

- **"Implemented the design" was true of the composer and false of the
  artboard, and I said the first while meaning the second.** Four elements of
  `Compose.dc.html` had never reached the app and my report called the screen
  done. MEASURED: the founder found it by opening the artboard, not me.
- **A mock counter was on the wrong door.** `state.logoReads` counted
  `readBrandLogoBytes` while the code had moved to `readBrandLogoBytesVariants`,
  so "never reads the logo file" would have passed while the code read it.
- **Both agents reported the other's in-flight files as test failures** —
  concurrent edits in one worktree. Every "pre-existing flake" claim was re-run
  by me rather than believed. None were flakes; all were the other agent's
  half-written file.
- **The test helper's `pictures: typeof MADE` pinned `stampedUrl` to null** from
  the literal it was inferred off, so the stamped fixture the whole result
  screen exists for could not be passed in. A fixture type narrow enough to
  exclude the case under test is the same shape of alibi as the `42703` fake.

---

## What the next session in THIS lane should pick up

1. **Apply the four migrations** (needs a person with `supabase db push`). Until
   then `stamped_asset_id`, `stamp_outcome` and `logo_asset_id_dark` are all
   dropped on `42703` and **the dark mark is dead code in production**. This is
   the top item and everything below is smaller.
2. **Open the Studio in a browser**, both themes:
   https://sahodalabs-git-wt-girija-development-4417s-projects.vercel.app/studio
   Nobody has, across two sessions. The composer is the first dark surface in
   the product outside the rail.
3. **Build one of the four Coming soon controls**, or delete the label. A label
   that stays a label for a month is worse than an absence.
4. **Re-seed the design canvas** — `Main.dc.html` has four states, the code has
   five.
5. **`@sahoda/jobs` `x-ration.test.ts` is red and is NOT this lane's.**
   `git diff origin/wt-core...HEAD -- apps/jobs` is EMPTY. Two guards on one
   publish path; the per-day cap fires first. A product question for whoever
   owns publishing.
6. **`packages/db/tests/live-guard.test.ts` prints a production database URL and
   password into the test log** when it fails, which it does wherever a repo-root
   `.env` exists. Reported since 2026-08-31 and still open. Needs somebody with
   the production project.
7. Design canvas, three artboards:
   https://claude.ai/code/artifact/2f63ef75-665c-461a-85ae-fda3c6062976

---

## Gate

Run at `9d7d9313`, 2026-09-03. MEASURED.

| Leg | Command | Result |
| --- | --- | --- |
| web unit | `npx vitest run` (from `apps/web`) | **PASS** — 590 files (587 passed, 3 skipped), 7,743 passed, 13 skipped, 0 failed, 314s |
| shared unit | `npx vitest run` (from `packages/shared`) | **PASS** — 31 files, 471 passed, 3.87s |
| lint + typecheck | `pnpm -w exec turbo run lint typecheck --force` | **PASS** — 18 tasks, 18 successful, 0 cached, 23.4s |
| design-lint | inside `@sahoda/web:lint` | **PASS** |
| format | `npx prettier --check .` | **PASS** |
| `packages/db` live legs | not run | **UNRUN** — shared live database |
| Playwright `@smoke` | not run | **UNRUN** — see "What was NOT done" |
| Vercel | PR #39 status on `9d7d9313` | **PASS** — "Deployment has completed" |

The lint and typecheck leg was forced (`--force`, 0 cached) because a cached
replay verifies nothing.

### Re-run after `lane-sync` took `wt-core`

`node scripts/lane-sync.mjs push` merged `wt-core` (16 behind, clean) into this
lane as `c024ba0b` and pushed. That made every figure above stale, so the whole
gate was run again on the merged head. MEASURED 2026-09-03.

| Leg | Command | Result |
| --- | --- | --- |
| full turbo gate | `pnpm -w exec turbo run typecheck lint test --force` | **PASS** — 27 tasks, 27 successful, 0 cached, 6m6s |
| web unit inside it | | **PASS** — 587 files passed, 3 skipped, 7,748 passed, 13 skipped, 0 failed, 334s |
| format | `npx prettier --check .` | **PASS** |

**`@sahoda/jobs` is GREEN on the merged head.** The `x-ration.test.ts` failure
carried in the 2026-09-01 handoff and repeated in item 5 above is **fixed on
`wt-core`** — MEASURED, `@sahoda/jobs:test` is one of the 27 successful tasks.
Item 5 is therefore closed and needs nothing from the next session.

`c024ba0b` was **not** pushed to `wt-core`. The gate is green and the push is a
one-liner (`git push origin HEAD:wt-core`), but pushing outside the lane is not
this session's to decide.


---
---

# Session 2 — same day, after the lane was merged

**Branch** `wt-girija` at `3a89e60f`, which is `wt-core`'s head: another session
pushed the trunk onto this lane's ref. Lane work above is unchanged and is in
`wt-core`. Nothing was built this session; it was verification, and it
**retracts the largest claim in Session 1**.

## What was retracted, with the measurement

**"FOUR migrations remain UNAPPLIED" is WRONG.** All four are applied to
production, and so are the four `20260902220001-4` that came from `wt-core`.
MEASURED 2026-09-03 against project `rloztdhzfliyvpvxsgjl` by reading the
CATALOG, not the migration ledger, because I had edited `20260831150000` after
its first run and a recorded version says nothing about a later edit:

| Object | State |
| --- | --- |
| `workspaces.logo_asset_id`, `.logo_asset_id_dark` | present, `uuid` |
| `asset_logo_facts` | present, **RLS enabled** |
| `studio_generation_images.stamped_asset_id`, `.stamp_outcome` | present |
| `stamp_outcome` check constraint | includes **`skipped`** — my later edit did land |
| both tenancy triggers, both partial indexes | present |

So the `42703` fallbacks in `studio.ts` and `logo-bytes.ts` are dead paths in
production now, and the dark mark is live rather than dropped. **Session 1's
"top item, everything else is smaller" is closed.** I did not run
`apply_migration` at all — there was nothing left to apply, and re-running DDL
that is already in place is risk with no upside.

**How the error happened, because it will happen again**: somebody applied them
between the 09-01 handoff and now, and I repeated "UNAPPLIED" from my own
earlier report without re-checking. The lesson is the one this project already
has a rule for: a claim about shared state has to be re-measured at the moment
it is made, not carried forward.

## The lane merged itself while I was gating

`171de658` is an ancestor of `origin/wt-core`. Another session merged it as
`46e806ea` "merge wt-girija into wt-core: the Studio composer, logo variants, and
stamp outcomes", and four more lanes landed after. My `git merge origin/wt-core`
then **fast-forwarded the local branch onto the trunk**, which would have turned
the lane into a copy of `wt-core`; I reset to `171de658`. `origin/wt-girija` has
since been pushed to `3a89e60f` by someone else anyway.

Nothing was lost. Worth recording because a fast-forward is silent and looks
like a successful merge.

## Studio has still never been seen working

I was asked to check it end to end on preview and **could not**. Two independent
walls, both MEASURED 2026-09-03:

1. **Vercel deployment protection.** `/studio` on the lane preview returns 302 to
   `vercel.com/sso-api`. The Vercel MCP fetcher, which exists to carry that auth,
   gets the same 302 with and without the `_vercel_share` token it mints itself.
2. **Clerk.** Past that, `/studio` needs a signed-in user, and this sandbox's
   Chromium cannot complete any outbound HTTPS request.

Keys are present locally, so the blocker is network and SSO, not configuration.
What I could establish: the `wt-girija` deployment is **READY**, and Vercel
reports **no runtime errors on the project in 24h**. That is "it built and the
database can hold the data". It is not "it works", and it must not be written up
as if it were.

## A guard in `.github/workflows/gate.yml` under-checks — NOT FIXED

**Found, reported, deliberately not changed.** The `smoke` job's guard step
refuses on three secret names:

    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL

but the run step immediately below passes **six**, adding
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_DB_URL`. `scripts/cloud-setup.sh`'s `ENV_REQUIRED` names the first two
of those as required for the app to boot. So somebody who adds exactly the three
the guard names will **clear the guard and then die inside the suite** with the
opaque failure the guard exists to prevent. The guard's own header says it was
rewritten twice because "add them" was not enough; it is one name-list short of
being right.

Left alone because `.github` is shared, the founder was about to act on it, and a
half-understood edit mid-conversation is worse than a clear report. It is a
small, well-scoped fix for whoever picks it up.

## Two facts about CI that stop a wrong decision

- **`e2e/global-setup.ts` already refuses a `pk_live_` key** and demands
  `pk_test_`. "Use a Clerk test instance for CI" needs no code change; it is
  enforced.
- **A Clerk test instance is not a test database.** The suite mints a user and
  lets the app create a workspace and a ledger in whatever
  `NEXT_PUBLIC_SUPABASE_URL` names, and there is one ACTIVE project: production.
  `lib/testing/e2e-target.ts` documents this as a measured finding — test
  workspaces have been appearing and vanishing in the customer database on every
  local run. Enabling CI smoke against production would make that automatic.
- **`sahoda-staging` (`yoxmzwkxweasfaahhvpj`) exists and is INACTIVE.** Restoring
  it is the clean answer: `ack_target=yoxmzwkxweasfaahhvpj` and no test workspace
  ever touches customer data.

## Blocked, needing a person

- **`restore_project` on `yoxmzwkxweasfaahhvpj` was DENIED by the permission
  classifier.** Not a tool gap, not a Supabase error. Restoring a paused project
  is billing-affecting, so the refusal is reasonable. A person unpauses it in the
  dashboard, or grants the permission.
- **No tool in this session can write a GitHub Actions secret.** The GitHub MCP
  server exposes workflows, runs, files, PRs and secret *scanning* — no
  create/update. Writing one needs the repo public key and a libsodium seal.
  Reading the values out of `apps/web/.env.local` was also correctly denied by
  the sandbox. This stays a person's job, and
  **`development156/sahodalabs` is PUBLIC** (MEASURED — `githubRepoVisibility`
  on every deployment record), which is a reason to use a Clerk test instance
  rather than the production one.

## What the next session in THIS lane should pick up

1. **Get somebody to open `/studio` and look at it.** Three sessions have now
   shipped to a screen nobody has seen. Everything else here is smaller.
2. **Restore `sahoda-staging` and apply the 100 migrations to it**, then point
   CI at it. I was one permission short of doing this.
3. **Fix the `gate.yml` guard's name list** — three checked, six needed.
4. Six repository secrets, on the SECRETS tab, from a Clerk **test** instance.
5. Build one of the four Coming soon controls, or delete the label.
6. Re-seed the design canvas: `Main.dc.html` has four states, the code has five.
7. `packages/db/tests/live-guard.test.ts` still prints a production database URL
   and password on failure. Open since 2026-08-31.

## Gate

**UNRUN this session, and that is the honest word.** No source file was changed:
`git diff 171de658..3a89e60f -- ':!docs'` is other lanes' work that arrived by
fast-forward, already gated by them. The only file this session writes is this
handoff. Session 1's gate stands as the last measurement of this lane's code.
