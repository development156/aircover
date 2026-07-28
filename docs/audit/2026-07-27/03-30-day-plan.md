# 03 — The 30-day plan to a launchable product

## The first line, as requested

**30 days is achievable — but only for a scope roughly one-fifth of what the docs describe, and
only if the two external clocks (Cashfree live activation and the aggregator account) are started
on Day 1.** The engineering on the critical path is about 12 working days of real work. The other
18 days are consumed by integrity debt, one third-party approval you do not control, and slack.
If Cashfree activation slips past Day 20, the launch slips with it and no amount of engineering
recovers it.

**The smallest scope that IS achievable in 30 days:**

> A signed-in user can buy credits with real money, link one social account, publish one real post
> to it on a schedule, and see honest proof it went out — on one trunk, behind CI that can fail.

That is the whole product for Day 30. Everything else is in the cut list at §7.

---

## 1. The critical path

Four steps. Every day of this plan serves one of them, or it is cut.

```
take money  →  link one account  →  publish one real post  →  prove it
```

Two properties of this path are worth stating plainly:

- **It is a chain, not a set.** "Publish one real post" is worthless without "link one account",
  which is worthless without a callback route that does not exist today.
- **Nothing on it is finished.** Not one of the four steps currently works end to end
  (`00-` §2.4, §2.7). The parts that *are* finished — the ledger, RLS, the mesh, the editor — are
  the parts that already work and need no further investment before launch.

**Week 0 exists because the path cannot be walked on the current foundation.** There is no single
trunk to build on, no signal that can fail, and a test suite that writes to the production
database. Building features on that is how you arrive at Day 28 with a green board and a broken
product.

---

## 2. Week 0 — Integrity (Days 1–5) · 28 Jul – 1 Aug

**No features. None.** Three things only: one trunk, real CI, test isolation.

| Day | Work | Output |
|---|---|---|
| **1** | **Start both external clocks before touching code.** Open the bundle.social account, confirm pricing/X tier/webhook guarantees. Start Cashfree live-mode KYC. Commission ToS + Privacy + Refund Policy (Cashfree requires them). | 2 clocks running, 3 legal docs commissioned |
| **1** | Merge PR #4 (`wt-admin` → `wt-web`). See §3 — this *reduces* risk. | one integration branch |
| **2** | Cherry-pick `wt-db`'s 2 commits; decide `sites-wip` (recommend: abandon); delete 4 merged branches; repair local `main`. Full sequence in `05-branch-reconciliation.md`. | **one trunk** |
| **2** | Reset `main` to the trunk; point Vercel production at `main`; protect `main`. | `main` is what ships |
| **3** | Land `.github/workflows/gate.yml` (`00-` §3.4). Make it a **required** status check. | a signal that can fail |
| **3** | **Prove CI can fail**: open a throwaway PR with a deliberately broken test; confirm red; close it. | evidence, not assumption |
| **4** | **Fix the test-suite-writes-to-production defect** — ticket **R-01** in `04-`. Add `SAHODA_ALLOW_LIVE_TESTS` opt-in; make live suites skip by default. | tests cannot touch prod |
| **4** | Replace `"lint": "exit 0"` in all 8 packages with a real ESLint run; fix fallout; add the raw-hex rule (closes SL-022). | lint means something |
| **5** | **Diagnose and fix the cron 500** — ticket **R-02**. It has been failing every 5 minutes, unlogged. | cron returns 200 |
| **5** | Add Sentry alerting on any non-2xx from `/api/cron/*`. | failures become visible |

> ### 🚦 GATE 0 — binary, end of Day 5
> 1. `git log --oneline main -1` equals the trunk head, and `wt-web`/`wt-admin` are merged into it. **PASS/FAIL**
> 2. A PR with a broken test shows a **red required check** and cannot be merged. **PASS/FAIL**
> 3. `pnpm test --force` with credentials present writes **zero** rows to `rloztdhzfliyvpvxsgjl` (verify `credit_ledger` count before/after). **PASS/FAIL**
> 4. `/api/cron/sweeps` returns **200** for 3 consecutive scheduled runs in the Vercel logs. **PASS/FAIL**
>
> **Any FAIL stops the plan.** Do not start Week 1 with a broken foundation — that is exactly how the last sprint produced 3,692 passing tests and a product that cannot take a payment.

---

## 3. Why merging PR #4 is the *safe* move (the one-sentence argument)

**The nine `ops_*` migrations are already applied to the only database that exists, so merging PR #4
makes the code match the database it is already running against — leaving it open is the risk, not
closing it.**

Consequently: **the Admin Ops platform is FROZEN, not cut.** Merge it, run it, add nothing to it
for 30 days. It costs zero days and it is how the team tracks the work.

---

## 4. Week 1 — Take money (Days 6–12) · 2 Aug – 8 Aug

Depends on: Gate 0.

