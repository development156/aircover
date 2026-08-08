# PRD — SAHODA LABS · AI Marketing OS
**Product Requirements Document · v3.0 FINAL · Confidential**
The final blueprint: the complete Sahoda Labs v1 feature set merged with the next-gen design plus the Experience Layer (Brand Skin adaptive theming + the embodied Sahoda guide). **Naming is final: SAHODA LABS** is the company and product; **Sahoda** is the in-app AI persona and mascot — one identity, two hats: your guide and your marketer. Brand system: see 07_Brand_Kit_SAHODA_LABS. v1 feature parity is proven in Appendix P.

---

## 1. Vision & Thesis

**One line:** *Hire an AI marketing employee, not a marketing tool.*

Every SMB tool today (Ocoya, Predis, Blaze, Buffer, Canva+ChatGPT) still makes the founder do the job: think of ideas, prompt, edit, schedule, check results, repeat. The v1 platform's thesis ("learn once, market every day") was right but incomplete — it generated content, it never *closed the loop*.

Sahoda's thesis: **Learn → Plan → Create → Test → Publish → Measure → Learn again — as one autonomous weekly cycle** the user supervises from WhatsApp or the dashboard, with an Autonomy Dial from "suggest only" to full autopilot with guardrails.

**Positioning statement:** For solo founders and micro-SMBs who can't afford a ₹15,000+/mo agency, Sahoda is an AI marketing employee that runs your website, content, campaigns, and replies every day — for less than ₹17/day — and gets measurably better at *your* brand every week.

## 2. Market Position & Pricing Strategy

- **Price leader:** ₹499–₹3,999/mo (India) / $12–$79 (global) vs. Ocoya $15–79, Blaze $69–149, ContentStudio $25–99, SocialBee $29–99. We are 40–60% cheaper at every tier.
- **Margin leader simultaneously** — not by charging more, but by spending less per output: tiered model routing (≈80% of tokens on economy-class models), Brand-Brain prompt caching (50–90% input-token savings on every call), batch APIs for overnight jobs (−50%), and per-call cost telemetry. Competitors run everything interactively on premium models; we don't. Target: **≥75% blended gross margin on AI COGS** (full math in §7).
- **Geo wedge:** India-first (UPI AutoPay via Razorpay/Cashfree from day one, WhatsApp-native, INR pricing, GST invoicing) with global Stripe rails in the same codebase.

## 3. USPs — the eight things nobody ships together

> Verified against the Jan-2026 competitive research (Ocoya, Predis, Blaze, Simplified, ContentStudio, SocialBee, FeedHive, Marky, Durable, 10Web, Jasper). Re-verify "first ever" claims with marketing/legal before public use.

