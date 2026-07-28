# 04 — Risks, unknowns, and open questions

Everything I could not verify, everything that needs a decision, and who has to answer it.
Actionable defects are filed as numbered tickets (**R-nn**) with the exact fix, written so someone
who was not in this session can execute them.

---

## 1. Tickets

### 🎫 R-01 — The test suite writes to the production database, and an operator cannot stop it

**Severity: CRITICAL** · **Owner: whoever owns `packages/db`** · **Do this before any other work**

#### What happens

`pnpm test` executes live-database suites against Supabase project `rloztdhzfliyvpvxsgjl` — which
is **the only Supabase project that exists**, i.e. production. An operator who explicitly blanks
the credentials in their shell is *not* protected.

#### Proof

During this audit, on 2026-07-27, the following was run from `wt-web`:

```bash
env SUPABASE_DB_URL= SUPABASE_SERVICE_ROLE_KEY= NEXT_PUBLIC_SUPABASE_URL= … pnpm test --force
```

Result — the live ledger suite ran anyway:

```
@sahoda/db:test:  ✓ tests/ledger.test.ts (9 tests) 4152ms
@sahoda/db:test:      ✓ GRANT → HOLD → DEBIT charges only completed units …  562ms
@sahoda/jobs:test: ✓ tests/holds.integration.test.ts (7 tests) 11320ms
@sahoda/billing:test: ✓ src/withCredits.integration.test.ts (6 tests) 3117ms
```

562 ms and 11.3 s per test are network round-trips, not local computation. Rows were written to
`workspaces` and `credit_ledger`.

The same blanking, run **outside turbo**, behaves correctly:

```bash
cd packages/db && env SUPABASE_DB_URL= … npx vitest run
#  Test Files  6 skipped (6)
#       Tests  105 skipped (105)
```

#### Root cause — two independent faults that combine

1. **Turbo strips the override.** Turborepo 2.x defaults to `envMode: "strict"`. The `test` task in
   `turbo.json` declares **no** `env` list, so undeclared variables are removed from the task
   environment. The operator's `SUPABASE_DB_URL=` never reaches vitest. (The repo already learned
   this exact lesson for the build in commit `ba32a3f` — the test task was never given the same
   treatment.)
2. **dotenv then refills it.** `packages/db/tests/helpers/env.ts:6` and
   `apps/jobs/tests/helpers/env.ts:6` call `loadEnv({ path: <repo-root>/.env })` unconditionally.
   With the operator's value stripped, `hasOwnProperty` is false, so dotenv 16.6.1 populates the
   **real** credential.

Net effect: the *only* way to disable live tests is to delete or move `.env`, which is a
do-not-touch file.

#### Blast radius today

Contained, but by luck rather than design: the suites create throwaway workspaces and delete them
in `afterEach`/`afterAll`, and the recovery sweep is narrowly scoped
(`ledger.test.ts:31-34`, `created_by = 'user_ledger' AND created_at < now() - interval '1 hour'`).
A future live test without that discipline would write to production with no guard at all.

#### The fix — opt-in, not opt-out

**Step 1.** `packages/db/tests/helpers/env.ts` — gate the dotenv load itself:

```ts
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

/**
 * Live suites talk to the ONE Supabase project, which is also production. They are OFF
 * unless explicitly opted in, because an operator CANNOT turn them off from the shell:
 * turbo strips undeclared env vars from a task, so `SUPABASE_DB_URL= pnpm test` never
 * reaches vitest, and dotenv then refills the real value. Opt-in is the only safe default.
 * See docs/audit/2026-07-27/04-risks-and-unknowns.md R-01.
 */
const LIVE = process.env.SAHODA_ALLOW_LIVE_TESTS === '1'

if (LIVE) {
  loadEnv({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true })
}

export const ENV = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  dbUrl: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
}

export const hasLedgerEnv = LIVE && ENV.dbUrl.length > 0
export const hasRlsEnv =
  LIVE &&
  ENV.supabaseUrl.length > 0 &&
  ENV.anonKey.length > 0 &&
  ENV.serviceKey.length > 0 &&
  ENV.jwtSecret.length > 0
```