| Day | Work |
|---|---|
| **6** | Wire Cashfree into `apps/web/src/app/actions/wallet.ts:25`. Today it hardcodes `createFixtureProvider()`; the provider seam already exists, so this is a one-line swap plus env. Keep the fixture selectable by env for local dev. |
| **7** | Checkout redirect + return route. `startCheckout` deliberately does not redirect today because the fixture URL is unresolvable — restore the redirect on the live path only, guarded on `session.mode === 'live'`. |
| **8** | Webhook receiver: signature verification (`providers/cashfree/signature.ts` exists), idempotency via `billing_webhook_events` (table live, 0 rows), → `apply_ledger_entry` GRANT. |
| **9** | **Replay + double-credit tests first.** A repeated webhook must grant once. This is the single most dangerous code in the product — money in. |
| **10** | Entitlement gate helper (`packages/billing`) — open request from both `apps/web` and `apps/jobs`. Plan → feature access. |
| **11** | Anon-client RLS tests for the 4 money tables with no coverage: `credit_ledger`, `credit_balances`, `subscriptions`, `billing_webhook_events`. |
| **11** | Publish ToS / Privacy / Refund at real URLs — Cashfree will check them. |
| **12** | **Live sandbox purchase, end to end, by a human.** Then a live-mode ₹1 purchase if activation has landed. |

> ### 🚦 GATE 1 — binary, end of Day 12
> 1. A real card charges real money in Cashfree **live** mode (₹1 test). **PASS/FAIL**
> 2. `billing_webhook_events` row count goes 0 → 1, and `credit_balances` increases by exactly the plan's grant. **PASS/FAIL**
> 3. Re-delivering the same webhook grants **nothing** the second time. **PASS/FAIL**
> 4. `/terms`, `/privacy`, `/refunds` return 200. **PASS/FAIL**
>
> ⚠️ If Cashfree live activation has not landed by Day 12, Gate 1 passes on **sandbox** and the launch date moves. Flag it that day — not on Day 28.

---

## 5. Week 2 — Link one account, publish one real post (Days 13–19) · 9 Aug – 15 Aug

Depends on: Gate 0. (Independent of Gate 1 — can run in parallel if you have two people.)

| Day | Work |
|---|---|
| **13** | Aggregator adapter: `packages/publishing/src/adapters/aggregator.ts`, injected `Transport` + fixture corpus, one file for all channels. Classify errors, never retry. |
| **14** | **The routing row.** `app_settings` (live, 0 rows) holds `publish_routing`; `createAdapterSelector` reads it, falls back to a compiled default, and still throws `NO_ADAPTER` for an unrouted channel. This is the escape hatch that does not exist today (`02-` §6). |
| **15** | **The callback route** — `apps/web/src/app/api/connections/callback/route.ts`. There are currently **zero** callback routes in the app. |
| **16** | Wire `public.upsert_connection` — the RPC is applied and has zero callers. Enable the connect button; delete the "connecting isn't live yet" copy. |
| **17** | `packages/shared` contract change, all consumers in one commit: `Channel` additions, `ConnectionPlatform`, and **`post_publish_logs.mode`** — an aggregator publish is real but not `'live'`, and today the Certainty System would render it as **"Simulated"** (`02-` §4). Migration + contract + UI together. |
| **18** | Webhook → `post_publish_logs` mapping + failure-reason classification. |
| **19** | **Publish one real post to one real account, by hand, from the app.** |

> ### 🚦 GATE 2 — binary, end of Day 19
> 1. A human links a real social account through the app; `connection_secrets` (or the aggregator link record) goes from **0 rows to 1**. **PASS/FAIL**
> 2. A post published from the app appears **on the real platform**, and its permalink resolves. **PASS/FAIL**
> 3. `post_publish_logs` records it with a mode that is **not** `fixture`, and the UI renders it as real — not "Simulated". **PASS/FAIL**
> 4. Setting `publish_routing` to `native` for that channel changes the rail **without a deploy**. **PASS/FAIL**

---

## 6. Week 3 — Make it fire on a schedule (Days 20–26) · 16 Aug – 22 Aug

Depends on: Gate 2.

| Day | Work |
|---|---|
| **20** | **The CAS claim.** No `UPDATE` anywhere sets `publish_status='publishing'`; without it, two overlapping cron ticks double-post. Migration + claim + release. This is the last correctness blocker. |
| **21** | Replace the always-throwing `enqueuePublish` with an inline publish guarded by that claim. |
| **22** | Turn `SAHODA_PUBLISH_DISPATCH_MODE=report` in production. Read the decisions against real rows. Change nothing. |
| **23** | Reconciliation sweep: async aggregator status → settle the credit hold. New work the own-adapter design did not need (`02-` §3.5). |
| **24** | Turn `SAHODA_HOLD_SWEEP_MODE=on`. The reaper has **never run**. Watch it release exactly the stranded holds and no others. |
| **25** | Turn `SAHODA_PUBLISH_DISPATCH_MODE=on`. First real scheduled publish. |
| **26** | Fix the `constraints.ts` lie: `publishable` must derive from the routing row, so LinkedIn can never again claim it can post with no adapter behind it. |