| # | USP | What it is | Why nobody has it |
|---|-----|-----------|-------------------|
| 1 | **Brand Brain™** | A versioned, self-improving business memory (products, offers, voice, winning hooks, taboo list, audience insights). Every generation **reads from it AND writes back to it** — top-performing posts update the voice model; flops get logged as anti-patterns. | Competitors have static "brand kits." None feed real performance data back into the brand model automatically. |
| 2 | **The Loop** | A weekly autonomous cycle: Sahoda plans the week Sunday night, creates drafts, pre-tests them, publishes on approval (or automatically at L3), reads the numbers, and opens Monday with a **CMO Report**: what worked, what changed, this week's plan. Governed by an **Autonomy Dial** (L0 Suggest → L1 Draft → L2 Publish-after-approval → L3 Autopilot with budget + guardrails). | "AI scheduling" exists; a governed closed loop with graduated autonomy and a weekly self-critique does not. |
| 3 | **Audience Twin™** | A synthetic panel of 25–100 persona agents built from your brand research + real follower data. Every post is **pre-flight tested** on the Twin before publishing: predicted engagement score, objections, best variant. Calibrated monthly against your actual results. | Synthetic-persona research tools exist standalone; no marketing OS runs pre-publish simulation on every asset. |
| 4 | **WhatsApp Chat-Ops** | Run the entire OS from WhatsApp: daily plan card with Approve/Edit/Skip buttons, "post this" via voice note, low-credit alerts, lead notifications, CMO report delivery. | Every competitor is dashboard-first and US-centric. First WhatsApp-native marketing OS. |
| 5 | **Performance Credits** | Earn credits back when content beats your rolling benchmark (capped at 10% of monthly allotment). Pricing that pays you for results. | Nobody aligns pricing with outcomes; credit systems are universally punitive and opaque. We also publish exact credit math (a known pain point with Lovable/Bolt/Ocoya). |
| 6 | **Agent-Native (MCP + API)** | The full OS exposed as MCP tools + public REST API — Claude/other agents and agency scripts can operate your marketing. | v1 shipped only a stub `/api/mcp`; no competitor ships a real agent surface. Positions us for the 2026 agentic wave (Gartner: 40% of enterprise apps embedding agents by end-2026). |
| 7 | **Brand Skin™** | Upload your brand guidelines (PDF/images) — or point at your logo/site — and the **entire app re-themes to YOUR brand**: primary, secondary, surfaces, fonts, everywhere. A Readability Guard auto-corrects any combination that fails WCAG-AA contrast so it always stays readable and good-looking. Extends to your generated sites, Studio templates, CMO reports, and client approval pages. One-tap revert in Settings → Customization. | Competitors theme *your content*; none re-skin *their own app* to the customer's brand — and none guarantees the result stays readable. |
| 8 | **Sahoda, the embodied guide** | A cursor-aware mascot that teaches by doing: spotlight tours that fade the screen and keep only the click target bright, speech bubbles, "Show me how" on every feature, stuck-detection, milestone celebrations — plus **Do-It-For-Me mode**, where Sahoda visibly moves the cursor and performs the steps for you (with confirmation before anything spends or publishes). | Wix-style tour bots exist for site builders only; nobody ships an embodied, cursor-gazing guide with Do-It-For-Me across a full marketing OS. |

