# 22i — Audit trail of MEASURED figures

Source commit: c8faa34, worktree wt-web
Generated: 2026-08-17
Model prices as of: 2026-08-16 (OpenRouter /api/v1/models), corroborated 2026-08-17 (platform.claude.com/docs/en/about-claude/pricing)
FX rate: 95.50 INR/USD. Sources: x-rates monthly average Aug 2026 = 95.30; Wise spot 95.60 on 2026-08-16; RBI reference rate 95.410 on 2026-08-13; midpoint used. Reverse-charge GST is OUTSIDE every INR cost figure in this file. USD vendor costs are converted at 95.50 and nothing else is added. The 18 percent RCM on imported services is a separate cash item, recoverable but paid in cash first, and it is never folded into a COGS or margin figure here.
Zernio: 4.80 USD per connected account per month. This is the VOLUME rate as documented, not a launch or introductory rate. The source sentence reads "a per-account cost line, roughly $4.80/account at volume" at docs/17_One_Week_Beta_Plan_SAHODA_LABS.md:63, and the same sentence instructs asking Zernio what the cap counts. No rate card exists in the repo, so this figure is DISPUTED. Cap scenario assumed in this file: Not applicable. This file records sources only and derives nothing.
Plan resolution assumption: the subscriptions table is assumed EMPTY in production. Nothing in the repo writes it, so every workspace resolves to DEFAULT_PLAN 'free' and the AS-IS cost figures follow from that. The recommended tier table assumes subscriptions will be written in future so that the channel and site fences actually operate.
This file: 46 MEASURED, 0 INFERRED

Every figure the model treats as MEASURED, with the file and line, query, or URL and date it came from. Any figure not listed here is INFERRED and carries a stated low, base and high rather than a source.

