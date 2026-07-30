# 01 — Scope map: docs vs repo

Every module in `docs/02_FSD_SAHODA_LABS.md` and every item in
`docs/05_Product_Roadmap_SAHODA_LABS.md` (§1 Alpha scope, §5 Alpha Gate, §6 backlog). No item is
omitted. Exactly one status per row.

**Status definitions**

| Status | Means |
|---|---|
| **SHIPPED-VERIFIED** | Works, and I have file:line + a live artefact (row count, log line, URL) proving it ran. |
| **SHIPPED-UNVERIFIED** | Code and tests exist and look complete, but I could not prove it executed in production. |
| **PARTIAL** | Some of it is real; a named piece is missing or dead. |
| **NOT STARTED** | No implementation. |
| **OBSOLETE** | Killed by the aggregator switch or a later decision. Do not build. |

Where repo and docs disagree: the repo is what exists, the doc is what was intended. Both are
stated.

---

## 1. Roadmap §1 — Day-2 Alpha scope (14 items)

| # | Item | Status | Why (one line) |
|---|---|---|---|
| 1 | Monorepo (pnpm+Turborepo) + `packages/shared` zod contracts, frozen H2 | **SHIPPED-VERIFIED** | 8 workspaces build; `packages/shared` 2,326 LOC is the single contract source; 3,692 offline tests pass on `--force`. |
| 2 | Supabase core schema + RLS on every table + `apply_ledger_entry()` + seed | **SHIPPED-VERIFIED** | 23 migrations applied; `list_tables` shows 38/38 `rls_enabled: true`; ledger proven by 9 live tests incl. a parallel-HOLD race. |
| 3 | Clerk auth → workspaces + members; workspace switcher | **SHIPPED-VERIFIED** | Live URL serves "Sign in · Sahoda"; 26 workspaces / 27 members / 17 profiles; `components/shell/workspace-switcher.tsx`. |
| 4 | Onboarding = Signal Resolution Console → `brand_memory` v1 | **SHIPPED-VERIFIED** | `actions/brand-resolve.ts` + migration `20260719094548_resolve_brand_memory`; `brand_memory` = 26 rows; `ai_provider_logs` = 36. |
| 5 | Look & Feel: 4 themes + colour extraction + Readability Guard | **SHIPPED-VERIFIED** | `workspace_themes` = 5 rows; `lib/brand/brand-theme.ts`; `guard-neutrals.test.ts` reads the real token file and fails on drift. |
| 6 | Posts editor + per-platform variants (Constraint Engine v0) + AI rewrite | **SHIPPED-VERIFIED** | `posts` 49 / `post_variants` 25 rows; `actions/posts-ai.ts:49` charges via `withCredits`; `shared/publishing/constraints.ts`. |
| 7 | Planner: list + week calendar, statuses, reschedule | **SHIPPED-VERIFIED** | `planner_events` = 9 rows; `components/planner/week-grid.tsx`; `/planner` route ships. |
| 8 | **Real publishing: X + Google Business Profile** (OAuth, vault, permalinks) | **PARTIAL** | Adapters + vault + 124 tests are real code, but 8 blockers make them unreachable; `connection_secrets` = 0 rows — no token has ever been stored. |
| 9 | Scheduled publish via Trigger.dev (idempotent, retries) | **PARTIAL** | Dispatcher + classifier + 60 tests exist and the Vercel cron fires every 5 min — but it **500s on every invocation** and `enqueuePublish` always throws. Never ran on Trigger.dev. |
| 10 | Credit ledger live + wallet UI + **Stripe test checkout + webhook** | **PARTIAL** | Ledger + wallet + 100 ledger rows are real. Stripe **does not exist** in the repo; `billing_webhook_events` = 0 rows. |
| 11 | "Plan my week" v0 → 5 drafts into Planner | **SHIPPED-VERIFIED** | `actions/plan-week.ts:106` charges 20 cr through `withCredits` and inserts posts. |
| 12 | **Sites v0**: prompt → sections → **real deploy** to `{slug}.sahoda.site` + form → leads | **PARTIAL** | Generation real (`sites` 5, `site_sections` 31, `leads` 3). Deploy absent: only `createFixtureDeployer`; `createCloudflareDeployer` exists solely in a comment. |
| 13 | Dashboard: CMO card, credit chip, empty states | **SHIPPED-VERIFIED** | `app/(app)/home/page.tsx` + `components/home/charts.tsx` (17 tests); every figure reads a table, no seeded placeholders. |
| 14 | **Sahoda Guide v0**: mascot + 6 tours + toasts + sandbox seed | **PARTIAL** | `guide_tours` = 6 rows and anchors ship, but **`tour_progress` = 0** — no tour has ever been completed. Demo seed is stranded on `wt-db`. |

**Alpha scorecard: 8 SHIPPED-VERIFIED · 5 PARTIAL · 1 (item 8) effectively not usable.**
Every PARTIAL is on the outward-facing boundary: publish, pay, deploy, onboard-the-user.

---

## 2. Roadmap §5 — the Alpha Gate (definition of done)