**Table-stakes done *right*** (fixes to Sahoda's fakes/gaps): real website hosting & deploys (no simulated Netlify URLs), Google Business Profile + review management (huge for local SMBs, absent from nearly all AI-first competitors), genuine analytics ingestion, dual payment rails, honest LinkedIn scoping.

## 4. Personas

1. **Priya — D2C solo founder (primary).** No team, 3 hrs/day lost to marketing. Buys: Loop L2/L3, WhatsApp ops, Instagram+WhatsApp channels. Success = posts go out daily without her.
2. **Ramesh — local business (restaurant/clinic/salon).** Needs GBP posts, review replies, a simple site, WhatsApp broadcasts. Success = more calls/walk-ins.
3. **Arjun — consultant/creator.** LinkedIn+X presence, personal site, newsletter. Success = inbound leads.
4. **Maya — micro-agency (Agency tier).** 5–15 clients. Needs multi-workspace, client approvals, white-label CMO reports, pooled credits, API. Success = serves 2× clients per employee.

## 5. Product Scope — Keep / Upgrade / Add / Remove

### 5.1 Keep & Upgrade (from the v1 codebase)

| v1 feature | Verdict | The upgrade |
|---|---|---|
| 5-step onboarding + AI brand research | **Keep — make it the moat** | 10-minute onboarding that also **auto-ingests** your existing website, Instagram, GBP listing; outputs Brand Brain v1 + a ready first-week plan, not just a PDF-style report. |
| Notion-style post editor + AI captions | Keep | Add per-platform native variants (one draft → LinkedIn/IG/X/GBP/WhatsApp versions), hook library from Brand Brain, Twin score inline. |
| Planner (calendar + Kanban) | Keep | Add approval lane, best-time slots learned from Measure, drag-to-reschedule with conflict checks. |
| AI Campaigns (prompt → 30-day plan) | Keep | Grounded in Brand Brain + Radar data; every campaign post is Twin-tested; one-click "load into Loop." |
| Unified inbox (LinkedIn/X) | Keep, expand honestly | Add Meta comments/DMs, **GBP reviews**, **WhatsApp**. LinkedIn comments shipped only behind a "Partner-pending" flag — never mocked as real. |
| Design studio (Pixy embed) | Keep concept, own the engine | Replace 3rd-party Pixy with our template render service (brand-locked templates, carousels, quote cards); optional Canva connect for power users. |
| Website builder (dual: Bolt-style + sitemap) | **Merge into one** | Single section-based AI builder with chat edits, forms, SEO, **real multi-tenant hosting on our edge with custom domains + SSL**. Code export = advanced mode, not the default UX. |
| Publishing adapters (8 platforms) | Keep pattern | Add **WhatsApp Business** + **Google Business Profile**; per-platform constraint engine (char limits, media specs, link rules) baked in. |
| Credits + Stripe billing | Keep, redesign | Double-entry credit ledger, rollover, Performance Credits, transparent math; **Razorpay UPI AutoPay + Stripe** dual rails (Sahoda deferred UPI — we ship it day one). |
| Cron publish + analytics sync | Keep intent | Move from naive cron routes to durable job orchestration (retries, idempotency, backoff) — see TSD. |
| Public API + MCP stub | Keep | Make both real and documented (see USP 6). |

### 5.2 Add (new to category or new vs Sahoda)
Brand Brain writeback · The Loop + Autonomy Dial + CMO Report · Audience Twin · WhatsApp Chat-Ops · Performance Credits · Competitive **Radar** (watch 1–5 competitors, auto-draft counter-content) · **Remix Engine** (one pillar asset → 10–20 derivatives: posts, carousel, reel script, email, blog, WhatsApp broadcast) · SEO/Blog agent publishing to your Sahoda site · CRM-lite (site forms + WhatsApp leads → simple pipeline with AI follow-up drafts) · Review management · Approval workflows + white-label (Agency) · GST-compliant invoicing · **Brand Skin** adaptive theming with brand-guideline extraction · **Sahoda Guide** (spotlight tours, contextual help, Do-It-For-Me) · **Sandbox demo brand** (practice credit-free on fake data) · **Milestones & streaks** (celebrations + small capped credit rewards) · **Simple/Pro mode** (adaptive UI density) · **Release tours** (30-second guided intro whenever a new feature ships) · **Voice onboarding** — talk to Sahoda instead of typing (P2).

### 5.3 Remove / Demote (with rationale)

| Feature | Decision | Why |
|---|---|---|
| Node-based workflow canvas | **Remove from v1** → replaced by **Playbooks** (curated, parameterized automation recipes: RSS→post, product drop→campaign, new review→reply draft, festival calendar). Canvas returns as Agency power feature in v2 if demanded. | SMBs don't build DAGs; it competes with n8n/Zapier at high build cost and near-zero Starter usage. Playbooks deliver 90% of the value at 10% of the cost. |
| Cobe 3D globe on dashboard | Remove | Vanity visualization with no real data behind it; replace with the CMO Report card. |
| Monaco code editor as primary site UX | Demote to "Advanced mode" | Target users don't edit code; section editor + chat edits is the UX. |
| Simulated Netlify deploy | Remove entirely | Never ship fake success states. Real hosting only. |
| Mock LinkedIn comments | Remove | Honesty > demo theater. Feature-flag until Partner approval; show real status. |
| ElevenLabs voice as core | Demote to add-on | Thin margins, niche demand; pass-through pricing add-on. |

## 6. Requirements by Module (prioritized user stories + acceptance criteria)

**P0 = launch-blocking · P1 = v1 (≤90 days post-launch) · P2 = v2**

### M1 · Onboard & Brand Brain (P0)
- *As a new user, I connect/enter my business in ≤10 min and get Brand Brain v1 + a first-week plan.* **AC:** wizard ≤6 steps; auto-ingest from URL/IG handle/GBP where given; deep research job (async, progress UI) writes `research_reports` + `brand_memory v1`; first-week plan auto-drafted; total cost to user = onboarding bundle (see §7); resumable; demo-safe fallbacks.
- *As a user, I can view/edit/version my Brand Brain.* **AC:** structured editor (voice, offers, products, personas, taboo list, hooks); every AI-writeback creates a diff the user can revert; version history retained 12 months.

### M2 · The Loop (P0 for L0–L2; P2 for L3)
- *As a user, I set an Autonomy Dial per channel.* **AC:** L0 suggest-only, L1 drafts to Planner, L2 publishes after my approval (WhatsApp or app), L3 auto-publishes within guardrails (max posts/day, blocked topics, credit budget/wk, quiet hours). Default L1.
- *Every Sunday, Sahoda plans my week; every Monday I get a CMO Report.* **AC:** weekly cycle job produces 5–7 post briefs grounded in Brand Brain + last week's metrics; CMO Report (top post, worst post, 1 learning written back to Brand Brain, this week's plan) delivered in-app + WhatsApp; cycle cost = 20 credits; skippable/pausable.
- *At L2, one tap approves the day's content.* **AC:** approval card shows preview + Twin score; edits round-trip; unapproved content auto-expires with notice.