**Step 2.** Apply the identical pattern to `apps/jobs/tests/helpers/env.ts`.

**Step 3.** The four billing integration suites each call `loadEnv` and read `DB_URL` inline. Give
them a shared helper (`packages/billing/src/test-helpers/live-env.ts`) exporting `LIVE_DB_URL`, and
change each `describe.skipIf(!DB_URL)` to `describe.skipIf(!LIVE_DB_URL)`:
- `src/withCredits.integration.test.ts:9`
- `src/entitlements/entitlements.integration.test.ts:8`
- `src/webhooks/webhooks.integration.test.ts:12`
- `src/webhooks/applyPlanGrant.integration.test.ts:8`

(`providers/cashfree/cashfree.live.test.ts` and `packages/mesh/src/smoke.live.test.ts` already
have their own opt-in and need no change — they are the pattern to copy.)

**Step 4.** `turbo.json` — declare the flag on the `test` task so it survives strict mode *and*
becomes part of the cache key, which stops a live-on run being served to a live-off run:

```json
"test": {
  "dependsOn": ["^typecheck"],
  "env": ["SAHODA_ALLOW_LIVE_TESTS"]
}
```

**Step 5.** Add the guard's own test — `packages/db/tests/live-guard.test.ts`:

```ts
it('refuses live suites unless SAHODA_ALLOW_LIVE_TESTS=1', () => {
  if (process.env.SAHODA_ALLOW_LIVE_TESTS !== '1') {
    expect(hasLedgerEnv).toBe(false)
    expect(hasRlsEnv).toBe(false)
  }
})
```

**Step 6.** Run live suites only from the nightly CI job, against a **Supabase branch**, never the
production project: `SAHODA_ALLOW_LIVE_TESTS=1 pnpm turbo run test --force --filter @sahoda/db`.

#### Acceptance test

`pnpm test --force` with a fully populated `.env` present writes **zero** rows: record
`select count(*) from credit_ledger` before and after; the numbers must match.

---

### 🎫 R-02 — Production cron returns HTTP 500 every 5 minutes, silently

**Severity: HIGH** · **Owner: whoever owns `apps/web` + Vercel env** · **Week 0, Day 5**

#### What happens

`/api/cron/sweeps` is scheduled every 5 minutes (`apps/web/vercel.json`) and **has never
succeeded**. Vercel runtime logs, deployment `dpl_5UUThQdJDwgPKWggcyo2Kgrj1oX9`:

- 72 invocations in 6 hours — exactly one per 5 minutes.
- 12 consecutive sampled runs (17:10–18:05 UTC), **all HTTP 500**.
- **Zero error-level log lines.** Completely invisible.

500 is diagnostic: `off` mode returns 200, an unauthorised request returns 401
(`route.ts:64-71`). The handler is throwing.

#### Candidate causes, in order of likelihood

1. **A set-but-invalid sweep flag.** `loadJobsEnv` deliberately **throws** on a present-but-
   unparseable `SAHODA_PUBLISH_DISPATCH_MODE` or `SAHODA_HOLD_SWEEP_MODE` — `"true"`, `"1"`, `"ON"`
   and `""` all refuse to start (`apps/jobs/src/env.ts:137-152`, documented as intentional). The
   local `.env` sets `SAHODA_PUBLISH_DISPATCH_MODE`; if Vercel's copy is not exactly
   `off|report|on`, this is the answer.
2. **Missing runtime env.** `loadJobsEnv` also throws when `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_DB_URL` is absent from the *runtime* environment.
3. **Middleware.** Several 500s are tagged `source: edge-middleware`. The route comment states it
   *must* be excluded from Clerk's middleware; if the matcher does not actually exclude it, Clerk
   may throw before the handler runs.
4. Database unreachable from the function region (the historical pooler-vs-direct-host failure).

#### How to diagnose in one step

