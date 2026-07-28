# 00 — State of the repo

**Audit date:** 2026-07-27 · **Mode:** read-only · **Rule:** evidence or nothing.
Every "done" below carries a file:line, a migration version, a git SHA, a live query result, or a
named passing test. Anything else is in `04-risks-and-unknowns.md`.

**Audit root:** `.claude/worktrees/wt-web` @ `cb10128`, cross-checked against
`.claude/worktrees/wt-admin` @ `e086f6e`. Neither is a superset — see §1.2.

---

## 1. Phase 1 — Inventory

### 1.1 Git reality

`origin/main` = `22a35aa` (2026-07-26 13:15 IST) — "fix(web): wallet and scheduled-post honesty,
plus the lockfile repair (#5)".

**Production does not deploy from `main`.** Vercel's production branch is `wt-web`
(every `target: "production"` deployment carries `githubCommitRef: "wt-web"`).

| Branch | behind \| ahead `origin/main` | Contained in | Verdict |
|---|---|---|---|
| `wt-web` | 2 \| 36 | — | Live trunk. Deploys to production. |
| `wt-admin` | 2 \| 58 | — | Ops platform. PR #4 → `wt-web`, 139 files, +16,671/−63. |
| `wt-pub` | 2 \| 26 | `wt-web` ✅ | Fully merged. Safe to delete. |
| `wt-mesh` | 84 \| 0 | `wt-web`, `wt-admin`, `main` ✅ | Fully merged. Safe to delete. |
| `wt-obs` | 55 \| 0 | `wt-web`, `wt-admin`, `main` ✅ | Fully merged. Safe to delete. |
| `wt-billing` | 66 \| 0 | `wt-web`, `wt-admin`, `main` ✅ | Fully merged. Safe to delete. |
| `wt-db` | 87 \| **2** | nothing | Stranded — 2 commits. |
| `sites-wip` | 76 \| **1** | nothing | Stranded — 1 commit. |
| `feat/admin-ops` | 2 \| 12 | 11 of 12 in `wt-web` by patch-id | 1 commit stranded (`ff806db`). |
| `main` (local) | 188 \| 1 | — | ☠️ Sits at `8fc57be` "Initial commit". A landmine. |
| `branch` | 63 \| 1 | — | Orphan name, superseded. |
| `backup/pre-deploy-fix-855e00a` | 42 \| 1 | — | Backup, keep until trunk lands. |

Full analysis and the merge sequence: `05-branch-reconciliation.md`.

**Correction to a widely-held belief:** `wt-db` does **not** have 87 unmerged commits and
`sites-wip` does not have 76. Those numbers are how far *behind* `origin/main` each branch is.
Unique work is **2 commits** and **1 commit** respectively (`git rev-list --left-right --count`).

Other git facts:
- 8 worktrees registered. The **primary checkout is stale**: `/home/divas/Documents/GitHub/sahodalabs`
  sits on `feat/admin-ops` @ `ff806db`, three days behind the live trunk.
- `origin/wt-web` = `71610dc`; local `wt-web` = `cb10128`. **One commit is unpushed and therefore
  not deployed.**
- 2 stashes on `wt-web`: `stash@{0}` "wt-web LEARNINGS cleanup", `stash@{1}` "wt-obs scrubber
  refinements (pre-deploy-fix 2026-07-25)".
- 1 open PR (#4). 0 open issues. PRs #1, #2, #3, #5 merged.
- No CI workflow has ever run on any of them (§3).

### 1.2 Neither integration branch is a superset

`git merge-base wt-web wt-admin` = `413a252`. After that point they diverge and never rejoin:

- `wt-web` has the entire scheduled-publish lane: `apps/jobs/src/dispatch/*`, `apps/jobs/src/env.ts`,
  `apps/jobs/src/sweeps.ts`, the Vercel cron route, design tokens v3, and the merged `wt-pub`.
- `wt-admin` has the ops platform: 9 migrations, 20 `ops_*` RPCs, `/admin/*` routes.

`git diff --stat wt-admin wt-web` over `packages/publishing apps/jobs packages/shared` = 33 files,
+2,538/−651. **There is no single ref containing all the work.** PR #4 is the unfinished join.

### 1.3 Monorepo map

Measured on `wt-web` @ `cb10128`. LOC counts `.ts/.tsx/.sql/.js/.mjs/.css`, excluding
`node_modules`, `dist`, `.next`, `.turbo`.

| Package | LOC | Files | Last commit | What it actually does today |
|---|---:|---:|---|---|
| `apps/web` | 36,513 | 328 | 2026-07-27 `cb10128` | The product. Auth, onboarding, editor, planner, wallet, home, admin. |
| `packages/sites` | **13,787** | 86 | 2026-07-20 `14510d6` | Generates sectioned pages. **Cannot deploy** — fixture deployer only. |
| `packages/billing` | 5,276 | 40 | 2026-07-20 `ce4b634` | `withCredits`, pg ledger port, Cashfree provider. Cashfree **not wired to the app**. |
| `apps/jobs` | 4,381 | 41 | 2026-07-26 `b7c c846` | Dispatcher + hold sweep. **Never deployed to Trigger.dev.** |
| `packages/publishing` | 3,759 | 20 | 2026-07-20 `666ba9c` | X + GBP adapters, OAuth helpers, AES token vault, fixtures. Never executed live. |
| `packages/db` | 3,491 | 25 | 2026-07-19 `f61d202` | 14 migrations (+9 in `wt-admin`), RLS helpers, live tests. |
| `packages/mesh` | 2,801 | 30 | 2026-07-20 `37f0c37` | Real OpenRouter/OpenAI calls. **Works.** |
| `packages/shared` | 2,326 | 32 | 2026-07-26 `9ee085f` | zod contracts, enums, Constraint Engine. Source of truth. |
| `apps/mcp` | **0** | 0 | 2026-07-18 `826043a` | **Empty scaffold.** Named in the stack; does not exist. |
| `packages/render` | **0** | 0 | 2026-07-18 `826043a` | **Empty scaffold.** Named in the stack; does not exist. |

### 1.4 Test reality

Run: `pnpm test --force` (cache bypassed) from `wt-web`, 2026-07-27 23:11 IST.

| Package | Passed | Skipped | Note |
|---|---:|---:|---|
| `@sahoda/sites` | 1,555 | 0 | Largest suite; tests a package that cannot deploy. |
| `@sahoda/web` | 1,518 | 0 | 112 files, `lib` + `ui` projects. |
| `@sahoda/billing` | 247 | 5 | 5 skipped = Cashfree live opt-in. |
| `@sahoda/jobs` | 132 | 0 | Includes 2 **live-DB** integration files. |
| `@sahoda/publishing` | 124 | 0 | Adapter/fixture/vault. |
| `@sahoda/mesh` | 79 | 1 | 1 skipped = live smoke. |
| `@sahoda/shared` | 28 | 0 | |
| `@sahoda/db` | 9 | **96** | 5 of 6 files are live-only. |
| **Total** | **3,692** | **102** | 3,794 collected. |

**What has no coverage at all:** no E2E has ever run in CI (3 Playwright specs exist:
`e2e/golden-path.spec.ts`, `e2e/unauthenticated.spec.ts`, `e2e/global-setup.ts`). `apps/mcp` and
`packages/render` have no code to cover. The 16 tables in §2.5 have policies but no anon-client test.

### 1.5 Migrations — all 23 applied

Verified against Supabase project `rloztdhzfliyvpvxsgjl` (`sahodalabs`, ap-south-1,
ACTIVE_HEALTHY) via `list_migrations`. **There is exactly one Supabase project — dev and production
are the same database.**

| # | Version | Name | In branch | Applied |
|---|---|---|---|---|
| 1–14 | `20260718000001` … `20260719160916` | helpers → add_upsert_connection | `wt-web`, `wt-admin`, `wt-db` (identical) | ✅ |
| 15 | `20260725102928` | ops_platform_tables | `wt-admin` only | ✅ |
| 16 | `20260725102929` | ops_qa_artifacts_bucket | `wt-admin` only | ✅ |
| 17 | `20260725182153` | ops_ingest | `wt-admin` only | ✅ |
| 18 | `20260726120000` | ops_human_writes | `wt-admin` only | ✅ |
| 19 | `20260727072107` | ops_admin_half | `wt-admin` only | ✅ |
| 20 | `20260727082426` | ops_write_registry | `wt-admin` only | ✅ |
| 21 | `20260727102406` | ops_credit_self_approve_gate | `wt-admin` only | ✅ |
| 22 | `20260727105323` | ops_credit_self_gate_reachable | `wt-admin` only | ✅ |
| 23 | `20260727110639` | ops_authorization_audit | `wt-admin` only | ✅ |

**No dead or superseded migrations.** No collisions between any branch (see
`05-branch-reconciliation.md` §3).

⚠️ **The database is ahead of `main` and ahead of the merged code.** Nine migrations from an
unmerged PR are live in the only database that exists. Reverting PR #4 would not revert them.

### 1.6 Live data census (`list_tables`, 38 tables, **all** `rls_enabled: true`)

The numbers that matter:

| Table | Rows | What it proves |
|---|---:|---|
| `credit_ledger` | 100 | The ledger is genuinely in use. |
| `credit_balances` | 17 | 17 workspaces hold balances. |
| `workspaces` / `workspace_members` / `users_profile` | 26 / 27 / 17 | Real multi-tenant usage. |
| `posts` / `post_variants` | 49 / 25 | The editor is used. |
| `brand_memory` | 26 | Onboarding + Brand Brain work. |
| `ai_provider_logs` | 36 | Real model calls happened. |
| `sites` / `site_pages` / `site_sections` | 5 / 6 / 31 | Sites **generate**. |
| `post_publish_logs` | 6 | Six publish attempts — all fixture-mode. |
| **`connection_secrets`** | **0** | **No OAuth token has ever been stored.** |
| **`billing_webhook_events`** | **0** | **No payment has ever been processed.** |
| `tour_progress` | 0 | The Guide has never been completed by anyone. |
| `app_settings` | 0 | No runtime config rows — no escape hatch in use. |
| `ops_audit_log` / `ops_qa_runs` / `ops_tasks` | 535 / 137 / 42 | The admin platform is genuinely used. |

### 1.7 LEARNINGS, decision log, tickets

- `LEARNINGS.md` — 90,879 bytes at repo root (81 lines in the `wt-admin` copy after dedupe). One
  line per PR, as the loop requires.
- **Cross-lane request log** is the real decision record: `apps/web/REQUESTS.md` (24 entries),
  `apps/jobs/REQUESTS.md` (13 entries), `packages/billing/REQUESTS.md`. Summarised in
  `04-risks-and-unknowns.md`.
- **SL tickets:** 42 cards, `ops/state/board.json` (seed) + live in `ops_tasks` (42 rows). Live
  status was not read (would need a `select`; out of the approved read-only scope). Notable open
  cards: **SL-033 "Add CI: run the gate and smoke on every pull request"**, SL-019/SL-020 (QA
  composer, blocked), SL-022 (raw-hex guard), SL-039 (audit where the dashboard infers state).
- `ops_roadmap_items` — 39 rows.

---

## 2. Phase 2 — The honesty audit

Legend: **REAL** · **FIXTURE/SIMULATED** · **DEAD** · **ABSENT**

### 2.1 `createAdapterSelector` — REAL code, never executed

`apps/jobs/src/publish/adapters.ts:32`.

- Line 34: `if (deps.mode === 'fixture') return createFixtureAdapter(...)` — short-circuits
  everything before the switch is reached.
- Lines 36–48: the live switch has exactly **two** cases: `'x'`, `'gbp'`.
- Lines 49–55: `default:` throws `AdapterError{ code: 'NO_ADAPTER', classification: 'permanent' }`.

| Channel | State | Proof |
|---|---|---|
| `x` | REAL code, never executed | `packages/publishing/src/adapters/x.ts`, 124 tests in-package, all against fixtures. `connection_secrets` = 0 rows. |
| `gbp` | REAL code, never executed | `packages/publishing/src/adapters/gbp.ts`, same. |
| `linkedin` | **ABSENT** — and the Constraint Engine lies about it | `packages/shared/src/publishing/constraints.ts` marks it `publishable: true`; no adapter exists. Filed in `apps/jobs/REQUESTS.md` as "BLOCKS live mode". |
| `instagram` | ABSENT | `constraints.ts:104` `publishable: false`. |
| everything else | ABSENT | falls to `default:` → `NO_ADAPTER`. |

`deps.mode` comes from `env.publishMode`, which **defaults to `'fixture'`**
(`apps/jobs/src/env.ts:78`).

### 2.2 Fixture / simulation flags in production paths

| Flag / seam | Location | Default in prod | Honest? |
|---|---|---|---|
| `publishMode` | `apps/jobs/src/env.ts:78` | `'fixture'` | ✅ deliberate; comment explains why |
| `SAHODA_PUBLISH_DISPATCH_MODE` | `env.ts:94,147` | `'off'` | ✅ invalid value refuses to boot |
| `SAHODA_HOLD_SWEEP_MODE` | `env.ts:95,147` | `'off'` | ✅ same |
| `createFixtureProvider()` | `apps/web/src/app/actions/wallet.ts:25` | **hardcoded, not a flag** | ⚠️ see §2.4 |
| `createFixtureAdapter()` | `apps/web/src/app/actions/posts-publish.ts:110` | **hardcoded** | ✅ labelled "Simulated" in UI |
| `createFixtureDeployer` | `packages/sites/src/deploy/fixture.ts:171` | **the only deployer** | ⚠️ see §2.6 |
| `enqueuePublish` | `apps/web/src/app/api/cron/sweeps/route.ts:77` | always throws | ✅ counted as `queueUnavailable`, not `failed` |

**Credit where due:** every one of these is explicitly labelled in the UI and commented in the
code. The product does not fake success. The dishonesty in this repo is in the *toolchain* (§3),
not the product.

### 2.3 Ledger — REAL. The best code in the repo.

- `app.apply_ledger_entry` — migration `20260718000006_billing_ledger`, applied.
- `packages/db/tests/ledger.test.ts` — 9 tests, executed live 2026-07-27 23:11 IST in 4,152 ms:
  - "GRANT → HOLD → DEBIT charges only completed units and releases the remainder" (562 ms)
  - "blocks a HOLD that exceeds available with CREDIT_INSUFFICIENT" (562 ms)
  - "parallel HOLDs never over-spend (single balance row serializes them)" (652 ms)
  - "keeps the replayed-sum invariant (Σ entry effects == stored balance)" (389 ms)
- `withCredits` is wired at **all four** AI entry points:
  `actions/brand-resolve.ts:47`, `actions/posts-ai.ts:49`, `actions/plan-week.ts:45` (20 cr),
  `actions/site-generate.ts:42`.
- Live evidence: `credit_ledger` 100 rows, `credit_balances` 17 rows.

**HOLD → DEBIT → RELEASE: REAL and proven.**

**The hold sweeper: DEAD IN PRODUCTION.** Code exists (`apps/jobs/src/holds/sweep.ts`) with 60
tests. It has **never successfully run** — see §2.4. Mode defaults to `off`, and the route that
would invoke it is 500ing.

### 2.4 🚨 Scheduled publishing — dead at eight points, one of them live-broken

| # | Blocker | Evidence |
|---|---|---|
| 1 | No OAuth callback route exists | `apps/web/src/app/api/` contains only `cron/` and `debug/` |
| 2 | `connections` has **no INSERT policy** | `20260718000005_connections.sql:39-44` — select/update/delete only |
| 3 | `public.upsert_connection` exists but has **zero callers** | migration `20260719160916` applied; no app code invokes it |
| 4 | Connect buttons ship `disabled` | `apps/web/src/app/(app)/connections/page.tsx:66-70` |
| 5 | Vault opener **intentionally unwired** | `apps/jobs/src/publish/deps.ts:16` |
| 6 | `publishMode` defaults `fixture` | `apps/jobs/src/env.ts:78` |
| 7 | **No CAS claim exists** | no `UPDATE` anywhere sets `publish_status='publishing'`; the string appears only in the CHECK constraint at `20260718000004_content.sql:34` |
| 8 | `enqueuePublish` always throws | `api/cron/sweeps/route.ts:77-79` |

Plus: **apps/jobs has never been deployed to Trigger.dev.** `apps/jobs/CLAUDE.md` states it
outright, and `TRIGGER_PROJECT_REF` vs `TRIGGER_PROJECT_ID` means "the deploy targets no project"
(`apps/jobs/REQUESTS.md`).

**⇒ Nothing has ever been published to a real platform by this product.** Corroborated:
`connection_secrets` = 0 rows; `post_publish_logs` = 6 rows, all fixture-mode.

#### 🚨 NEW — the cron is live and failing silently

`apps/web/vercel.json` schedules `/api/cron/sweeps` every 5 minutes. Vercel runtime logs for the
current production deployment `dpl_5UUThQdJDwgPKWggcyo2Kgrj1oX9`:

- **72 invocations in 6 hours** — exactly every 5 minutes. The cron is firing.
- **Every single one returns HTTP 500.** Sampled 12 consecutive runs 17:10 → 18:05 UTC: all 500.
- **Zero error-level log lines.** The failure is completely invisible.

A 500 is not a no-op. `off` mode returns 200. Unauthorised returns 401. **The handler is
throwing.** So the answer to "has the hold sweeper ever run?" is **no — it cannot even start.**
Candidate causes and the exact diagnostic are in `04-risks-and-unknowns.md` **R-02**.

### 2.5 Auth, RLS, vault, `ops_*`

**Auth: REAL.** Clerk. `https://sahodalabs.vercel.app` serves "Sign in · Sahoda". 12
`/api/webhooks/clerk` invocations in 6h. 17 `users_profile` rows.

**RLS policies: REAL and complete.** All **38** live tables report `rls_enabled: true`. Coverage
comes from two sources — 12 direct `alter table … enable row level security`, and 15 via the
helpers `app.apply_tenant_policies` / `app.apply_tenant_read_policy`
(`20260718000001_helpers.sql:34,55`) — plus 11 `ops_*` tables from `wt-admin`.

**RLS anon-client tests: 11 of 27 app tables.** This breaks a CLAUDE.md non-negotiable.

- ✅ Covered (`packages/db/tests/rls.test.ts`, 45 tests): `connection_secrets`, `guide_tours`,
  `leads`, `posts`, `post_variants`, `site_pages`, `sites`, `site_sections`, `workspace_members`,
  `workspaces`, `workspace_themes`.
- ❌ **Not covered:** `ai_provider_logs`, `app_settings`, `audit_logs`, `billing_webhook_events`,
  `brand_memory`, `connections`, **`credit_balances`**, **`credit_ledger`**, `memory_events`,
  `planner_events`, `plans`, `post_media`, `post_publish_logs`, `subscriptions`, `tour_progress`,
  `users_profile`.

The two money tables are in the uncovered list.

**Token vault: REAL code, zero use.** AES-GCM, `packages/publishing/src/vault/token-vault.ts`,
key from `TOKEN_VAULT_KEY`. `sealSecret` is called from `oauth/x.ts:158` and `oauth/gbp.ts:135` —
neither of which is reachable, because there is no callback route. `connection_secrets` = 0 rows.

**`ops_*` RPCs: REAL, hardened, in use.** 20 `public.ops_*` functions + 7 `app.ops_*` helpers.
Three client-controllable-authorization vulnerabilities were found and fixed *during* this build,
each with an adversarial test first — migrations 21 (`ops_credit_self_approve_gate`), 22
(`ops_credit_self_gate_reachable`), 23 (`ops_authorization_audit`), all applied. Commit `91dd8f4`
documents the original: `p_allow_self` was a caller-supplied boolean that skipped both identity
checks on a function granted to `authenticated`. `ops_audit_log` = 535 rows.

This is the strongest security work in the repo and it should be the template for everything else.

### 2.6 Sites v0 — generation REAL, deploy ABSENT

- `packages/sites` is **13,787 LOC with 1,555 tests** — the largest package and the largest suite.
- Its **only** deployer is `createFixtureDeployer` (`src/deploy/fixture.ts:171`), which writes a
  bundle to a local directory.
- `createCloudflareDeployer` appears **exactly once in the entire repo — inside a comment**
  (`packages/sites/src/index.ts:41`, "re-export: `createCloudflareDeployer` and the transports").
- **Zero calls to `api.cloudflare.com` anywhere.** `CLOUDFLARE_API_TOKEN` is allowlisted in
  `turbo.json` and read by nothing.
- **No consumer:** grep for `Deployer` across `apps/web/src` returns nothing.

Generation is real (`sites` 5, `site_pages` 6, `site_sections` 31 rows) and the in-app preview
ships. **A site has never been deployed to `*.sahoda.site`.**

### 2.7 Billing — the product cannot take money

- `apps/web/src/app/actions/wallet.ts:24-25`:
  ```ts
  function provider(): PaymentProvider {
    return createFixtureProvider()
  }
  ```
  Hardcoded. Not behind a flag.
- The fixture's checkout URL is `https://fixture.local/checkout?…` — a host that does not resolve,
  which is why `startCheckout` deliberately never redirects (`wallet.ts:13-23`).
- **Cashfree is built but unwired.** `packages/billing/src/providers/cashfree/` has provider,
  signature, webhook, env + tests. Nothing in `apps/web` imports it.
- **Stripe does not exist.** `STRIPE_SECRET_KEY` and `STRIPE_STARTER_PRICE_ID` are in
  `turbo.json`'s build allowlist; there is no Stripe implementation anywhere in the repo.
- Live proof: **`billing_webhook_events` = 0 rows.** No payment event has ever been received.

Roadmap §1 item 10 promises "Stripe test-mode checkout + webhook → plan + monthly grant." Neither
half exists on the Stripe rail.

### 2.8 The list that matters most: success without a real external effect

Ranked by danger. The good news is that this list is short, and most of it is honest by design.

| # | Path | Verdict |
|---|---|---|
| 1 | **`turbo test` reports passes for suites that never ran** | ⚠️ **REAL RISK.** See §3. |
| 2 | **`turbo lint` always exits 0** | ⚠️ **REAL RISK.** See §3. |
| 3 | **Cron returns 500 forever; nothing alerts** | ⚠️ **REAL RISK.** §2.4. |
| 4 | `simulatePublish` returns `ok:true` with `fixture://` permalinks | ✅ Safe — UI branches on `result.mode === 'fixture'`, never on the permalink, and prints "Simulated — nothing was posted". |
| 5 | `startCheckout` returns `ok:true, simulated:true` | ✅ Safe — guard is on `session.mode !== 'live'`, and it refuses to redirect. |
| 6 | Fixture deployer returns `ok:true` + a URL | ✅ Unreachable — no consumer in `apps/web`. |
| 7 | Post status promotion after a fixture publish | ✅ Blocked twice — `classify.ts:183` holds on `fixture-publish`; `pgDispatch.ts:186` requires a recorded mode. |

---

## 3. Why every previous green signal was meaningless

Three independent mechanisms each guaranteed a green light that certified nothing. Together they
mean **no gate has ever gated anything in this repo.**

### 3.1 `lint` is `exit 0` in all eight packages

```
apps/jobs/package.json:14        "lint": "exit 0"
apps/web/package.json:12         "lint": "exit 0"
packages/billing/package.json:13 "lint": "exit 0"
packages/db/package.json:13      "lint": "exit 0"
packages/mesh/package.json:13    "lint": "exit 0"
packages/publishing/package.json:13 "lint": "exit 0"
packages/shared/package.json:14  "lint": "exit 0"
packages/sites/package.json:13   "lint": "exit 0"
```

`turbo lint` has never inspected a single line of code. Every "gates green" claim in every
changelog entry includes this no-op. There is no ESLint config in the repo — which is also why
SL-022 ("raw-hex guard — doc 08 has no ESLint behind it") is still open: the design-system rule
"no raw hex anywhere" has no enforcement whatsoever.

### 3.2 The turbo cache served results for suites that did not run

Reproduced during this audit. First run of `pnpm test`, with the database credentials deliberately
blanked in the shell:

```
Tasks:    14 successful, 14 total
Cached:   13 cached, 14 total
@sahoda/db:test:  Test Files  6 passed (6)
@sahoda/db:test:       Tests  105 passed (105)
```

105 database tests "passed" with no database credentials. That is impossible — they were replayed
from cache. Re-run with `--force`:

```
Cached:   0 cached, 14 total
@sahoda/db:test:  Test Files  1 passed | 5 skipped (6)
@sahoda/db:test:       Tests  9 passed | 96 skipped (105)
```

**Turbo's cache key does not include the environment a test depends on.** Any developer or CI job
that runs `pnpm test` can be handed a green result produced on a different machine, with different
credentials, weeks earlier. Every historical "1,910/1,910 passing" and "1,518 tests green" claim
in the changelog is unreliable unless it was produced with `--force`.

### 3.3 There is no CI

`.github/` contains exactly one thing: `ISSUE_TEMPLATE/bug.md`. **No workflows directory. No
workflow file. Nothing has ever run on a push or a pull request.** Vercel builds previews, but a
Vercel build runs `next build` — it does not run `turbo test`, and a failing test cannot block a
merge because nothing reports a status to GitHub.

PR #4 has been open since 2026-07-25 with 139 files changed and **zero automated checks**.

SL-033 is on the board: *"Add CI: run the gate and smoke on every pull request."* It is open.

### 3.4 The minimum CI that would make a green signal mean something

Four requirements, in priority order. This is the smallest configuration that converts "green"
from decoration into evidence.

1. **`--force` on test, always.** Never trust the cache for a correctness gate.
2. **No repo `.env` on the runner.** Live suites must skip, and skipping must be *visible*.
3. **Real lint.** Replace `exit 0` with an actual ESLint run, or delete the task so nobody reads
   it as a signal.
4. **Typecheck + build.** Both already work; neither is enforced.

```yaml
# .github/workflows/gate.yml
name: gate
on:
  pull_request:
  push: { branches: [main, wt-web] }

concurrency:
  group: gate-${{ github.ref }}
  cancel-in-progress: true

jobs:
  gate:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    # No secrets are exposed to this job on purpose. Live-DB suites must skip,
    # and the skip count is asserted below so a silent skip cannot pass as green.
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile

      - name: typecheck
        run: pnpm turbo run typecheck --force

      - name: test (cache bypassed, no database)
        run: pnpm turbo run test --force --output-logs=full | tee test.log

      # Guard the guard: if the offline suite count ever collapses, fail loudly
      # rather than reporting a green run of nothing. Numbers from 2026-07-27.
      - name: assert suite size
        run: |
          total=$(grep -aoE 'Tests +[0-9]+ passed' test.log \
                  | grep -oE '[0-9]+' | paste -sd+ | bc)
          echo "offline tests passed: $total"
          test "$total" -ge 3600 || { echo "::error::suite shrank to $total (expected >= 3600)"; exit 1; }

      - name: build
        run: pnpm turbo run build --force
        env:
          # Only what @sahoda/web#build declares. Everything else must be absent.
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.CI_SUPABASE_URL }}
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.CI_CLERK_PK }}
```

Then, in GitHub → Settings → Branches: make `gate` a **required status check** on `main` and
`wt-web`, and require a PR before merging. Without that last step the workflow is advisory and
changes nothing.

**Two follow-ons, both cheap:**
- Add a nightly job that *does* carry credentials and runs the 96 skipped live tests against a
  throwaway Supabase branch — not against the production project (see `04` R-01).
- Replace `"lint": "exit 0"` with `eslint .` in one package first, fix the fallout, then roll out.
  A raw-hex rule closes SL-022 at the same time.

---

## 4. Deployment pipeline health

| Fact | Value |
|---|---|
| Vercel project | `sahodaya-labs` (`prj_m80Xgvj1WG6VRdVeDQzZuRmOr74E`) |
| Team | `development-4417s-projects` (`team_CKya7LO7qJMeMjw9EKeodnKb`) |
| Production branch | **`wt-web`** — not `main` |
| Last production deploy | `dpl_5UUThQ…` — `wt-web@71610dc`, 2026-07-27 ~15:19 IST |
| Latest deploy overall | `dpl_ByPMp…` — `wt-admin@e086f6e`, **preview** (PR #4) |
| Live URL | `https://sahodalabs.vercel.app` → serves "Sign in · Sahoda" ✅ |
| Framework / Node | Next.js / 24.x |
| GitHub Actions | **none** |
| Commit signature | every deploy `githubCommitVerification: "unverified"` |

Deploys are healthy and current. The gap is that **`main` is not what ships**, so branch
protection on `main` protects nothing that reaches users.

---

## 5. One-paragraph verdict

The correctness core of this product is genuinely good: the credit ledger is provably atomic under
concurrency, RLS is on every table, the model mesh makes real calls, and the ops platform's
authorization was hardened by adversarial tests that found three real vulnerabilities. What is
missing is not quality — it is *connection to the outside world*. No user can link an account, no
user can pay, no post has ever reached a platform, no site has ever been deployed, and the one
scheduled job that is live has been throwing a 500 every five minutes with nobody watching.
Meanwhile every automated signal that would have caught any of this was structurally incapable of
failing. Fix the signals first, then connect the money and one publishing rail; everything else on
the roadmap is a distraction from a launch.
