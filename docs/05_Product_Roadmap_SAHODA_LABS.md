# Product Roadmap — SAHODA LABS
**v2.0 · THE 2-DAY BUILD SPRINT · Confidential**
Supersedes v1.0 (30-day plan) and all timeline references in other docs. Founder decision: build in **2 days**. This plan makes those 48 hours count — by defining exactly what ships (the Day-2 Alpha), running everything in parallel Claude Code worktrees, and moving the rest to a strictly ordered backlog. Scope elsewhere (PRD/FSD) is unchanged; only sequencing is compressed.

---

## 0. The Sprint Contract
**What Day-2 Alpha IS:** a real, deployed, multi-tenant product a design partner can sign into, teach their brand, create posts, publish to real channels, get a website live, and spend credits — with the signature Sahoda moments working.
**What it is NOT:** the full v3.0. Loop automation, Twin, Inbox, Studio, Razorpay, WhatsApp and 6 more channels are backlog, in the order in §6.
**Non-negotiable even at max speed:** tenant isolation (RLS), atomic credit ledger, encrypted tokens, no fake success states, hooks/gates stay ON. These are the three places "minimal QA" causes real damage — they get the QA.

## 1. Day-2 Alpha Scope (IN — 14 items)
1. Monorepo (pnpm+Turborepo) + `packages/shared` zod contracts — frozen Hour 2.
2. Supabase: core schema + **RLS on every table** + `apply_ledger_entry()` + seed script.
3. Clerk auth → workspaces + members; workspace switcher.
4. **Onboarding = Signal Resolution Console** (port `sahoda_brand_brain_demo.html` behavior): 5 channels + clarity waveform + Resolve via Model Mesh → `brand_memory v1`; blanks inferred, never blocked.
5. **Look & Feel step**: 4 default themes + logo/site color-extract-lite + Readability Guard; revert in Settings.
6. Posts editor with per-platform variants (Constraint Engine v0: X, GBP, LinkedIn, IG text rules) + AI rewrite (1 cr).
7. Planner: list + week calendar; statuses; reschedule.
8. **Real publishing: X + Google Business Profile** (OAuth, AES token vault, publish + permalink logs). LinkedIn self-post if time (H16 stretch).
9. Scheduled publish via Trigger.dev task (idempotent, retries).
10. **Credit ledger live**: 100-cr grant, HOLD→DEBIT on every AI action, failed=released, wallet UI with per-entry "why". Stripe **test-mode** checkout + webhook → plan + monthly grant.
11. **"Plan my week" v0**: one action → 5 Brand-Brain-grounded drafts into Planner (the Loop's seed, not the scheduled cycle).
12. **Sites v0**: prompt → sectioned page(s) → **real deploy** to `{slug}.sahoda.site` (Cloudflare) + contact form → `leads` + in-app alert.
13. Dashboard: CMO card (from seed+real publish logs), credit chip, empty states.
14. **Sahoda Guide v0**: mascot (blade, cursor-gaze) + 6 tours (onboarding, first post, approve, connect, wallet, site) + toasts; Sandbox seed brand "Chai & Chapters".

**Explicitly OUT of Alpha** (see §6 order): scheduled Loop cycles & CMO email, Audience Twin, Inbox, Studio renderer, Campaigns beyond plan-only, Meta/WhatsApp/Pinterest/Threads/YouTube/Shopify, Razorpay, custom domains, Radar/Remix/Playbooks/DIFM, analytics ingestion (stubbed), Hindi, Agency tier, public API/MCP.

## 2. Day 0 (evening before, ~3h) — Preconditions
Do ALL of this before Hour 0 or the sprint stalls:
- Accounts & keys per **12_Build_Companion §10** (Supabase, Clerk, Vercel, Cloudflare + `sahoda.site` zone, Trigger.dev, Upstash, Resend, Sentry, Stripe test, X API, Google Cloud project for GBP OAuth, OpenRouter 3 keys). Keys into env/Doppler using **12 §7** `.env.example`.
- Claude Code setup from docs **09/10/11 + 12 §4–6**: settings+hooks, root & package CLAUDE.md, MCPs, skills, commands, subagents. Verify with `/doctor`.
- **Start the external-approval clocks anyway** (they're free to start): Meta app review, WhatsApp business verification, Razorpay KYC, LinkedIn Partner — tracker in 12 §10. They gate backlog items, never the Alpha.
- Test accounts: one throwaway X account + one GBP test location + Stripe test cards.
- `git init`, push, protect main, create the 5 worktrees (§4).

## 3. The 48 Hours (hour-by-hour)
Evening ritual at every checkpoint: merge in dependency order → `turbo typecheck lint test` → Playwright smoke → commit → one line in LEARNINGS.md.

**DAY 1**
| Hours | Track | Work |
|---|---|---|
| H0–2 | SOLO (Opus, plan mode) | **Phase-A contracts:** full core schema + RLS specs + ALL zod contracts + package interfaces + `pricing.config.json` (12 §9). Freeze. Fan out. |
| H2–6 | 5 parallel worktrees | **db:** ledger fn + RLS tests · **web:** shell, Clerk, nav, tokens from 08 · **mesh:** router + `brand_guidelines`/`captions` tasks + telemetry · **pub:** X+GBP adapters + Constraint v0 · **jobs:** Trigger init + `publishPost` |
| H6–7 | CHECKPOINT 1 | Merge db→all; gates green; deploy preview live |
| H7–11 | parallel | **web:** Onboarding Console (port demo UI to Next) + Look&Feel + Guard · **web2:** Posts editor + variants · **billing:** wallet UI + `withCredits()` + Stripe test checkout/webhook · **db:** seed Chai&Chapters |
| H11–12 | CHECKPOINT 2 | E2E: signup→onboard→resolve Brain→draft post. Sleep. |

**DAY 2**
| Hours | Track | Work |
|---|---|---|
| H12–16 | parallel | **jobs+pub:** schedule→publish to REAL X+GBP with logs+retries · **web:** Planner · **billing:** debits wired on every AI action, failure=release |
| H16–19 | parallel | **sites:** gen→CF deploy→`*.sahoda.site`+form→leads · **web:** Dashboard/CMO + "Plan my week" v0 · **guide:** mascot + 6 tours (contract FSD App C) · stretch: LinkedIn self-post |
| H19–21 | HARDENING | RLS suite from anon client · ledger concurrency test · `/security-review` + fixes · error/empty states pass · focus/a11y pass |
| H21–23 | SHIP | Seed demo data, run the **Alpha Gate (§5)**, record 3-min demo script, tag `v0.1-alpha`, write LEARNINGS |
| H23–24 | Buffer | It will be needed. |

## 4. Parallel Worktree Map
| Worktree | Owns | Model | Never touches |
|---|---|---|---|
| wt-db | packages/db (schema, RLS, ledger fn, seeds) | Opus | anything else's migrations rule: ONLY this agent edits migrations |
| wt-mesh | packages/mesh + apps/jobs AI tasks | Sonnet | db migrations |
| wt-web | apps/web (shell, onboarding, editor, planner, dashboard, guide) | Sonnet | packages/* internals — imports contracts only |
| wt-pub | packages/publishing + OAuth routes | Sonnet | ledger |
| wt-billing | packages/billing + wallet UI + Stripe | Sonnet | adapters |
Human = reviewer on every PR (reviewer subagent first). 2–4 sessions active at once; queue the rest. Lockfile installs by one agent only.

## 5. Alpha Gate (Definition of Done — all must pass)
☐ Fresh signup → onboarding → **resolved Brand Brain** in <10 min ☐ Post published to real X **and** real GBP with permalinks logged ☐ Scheduled post fires within ±60s ☐ Every AI action debits correctly; a forced failure releases the hold ☐ Stripe test upgrade grants credits via webhook ☐ Site live at `{slug}.sahoda.site`; form creates a lead ☐ RLS suite: zero cross-tenant reads/writes ☐ 6 tours run; mascot gazes; reduced-motion clean ☐ No fake states anywhere ☐ `turbo typecheck lint test` + smoke green on main ☐ Deploy preview shareable.

## 6. Post-Sprint Backlog (strict order — pull top-down, one at a time)
1 Scheduled Loop cycles + Monday CMO report (email) 2 Approval flows L2 (in-app/email; WhatsApp when verified) 3 Analytics ingestion X/GBP → normalized 4 Audience Twin v0 + inline scores 5 Campaigns full (tabs + add-to-planner) 6 Meta publish (when approved) + IG variants 7 Studio renderer (zero-COGS exports) 8 Razorpay UPI AutoPay 9 Inbox v0 (X mentions + GBP reviews) 10 Guideline-PDF Brand Skin extraction 11 Custom domains (SSL-for-SaaS) 12 Playbooks×3 13 Remix 14 Radar 15 DIFM + stuck-detect 16 Hindi 17 Agency + white-label 18 Public API + MCP 19 Pinterest/Threads/Shorts/Shopify 20 Loop L3.

## 7. Sprint Risks & In-Sprint Cut Line
If behind at CHECKPOINT 2 or H16, cut Alpha items in this exact order (announce, don't slip silently): 6 tours→3 · "Plan my week" v0 · Dashboard CMO polish · Sites v0 (→ backlog #0) · LinkedIn stretch. **Never cut:** RLS, ledger, token vault, real-publish honesty, Stripe webhook idempotency.
| Risk | Plan B |
|---|---|
| X/GBP OAuth fights back (likely) | Time-boxed 90 min each; wt-pub pairs with human; fixture-mode flag keeps UI unblocked |
| Trigger.dev friction | Fallback: Vercel cron + QStash, same task signature |
| Claude usage caps on heavy day | Drop to 2 concurrent sessions; Haiku for search; batch nothing interactive |
| CF sites deploy rabbit-hole | Fallback: static export to Vercel wildcard subdomain, CF later |
| Model JSON drift on Resolve | zod + 1 repair retry + demo-fallback payload (already specced) |

## 8. After the Gate
Day 3+: invite 5 design partners (not 25 — Alpha is thin), watch them, fix, then pull backlog #1. Approvals tracker reviewed daily. When Meta/WhatsApp/Razorpay land, their backlog items unlock. The 30-day plan's launch-hardening list (old v1.0 D19–29) applies before any public launch.
