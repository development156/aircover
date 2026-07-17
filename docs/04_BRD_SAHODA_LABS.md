# BRD — SAHODA LABS
**Business Requirements Document · v1.0 · Confidential**
Companions: PRD/FSD/TSD v3.0 FINAL · 05_Product_Roadmap · 06_UXUI · 07_Brand_Kit. The TSD doubles as the SDD.

---

## 1. Executive Summary
SAHODA LABS sells an **AI marketing employee** to businesses that can't afford one: it learns the business once (Brand Brain), then plans, creates, pre-tests, publishes, and measures marketing every week (The Loop), supervised from WhatsApp. Revenue = subscriptions (₹499/₹1,499/₹3,999 · $12/$29/$79) metered by a credit economy engineered for **≥75% blended AI gross margin** while undercutting every AI-first competitor by 40–60%. India-first go-to-market (UPI AutoPay, WhatsApp-native, Hindi), global-ready from day one.

## 2. Business Objectives (first 12 months)
| # | Objective | Key results |
|---|---|---|
| O1 | Launch fast | Public launch by Day 30 of build (Roadmap M5); private beta Day 10 |
| O2 | Prove demand | 2,000 free workspaces + 300 paid by Month 3; 1,000 paid by Month 6 |
| O3 | Protect margin | Blended AI gross margin ≥75% every month; weekly repricing ritual in place |
| O4 | Prove the moat | ≥50% of paid workspaces on Loop L2+ by day 30 of their life; Twin MAE <20% by Month 3 |
| O5 | Expand ARPU | Agency tier live by Month 2; Agency NRR ≥110%; top-up attach ≥8% |
| O6 | Own the brand | sahodalabs.com relaunched on our own Sites product; all social handles active and run by our own Loop ("Sahoda markets Sahoda") |

## 3. Market Opportunity (from 2026 research; directional)
AI-in-marketing is ~USD 35B in 2026 growing to ~USD 82B by 2030 at ~25% CAGR (Grand View Research). Gartner projects 40% of enterprise apps will embed task-specific agents by end-2026 and 60% of brands will use agentic AI for 1:1 interactions by 2028 — the category is moving from "AI features" to "AI employees," which is exactly our positioning. The wedge: **60M+ Indian MSMEs**, agency retainers starting ₹15,000+/month, and every credible AI-first competitor (Ocoya, Predis, Blaze, ContentStudio, SocialBee) priced $27–149/month, dashboard-only, US-centric, with no WhatsApp, no UPI, no GBP focus, and no closed learning loop.

## 4. Target Customers & Value
| Persona | Pain | What they buy | Willingness to pay |
|---|---|---|---|
| Solo D2C founder | 3 hrs/day lost to marketing; can't afford agency | Loop L2/L3 + IG/WhatsApp + Studio | ₹499–1,499 |
| Local business (clinic/restaurant/salon) | Invisible on Google; reviews unmanaged; no site | GBP + reviews + Sites + WhatsApp broadcasts | ₹499–1,499 |
| Consultant/creator | Inconsistent LinkedIn/X presence; no personal site | Loop + LinkedIn/X + Sites + SEO blog | ₹499–1,499 |
| Micro-agency (5–15 clients) | Serve more clients per employee | Multi-workspace, approvals, white-label, API | ₹3,999+ seats |

## 5. Revenue Model
Streams: (1) subscriptions — Free / Starter ₹499·$12 / Growth ₹1,499·$29 / Agency ₹3,999·$79, annual = 2 months free; (2) credit top-ups at ₹49·$0.60 per 100 (priced above plan rate to nudge upgrades); (3) Agency expansion — extra client workspaces ₹599·$15; (4) voice add-on (pass-through+); (5) later: public API metered tiers, white-label. Performance Credits give-back is capped at 10% of monthly allotment (≈3% of revenue worst case) and is a retention feature, not a discount program. Full action-level pricing, COGS bands, and the Margin Engine are canonical in PRD §7.

## 6. Unit Economics Framework (assumptions flagged, revisit monthly)
- **ARPU target:** ₹900+ blended (mix of Starter/Growth/Agency).
- **Gross margin:** ≥75% on AI COGS via the Margin Engine (tiered routing, prompt caching, batch, telemetry). Realistic-usage modeling shows 83–94% on Growth (PRD §7.4); the credit cap bounds worst case.
- **CAC targets:** organic/community ≤₹300; paid ≤₹1,200 blended.
- **Retention & LTV:** target M3 paid logo retention ≥70% ⇒ average paid lifetime ≥8 months ⇒ LTV ≈ ₹900 × 0.75 × 8 ≈ **₹5,400**; LTV:CAC ≥ 4 even at paid-CAC ceiling.
- **Fixed base (pre-scale):** infra + tools ₹40–80k/month + founder time; **contribution break-even ≈ 300–600 paid subs** depending on mix — inside the O2 target.
- **Scenario sketch (MRR / est. AI COGS at conservative 60% realized margin):** 500 subs ≈ ₹4.5L / ₹1.8L · 2,000 ≈ ₹18L / ₹7.2L · 10,000 ≈ ₹90L / ₹36L. Treat as a planning frame, not a forecast.

