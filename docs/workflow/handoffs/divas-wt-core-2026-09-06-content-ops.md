# Handoff — divas / wt-core (2026-09-06, Assets + Planner + Approvals deep audit, 17:27–19:00 IST)

**Done.** Nine fixes in `c5ae7c92` (pushed, built as `dpl_A39q8DNC`, all verified headless on that build). Report: https://claude.ai/code/artifact/032b3c05-cba9-4bae-8ebb-19e0e2c80887 · Preview: https://sahodalabs-git-wt-core-development-4417s-projects.vercel.app/assets, /planner, /approvals. Not promoted to app.sahodalabs.com.

## How it was run

Chrome extension was down; Playwright MCP Chromium until another session took it, then a private headless Chromium with a Clerk ticket (`scratchpad/verify-fixes.mjs` pattern). Signed in as `sahoda.qa.mtoy3biltfnr4k` on the PRODUCTION db, QA workspace 83bcafc4 only. Four read-only code subagents (assets, planner, approvals + state machine, db/storage). One live PostgREST probe with the QA user's own JWT on a QA-owned row, reverted. Every post, photo, folder and storage object created today was deleted (remaining posts 0, assets 0).

## What was found (45 findings, F-01..F-45 in the artifact)

- **F-01 P0, MEASURED on prod:** any member's own JWT can `PATCH posts` to `scheduled` (+date) and `partial` over PostgREST (200); only `published` is refused. The row policy is membership-only; role lives in actions and three RPCs. Owner/editor can also schedule a draft from the planner row. Approval gates nothing, records nothing (`approver: null`), and an approved post stays approved through any edit. No send-for-review / reject / resubmit exists.
- Planner: three meanings of "scheduled"; approved+dated reads "not yet dated" beside its date and sits in no tab; calendars are IST, rows are workspace zone, the picker is browser zone; every view reads the 100 most recently updated posts; month view prints two overlapping notes; day view uses a 7-track grid.
- Assets: everything client-side runs over the newest 200 rows; originals as thumbnails; no bucket size/mime limits; `emptyTrash` loops 200 serial RPCs; `anon` likely still executes `delete_asset`/`erase_workspace`.
- Composer: after the first save the address sometimes stays `/posts/new` and a reload opens an empty editor (F-14, 2 of 4 attempts, one with a fresh share cookie).
- DB: post delete cascades `post_publish_logs`; no index serves the dispatcher pickup; no CHECK ties `scheduled_at` to status; prod schema snapshot stops at migration 68 of 109.

## Shipped in c5ae7c92 (each test-first, red then green; 150 files / 1922 tests green; typecheck + prettier clean)

Oversize upload refused in the browser with the server's own sentence and a per-file try/catch (uploader + composer); drawer "Move to trash" and `deleteAsset` refuses live rows; trashed asset cannot be attached; floating panel ignores its own scroll; publish-state provider resyncs on a newer `initial.readAt`; `schedulePost` refuses zero channels and the note stops promising a send; today / next up / upcoming use `isDispatchable`; one `revalidatePostSurfaces()`; library view/sort read after hydration (React #418 gone). e2e `assets.spec.ts` steps 9–10 retargeted through the trash but NOT executed here (smoke runs on CI against staging).

## Traps met today

- `_vercel_share` links and Clerk tickets are both single-use and the share cookie dies after ~20 min; reloads then bounce through vercel.com SSO with a stale `url=`, which looks like a product redirect. Mint both right before each headless run.
- A fresh browser context for the QA user opens **Chai & Chapters (Demo)** (6473b616, 32 posts, presenter data). Pin `sahoda_ws=<workspace slug>` as a cookie BEFORE sign-in. Never write to the demo workspace.
- Another session committed to this worktree twice during the audit (`9aa3317e`, `9415dcf2`); stage by explicit path.

## Not done, and why

Approval gate (F-15), approval record (F-07/08), planner zone (F-11) and every migration (F-01, F-13, F-30, F-31, F-32, F-38) need a founder ruling or wt-db. Plan my week could not run on the preview (no SUPABASE_DB_URL there; honest refusal, not charged). Publishing to a real channel not driven (no connection on the QA workspace).

## Needs a decision

1. F-01: close the member-writable lifecycle in SQL (role-aware trigger) or make status/scheduled_at RPC-only.
2. F-15: is approval a gate for owners/editors, or advice? Every approvals fix follows from this.
3. F-11: which zone the planner page renders in.
