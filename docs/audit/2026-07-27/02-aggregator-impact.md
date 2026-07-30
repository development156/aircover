# 02 — Aggregator impact analysis

**Decision under evaluation:** route Instagram / Facebook / LinkedIn / Threads / Pinterest /
YouTube / TikTok through a third-party publishing aggregator (bundle.social, flat pricing;
Ayrshare disqualified on per-profile pricing). X and Google Business Profile stay on our own
adapters. WhatsApp remains a separate Cloud API track.

---

## 0. The headline

**The switch deletes almost no code, because the nine hand-built adapters were never built.**

Only two adapters exist — `x` and `gbp` — and the decision keeps both. Everything the aggregator
replaces is *planned* work, not shipped work. That makes this the cheapest architectural change
available to you, and it should be taken.

What it actually buys, in order of value:

1. **It deletes the Meta app review from your critical path.** That is a multi-week third-party
   clock you do not control, replaced by an account you can open today.
2. **It deletes six OAuth integrations you have not started** — and you have already proven, over
   nine days, that you cannot finish even *one* (`connection_secrets` = 0 rows).
3. It converts seven channels from "someday" to "config".

What it does **not** fix: the eight blockers in `00-` §2.4 are almost all on *our* side of the
boundary. An aggregator gives you a publish rail; it does not give you a CAS claim, a working
cron, a connect button, or a payment.

---

## 1. What the switch DELETES

### 1.1 Code — almost nothing, because it does not exist

| Would have been | Status today | Deleted? |
|---|---|---|
| `packages/publishing/src/adapters/instagram.ts` | never written | ✅ never write it |
| `…/facebook.ts` | never written | ✅ never write it |
| `…/linkedin.ts` | never written | ✅ never write it |
| `…/threads.ts`, `…/pinterest.ts`, `…/youtube.ts`, `…/tiktok.ts` | never written | ✅ never write them |
| `packages/publishing/src/oauth/{meta,linkedin,…}.ts` | never written | ✅ never write them |
| Fixture corpora for 7 platforms | never written | ✅ never write them |

**Actual files deleted today: zero.** Actual files never to be written: ~14 adapters + ~7 OAuth
mounts + ~7 fixture sets, at the observed rate of ~1,900 LOC and ~60 tests per platform pair
(`packages/publishing` is 3,759 LOC / 124 tests for two platforms).

### 1.2 Code that becomes dead **only if X also moves** — a decision you must make

If X stays ours, nothing here changes. If X moves to the aggregator, these become deletable:

- `packages/publishing/src/adapters/x.ts`, `x-http.ts`, `x-media.ts` (+ 3 test files)
- `packages/publishing/src/oauth/x.ts` (+ `x.test.ts`)
- `packages/publishing/fixtures/x/` — 11 fixture files
- the `case 'x':` arm of `apps/jobs/src/publish/adapters.ts:37-42`

See §6 — my recommendation is that X moves for launch and comes back later if the aggregator's X
support disappoints.

### 1.3 Env vars that become dead weight

| Var | Why dead |
|---|---|
| `META_APP_ID` | Aggregator owns the Meta app. **Note: no `META_APP_SECRET` was ever set — this OAuth app was never completable.** |
| `LINKEDIN_CLIENT_ID` | Same. Also no secret set. |
| `X_CLIENT_ID` | Dead **only if** X moves. Also no `X_CLIENT_SECRET` set. |
| `RAZORPAY_KEY_ID` | Unrelated but already dead — Cashfree is the chosen rail (Roadmap §6.8 is OBSOLETE). |
| `JOB_SIGNING_SECRET` | Already dead — allowlisted in `turbo.json` and read by nothing (filed in `apps/jobs/REQUESTS.md`). |
| `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_ID` | Dead if Trigger.dev is abandoned (it has never been deployed to). |

All are in `turbo.json`'s `@sahoda/web#build` env list and must be removed from there too, or the
build allowlist keeps documenting a stack you do not have.

### 1.4 Doc sections that become obsolete

- `docs/05` §1 item 8 — rewrite: "real publishing" is no longer X+GBP-shaped.
- `docs/05` §6 item **6** ("Meta publish (when approved) + IG variants") — **delete**.
- `docs/05` §6 item **19** (Pinterest/Threads/Shorts) — **delete** the three social channels;
  keep Shopify as unrelated.
- `docs/05` §2 "start the external-approval clocks — Meta app review, LinkedIn Partner" —
  **delete both**. This is the schedule win.