### M3 · Create Suite (P0)
- *Post editor:* draft once → per-platform variants respecting each platform's constraints; inline AI rewrite (1 cr), hooks from Brand Brain, hashtag sets, media attach (upload / generate / studio). **AC:** variant validation blocks over-limit publishes; autosave; Twin score button.
- *Campaigns:* prompt + config (duration, count, objective, audience) → structured plan (overview, posts, creative direction, video scripts) with tabs; "Add all to Planner/Loop" is idempotent. 25 cr.
- *Remix Engine (P1):* paste a blog/YouTube/long post → 10–20 platform-native derivatives with source attribution. 15 cr/batch.
- *Studio:* brand-locked templates (own renderer), carousel builder, quote cards; PNG/MP4 export; save to library.

### M4 · Audience Twin (P1)
- *Before publishing, I can test on my Twin.* **AC:** panel of 25 (Starter) / 100 (Growth+) personas seeded from research + follower stats; returns 0–100 score, top objection, suggested fix, best-of-N variant pick; 4 cr/run; runs in <30s (batched economy models); monthly calibration job compares predictions vs. actuals and reports accuracy; disclosed as *predictive, not guaranteed*.

### M5 · Publish (P0)
- Channels at launch: **Instagram, Facebook, X, LinkedIn (self-post), Google Business Profile, WhatsApp broadcast**; P1: Pinterest, Threads, YouTube Shorts; P2: Shopify product-post sync. **AC:** OAuth with AES-encrypted token vault; scheduled publish via durable queue with retries + idempotency keys; per-post publish log with platform IDs; token-expiry detection → WhatsApp/email reconnect nudge; platform failures degrade gracefully (never block other channels).

### M6 · Sites (P0 basic, P1 full)
- *Prompt → live website on a real URL in <5 min.* **AC:** section-based generation (≤5 pages), chat edits (3 cr), forms wired to CRM-lite, SEO meta done, hosted multi-tenant on our edge at `brand.sahoda.site`; custom domain + auto-SSL (P1); site generation 100 cr, **one site included free per paid plan per quarter** (acquisition hook); blog agent publishes SEO articles to the site (10 cr, P1); code export (P1).

### M7 · Engage — Inbox & Reviews (P1)
- Unified threads: Meta comments/DMs, X mentions, GBP reviews, WhatsApp; AI draft reply (1 cr) grounded in Brand Brain; assign, resolve, SLA timer; review-reply Playbook; LinkedIn comments behind Partner flag with visible status.

### M8 · Measure (P0 lite, P1 full)
- Ingest per-platform metrics on schedule → normalized (reach, engagement, clicks, video views); site events + UTM attribution-lite; insights job writes learnings to Brand Brain; powers Loop, Twin calibration, Performance Credits. **AC:** dashboards per channel + per post; data freshness ≤6h; export CSV.

### M9 · Radar (P1)
- Track 1–5 competitors (public pages/sites): weekly digest of their posts/offers + 2 counter-content drafts. 5 cr/competitor/week; Growth+.

### M10 · Playbooks (P1)
- Library of parameterized automations (RSS→draft, product drop→mini-campaign, review→reply draft, festival calendar for India+global, low-engagement→remix trigger). Enable/disable per workspace; every run logged; 2 cr/run.

### M11 · Chat-Ops (P0 for approvals/alerts; P1 full)
- WhatsApp (Cloud API) + optional Slack: daily approval cards, CMO report, lead alerts, low-credit alerts, "create a post about …" text/voice commands mapped to Create actions with confirmation before spend.