> ### 🚦 GATE 3 — binary, end of Day 26
> 1. A post scheduled for T+10 min publishes within **±60 s** of T, unattended. **PASS/FAIL**
> 2. Two overlapping cron invocations produce **exactly one** platform post. **PASS/FAIL**
> 3. A forced publish failure **releases** the credit hold; the user is not charged. **PASS/FAIL**
> 4. `/api/cron/sweeps` has returned 200 for **48 consecutive hours**. **PASS/FAIL**

---

## 7. Week 4 — Prove it and launch (Days 27–30) · 23 Aug – 26 Aug

| Day | Work |
|---|---|
| **27** | Playwright `@smoke` on the real golden path: sign up → onboard → buy → link → post. Wire it into CI. |
| **28** | Security review of the two new external boundaries (payment webhook, aggregator webhook). Use the adversarial pattern that found the three `ops_*` vulns — assume the caller is hostile. |
| **29** | Error/empty/loading states on the new surfaces; honest copy pass. Rate limits on the callback and webhook routes. |
| **30** | **Launch gate**, then invite 5 design partners. Not 25. |

> ### 🚦 GATE 4 — LAUNCH, binary, Day 30
> 1. A person who is not on the team completes: sign up → buy credits with real money → link an account → schedule a post → post goes live. **PASS/FAIL**
> 2. CI is green on `main`, and a deliberately broken test still turns it red. **PASS/FAIL**
> 3. Zero fake-success states on the golden path. **PASS/FAIL**
> 4. Sentry shows no unhandled 5xx on the golden path for 24 h. **PASS/FAIL**

---

## 8. THE CUT LIST

Everything below does **not** fit in 30 days. Each line says what deferring it costs.

### Cut outright

| Cut | What deferring costs |
|---|---|
| **Sites v0 (13,787 LOC)** | We keep a package with 1,555 tests, no deployer, and no consumer in the app; finishing it needs a Cloudflare integration plus a mount, and **no design partner has asked for it.** Cost: the "website in a click" pitch is unavailable at launch. |
| **Google Business Profile** | Our richest adapter stays dark. Cost: local-business prospects can't use their most valuable channel — this is the **first thing to add after launch**, and the reason we keep the native rail. |
| **X on our own adapter** | Route X via the aggregator instead (`02-` §7.2). Cost: dependence on their X tier; recoverable in a day via the routing row. |
| **WhatsApp** | Separate Cloud API track, business verification, no aggregator resells it. Cost: no approval-by-WhatsApp, the signature Sahoda moment. |
| **Sahoda Guide (6 tours)** | `tour_progress` = 0 — nobody has ever completed one. Cost: onboarding is unguided; mitigate with 3 static tooltips. |
| **Audience Twin, Inbox, Studio, Campaigns, Remix, Radar, Playbooks, DIFM, Hindi, Agency, Public API/MCP** | None are started; `packages/render` and `apps/mcp` are empty scaffolds. Cost: none in 30 days — they were never close. |
| **Analytics ingestion** | The aggregator returns metrics for its channels; read theirs later. Cost: no "Measure" module at launch. |
| **The Loop (M2) + CMO email** | Requires a working publish rail first. Cost: the automation story is a roadmap promise, not a demo. |
| **RLS anon tests for the 12 non-money uncovered tables** | Do the 4 money tables in Week 1 only. Cost: a known non-negotiable stays partly violated; schedule it Week 5. |

### Frozen, not cut

| Frozen | Why |
|---|---|
| **Admin Ops platform** | Merge PR #4 and stop. Its migrations are already live in production; the code must catch up, but add no features. Zero days. |
| **Trigger.dev** | Never deployed to; the Vercel cron is the sanctioned fallback and works. Delete `TRIGGER_*` env vars or leave them inert. |

### What launch looks like without the cut list

A credible, narrow SaaS: **sign up, teach it your brand, generate and edit posts with AI, buy
credits with real money, link one social account, and schedule real posts that actually go out.**
It is honest, it is multi-tenant, the money is atomic, and every claim on screen is true.

What it is **not**: it has no website builder, no GBP, no WhatsApp, no analytics, no automation
loop, and no guided tour. It is a scheduling-and-drafting product with a very good ledger. That is
a real product and five design partners can use it on Day 30.

---

## 9. If you only get 20 days

Cut Week 3 entirely. Ship **manual publish only** — the user clicks "Publish now" and it goes out.
Scheduling is the single most expensive remaining feature (CAS claim, reconciliation, three flag
flips, 48-hour soak) and the least differentiated. A product that publishes on click is launchable;
a product that publishes on a schedule but double-posts is not.

---

## 10. The three things most likely to kill this

1. **Cashfree live activation.** Not on our calendar. Legal docs gate it. Start Day 1; escalate Day 10; if it has not landed by Day 20, launch in sandbox with a waitlist and say so.
2. **No CI until Day 3.** Every day the team builds against unfailable gates is a day of invisible debt. If Gate 0 slips, everything after it is being built on sand.
3. **The `post_publish_logs.mode` contract change (Day 17).** It touches a DB CHECK constraint, a frozen zod contract, the dispatcher guard and the Certainty System simultaneously. Done badly, every real publish renders as "Simulated" and the launch demo shows the product calling its own success fake.
