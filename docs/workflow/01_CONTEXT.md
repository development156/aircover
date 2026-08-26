# 01 · Context

**As of 24 August 2026.** This file goes stale. Where it disagrees with the code, the code wins — and correct this file.

---

## What the product is

Sahoda is an AI marketing employee for Indian small businesses — shop owners, clinics, boutiques who cannot afford an agency retainer or a marketing hire. It learns a business once, then plans, writes, publishes and measures content on a weekly cycle.

**The user is a bakery owner in Bhubaneswar on a mid-range Android, on Indian mobile data, who has never used a marketing tool.** That sentence should decide most design arguments. It is not a persona exercise; it is why 44px touch targets and 390px-first are non-negotiable, and why a heavy blur or a 4MB video is a real cost rather than a taste question.

**Pricing:** Starter ₹1,999 · Growth ₹3,999 · Studio ₹7,999 per month, with 1,500 / 4,000 / 12,000 credits. Repriced 2026-08-24 from the business model deck; the previous ₹499 / ₹1,499 / ₹3,999 at 1,500 / 5,000 / 15,000 is what customers saw before that date. Note the allowances went DOWN as the prices went up. `PLAN_CATALOG` in `packages/shared/src/billing/plans.ts` is the source; this line is a summary of it.

**"Studio" is a label, not an id.** The plan's id is still `agency`, because that id is the `plan_id` on every live subscription row. Code says `agency`, customers read "Studio", and `plans.test.ts` asserts they disagree on purpose.

**There is no free tier to SELL, but `free` is not dead code.** This file previously said a `Free` row "was removed" and that code assuming it is a bug. That was wrong, and acting on it would break access control. MEASURED 2026-08-24: `free` is in `PLAN_CATALOG`, in the `plans` seed, and is the **entitlement floor** — `packages/billing/src/entitlements/pg.ts:8` resolves a workspace with no live subscription to `free`, and `packages/shared/src/billing/lifecycle.ts:96` falls back to it once suspended. Removing it would change what an unsubscribed or suspended workspace may do. What is true is that nobody is sold a permanent free plan.

---

## The three concepts everything rests on

**Brand Brain** — a versioned, append-only brand memory. Fields are either CONFIRMED by a person or INFERRED by a model, and the product never blurs the two. The confirmation ring exists for this and is sacred.

**The Loop** — a weekly seven-stage cycle: Reflect → Plan → Create → Test → Stage → Report. Governed by the Autonomy Dial: L0 suggests, L1 drafts into the planner (default), L2 requires approval, L3 auto-publishes. **L3 does not ship** and is visible-and-unselectable.

**Per-channel variants** — the product's one real differentiator, and the thing every competitor lacks. One post has one body **and one format** per channel. Instagram's caption differs from LinkedIn's, each with its own character limit, its own rule violations, its own independent publish state. Any change that would collapse variants into a single body is a regression, whatever it looks like.

---

## Stack

Next.js 15 · Supabase (Postgres, RLS throughout) · Clerk (auth) · Cashfree (payments) · Zernio (publishing aggregator, `https://zernio.com/api/v1`) · OpenRouter (AI) · Turborepo/pnpm monorepo · Vercel.

**Radar:** Apify for social, Zyte for web, shared competitor registry deduped across tenants.

**Production Supabase ref: `rloztdhzfliyvpvxsgjl`.** There is only one Supabase project and it is production. There is no staging.

**Shell is fish.** Wrap any loop, heredoc, `export`, `<(...)` or `${VAR:-default}` in `bash -c '...'`. Fish uses `psub`, not `<()`.

---

## The three standing non-negotiables

**RLS on every table.** `lib/supabase/server.ts` explicitly refuses a service-role client. RLS is the only security boundary in this product — there is no second net.

**The ledger never lies.** Append-only, double-entry, compensating entries for corrections, never an edit. Run `packages/db/scripts/ledger-invariants.mjs` before and after anything that touches money, and account for the delta exactly.