### M12 · Platform (P0)
- Workspaces + members + roles (Owner/Editor/Approver/Viewer), invites; Agency: multi-workspace switcher, pooled credits, client-approval links, white-label report PDF (P1).
- Billing: plans below, dual rails (Razorpay UPI AutoPay for INR, Stripe for global), GST invoices, proration, dunning; webhook idempotency.
- Credits: double-entry ledger, live balance, itemized usage ("this action = X credits because …"), rollover cap 2× monthly, top-ups, spend caps + alerts.
- Security/admin: audit log, API keys, data export, delete-my-data.

### M13 · Brand Skin — Adaptive Brand Theming (P0 default themes + logo extraction; P1 guideline-PDF extraction)
- *During onboarding ("Look & Feel" step), I pick a default theme OR make the app wear my brand.* **AC:** three paths — curated default themes; upload brand guidelines (PDF/PNG/JPG ≤25 MB); or auto-extract from my logo/website. Extraction proposes a token set (primary, secondary, accent, neutrals, font pairing) with a live preview on 3 sample screens; the **Readability Guard** auto-adjusts any color pair failing WCAG AA (4.5:1 body text, 3:1 UI) and shows exactly what it changed ("Adjusted primary #1A1A66 → #2B2BAA for readability"); I can accept, tweak per token, or fall back to default. Free — 0 credits.
- *The accepted theme applies across the whole app instantly, and optionally to my generated sites, Studio templates, CMO report PDFs, and client approval pages.* **AC:** applies in <1s without reload; dark-mode variant auto-derived and guard-checked; scope toggles per surface; any workspace member can personally override to the default theme (accessibility) without affecting others.
- *I can revert or manage it anytime in Settings → Customization.* **AC:** version history (last 10), one-tap revert, re-extract anytime, seasonal "occasion packs" (e.g., Diwali accents) apply as an overlay and auto-expire.

### M14 · Sahoda Guide — Embodied Tutorials & Help (P0 core tours + contextual help; P1 Do-It-For-Me + stuck-detection; P2 voice)
- *On my first visit to any module, Sahoda offers a tour — never forces one.* **AC:** spotlight overlay dims the page ~65% while the target area stays fully bright with a pulsing ring; Sahoda's mascot walks/points to the target and its eyes follow my cursor; speech bubbles ≤2 sentences per step; controls: Next / Back / Skip tour / Remind me later / Don't show again; ≤8 steps per tour; progress resumes across sessions and devices.
- *Every major feature has a "Show me how" affordance, and Help search ("How do I schedule a week of posts?") launches the matching live tour.* **AC:** ≥40 tours at launch covering all P0 flows; missing/renamed UI target never breaks a tour (step auto-skips and logs).
- *"Do it for me":* from any tour or help result, Sahoda moves a visible cursor and performs the steps live; I can take over or press ESC to abort instantly; **any step that spends credits or publishes always pauses for my explicit confirmation**; DIFM is disabled on Billing, API-key, and Delete screens.
- *Sahoda notices when I'm stuck* (repeated failed attempts, looping between panels, long idle on complex screens) and gently offers help — max 1 proactive offer per day, fully mutable in settings.
- *Sahoda celebrates my milestones* (first publish, first Loop week, 7-day streak, first site live, first lead) with confetti — Sahoda-v1 heritage — and a small credit reward (caps in §7).
- **Localization & access:** English + Hindi at launch; reduced-motion mode (static mascot, fades only); screen-reader mode (linear numbered checklist with identical copy); full keyboard control. Personality level (Minimal/Friendly/Playful), frequency, and global mute in settings.

### M15 · Delight & Mastery Layer (P1/P2)
- **Sandbox brand:** a demo workspace ("Chai & Chapters," a fictional bookshop) with unlimited demo credits, watermarked output, and nothing ever publishing externally — Sahoda offers it on first login so users can practice risk-free.
- **Simple/Pro mode:** Simple hides advanced controls (Radar, API, code export, advanced scheduling); mastery signals trigger Sahoda to suggest graduating to Pro. Per-user.
- **Release tours:** every shipped feature flagged `tourable` gets an auto-offered 30-second tour, once.
- **Voice onboarding (P2):** speak your answers; Sahoda fills the wizard fields live with visible per-field confirmation.

## 7. Credits & Pricing Economy

### 7.1 Plans