## 7. Go-To-Market
**Motion:** product-led (real free tier proves output quality) + founder-led content.
**Channels, in priority order:** (1) **Dogfooding as marketing** — our own Loop runs SAHODA LABS' IG/X/LinkedIn publicly, with the CMO Report shared build-in-public; the marketing site is built on our own Sites product. (2) WhatsApp founder/D2C communities and MSME groups (India). (3) Instagram Reels for SMB how-tos (Hindi + English). (4) Product Hunt + X build-in-public for global. (5) **Agency partner program** — rev-share + white-label; agencies are the highest-ARPU channel. (6) SEO via our own blog agent. (7) Marketplace/directory listings (Clerk/Supabase/Cloudflare showcases, AI tool directories).
**Launch sequence:** waitlist from Day 9 (teaser on Sites) → design-partner beta D10 → soft launch D27–29 → public launch D30 (PH + India communities) — per Roadmap.
**Sales-assist** only for Agency tier (demo + onboarding call).

## 8. Operational Requirements
Support: in-app Sahoda guide first-line, WhatsApp support line, 24h response SLA, help center generated from FSD. Content ops: tours, templates, festival calendar, Hindi parity. AI cost ops: weekly margin review + repricing rule (TSD §11 alerts). Trust & safety: pre-publish brand-safety pass, sites abuse scanning, platform-policy compliance. Finance ops: dual-rail reconciliation, GST invoicing, credit-ledger audit (sum-of-entries invariant). Legal/compliance: DPDP (India) + GDPR alignment, ToS/Privacy/DPA live before beta, trademark filing for SAHODA LABS, platform developer-policy adherence (Meta/X/LinkedIn/Google/WhatsApp).

## 9. Stakeholders & Ownership (adapt to actual team)
| Area | Owner (default) |
|---|---|
| Product/PRD, pricing, cut-lines | Founder/CEO |
| Engineering & TSD, security | Founding engineer (or CEO + Claude Code per field guide) |
| Design/Brand/UX | Design lead (docs 06/07 as source of truth) |
| Growth/GTM, communities | Founder/CEO |
| Support & content ops | Shared until Month 2 hire |
| Finance/compliance | Founder + CA (GST) |

## 10. Dependencies & Constraints
External approval gates (canonical list + lead times + fallbacks in Roadmap §2): Meta app review, X paid API, LinkedIn (self-post now; Partner program long-lead), WhatsApp business verification + templates, Google Business Profile API, YouTube quota, Stripe activation, Razorpay KYC, Cloudflare SSL-for-SaaS/DNS. Vendor dependencies: model providers (multi-provider Mesh mitigates), Clerk, Supabase, Trigger.dev, Cloudflare. Budget constraint: bootstrap-friendly — launch infra <₹1L/month.

## 11. Assumptions (testable)
SMBs will trust an AI to publish after a 2-week approval habit (validate in beta via L2→L3 upgrade rate). WhatsApp approvals materially lift retention (A/B in beta). Credit transparency reduces bill-shock churn vs competitors. India price points hold without devaluing the global $ tiers. One founder + Claude Code parallel workflow sustains the 30-day plan (field-guide assumptions).

## 12. Business Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Platform approval slip breaks launch story | Launch channels that don't need review (X, GBP, WhatsApp-after-verification, LinkedIn self-post); honest "pending" states; Roadmap fallbacks |
| Model price spike compresses margin | Multi-provider routing, monthly repricing rule, credits decouple retail from COGS |
| Price leader = "cheap" perception | Lead marketing with CMO Report/Twin capability; price as footnote; premium brand system (07) |
| Free-tier abuse / AI cost blowout | Hard credit caps, spend alerts, abuse heuristics, sandbox for tourists |
| Low free→paid | Onboarding "wow" (Look & Feel theming + first-week plan), 1 free site/quarter hook, WhatsApp nudges |
| Competitor copies pricing | Moat is compounding: Brand Brain data + Twin calibration + Loop history can't be copied by a price cut |
| Founder bandwidth | Ruthless cut-line policy (Roadmap §6); agency tier deferred features |

## 13. Success / Exit Criteria per Phase
**Beta exit (D18 gate):** ≥15 active design partners, ≥60% completed onboarding, ≥40% published within 24h, publish success ≥99%, zero cross-tenant incidents.
**Launch go/no-go (D29):** billing live-mode verified both rails, P0=0, security review clean, rollback tested, support macros ready, status page live.
**Month-3 review:** O2/O3 metrics on track else re-plan pricing/GTM; decide Agency-tier investment level; decide LinkedIn Partner continuation.