**No fake success states.** A green "Published" that is not keyed off a real `platformPostUrl` is the failure that ends trust with a customer. This generalises: never render a figure no query produced. Reach, revenue, predicted performance, competitor counts, audience age — anything that is a claim about the user's own business is the one class this product may never invent. A container with an em dash is correct. A number with nothing behind it is a lie.

---

## What is built

Every feature the product promises, except three deliberate drops.

58 routes. The composer with per-channel bodies and formats. Brand Brain, the Signal Resolution Console, Knowledge, Audience. The Loop and the Autonomy Dial. Radar with a deduped registry and a measured cheap-check. Campaigns, Approvals, Assets with a delete gate, Remix, Leads, Playbooks, Templates, Sites. Billing end to end — proration, dunning, chargebacks, GST invoicing. Webhooks. Auto-resize with an offered crop. A rebuilt onboarding. A design system at `docs/37`.

**Deliberately dropped:** Ads functionality, WhatsApp Chat-Ops, Design Studio, the node-based workflow canvas (replaced by Playbooks, per PRD §5.3 — SMBs do not build DAGs).

---

## What is not true yet

**Nobody has used it.** Every green is a test, a gate, or a database read. Not one is a person trying to get something done. Every defect that actually mattered in the last twenty sessions was found the moment a human opened a browser — a nav bar reading "S Sah", a chart that looked broken, four orange buttons shouting at each other, a month calendar that was not a calendar on a phone. None came from tests, and this codebase has more tests than most funded companies.

**Production may be behind.** Check `git log wt-web..wt-integrate3 --oneline | wc -l` before assuming anything about what customers see. A fix that is green locally is not a fix in production.

**Scheduled jobs need `.github/workflows` on the default branch.** GitHub only schedules from the default branch. This is why metrics, Radar and Playbooks were inert for weeks — not a code bug.

---

## What only the founder can do

| Item | Why |
|---|---|
| **Use the product for an hour** | The largest untested surface in the system |
| **Clerk production keys** | A test key serves production today; every signup adds a row to a manual remap. One-way door. |
| **Supabase Pro, $25/mo** | Free has no point-in-time recovery, pauses after a week idle, and 1 GB of storage that auto-resize will fill in weeks |
| **Restore a backup and time it** | Never done. An untested backup is a belief. |
| **A lawyer** | ToS, Privacy, DPA. Cashfree KYC is done, so money is imminent. |
| **A chartered accountant** | `docs/29_GST_Questions.md` — eleven questions, each stating what the code assumes |
| **Cashfree support ticket** | Production keys return 401 against Cashfree's own production endpoint |

---

## Where the documents live

`docs/01_PRD` · `docs/02_FSD` · `docs/03_TSD` — what the product is meant to be.
**There is no open items register.** `docs/19` is cited in older notes and has
never existed in this repository's history — `git log --all --diff-filter=A --
'docs/19*'` returns nothing. The nearest thing is `docs/32_Loose_Ends.md`, but
it is a dated snapshot of runs 1–27 taken on 2026-08-19, not a living list, and
its own header calls itself `30`. If an open items register is wanted, it has
to be created.
`docs/26` / `docs/37` — the design system. **37 supersedes 26.**
`docs/31` — publishing formats, per channel, with what Zernio can actually reach.
`docs/33_QA_Report.md` / `docs/34_UX_Lane_Report.md` — the QA and UX lane
reports, 431 findings between them. **Cite documents by full filename, not by
number:** 13, 29, 31, 33 and 34 are each shared by two or three different files.
`docs/45_Product_Structure.md` — the 60,507-word structural handoff written for
the designer's assistant. (Written as `docs/35` on the unmerged `wt-handoff`
lane; `docs/35` on the trunk is `35_Operations.md`, a different document.)

When a document and the code disagree, **the code wins and you correct the document.**