| Plan | India | Global | Monthly credits | Channels | Sites | Loop | Twin | Seats | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Free | ₹0 | $0 | 100 | 2 | 0 (preview only) | L0–L1 | — | 1 | Prove quality; no card required |
| Starter | **₹499** | **$12** | 1,500 | 4 | 1 | L0–L2 | 25-persona | 1 | Undercuts every AI-first rival |
| Growth | **₹1,499** | **$29** | 5,000 | 8 | 3 | L0–L3 | 100-persona | 3 | Radar (3 comps), API, Remix |
| Agency | **₹3,999** | **$79** | 15,000 pooled | 8/client | 10 | L0–L3 | 100 | 10 | 5 client workspaces (+₹599/$15 each), white-label, approvals |

Annual = 2 months free. Top-up: ₹49/$0.60 per 100 credits (priced above plan rate → nudges upgrades). Rollover: unused credits carry to next month, capped at 2× monthly allotment. **Performance Credits:** content beating your 30-day rolling benchmark by ≥25% earns 2 cr back per post, capped at 10% of monthly allotment (COGS-neutral: max giveback ≈ 3% of revenue). **The Experience Layer is free:** theming, guideline extraction, tours, Do-It-For-Me, and Sandbox usage cost 0 credits — they're retention features, and extraction's small vision-model COGS is absorbed as CAC. Milestone rewards: +2 cr each, lifetime cap 20 cr/workspace, counted inside the 10% monthly reward cap.

### 7.2 Action price list, COGS & margin
Credit value ≈ ₹0.30 (Growth basis). COGS bands assume the Margin Engine (§7.3) is active; re-benchmark against live model prices at build (model pricing shifts quarterly).

| Action | Credits | Est. AI COGS (₹) | Gross margin | Routing tier |
|---|---|---|---|---|
| Caption / rewrite / hashtags / inbox reply | 1 | 0.03–0.12 | 60–90% | Economy |
| Post with 5 platform variants | 3 | 0.20–0.40 | 55–78% | Economy |
| Twin pre-flight (25 personas, batched) | 4 | 0.30–0.80 | 33–75% | Nano/batch |
| Image (standard) | 6 | 0.50–1.60 | 10–72% | Flash-image ladder |
| Image (premium) | 12 | 2.20–3.40 | 5–39% | Premium image |
| Carousel (5 slides, own renderer + 1 image) | 8 | 0.80–2.00 | 17–67% | Renderer + economy |
| Video script (60s storyboard) | 3 | 0.15–0.30 | 67–83% | Standard |
| Weekly Loop cycle (plan + briefs + CMO report) | 20 | 1.50–4.00 | 33–75% | Standard + batch + cache |
| Campaign (30-day, ≤20 posts) | 25 | 2.50–5.00 | 33–67% | Standard + cache |
| Deep brand research (onboarding) | 50 | 6.00–12.00 | 20–60% | Research (Sonar-class) |
| Site generation (≤5 pages) | 100 | 12.00–25.00 | 17–60% | Standard + heavy cache |
| Site AI edit | 3 | 0.20–0.50 | 44–78% | Standard |
| SEO blog article (~1,200 words) | 10 | 0.80–2.00 | 33–73% | Standard |
| Radar scan (per competitor/wk) | 5 | 1.00–2.50 | 17–67% | Research/batch |
| Playbook run | 2 | 0.10–0.40 | 33–83% | Economy |
| Voiceover add-on (per min) | 25 | 8.00–14.00 | pass-through+ | External TTS |

**Blended target:** ≥75% gross margin on the expected usage mix (text ≈ 70% of actions). Media and research are strategic thin-margin lines; they drive activation and are volume-capped by credits. Loss-leader: one free site/quarter per paid plan (bounded, high-conversion hook).

### 7.3 The Margin Engine — how we're cheaper AND more profitable
1. **Tiered model routing:** a complexity classifier sends ~80% of tokens to economy-class models (Flash/Haiku-tier), standard-class only when needed, premium only for strategy/site generation. Competitors run premium models for everything.
2. **Brand-Brain prompt caching:** brand context rides on every call; provider prompt caching cuts those input tokens 50–90%.
3. **Batch APIs** for all non-interactive work (Loop planning, Radar, Twin panels, analytics insights) at ~50% discount, run overnight.
4. **Output budgets:** hard `max_tokens` per task; structured outputs prevent rambling.
5. **Cost telemetry:** every AI call logs provider, model, tokens, ₹ cost, credits charged → weekly auto-repricing review; per-workspace spend caps stop abuse.
6. **Cheapest-capable media ladder:** image requests try the cheapest model that meets the brief; premium only on explicit request.

