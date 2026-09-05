# 51 — Full application audit: browser QA + engineering, 2026-09-05

**For the founder.** Lane `wt-core` at `cff2231b`, production build (`next build` + `next start -p 3100`), real Chromium, a throwaway Clerk test user and workspace created and deleted again the same hour. Five read-only code audits ran in parallel (security, database, frontend, backend/jobs, tests). Every claim below is marked **MEASURED** (a browser, a query, or a test produced it) or **INFERRED** (read from code, not executed).

**Status vocabulary for browser items:** PASS = tested in the browser and worked · FAIL = tested and broken · BLOCKED = could not be tested here · INFERRED = from code only.

---

## A. Executive summary

**The product works, and it is unusually honest about what it cannot do.** 44 of 46 routes rendered without a console error; every empty state named exactly what was missing; the composer, planner, wallet, delete flow, sign-out, dark theme and three viewport widths all held up. The security review found no P0/P1/P2 across auth, webhooks, RLS, the token vault, SSRF and OAuth. The unit gate is green: **27/27 turbo tasks, 3m26s, 0 failures** (MEASURED).

**The one thing that would lose a customer on day one** is in onboarding. The Brand Brain build (a real model call) returns its result to the browser and only saves it after the reveal screen's confirm. Close the tab, refresh, or lose the connection in that window and the model output is discarded. It is free three times a day; after that the flow says "try again tomorrow" while still showing a "Try again" button. **MEASURED: three successful model calls, zero brain rows, then a 24-hour lockout**, all reproduced in one sitting by a harness that closed the browser at the wrong moment, which is what a phone on Indian mobile data does.

**Biggest engineering risk:** the publish path's HTTP transport had no timeout, so a stalled socket parked a post in `publishing` with no log row for the full 600-second lease. Fixed in this lane, proven by mutation.

**Overall recommendation:** ship-able for a supervised beta once the onboarding persistence defect is closed. Nothing found is a data-loss or cross-tenant risk.

**In plain terms:** the app is solid and truthful. One screen can throw away work a customer just watched it make, three times, then lock them out for a day. Fix that screen first.

---

## B. Architecture map