- `docs/02_FSD` M5 · Publish — the per-platform OAuth narrative needs replacing with a single
  linked-account model.
- `docs/03_TSD` — the publishing architecture section (per-adapter transports) shrinks to two.

### 1.5 Tables / columns

**No table is deleted.** `connections` and `connection_secrets` keep their shape — the aggregator
still produces a per-workspace linked account you must record. What changes is *what goes in them*:
one aggregator team/workspace id instead of seven token pairs. `connection_secrets` may hold
nothing at all for aggregator channels (they hold the tokens), which makes the AES vault
**smaller**, not gone.

---

## 2. What it KEEPS but SHRINKS

| Component | Before | After |
|---|---|---|
| **AES token vault** (`packages/publishing/src/vault/token-vault.ts`) | 9 platforms × access+refresh | X + GBP only — or **GBP only** if X moves. Keep the code; the key rotation story stays. |
| **`connections` / `connection_secrets`** | 9 platform rows/workspace | 1 aggregator link + up to 2 native. |
| **Dispatcher** (`apps/jobs/src/dispatch/*`) | ours | **Unchanged and still required.** The aggregator can schedule, but our Constraint Engine, credit hold and approval gate must run *before* handoff. Do not delegate scheduling. |
| **Vercel cron** | 2 sweeps | Unchanged — still needs the hold sweeper, plus a new status-reconciliation sweep (§3.5). |
| **Constraint Engine** (`packages/shared/src/publishing/constraints.ts`) | ours | **Unchanged and still required.** The aggregator will not enforce your brand rules, banned phrases or per-channel character limits. This stays our differentiator. |
| **`post_publish_logs`** | ours | Unchanged shape, new `mode` value (§4). |

---

## 3. What it ADDS

### 3.1 One adapter case
`apps/jobs/src/publish/adapters.ts` — replace the `default:` throw with an aggregator adapter:

```ts
default:
  return createAggregatorAdapter({ transport: deps.transport, channel, now: deps.now })
```
One new file, `packages/publishing/src/adapters/aggregator.ts`, following the existing injected-
`Transport` + fixture-corpus pattern (`pub-transport-and-adapter-pattern`). Estimated ~400 LOC +
~40 tests — *one file for seven channels*, versus ~1,900 LOC per two channels today.

### 3.2 Account-linking UX
The aggregator provides a hosted link flow. You still need:
- **one** callback route — `apps/web/src/app/api/connections/callback/route.ts` (today there are
  **zero** callback routes),
- a write path: `public.upsert_connection` **already exists and is applied** (migration
  `20260719160916`) and has zero callers. This is the single highest-leverage unblock in the repo.
- an INSERT policy on `connections`, or a service-role write through the RPC.

### 3.3 Status / webhook mapping
Aggregator webhook → `post_publish_logs`. Needs: signature verification (mirror
`packages/billing/src/providers/cashfree/signature.ts`), an idempotency key, and a mapping into
the existing zod row schema. `billing_webhook_events` shows the pattern already exists.

### 3.4 Failure-reason mapping
Aggregator error codes → `AdapterError{ classification: 'transient' | 'permanent' }`. Adapters
classify, they never retry — that rule holds (`wt-pub-scope-and-rulings`).

### 3.5 A reconciliation sweep
New: aggregator posts are asynchronous. A third cron sweep must poll/receive terminal status and
settle the credit hold. **This is new work the own-adapter design did not need**, and it is the
main hidden cost of the switch.

### 3.6 Credit accounting for a per-post external cost
Today `withCredits` charges a flat price from `pricing.config.json` with no COGS recorded
(`withCredits` writes `model_tier: null` and no cogs — filed in `apps/web/REQUESTS.md`). A flat
aggregator subscription is *easier* than per-profile: publishing cost becomes fixed overhead, not
per-post COGS. **Recommendation: do not add per-post cost tracking.** Price publishing at 0 credits
for launch and absorb it.

### 3.7 Analytics
The aggregator returns per-post metrics for its 7 channels — this partly delivers Roadmap §6.3 for
free. Do not build ingestion; read theirs.

---

## 4. Blast radius on `packages/shared`

`packages/shared` is a **frozen contract package** (CLAUDE.md forbids team sessions from touching
it). These changes are unavoidable and must be done deliberately, in one migration-style change,
with all consumers updated in the same commit.