### 7.4 Unit economics illustration (Growth, ₹1,499)
Typical month: 4 Loop cycles (80 cr) + 20 posts w/ variants (60) + 12 images (72) + 20 Twin runs (80) + 1 campaign (25) + 40 replies/rewrites (40) + 4 Radar scans ×3 (60) + misc (83) ≈ **500 credits used of 5,000**. Even a 10× power user stays inside allotment; expected AI COGS ₹90–₹260 → **83–94% gross margin** on realistic usage, with the credit cap as the absolute worst-case bound (≈ 5,000 cr ≈ ₹1,000–1,400 COGS only if fully consumed at worst-case rates — still ≥0 at list price, and rare).

## 8. Success Metrics (KPIs)
- **Activation:** ≥60% of signups complete onboarding; ≥40% publish within 24h; time-to-first-publish median <2h; first-tour completion ≥70%; Brand Skin adoption ≥50% of paid workspaces; "Show me how" usage ≥30% of new users in week 1.
- **Habit:** ≥50% of paid workspaces on Loop L2+ by day 30; weekly active workspaces ≥65%.
- **Monetization:** Free→paid ≥6%; ARPU ₹900+; blended AI gross margin ≥75%; top-up attach ≥8%.
- **Quality:** Twin calibration error <20% MAE by month 3; publish success rate ≥99%; AI fallback-hit rate <2%.
- **Retention:** M3 logo retention ≥70% paid; Agency NRR ≥110%.

## 9. Release Plan
- **Phase 0 — Foundation (wk 0–8):** tenancy+RLS, auth, billing (both rails), credit ledger, Model Mesh, Brand Brain v1, onboarding, post editor, Planner, publish to IG/FB/X/GBP, Measure-lite, WhatsApp alerts. *Private beta.*
- **Phase 1 — Launch (wk 8–16):** Loop L0–L2 + CMO Report, Campaigns, Studio (own renderer), Sites with real hosting, LinkedIn self-post, Chat-Ops approvals, transparent credits UI, **Brand Skin (default themes + logo/site extraction)**, **Sahoda Guide core tours + contextual help**. *Public launch, PH + India GTM.*
- **Phase 2 — Differentiate (wk 16–28):** Audience Twin, Radar, Remix, Playbooks, Engage (Meta/GBP/WhatsApp inbox), custom domains, Agency workspace + white-label, public API + MCP, Pinterest/Threads/Shorts, **guideline-PDF extraction, Sahoda Do-It-For-Me + stuck-detection, Sandbox brand, Milestones, Simple/Pro mode, Release tours**.
- **Phase 3 — Autopilot (wk 28+):** Loop L3 with guardrails, Twin calibration v2, Shopify sync, LinkedIn Partner features (if approved), workflow canvas (if demanded), ads-copy → ads-API exploration, **voice onboarding with Sahoda**.

## 10. Non-Goals (v1)
No paid-ads *buying/spend management*; no email-marketing suite (export/Zapier instead); no native video generation (scripts + templates only); no enterprise SSO/SOC2 (Agency ≠ enterprise); no marketplace.

## 11. Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Platform API gatekeeping (Meta review, LinkedIn Partner, X pay-per-use fees) | Launch with self-serve-friendly channels (IG/FB/GBP/WhatsApp/X-lite); honest feature flags; X posting costs priced into credits; start LinkedIn Partner application in Phase 0. |
| Model-price volatility squeezes margins | Cost telemetry + monthly repricing rule; multi-provider routing; credits decouple retail price from COGS. |
| Autonomy publishes something wrong (L3) | Guardrails: taboo list, brand-safety classifier pass, budget caps, quiet hours, one-tap kill switch, L3 gated to accounts ≥30 days old. |
| Twin over-promises | Ship as "predicted score," show calibration accuracy publicly, never guarantee outcomes. |
| Single AI-gateway outage | Model Mesh has direct-provider bypass for P0 paths (TSD §4). |
| Low-price brand = "cheap" perception | Lead marketing with the CMO Report + Twin (capability), price as footnote. |