| Figure | Value | Source |
|---|---|---|
| Model prices, haiku-4.5 | $1.00 in, $0.10 cached, $5.00 out per 1M | openrouter.ai/api/v1/models, 2026-08-16; platform.claude.com/docs/en/about-claude/pricing, 2026-08-17 |
| Model prices, sonnet-5 | $2.00 / $0.20 / $10.00 | same; the $2/$10 rate is confirmed permanent, the scheduled rise to $3/$15 will not occur |
| Model prices, opus-4.8 | $5.00 / $0.50 / $25.00 | same |
| Image model | $0.0387 per 1024x1024 image | openrouter.ai/api/v1/models, 2026-08-16 |
| Aggregator markup on tokens | 0 percent | openrouter.ai/docs/faq, 2026-08-16 |
| Batch discount | minus 50 percent on both legs | platform.claude.com pricing, 2026-08-17 |
| Minimum cacheable prefix | 4,096 haiku, 1,024 sonnet and opus | platform.claude.com/docs/en/build-with-claude/prompt-caching, 2026-08-17 |
| Cache multipliers | 1.25x 5-minute write, 2x 1-hour write, 0.1x read | same |
| Briefs per Loop | exactly 5 | packages/shared/src/mesh/tasks.ts:241, and plan-week.ts:52 |
| Output token ceilings | 512 to 8,192 by task | each task file under packages/mesh/src/tasks/ |
| Observed output tokens | 210 to 2,846 by task | packages/mesh/src/token-budget.ts:32-84 |
| Cached prefix rendered size | 701 characters, 8 lines | packages/mesh/src/brand-context.ts:32-42 |
| Caching mechanism ships | cache_control ephemeral | packages/mesh/src/providers/openrouter.ts:14-16 |
| Batch endpoint calls | none anywhere | repo-wide grep, zero hits |
| Tier routing is dead code | TASK_TIER unread | packages/mesh/src/routing.ts:31; consumer is engine.ts:231 reading def.tier |
| The one tier divergence | brand_guidelines economy vs standard | routing.ts:61 against brand-guidelines.ts:39 |
| Repair mechanism | one retry, larger input | packages/mesh/src/engine.ts:131-144, :312-327 |
| No retry, backoff or timeout | absent | packages/mesh/src, 7 non-test hits all comments |
| Cost estimator is wrong and high | haiku [1,5] and opus [5,25] correct, all else [3,15] | packages/mesh/src/mesh.ts:33-42 |
| cost_usd written, never read | no SELECT anywhere | packages/mesh/src/engine.ts:183 |
| Channels that exist | 4 | packages/shared/src/enums.ts:8 |
| Channel fence enforced | yes | apps/web/src/app/api/oauth/zernio/start/route.ts:89-91 |
| Site fence enforced | yes, before the credit hold | apps/web/src/app/actions/site-generate.ts:126-134 |
| Seats unenforceable | no invite path exists | workspace_members inserted only by two migrations |
| subscriptions never written | only test INSERTs | packages/billing/src/entitlements/pg.ts:49-56 is the sole reader |
| Checkout route absent | does not exist | apps/web/src/app/actions/wallet.ts:88-92 |
| Publish flags default off | fixture, off, off, unset | apps/jobs/src/env.ts:90,:113,:115,:171 |
| Free resolve unbounded | creditsCharged 0, no ledger | apps/web/src/app/actions/onboarding-resolve.ts:193; read-brain.ts:43-47 |
| Repricing needs a deploy | build-time JSON import | packages/shared/src/ledger/pricing.ts:2; turbo.json globalDependencies |
| Aggregator rate | $4.80 per account at volume, DISPUTED | docs/17_One_Week_Beta_Plan_SAHODA_LABS.md:63 |
| Cashfree UPI MDR | 1.95 percent ex-GST | cashfree.com/payment-gateway-charges/, 2026-08-17 |
| Cashfree AutoPay debit | ₹5 under ₹1,000, ₹15 at or above | cashfree.com/recurring-payment/, 2026-08-17 |
| RBI AFA-free ceiling | ₹15,000 per transaction, all rails | rbi.org.in, RBI/DPSS/2026-27/396, 21 April 2026 |
| RBI pre-debit notice | 24 hours, opt-out required | same, section 6(a) |
| GST on software | 18 percent | busy.in/gst-rates/it-services/, updated 2026-08-05; cleartax.in/s/gst-on-software |
| B2C display rule | total in a single figure, not necessarily inclusive | Consumer Protection (E-Commerce) Rules 2020, Rule 4 |
| Export zero-rating | conditional on all five limbs, annual LUT | Section 16 and 2(6) IGST Act |
| Reverse charge | 18 percent, cash ledger only | Section 5(3) IGST Act; Section 49(4) CGST |
| Equalisation levy | fully withdrawn | 2 percent from 2024-08-01, 6 percent from 2025-04-01 |
| DPDP core obligations | in force 14 May 2027 | PIB backgrounder, 17 November 2025 |
| Vercel Pro | $20 per month | vercel.com/docs/plans/pro-plan, 2026-08-17 |
| Supabase Pro | $25 per month | supabase.com/pricing, 2026-08-17 |
| Clerk | $25 Pro, 50,000 MRU included, $100 B2B add-on | clerk.com/pricing, 2026-08-17 |
| Zoho Social INR | ₹900 / ₹2,400 / ₹3,800 ex-GST | techjockey.com/detail/zoho-social, 2026-08-17 |
| ZocialOne INR | ₹1,999 / ₹4,999 / ₹14,999 plus GST | zocialone.ai/pricing, 2026-08-17 |
| Global competitors publishing INR | zero of nine | nine vendor pricing pages, all 2026-08-17 |
| Agency floor | ₹7,000 per month | digitalflo.in/social-media-marketing-packages/, 2026-08-17 |
| Junior hire, tier-1 | ₹31,400 per month fully loaded | ambitionbox.com social media executive, n=9,200, updated 2026-08-14 |
| DIY stack | ₹1,210 lean, ₹3,932 standard | canva.com/en_in/pricing, chatgpt.com/pricing, buffer.com/pricing, all 2026-08-17 |
| MSME marketing spend ceiling | 62.5 percent under ₹10,000 per month | SIDBI 2025 via India SME Forum, secondary |
| FX | 95.50 INR/USD, 8.9 percent annual depreciation | x-rates, Wise, RBI reference, 2026-08-16 |