The error is unlogged because `loadJobsEnv`'s throw happens before `reportServerError` is reached.
Wrap the deps construction and report the **key name only** — the loader already guarantees it
never echoes a value:

```ts
try {
  deps = dispatchSweepDeps({ limit: DISPATCH_BATCH })
} catch (e) {
  reportServerError(e, { action: 'cron:boot' })   // names keys, never values
  return Response.json({ ok: false, scope: 'boot' }, { status: 500 })
}
```

Then read `vercel env ls` and confirm the two mode flags are exactly `off`, `report` or `on`.

#### Why this matters beyond the cron

This is the clearest demonstration of §3 of `00-`: a production job has been failing on every
invocation for at least two hours (and probably since it was deployed on 2026-07-26), and **no
test, no gate, no alert and no dashboard noticed.** Fix the cron, then add Sentry alerting on any
non-2xx from `/api/cron/*`.

---

### 🎫 R-03 — `constraints.ts` claims LinkedIn is publishable; no LinkedIn adapter exists

**Severity: MEDIUM (HIGH the moment `SAHODA_PUBLISH_MODE=live`)** · Owner: `packages/shared`

`packages/shared/src/publishing/constraints.ts` marks LinkedIn `publishable: true`. There is no
LinkedIn adapter, so a LinkedIn variant clears the dispatcher's `canAttempt` guard and would fail
`NO_ADAPTER` permanently in live mode. Real exposure is recorded in `apps/jobs/REQUESTS.md`:
production post `c36d3757` (workspace `8073bf58`) carried `linkedin:pending`.

**Fix:** derive `publishable` from the routing row introduced in `02-` §6, so the claim cannot
outrun the rail. Scheduled for Day 26.

---

### 🎫 R-04 — 16 tables have RLS policies but no anon-client test

**Severity: MEDIUM** · Owner: `packages/db`

Violates the CLAUDE.md non-negotiable "every table: workspace_id + RLS + anon-client test".
Uncovered: `ai_provider_logs`, `app_settings`, `audit_logs`, `billing_webhook_events`,
`brand_memory`, `connections`, **`credit_balances`**, **`credit_ledger`**, `memory_events`,
`planner_events`, `plans`, `post_media`, `post_publish_logs`, `subscriptions`, `tour_progress`,
`users_profile`.

**Fix:** the 4 money tables in Week 1 (Day 11). The other 12 in Week 5. Blocked behind **R-01** —
do not add live tests until they cannot hit production.

---

### 🎫 R-05 — Dead env vars in the build allowlist

**Severity: LOW** · Owner: infra

`JOB_SIGNING_SECRET` (read by nothing), `RAZORPAY_KEY_ID` (superseded by Cashfree),
`STRIPE_SECRET_KEY` + `STRIPE_STARTER_PRICE_ID` (no Stripe code exists),
`TRIGGER_SECRET_KEY` + `TRIGGER_PROJECT_ID` (never deployed to; also a documented
`_REF` vs `_ID` mismatch), and after the aggregator switch `META_APP_ID` + `LINKEDIN_CLIENT_ID`.
Each is declared in `turbo.json` `@sahoda/web#build`, which reads as a statement about the stack
that is no longer true.

---

## 2. UNVERIFIED — could not be proven either way

