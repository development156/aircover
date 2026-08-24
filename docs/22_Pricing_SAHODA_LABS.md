# 22 — Pricing and Unit Economics: index and executive summary

Source commit: c8faa34, worktree wt-web
Generated: 2026-08-17
Model prices as of: 2026-08-16 (OpenRouter /api/v1/models), corroborated 2026-08-17 (platform.claude.com/docs/en/about-claude/pricing)
FX rate: 95.50 INR/USD. Sources: x-rates monthly average Aug 2026 = 95.30; Wise spot 95.60 on 2026-08-16; RBI reference rate 95.410 on 2026-08-13; midpoint used. Reverse-charge GST is OUTSIDE every INR cost figure in this file. USD vendor costs are converted at 95.50 and nothing else is added. The 18 percent RCM on imported services is a separate cash item, recoverable but paid in cash first, and it is never folded into a COGS or margin figure here.
Zernio: 4.80 USD per connected account per month. This is the VOLUME rate as documented, not a launch or introductory rate. The source sentence reads "a per-account cost line, roughly $4.80/account at volume" at docs/17_One_Week_Beta_Plan_SAHODA_LABS.md:63, and the same sentence instructs asking Zernio what the cap counts. No rate card exists in the repo, so this figure is DISPUTED. Cap scenario assumed in this file: S1 (per connected account) as headline, with S2 and S3 shown as sensitivity in the parts.
Plan resolution assumption: the subscriptions table is assumed EMPTY in production. Nothing in the repo writes it, so every workspace resolves to DEFAULT_PLAN 'free' and the AS-IS cost figures follow from that. The recommended tier table assumes subscriptions will be written in future so that the channel and site fences actually operate.
This file: 6 MEASURED, 2 INFERRED

## What this is

Phases 0 to 8 of a pricing derivation for an AI marketing product aimed at Indian SMBs. Every price in docs 01 to 12 is a pre-build placeholder and none is carried forward. AS-IS and AS-DESIGNED run side by side and are never blended. Figures come from `finance/recompute.mjs`.

## The seven findings that decide the price

1. AI is not the main cost. The publishing aggregator is, by 27 times: ₹917 per workspace per month against ₹34.41 of AI.
2. The credit grants do not bind. The designed cadence burns 169 credits a month against a Starter grant of 1,500, so credits cannot fence.
3. Two fences exist. Channels and sites are enforced in code; seats, loopLevel and twinSize are declared and enforced nowhere.
4. The placeholder prices lose money under the literal aggregator reading. Two channels cost ₹1,029 fully loaded against a ₹4,970 minimum viable price.
5. Every placeholder tier has unbounded downside, free included, because the allotment does not bind.
6. Zero of nine global competitors publish INR pricing, and the INR-native incumbent sells twelve channels for ₹900 while only four exist here.
7. Price leadership is foreclosed by the cost floor. At ₹1,499 for two channels gross margin is 22.4 percent and maximum affordable CAC is ₹2,315.

## The recommended tier table

Value priced, fenced on channels and sites, GST-inclusive without a GSTIN and exclusive with one. Margins are the per-connected-account case.

| | Free | Solo | Business | Studio |
|---|---|---|---|---|
| INR per month | ₹0 | ₹2,499 | ₹4,999 | ₹9,999 |
| USD per month | $0 | $29 | $59 | $119 |
| Channels | 0 | 2 | 4 | 4 |
| Sites | 0 | 1 | 3 | 10 |
| Monthly credits | 200 | 1,500 | 4,000 | 12,000 |
| Annual | not offered | ₹24,990, manual renewal | ₹49,990, same | ₹99,990, same |
| Top-up pack | none | ₹499 for 400 credits | same | same |
| Gross margin | n/a | 53.7% | 54.7% | 77.4% |
| Contribution | −₹39 | ₹1,073 | ₹2,226 | ₹6,365 |

No price here is final until the aggregator's rate card is in hand. That one question moves gross margin by 22 points and break-even by 55 customers, and it is the only input that can flip the strategy choice.

## The parts

| File | Contents |
|---|---|
| 22a_Cost_Floor.md | Phase 1. Cost per action, lever values, usage profile, aggregator arithmetic, cost to serve. |
| 22b_Credit_Unit.md | Phase 2. Why a credit is the wrong meter; required credit price; top-up check. |
| 22c_Price_Construction.md | Phase 3. Minimum viable price, worst-case bound, fencing, tier count. |
| 22d_Market_Validation.md | Phase 4. Competitors, anchors, willingness to pay, the RBI ceiling, GST, arbitrage. |
| 22e_Recommendation.md | Phase 5. Both strategies, the argument for one, two plain consequences. |
| 22f_Unit_Economics.md | Phases 6 and 7. ARPU, LTV and maximum CAC, churn, free tier, break-even. |
| 22g_Scale_And_Risk.md | Phase 8. Cost at scale, levers ranked, aggregator versus direct integration, margin killers. |
| 22h_Assumptions_And_Open_Questions.md | INFERRED inputs, what would flip the recommendation, ten open questions, four SQL queries. |
| 22i_Audit_Trail.md | Every MEASURED figure with its source. |