| Contract | Change | Breaks |
|---|---|---|
| `ChannelSchema` / `Channel` (`src/enums.ts:9`) | add `threads`, `pinterest`, `youtube`, `tiktok`, `facebook` | `CHANNEL_LABELS` (apps/web), `constraints.ts`, `week-grid.tsx` `STATUS_STYLES`, variant panel, every exhaustive `switch` |
| `constraints.ts` `publishable` | becomes **routing-dependent**, not a static boolean | `posts-publish.ts:87,101`, dispatcher `canAttempt` guard, planner "can this go out" copy |
| `ConnectionPlatform` (`src/db/connections.ts`) | add `aggregator` as a platform, or add a `provider` discriminator | `listConnections`, connections UI, `upsert_connection` RPC signature |
| `post_publish_logs.mode` — today `'live' \| 'fixture'` | needs a third state, or a separate `provider` column | ⚠️ **`lib/posts/read.ts` + the entire Certainty System** (`32f223a`): `published + live` is the *only* route to `.is-real`. An aggregator publish is real but not `live` — **it would render as "Simulated" today.** |
| `PublishAdapter` interface | must carry an external post id + a pending state | `runPublishPost.ts`, `classify.ts:183` (`fixture-publish` hold) |

**The `mode` enum is the sharp edge.** It is a DB CHECK constraint *and* a UI truth-mapping *and*
a dispatcher guard. Changing it requires a migration, a shared-contract change and a UI change in
lockstep — and `packages/db/supabase/migrations` is append-only. Plan it as one coordinated change,
not three.

---

## 5. What the aggregator CANNOT cover

| Gap | Why | Consequence |
|---|---|---|
| **WhatsApp** | Cloud API + business verification is a Meta-direct track no aggregator resells | Stays ours. Keep it out of the 30-day plan entirely. |
| **Google Business Profile** | Not a social network; bundle.social does not carry it | **Stays ours — and it is the only channel where our own adapter is mandatory.** |
| **GBP-specific post types** | Local posts, offers, CTA buttons, `searchUrl` permalinks — see `packages/publishing/fixtures/gbp/` (12 fixtures incl. `local-post.success-no-searchurl.json`) | Our GBP adapter's richness has no aggregator equivalent. Do not lose it. |
| **Brand-rule enforcement** | Constraint Engine is ours | Keep. This is the product. |
| **Approval gates / credit holds** | Ours | Must run before handoff. |
| **X, if their support is thin** | Verify their X tier and rate limits before committing | See §6. |

---

## 6. The escape hatch — **it does not exist today**

**Requirement:** flip a channel back to our own adapter as a config row, not a deploy.

**Current reality: false.** Two hardcoded structures decide routing, both compiled in:

1. `apps/jobs/src/publish/adapters.ts:36-56` — a literal `switch (channel)`.
2. `packages/shared/src/publishing/constraints.ts` — `publishable` is a static const.

Changing either requires a commit, a build and a deploy. There is **no runtime routing table**.

**The good news:** the table to hold one already exists and is empty. `app_settings` is live,
RLS-enabled and has **0 rows**. A minimal, honest escape hatch:

- Add a workspace-scoped (or global) `publish_routing` row: `{ "instagram": "aggregator",
  "x": "native", "gbp": "native" }`.
- Read it in `createAdapterSelector` and fall back to a compiled default when absent — never
  fabricate a route.
- Keep the `default:` throw for any channel with **no** route. A missing config must fail loudly,
  not silently pick a rail.

**Cost: roughly half a day.** Build it *with* the aggregator adapter, not after. Without it, a bad
aggregator day is a deploy-under-pressure, and this team has already learned what those cost.

---

## 7. Recommendation

1. **Take the switch.** It is nearly free in deleted code and removes the largest third-party
   clock (Meta review) from the plan.
2. **For launch, route X through the aggregator too.** Our X adapter has never executed; keeping it
   means building an OAuth callback + vault opener for a channel the aggregator already covers.
   Keep the code — it costs nothing to leave in place — and flip it back via the routing row once
   launch is behind you. *This is a decision I need from you.*
3. **GBP is the exception and must stay ours** — but it is **not** on the 30-day critical path
   (see `03-`). One channel is enough to launch.
4. **Build the routing row in `app_settings` in the same PR as the aggregator adapter.**
5. **Do not delegate scheduling, constraints, approvals or credit holds to the aggregator.** Hand
   off only the final send.
6. **Verify before signing:** bundle.social's X tier, their GBP support (expect none), their
   webhook delivery guarantees, and whether their flat price is per-workspace or per-brand at your
   tier. Ayrshare was disqualified on exactly this axis — confirm the new one does not have the
   same shape hidden elsewhere.