The gate as written. This is the honest scoring.

| Gate criterion | Result | Evidence |
|---|---|---|
| Fresh signup → onboarding → resolved Brand Brain in <10 min | **PASS** | 26 workspaces, 26 brand_memory rows, 36 provider logs. |
| Post published to real X **and** real GBP with permalinks logged | **FAIL** | `connection_secrets` = 0; `post_publish_logs` 6 rows all fixture. |
| Scheduled post fires within ±60s | **FAIL** | Cron 500s every 5 min; `enqueuePublish` throws by design. |
| Every AI action debits; forced failure releases the hold | **PASS** | 4/4 AI actions wrapped; live test "GRANT → HOLD → DEBIT … releases the remainder". |
| Stripe test upgrade grants credits via webhook | **FAIL** | No Stripe code exists; `billing_webhook_events` = 0. |
| Site live at `{slug}.sahoda.site`; form creates a lead | **FAIL** | No Cloudflare deployer. (`leads` = 3, from the embed form, not a deployed site.) |
| RLS suite: zero cross-tenant reads/writes | **PASS (partial scope)** | 45 anon-client tests pass — but cover 11 of 27 tables. |
| 6 tours run; mascot gazes; reduced-motion clean | **UNVERIFIED** | Tours seeded; `tour_progress` = 0 means none was ever completed. |
| No fake states anywhere | **PASS** | Audited §2.8 of `00-`; every simulated path is labelled and guarded. |
| `turbo typecheck lint test` + smoke green on main | **FAIL** | `lint` is `exit 0`; no CI; smoke has never run automatically; `main` is not what deploys. |
| Deploy preview shareable | **PASS** | `https://sahodalabs.vercel.app` serves the app. |

**Alpha Gate: 5 PASS · 5 FAIL · 1 UNVERIFIED. The Alpha Gate does not pass.**

---

## 3. FSD modules M1–M15 + appendices

| Module | Status | Why |
|---|---|---|
| **M1 · Onboard & Brand Brain** | **SHIPPED-VERIFIED** | Console + Resolve + `brand_memory` v1 live; 26 rows. |
| **M2 · The Loop** | **NOT STARTED** | No orchestration; `apps/jobs` has no Loop code. Roadmap explicitly defers it. |
| **M3.1 · Post editor** | **SHIPPED-VERIFIED** | Variants, autosave, AI rewrite, cost-before-spend. |
| **M3.2 · Campaigns** | **NOT STARTED** | No route, no table. |
| **M3.3 · Remix Engine (P1)** | **NOT STARTED** | No code. |
| **M3.4 · Studio (own renderer)** | **NOT STARTED** | `packages/render` is an **empty scaffold** — 0 files, 0 LOC. |
| **M4 · Audience Twin** | **NOT STARTED** | No code. |
| **M5 · Publish** | **PARTIAL** | Constraint Engine + X/GBP adapters + vault real; connect, decrypt, dispatch and queue all dead. |
| **M6 · Sites** | **PARTIAL** | 13,787 LOC generates and previews; cannot deploy. |
| **M7 · Engage (Inbox & Reviews)** | **NOT STARTED** | No code. |
| **M8 · Measure** | **NOT STARTED** | No analytics ingestion; roadmap marks it "stubbed". |
| **M9 · Radar (P1)** | **NOT STARTED** | No code. |
| **M10 · Playbooks (P1)** | **NOT STARTED** | No code. |
| **M11 · Chat-Ops (WhatsApp)** | **NOT STARTED** | No code. Separate track; aggregator cannot cover it. |
| **M12 · Platform** | **PARTIAL** | Auth, workspaces, members, RLS, ledger, audit real. Billing rail and entitlement gate missing. |
| **M13 · Brand Skin** | **SHIPPED-VERIFIED** | Theming + extraction + Readability Guard; guard mirrors v3 tokens under test. |
| **M14 · Sahoda Guide** | **PARTIAL** | Engine + anchors + 6 seeded tours; zero completions recorded. |
| **M15 · Delight & Mastery** | **NOT STARTED** | No code. |
| **App. A · Credit price table** | **SHIPPED-VERIFIED** | `pricing.config.json` is the only price source; `creditCost` imported from `@sahoda/shared`. |
| **App. B · Approval card contract** | **NOT STARTED** | Belongs to M11/L2 approvals; no code. |
| **App. C · Tour definition contract** | **PARTIAL** | Contract honoured by `lib/guide/anchors.ts`; unexercised end-to-end. |

---

## 4. Roadmap §6 — post-sprint backlog (strict order, 20 items)