## 12. Open Questions
Trademark & handle registration for SAHODA LABS; ElevenLabs vs. cheaper TTS for the voice add-on; Twin persona count vs. latency tuning; whether Free tier includes 1 published site page; Agency reseller/white-label pricing depth; Sahoda mascot visual design (2D Rive character) and voice.

## Appendix P — Sahoda Labs v1 → Ultimate Parity Matrix
Every function/feature of the original Sahoda Labs codebase, and where it lives now. Nothing is lost; "Replaced" items have a strictly superior successor.

| Sahoda Labs v1 feature | Status | Where in Ultimate |
|---|---|---|
| 5-step onboarding + AI brand research | Upgraded | M1 (adds auto-ingestion, Brand Brain, Look & Feel theme step) |
| Dashboard analytics + AI Insights chat | Upgraded | M8 dashboards + insights; chat retained (1 cr/msg) |
| Cobe 3D globe | Removed | Replaced by CMO Report card (§5.3 rationale) |
| Notion-style post editor + AI captions/hashtags | Upgraded | M3.1 with per-platform variants + Constraint Engine |
| Planner (calendar + Kanban, hold/approve/queue) | Upgraded | M3/M2 with approval lane + learned best-time slots |
| AI Campaigns (tabs incl. video scripts, add-all-to-planner) | Upgraded | M3.2, Twin-tested, "Load into Loop" |
| Smart Inbox (LinkedIn + X) + AI replies + assign/resolve | Upgraded | M7 (+Meta, GBP reviews, WhatsApp; LinkedIn comments behind honest Partner flag) |
| Pixy Design Studio (templates, layers, PNG export) | Replaced in kind | M3.4 own renderer (zero-COGS exports) + optional Canva connect |
| Node workflow canvas + dry-run console | Replaced | M10 Playbooks (canvas returns as v2 Agency option if demanded) |
| Website builder — Bolt-style code workspace | Merged | M6 advanced mode + code export |
| Website builder — sitemap style + slug publishing | Upgraded | M6 with real Cloudflare hosting, custom domains, SSL |
| Simulated Netlify deploy | Removed | Real deploys only (TSD §8) |
| Site forms + submissions endpoint | Upgraded | M6 forms → CRM-lite leads + Chat-Ops alerts |
| Connections directory (LinkedIn/Meta/X, Shopify, WooCommerce, WordPress, Figma, OpenAI, ElevenLabs, Stripe) | Kept, curated | M5/M12; WooCommerce via Playbook webhook; Figma/WordPress = P2 connectors; ElevenLabs = voice add-on |
| Publishing adapters: LinkedIn, Meta, X, Pinterest, Threads, YouTube Shorts, Shopify | Kept + expanded | M5 (+WhatsApp Business, Google Business Profile) |
| Credits wallet + `deduct_credits_atomic` + transactions log | Upgraded | §7 + TSD double-entry ledger with holds & Performance Credits |
| Stripe 3-tier billing + webhook | Upgraded | M12 dual rails: Razorpay UPI AutoPay + Stripe, GST invoices |
| Cron: publish-posts / run-queue / sync-analytics | Upgraded | Durable job workflows with retries + idempotency (TSD §1, §7) |
| Public v1 API (posts, campaigns) + api_keys | Upgraded | TSD §13 full REST v1 + outbound webhooks |
| `/api/mcp` stub | Realized | USP 6, TSD §13 MCP server |
| Marketing-leads landing capture | Kept | Landing + M6 leads pipeline |
| System-status page | Kept | M12 admin |
| Resilient Demo Mode (local JSON DB) | Replaced | Seeded staging env + user-facing Sandbox brand (M15) |
| Canvas-confetti celebrations | Kept & elevated | M14 milestone celebrations |
| AES token encryption, RLS, rate limiting, Resend email | Kept, hardened | TSD §3 |
| Idempotency / security / validation test suites | Expanded | TSD §12 |
| Multi-model routing (OpenRouter, task-scoped keys) | Upgraded | TSD §4 Model Mesh (tiers + direct-provider bypass + caching + batch) |