| # | Item | Why unverified | Who/what answers it |
|---|---|---|---|
| U-01 | **Have the sweeps ever mutated a row?** | The cron 500s, so almost certainly no — but the Vercel env values for `SAHODA_*_MODE` were not readable (no MCP tool exposes env vars, and `.env` reads were correctly denied). | `vercel env ls` |
| U-02 | Live board status of the 42 SL cards | `ops/state/board.json` is the **seed** (uses `board_column`, not `status`); live status lives in `ops_tasks`. Reading it needs a `select`, outside the approved scope. | `/admin` or a read query |
| U-03 | Sentry redaction against a **stored** event | Explicitly parked post-demo in `apps/web/REQUESTS.md`. Unit tests prove the scrubber; nobody has read a real stored event. | Sentry dashboard |
| U-04 | Is `sahoda.site` actually owned and zoned? | `CLOUDFLARE_ZONE_ID` is set, which implies yes, but no DNS check was run. | Cloudflare dashboard |
| U-05 | Cashfree account state — sandbox vs live-activated | `CASHFREE_ENV` value not readable. A prior note records `CASHFREE_APP_ID == CASHFREE_SECRET_KEY` in `.env`, which would mean the credentials are wrong. | Cashfree dashboard |
| U-06 | Do the 3 Playwright specs pass? | They have never run in CI and were not run here (they need a live app + Clerk session). | Run them in Week 4 |
| U-07 | Does the demo seed on `wt-db` still apply cleanly? | Written 2026-07-20 against a 14-migration schema; the DB now has 23. | Run against a Supabase branch |
| U-08 | bundle.social's real capabilities | Not contacted. X tier, GBP support (expect none), webhook delivery guarantees, and whether flat pricing is per-workspace or per-brand at our tier — the exact axis that disqualified Ayrshare. | Vendor |
| U-09 | Whether `apps/web`'s Clerk middleware truly excludes `/api/cron/*` | Suspected contributor to R-02; not read line-by-line. | Read `middleware.ts` matcher |
| U-10 | Historical test-pass claims | Any "N tests green" produced without `--force` may include cached results from a different environment. Unknowable retrospectively. | Re-run with `--force` |

---

## 3. Schedule risks on someone else's calendar

These are the only true schedule risks — everything else is our own execution.

| Risk | Whose calendar | Impact | Mitigation |
|---|---|---|---|
| **Cashfree live activation / KYC** | Cashfree | **Kills the launch date.** No money = no launch. | Start Day 1. Escalate Day 10. If not landed by Day 20, launch in sandbox with a waitlist and say so publicly. |
| **Legal docs (ToS / Privacy / Refund)** | Whoever drafts them | Gates Cashfree activation. **None exist in the repo today.** | Commission Day 1. Templates are acceptable for launch. |
| **bundle.social account + API access** | Vendor | Gates Week 2 entirely. | Open the account Day 1, before writing the adapter. |
| ~~Meta app review~~ | ~~Meta~~ | **ELIMINATED by the aggregator switch.** This was the biggest clock. | — |
| ~~LinkedIn Partner programme~~ | ~~LinkedIn~~ | **ELIMINATED.** | — |
| X API tier | X | Only if X stays native — recommend it does not. | Route X via the aggregator for launch. |
| GBP API access | Google | Deferred; GBP is cut from the 30 days. | Post-launch. |

---

## 4. The five decisions I need from you

1. **Does X route through the aggregator for launch, or stay on our own adapter?**
   My recommendation: aggregator. Our X adapter has never executed, and keeping it native means
   building an OAuth callback and a vault opener for a channel the aggregator already covers. The
   code stays in the repo and comes back via a config row later.

2. **Is Google Business Profile cut from the 30 days?**
   My recommendation: yes, and it is the first thing added after launch. It is the one channel no
   aggregator can give us, and our adapter for it is the richest thing in `packages/publishing`.

3. **Is Sites v0 cut?**
   My recommendation: yes. 13,787 LOC, 1,555 tests, no deployer, no consumer in the app, no
   revenue attached. Confirm no design partner was promised it.

4. **If Cashfree live activation slips past Day 20 — do we launch in sandbox with a waitlist, or
   move the date?** Decide this *now*, not on Day 28.

5. **Who owns the legal docs, and do they start on Day 1?**
   Nothing else on the critical path is blocked by a person we have not named yet.

**Two smaller rulings that unblock engineering:**
- Publishing priced at **0 credits** for launch (flat aggregator fee absorbed as overhead)? I
  recommend yes — it avoids a `pricing.config.json` change and per-post COGS tracking.
- May `packages/shared` be unfrozen for the one coordinated contract change on Day 17
  (`Channel`, `ConnectionPlatform`, `post_publish_logs.mode`)? It cannot be avoided.