| # | Item | Status | Why |
|---|---|---|---|
| 1 | Scheduled Loop cycles + Monday CMO report (email) | **NOT STARTED** | Depends on a working publish rail, which does not exist. |
| 2 | Approval flows L2 (in-app/email; WhatsApp when verified) | **NOT STARTED** | No approval-card contract implementation. |
| 3 | Analytics ingestion X/GBP → normalized | **PARTIAL-OBSOLETE** | Not started; **and** the aggregator supplies analytics for its 7 channels, so only X/GBP would remain ours. Rescope before building. |
| 4 | Audience Twin v0 + inline scores | **NOT STARTED** | No code. |
| 5 | Campaigns full | **NOT STARTED** | No code. |
| 6 | **Meta publish (when approved) + IG variants** | **OBSOLETE** | The aggregator holds the Meta app review. Building our own Meta adapter — and waiting on Meta — is cancelled. This is the single biggest schedule win. |
| 7 | Studio renderer (zero-COGS exports) | **NOT STARTED** | `packages/render` empty. |
| 8 | Razorpay UPI AutoPay | **OBSOLETE** | Superseded — Cashfree is the chosen rail and is already built. `RAZORPAY_KEY_ID` in `turbo.json` is dead weight. |
| 9 | Inbox v0 (X mentions + GBP reviews) | **NOT STARTED** | No code. |
| 10 | Guideline-PDF Brand Skin extraction | **NOT STARTED** | No code. |
| 11 | Custom domains (SSL-for-SaaS) | **NOT STARTED** | Depends on a Cloudflare deploy path that does not exist. |
| 12 | Playbooks ×3 | **NOT STARTED** | No code. |
| 13 | Remix | **NOT STARTED** | No code. |
| 14 | Radar | **NOT STARTED** | No code. |
| 15 | DIFM + stuck-detect | **NOT STARTED** | No code. |
| 16 | Hindi | **NOT STARTED** | No i18n layer. |
| 17 | Agency + white-label | **NOT STARTED** | No code. |
| 18 | Public API + MCP | **NOT STARTED** | `apps/mcp` is an **empty scaffold** — 0 files. |
| 19 | **Pinterest / Threads / Shorts / Shopify** | **OBSOLETE (3 of 4)** | Pinterest, Threads and YouTube Shorts come free with the aggregator — no adapter work. Shopify is unrelated commerce and stays NOT STARTED. |
| 20 | Loop L3 (autopilot) | **NOT STARTED** | Requires guardrails + 30-day account age + Growth plan; none exist. |

---

## 5. Not in any doc, but built and live

Scope that exists in the repo without a home in the FSD or the roadmap. It is real work and it
must appear on the map.

| Item | Status | Why |
|---|---|---|
| **Admin Ops platform** (`docs/13_Admin_Ops`) — 11 tables, 20 `ops_*` RPCs, `/admin/*` | **SHIPPED-VERIFIED (DB) · PARTIAL (UI)** | 9 migrations applied; `ops_audit_log` 535 rows, `ops_qa_runs` 137, `ops_tasks` 42. UI lives only on `wt-admin` behind open PR #4 — **deployed to preview, never to production**. |
| **Maker-checker credit grants + authorization audit** | **SHIPPED-VERIFIED** | Migrations 21–23 applied; three client-controllable-authz vulns found and fixed with adversarial tests first (`91dd8f4`, `d9110ed`). |
| **Sentry observability + secret scrubbing** | **SHIPPED-UNVERIFIED** | `lib/observability/*` ships and `SENTRY_*` is in the turbo allowlist; live redaction against a stored event is explicitly parked in `apps/web/REQUESTS.md`. |
| **Design tokens v3 + Certainty System** | **SHIPPED-VERIFIED** | `88b5907`, `32f223a`, `43e712d`, `71610dc` all deployed to production. |
| **Vercel cron sweeps** | **PARTIAL — LIVE AND BROKEN** | Fires every 5 min, returns HTTP 500 every time, logs nothing. See `00-` §2.4. |
| **Public beta-apply form + Clerk webhook** | **SHIPPED-UNVERIFIED** | `ops_beta_applications` exists but is **0 rows**; 12 `/api/webhooks/clerk` hits in 6h prove the webhook is reachable. On `wt-admin` only. |

---

## 6. Where the docs and the repo disagree

| Doc says | Repo says | Call |
|---|---|---|
| Stack includes `packages/render` and `apps/mcp` | Both 0 files, 0 LOC | Docs are aspirational. Delete from the stack line or build them. |
| Roadmap §1.10: "Stripe test-mode checkout + webhook" | No Stripe code; Cashfree built instead | Roadmap is stale. Cashfree is the decision. |
| Roadmap §1.12: Sites v0 "real deploy to Cloudflare" | Fixture deployer only, no consumer | Never built. See cut list. |
| Roadmap §4: 5 worktrees, "human = reviewer on every PR" | 8 worktrees; PR #4 open 2 days with 0 checks | Process drifted; no CI to enforce it. |
| `constraints.ts` marks LinkedIn `publishable: true` | No LinkedIn adapter exists | **Repo contradicts itself.** Filed as "BLOCKS live mode" in `apps/jobs/REQUESTS.md`. |
| `connections/page.tsx:16` says `upsert_connection` is "still pending at wt-db" | Migration `20260719160916` is **applied** | Comment is stale by 8 days; the RPC exists and simply has no caller. |
| CLAUDE.md: "Every table: workspace_id + RLS + anon-client test" | 27 tables have RLS, 11 have the test | Non-negotiable is being violated. |
