# Handoff — divas / wt-core (2026-09-06, deep audit: /inbox, /leads, /report, /radar, 18:15–19:50 IST)

**Done, verified live.** Fixes `deb355c7` (verified on its own deployment `dpl_BFAumpXG`), `e169a41e` and `0a1ae3fd` (tests + typecheck; not yet on a live build). Report: https://claude.ai/code/artifact/820392c0-6b3a-49d6-a800-2c0b8ee257b1 (36 findings, IL-01..IL-36, every one marked MEASURED / INFERRED / BLOCKED).

## The verdict in one paragraph

The four screens are careful and never lie; the pipelines behind them are dormant. MEASURED on production: the inbox store holds **0 threads across all 35 workspaces** (168 webhook events since 24 Aug, none a message/comment/review, 99 unroutable); Radar has produced **0 changes ever** (one cron run on 31 Aug, 3 of 4 fetches `could_not_check`: APIFY_TOKEN absent, "thin: needs javascript"); `post_metric_snapshots` exist for **1 of 35 workspaces**; **12 of 12** Loop cycles have `reflect_skipped_no_history`. The four surfaces share one bridge (inbox thread → lead) and one exit (Radar change → post draft). The report reads none of inbox, leads or radar.

## Fixed (each with a test that was red first)

| Finding | Fix | Verified |
|---|---|---|
| IL-01 workspace switcher never switched ("form is not connected": the submit button's onClick closed the menu before the browser submitted) | `workspace-switcher.tsx` runs the action, then closes; `workspace-switcher.test.tsx` plays the browser's microtask order by hand | LIVE: POST 200, header switches both ways, no warning |
| IL-03 stored thread with no connected account → `/inbox/threads//id` → 404 | `conversation-row.tsx` (deb355c7) **and** `conversation-list.tsx` (e169a41e — the list page builds its own row; the first fix did not reach it, MEASURED live) | e169a41e by test; live pending |
| IL-04 /leads scrolled sideways at 390 (971 px) and 768 (1053 px) | `min-w-0` on the doors grid items | LIVE: 380 / 768 |
| IL-12 report numerals 01 02 03 04 06 | `lib/report/module-numbers.ts` running counter | LIVE: 01–05 |
| IL-13 "instagram." keys in report sentences | `channelName()` through CHANNEL_LABELS | LIVE |
| IL-02 plan sub-line "waiting for your approval" on `expired` posts | wording now a past fact; proper fix = join `posts.status` into the brief view | LIVE (wording) |
| IL-18 embed snippet `//embed/lead` | `lib/leads/embed-origin.ts` | LIVE |

## Open, ranked (details in the artifact)

1. IL-05 register Zernio message/comment/review subscriptions; fix account routing (59% of events unroutable).
2. IL-06 APIFY_TOKEN in prod; wire `radar_fetch_log` into the feed's `attempts` (hardcoded `[]`, so NotChecked never renders).
3. ~~IL-07~~ done in `0a1ae3fd` (own workspace first when no cookie).
4. IL-02 proper, IL-08 (fixture rows can enter the ranking; unbounded read), IL-09 (lead dedupe is check-then-insert, no unique key; same conversation is a lead in two workspaces), IL-10 (sent replies never written to the store).
5. IL-36 `pnpm --filter @sahoda/web lint` is red at HEAD: `asset-detail.tsx` over the font-size ratchet + 3 raw hex (c5ae7c92, not this audit).

## Traps met

- The Chrome extension was not connected; the Playwright MCP browser was signed in as the QA test user (`user_3IvYwf26…`, workspace `83bcafc4`). Vercel share links are **single-use and bound to the deployment the alias pointed at**; with another session pushing every few minutes the alias kept moving and every fresh link bounced to Vercel login. What worked: mint the share link for the **deployment-specific URL**, sign in there with a Clerk ticket (`clerk-probe.mjs ticket <user>`), drive with `browser_run_code_unsafe` reading a driver file placed under `.playwright-mcp/` (the only allowed root).
- Adding a membership to test with demo data **changed the active workspace** of the next request (IL-07); a form filled on "My workspace" wrote to "Chai & Chapters".
- `page.waitForLoadState('networkidle')` never settles on the preview (vercel.live toolbar); use `load` + a short wait.
- Another session is working in this same worktree (approvals/planner/composer/mesh files modified, `auto-publish-note.test.tsx` failing tsc). Staged by explicit path only.

## Production writes made and removed

Membership (QA user → demo ws), 2 competitor subscriptions, 1 competitor + 1 source + 2 snapshots + 1 change, 1 lead, 2 inbox threads + 2 messages. `scratchpad/cleanup.mjs` deleted all of them; re-counts: leads 5, subscriptions 5, demo members 2, QA inbox 0.

## Not done, and why

- Live reply / failed send / duplicate send: BLOCKED (no Zernio-backed messaging account reachable to the test user).
- Vercel runtime logs for the cron routes: BLOCKED (query timed out twice); DB timestamps used.
- Playwright smoke leg: not run here (cannot run locally; CI only).

## Decisions executed (founder delegated all three, 19:32 IST)

- IL-07 → **the workspace you created wins when no cookie is set**, then the first membership; cookie still wins. `lib/workspaces.ts` reads `created_by` on the same memoised select; `topbar.tsx` and `rail-foot.tsx` resolve with the same user id. `workspaces.resolve.test.ts` pins it.
- IL-24 → **a Radar draft keeps requiring a channel.** The credit buys per-channel versions; a channel-less idea has the composer's own door. No code change.
- IL-14 → **the demo workspace's three "learned" rows were reworded in production** ("Your Instagram posts reached 1.6× what your LinkedIn posts reached."). They were leftovers of `lib/loop/cycle.live.test.ts`, whose `WORKSPACE` constant IS the demo workspace, so the next run of that test writes the test sentence again. Owed: point that test at a throwaway workspace.

Nothing else needs a decision.