| Layer | What it is | Notes |
| --- | --- | --- |
| `apps/web` | Next.js 15 App Router, 88 routes (57 pages, 21 API routes) | Every route is dynamic (`ƒ`); shared JS 187 kB; heaviest page `/posts/[id]` 285 kB |
| `apps/jobs` | Publish, reconcile, metrics, radar, loop, autopilot workers | Driven by 7 Vercel crons in `vercel.json`; Trigger.dev wrappers exist but the cron is the live rail |
| `packages/shared` | zod schemas, the source of truth | `PLAN_CATALOG`, channel enums, brand memory payload |
| `packages/db` | 104 migrations (103 + this lane's), RLS on every tenant table, `apply_ledger_entry` | Production ref is the only database; there is no staging |
| `packages/mesh` | model calls via OpenRouter, zod-parsed, one repair, `ai_provider_logs` on every outcome | timeouts present on every provider call |
| `packages/publishing` | Zernio adapters, constraint engine, AES-GCM token vault | transport now has a 30 s deadline |
| `packages/billing` | Cashfree rail, `withCredits` hold/settle, entitlements | ledger idempotency verified in SQL |
| Clerk · Supabase · Cashfree · Zernio · OpenRouter · Sentry · Upstash | external | Clerk runs on a **development** instance in production (known founder item) |

## C. Data-flow map (the flows that matter)

| Flow | Path | Verdict |
| --- | --- | --- |
| Sign in | Clerk ticket → `/sign-in` → `/` → `/home` → layout `landingDecision` | PASS. Fresh browser after >60 s idle bounces through `/sign-in` for 1.8–3.4 s (dev-instance cookie model) |
| Create workspace | `CreateWorkspaceButton` server action → `workspaces` + `workspace_members` + GRANT 100 → redirect `/onboarding` | PASS. Ledger row `grant:signup:<ws>` MEASURED |
| Build Brand Brain | intake (localStorage) → `resolveOnboarding` → mesh `brand_guidelines` → **returned to client** → reveal → `saveWorkspaceTheme` → `saveBrandMemory` | **FAIL** at the seam: nothing persisted until the last step (§Q-01) |
| Write a post | composer → autosave server action → `posts` + `post_variants` per channel → list | PASS. Autosave, reload, per-channel limits, honest "not connected" |
| Post now | `release_post_for_publish` → sweep cron → claim → adapter → `post_publish_logs` | INFERRED (no connected channel); refusal UI PASS |
| Buy a plan | wallet → `startPlanUpgrade` → Cashfree order → `/billing/checkout/[orderId]` → webhook → ledger | Cashfree refuses in this environment (known: production keys 401); client double-submit guard PASS; server-side order idempotency absent (INFERRED) |
| Delete a post | dialog → action → cascade | PASS, copy states credits are not returned |

## D. User journey map

| Journey | Entry | Outcome | Friction |
| --- | --- | --- | --- |
| J1 new user | `/` → `/home` first-run card → Create workspace → `/onboarding` 5 steps → build | Reached the build; result lost on close (§Q-01) | Focus lands on `<body>` after each step; "Website — Read your pages" can be queued with no website given |
| J2 returning user | fresh browser → `/posts` | 3.4 s with a pass through `/sign-in` (no form painted) | Cosmetic but every return visit pays it |
| J3 first dashboard | `/home` after brain exists | A plan-upsell modal covers the dashboard on first visit (§Q-04) | The first thing a paying-curious user sees is a paywall |
| J4 compose | `/posts/new` | PASS end to end | none material |
| J5 pay | `/wallet` → Start checkout | honest refusal; no order created | none (environment) |
| J6 leave | user menu → sign out → protected route redirects | PASS | none |

## E. Feature audit (major features)

| Feature | Browser | Backend/data | Issues |
| --- | --- | --- | --- |
| Onboarding | PASS to build; FAIL persistence | 3 `ai_provider_logs` rows ok, 0 `brand_memory` rows (MEASURED) | Q-01, Q-02, Q-03 |
| Home dashboard | PASS | reads batched in one `Promise.all`, React `cache()` dedupe (INFERRED) | Q-04 upsell modal |
| Brand Brain (overview, voice, resolve, knowledge) | PASS; confirm-free moved 0/15 → 1/15 | seeded `system` source correctly flagged "A sample, not your brand" | Q-11 duplicate h1 (fixed) |
| Composer | PASS | autosave, variants, 280/2,200 limits, Instagram photo rule | Q-12 Telegram listed on `/posts` and `/planner` but absent from the composer |
| Planner | PASS at 3 widths | — | clipped nowrap text at 390 (cosmetic) |
| Connections | PASS | OAuth return re-derives workspace from session (verified clean) | Q-08 "Details" buttons 63×18 at 390; "Not proven live" is internal jargon on a customer screen |
| Wallet / plan / checkout | PASS (refusal honest) | order creation not idempotent server-side | Q-06 |
| The Loop | PASS (On, waiting for Sunday) | — | — |
| Analytics / Report | PASS, example clearly labelled "not your figures" | — | — |
| Ads/* | placeholder ("Coming soon") | — | by design |
| Admin | 404 to non-admin | middleware + `requireOpsAdmin` in every action (verified) | — |

## F. Browser QA report

**Environment:** Playwright Chromium 1.61 headless, 1440×900 then 390/768/1024, production build. HTTPS to Clerk, Supabase and OpenRouter worked. The Chrome extension was not connected, so the Playwright browser was used.

| Area | Result |
| --- | --- |
| Routes loaded | 46 probed: 43 × 200, `/admin` and `/admin/qa` 404 (non-admin, correct), `/nonexistent-route` 404 with its own copy |
| Console errors | 0 on every 200 route; only the Clerk development-keys warning |
| Network | every page prefetches 12–14 sibling routes via RSC; all dynamic, so each prefetch hits the server (§Q-09) |
| Responsive 390 | no horizontal scroll on 12 screens; bottom nav; `/brain` tab strip and `/connections` filter chips overflow into a scroll strip with no affordance |
| Responsive 768 | topbar controls 38 px, planner Approve/Schedule 67×28, plan-change buttons clip their price text |
| Responsive 1024 | as 768 |
| Dark theme | rendered; my contrast detector could not resolve translucent tints, so no contrast claim is made (a prior lane's detector failed the same way; docs/workflow/05_TRAPS.md) |
| Keyboard | focus rings visible on every rail link; 14 Tabs still inside the rail: no skip link (§Q-10) |
| Double submit | Start checkout: button disabled in flight; second click accepted only after the first returned (MEASURED 445 ms apart) |
| Reload mid-edit | composer state survives |
| Refresh mid-build | onboarding: brain lost (§Q-01) |
| Sign out | redirect to `/sign-in`; protected route redirects |
| BLOCKED | publishing to a real channel (no OAuth completion in a headless harness), payment completion (Cashfree refuses), the @smoke suite (see §P) |

## G. Frontend audit

- Server/client boundaries clean: no page-level `'use client'`; the only client boundaries at the route level are the 5 `error.tsx` files (INFERRED, agent).
- Data fetching: `/home` and `/report` batch reads; `React.cache()` dedupes layout/page overlap (INFERRED).
- Dead code: `onboarding-flow.tsx` (416 lines) and `coming-soon.tsx` have zero production importers; 38 further candidates unverified.
- Unwired server actions (callable RPC with no UI): `actions/inbox.ts` `draftReply`/`setThreadStatus`, `actions/posts-image.ts` `generateImage`. The repo's own `brand-resolve.ts` header states why this class matters (§Q-07).
- 93 files over the 300-line rule; largest `studio-workbench.tsx` 1,190.
- Bundle: shared floor 187 kB; `js-budget.mjs` is a ratchet against its own last run, not a ceiling.

## H. Backend audit

- Crons: 7, each `isAuthorizedCronRequest` first, constant-time, fail-closed. `sweeps` `maxDuration=300` on a `*/5` schedule can straddle at equality (comment claims otherwise; bounded by CAS claim).
- Publish: DB claim is the idempotency guarantee; `releaseVariant` WHERE can wipe another worker's live claim on a lapsed lease (unreachable on Vercel today, reachable on a durable runner).
- Credits: no path charges for a failure; RELEASE on run-throw and settle-throw; lost-ack double-charge from the July review is closed (VERIFIED in SQL by the agent).
- Transport: publishing `fetchTransport` had no `signal` → **fixed this lane**.
- Layering: no deep imports, no `packages→apps` import.

## I. Database / data audit

| Item | Finding |
| --- | --- |
| Missing FK indexes | 7 columns (planner_events.post_id, remix_batches.source_post_id, remix_derivatives.post_id, competitor_changes.{from,to}_snapshot_id, loop_autopilot_log.{brief,cycle}_id) → migration written this lane, **not applied** |
| Transaction seam | `remix/store.ts createBatch` inserts batch then derivatives in two statements |
| Unbounded read | `knowledge/store.ts readLibrary` has no limit |
| Ledger function | `EXPIRE` / negative `ADJUST` lack the available-balance guard the other branches have (no caller today) |
| Invariants script | 9 checks, none reads `hold_expires_at`; not wired into any gate |
| zod ↔ SQL | posts, post_variants, credit_ledger, invoices all match |

## J. UI audit (with evidence)

- Plan-change buttons at 768 truncate "₹1,999 a month · 1,500 cr…" (frame `resp-768_settings_plan`).
- `/brain` tab strip cuts "Audience" at the 390 edge with no scroll hint (frame `resp-390_brain`).
- "Details" buttons on `/connections` are 63×18 at 390 (12 of them).
- Onboarding controls are 28–39 px tall at 390 (Save & exit 98×28, Build 265×38).
- Sticky composer save bar overlaps the template card in a full-page capture only (viewport is fine).

## K. UX audit

- **The upsell modal on the first dashboard visit** is the largest journey-level issue after Q-01: a user who has just finished setup is asked to pay before seeing what they set up.
- Onboarding "Free the first time" stays on screen after the free allowance is spent, beside "Try again", beside "Try again tomorrow".
- "Not proven live" and "Publishes today" on connection cards are engineering vocabulary.
- Empty states, refusals and destructive dialogs are exemplary; keep them.

## L. Accessibility audit

- No skip-to-content link; the rail has ~20 focusable links before `main`.
- Focus is dropped to `<body>` on every onboarding step change.
- `/brain/knowledge` had two `h1` elements → fixed this lane.
- Sub-44 px targets at 390 on `/connections` and `/onboarding`; sub-44 px throughout at 768.
- Clerk's avatar `alt="'s logo"` is masked by the button's label (known, third-party).

## M. Performance audit

| Measurement | Value | Status |
| --- | --- | --- |
| `next start` ready | 677 ms | MEASURED |
| Typical page load, signed in, warm | 670–840 ms | MEASURED |
| First load after idle (sign-in bounce) | 1.8–3.4 s | MEASURED |
| Brand Brain build (haiku-4.5 via OpenRouter) | 6.6 s latency, $0.0036, 671 in / 593 out tokens | MEASURED |
| RSC prefetches per page | 12–14, all dynamic routes | MEASURED (cost per prefetch not measured) |
| Shared JS | 187 kB; `/posts/[id]` 285 kB | MEASURED (build) |
| Client-side rail navigation | 47 ms | MEASURED |

## N. Security audit

No P0/P1/P2. Verified end to end: Clerk webhook requires verified email + 5-minute Svix tolerance; all 49 SECURITY DEFINER functions taking `p_workspace_id` enforce membership; AES-256-GCM vault with pinned tag; Radar SSRF guard re-checks the resolved IP at connect time (the prior "OPEN" item is closed); Cashfree/Zernio/Clerk webhooks HMAC the raw body before parsing; OAuth return ignores every browser-supplied id. Three P3s: export-drift guard skips without a DB; no per-user rate limit on the publish route; CSP has no `script-src` (self-documented). PGlite RLS proofs 85 passed; the live 47-table matrix could not be re-run here.

## O. Reliability / failure audit

| Failure | Behaviour | Status |
| --- | --- | --- |
| Model unreachable at onboarding | sample brain served, flagged "not your brand", nothing charged | INFERRED from code; the flag renders correctly (MEASURED with a `system` row) |
| Payment provider refuses | "its payment service refused the request… Sahoda has been told" | MEASURED |
| Unknown checkout order | said "could not reach the payment provider" and reported to Sentry | MEASURED → **fixed**: now 404, not reported |
| Stalled publish socket | hung to platform kill, no log row | INFERRED → **fixed**: 30 s deadline |
| Browser closed mid-build | model output discarded | MEASURED, open (Q-01) |
| Cron overlap | CAS claim + ledger keys make it safe | INFERRED |

## P. Testing audit

- **Gate leg 1 (typecheck · lint · test):** 27/27 tasks, exit 0, 3m26s; apps/web 8,251 passed / 13 skipped; db 978 passed / 198 skipped (live-only). MEASURED this lane.
- **Smoke leg:** UNRUN. It writes to production and needs `SAHODA_E2E_ACK_TARGET` typed by a person; CI cannot run it because no repository secrets exist (run 981, CLAUDE.md).
- 11 `@smoke` tests skip silently when `SUPABASE_SERVICE_ROLE_KEY` is absent; the gate's exit code does not notice.
- Zero coverage: `/`, `/admin/{applications,brain,jobs}`, `/inbox/comments/[a]/[b]`, `/api/privacy/export` glue, `/api/cron/radar` handler, 7 server actions incl. `startPlanUpgrade` (only ever mocked).
- 27 tests assert `ok === false` with no sentence and no side-effect check.
- Highest-value missing tests: §V.

## Q. Complete findings table

| ID | Sev | Category | Location | Finding | Evidence | Root cause | Best fix | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q-01 | **P1** | Reliability · UX · Product | `use-build.ts:310–420`, `onboarding-resolve.ts` | Brain build result lives only in client memory until the reveal's confirm; close/refresh/drop discards it; 3 free/day then 24 h lockout | 3 `ai_provider_logs` ok rows, 0 `brand_memory` rows, lockout message rendered (MEASURED) | Resolve action returns the brain instead of persisting it; free-limit counts attempts, not persisted brains | Persist a `draft` `brand_memory` row (status column already allows `draft`) inside `resolveOnboarding`; reveal reads the draft; confirm promotes it; count free resolves on drafts that reached a reveal. Alternative: don't count an attempt whose output was never saved | OPEN |
| Q-02 | P2 | UX · Copy | processing overlay failure card | "Try again" offered when the sentence says "try again tomorrow"; "Free the first time" still shown after the allowance | frame `onb5-fourth-build` (MEASURED) | `retryable` derives only from `kind !== 'insufficient'` | Return a `kind: 'limit'` and set `retryable=false`; hide the "free" tag once `freeResolveAllowed` is false | OPEN |
| Q-03 | P3 | Accessibility | onboarding step transitions | focus drops to `<body>` | `document.activeElement` after Continue (MEASURED) | no focus management on step change | move focus to the new step's `h2` | OPEN |
| Q-04 | P2 | UX · Product | `/home` first visit with a brain | plan upsell modal covers the dashboard | frame `brain_home` (MEASURED) | intentional prompt, wrong moment | show it on the second visit or after the first successful action; never over the first dashboard | OPEN |
| Q-05 | P2 | Reliability | `packages/publishing/src/transport.ts` | no fetch timeout on the publish path | code (VERIFIED by agent) | `fetch` has no default deadline | `AbortSignal.timeout(30_000)` | **FIXED**, mutation-proven |
| Q-06 | P2 | Backend · Data | `actions/billing.ts startPlanUpgrade` | no server-side idempotency on order creation; guard is client-only | double-click MEASURED: button disabled in flight; second call accepted after first returned | no open-order check | look up an open order for the workspace/plan before creating; return it | OPEN |
| Q-07 | P2 | Architecture · Security-adjacent | `actions/inbox.ts`, `actions/posts-image.ts` | `'use server'` exports with no UI caller (one spends credits) | grep (VERIFIED by agent) | built, never wired | wire or delete, per the repo's own `brand-resolve.ts` rule | OPEN |
| Q-08 | P2 | Accessibility · Mobile | `/connections` at 390 | 12 "Details" buttons 63×18; onboarding buttons 28–39 px | responsive sweep (MEASURED) | desktop sizing reaching phone | 44 px min-height on those controls | OPEN |
| Q-09 | P3 | Performance | rail `<Link>` prefetch | 12–14 dynamic-route prefetches per page load | network log (MEASURED) | default `prefetch` on dynamic routes | `prefetch={false}` on rail links or a lighter loading boundary; measure server cost first | OPEN |
| Q-10 | P3 | Accessibility | app layout | no skip link | 14 Tabs in rail (MEASURED) | — | add "Skip to content" as first focusable | OPEN |
| Q-11 | P3 | Accessibility | `/brain/knowledge` | two `h1` | aria snapshot (MEASURED) | page adds its own h1 under the section h1 | `h2` with the same class | **FIXED** |
| Q-12 | P3 | UI · Consistency | `/posts`, `/planner` vs composer | Telegram listed as a channel, no Telegram button in the composer | aria (MEASURED) | enum has `telegram`; composer palette does not | add or remove consistently | OPEN |
| Q-13 | P2 | Copy · Observability | `/billing/checkout/[orderId]` | unknown order said "could not reach the payment provider" + Sentry report | MEASURED | one catch for 404 and outage | 404 → `notFound()` | **FIXED** with tests |
| Q-14 | P2 | Database | 7 FK columns | no index on the referencing side | grep across 103 migrations (MEASURED) | — | migration `20260905100000_fk_indexes_for_deletes.sql` | **WRITTEN, not applied** |
| Q-15 | P2 | Data | `remix/store.ts createBatch` | two inserts, no transaction | code (VERIFIED) | — | single RPC | OPEN |
| Q-16 | P2 | Data · Perf | `knowledge/store.ts readLibrary` | unbounded select | code (VERIFIED) | — | `LIST_LIMIT` + pagination like campaigns | OPEN |
| Q-17 | P2 | Testing | 11 `@smoke` specs | silent skip without service key | grep (MEASURED) | `test.skip(admin === null)` | fail the run when the key is set and any skipped; print count otherwise | OPEN |
| Q-18 | P3 | Testing | 27 refusal tests | bare `ok === false` | sample (MEASURED) | — | assert the sentence + `not.toHaveBeenCalled` | OPEN |
| Q-19 | P3 | UX · Auth | return visit after idle | 1.8–3.4 s via `/sign-in` | MEASURED | Clerk development instance in production | move to production Clerk keys (founder item) | OPEN |
| Q-20 | P3 | Copy | `/connections` cards | "Not proven live", "Publishes today" | aria (MEASURED) | internal status leaking | "Ready to publish" / "Read-only for now" | OPEN |
| Q-21 | P3 | Backend | `sweeps/route.ts` | `maxDuration=300` on a 5-minute schedule; comment claims no straddle | code (VERIFIED) | — | 240, or fix the comment | OPEN |
| Q-22 | P3 | Database | `apply_ledger_entry` EXPIRE/ADJUST | no available-balance guard | code (VERIFIED), no caller | — | add the HOLD/DEBIT guard | OPEN |
| Q-23 | P3 | Security | `export-drift.test.ts` | guard skipped without DB | code (VERIFIED) | — | diff against the migration-derived table list | OPEN |
| Q-24 | P3 | Frontend | `onboarding-flow.tsx`, `coming-soon.tsx` | dead files | grep (VERIFIED) | — | delete | OPEN |

## R. Top 10 highest-value improvements

1. **Persist the Brand Brain at resolve time (Q-01)** — the only finding that loses a customer's work and locks them out.
2. Fix the free-limit refusal card (Q-02) — a remedy that cannot work is the product's own rule 2.
3. Move the plan modal off the first dashboard (Q-04) — first impression after setup.
4. Server-side idempotent order creation (Q-06) — money path, cheap to close.
5. Wire or delete the unwired spend action (Q-07) — a callable credit-spend with no screen.
6. 44 px targets on phone (Q-08) — the stated non-negotiable, on the two screens that miss it.
7. Apply the FK-index migration (Q-14) — every post delete gets slower without it.
8. Make `@smoke` skips loud (Q-17) — a green gate that ran less than it says.
9. Skip link + onboarding focus (Q-03, Q-10) — keyboard users pay ~20 Tabs a page.
10. Measure and, if warranted, trim rail prefetch (Q-09) — 14 server renders per page view is the one performance suspect.

## S. Engineering roadmap

- **NOW:** Q-01, Q-02, Q-06, apply Q-14 (owner), Q-17.
- **NEXT:** Q-04, Q-07, Q-08, Q-15, Q-16, Q-03/Q-10, Q-12, Q-20.
- **LATER:** Q-09 (after measurement), Q-18, Q-21–Q-24, file-size splits, dead-code sweep with a `dynamic()`-aware script.

## T. Architectural recommendations

**Onboarding resolve.** Current: client orchestrates resolve → theme → save across three actions; the middle state is unrecoverable. Target: `resolveOnboarding` writes a `draft` `brand_memory` row and returns its id; the reveal renders from the draft; confirm promotes `draft → active` and supersedes the prior version; `freeResolveAllowed` counts drafts. Migration risk: none (the `draft` status already exists in the CHECK). Benefit: refresh-safe, resumable from another device, and the model cost is never spent twice for one reveal.

**Server-action surface.** Adopt the rule already written in `brand-resolve.ts`: a `'use server'` export with no UI caller is deleted, and a lint rule enforces it (the repo's `lint.mjs` ratchet is the natural home).

Nothing else warrants a redesign. Do not touch the empty-state system, the honesty gates, the ledger, or the composer's per-channel model.

## U. UX improvement roadmap

1. Onboarding: persist the build; make the failure card's buttons match its sentence; move focus per step; 44 px controls.
2. First dashboard: no modal; a dismissible card at most.
3. Connections: customer-facing status words; bigger "Details".
4. Composer: Telegram parity with the channel lists, or remove it from the lists.
5. Return visit: production Clerk keys remove the sign-in flash.

## V. Testing roadmap

| Kind | Test |
| --- | --- |
| Unit | `startPlanUpgrade` twice → one order (`actions/billing.test.ts`) |
| Unit | `resolveOnboarding` writes a draft row; free limit counts drafts (after Q-01) |
| Unit | `/api/privacy/export` 401/404/headers; `/api/cron/radar` 401/skip/500 |
| Unit | `draftReply` refuses cross-workspace and signed-out |
| Unit | retarget the 27 bare `ok === false` tests to sentences + side effects |
| Integration | `remix createBatch` atomic after Q-15 |
| Browser | onboarding: reload after build lands on the reveal (after Q-01) |
| Browser | checkout double-click fires one request (`@smoke`, fixture-only) |
| Browser | 44 px floor at 390 on `/connections` and `/onboarding` (extend `shell-probe`) |
| Gate | fail on any `@smoke` skip when the service key is present |

## W. Final verdict

1. **Works well:** composer, planner, wallet, delete flow, empty states, refusal copy, RLS and webhook hardening, ledger idempotency.
2. **Fragile:** onboarding's resolve → reveal → save seam; the publish path's stalled-socket case (now closed).
3. **Dangerous:** nothing at the data or tenant level. The closest is an unwired credit-spend action.
4. **Confusing:** the first-dashboard upsell; "Try again" beside "try again tomorrow"; engineering words on connection cards.
5. **Unnecessarily complex:** 93 files over 300 lines; two orphaned onboarding components.
6. **Fix immediately:** Q-01, Q-02.
7. **Redesign:** only the resolve persistence (small, contained).
8. **Do not change:** the honesty system, the ledger, per-channel variants, the delete dialog.
9. **Hidden risks:** 11 smoke tests that skip silently; the invariants script nobody runs; missing FK indexes that compound weekly.
10. **What would make it significantly better:** a customer who refreshes mid-onboarding and finds their brain waiting for them.

---

## What was NOT done, and why

- **The `@smoke` Playwright leg is UNRUN.** It mints users in production and requires a person to type the acknowledgement variable; I did not make that decision for the founder. The exploratory QA above used the same fixture method under one throwaway user, cleaned up and verified (0 workspaces remaining, Clerk user deleted).
- **No real channel was connected and nothing was published.** OAuth cannot complete in a headless harness.
- **No payment completed.** Cashfree refuses this environment's keys (known).
- **Dark-theme contrast was not measured.** My detector resolved translucent tints as the background, which is its own artefact, so no number is reported.
- **The FK-index migration is written, not applied.** Applying to production is a different act.
- **The live 47-table RLS matrix and the DPDP export drift diff were not re-run** (no live DB from the agent's sandbox); PGlite proofs ran green.

## Needs a decision

1. Apply `20260905100000_fk_indexes_for_deletes.sql` to production (7 plain `create index if not exists`).
2. Whether the plan modal stays on the first dashboard visit.
3. Who types `SAHODA_E2E_ACK_TARGET` and runs the smoke leg, and who adds the three CI secrets.
