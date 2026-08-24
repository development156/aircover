# 22b — Deriving the credit unit (Phase 2)

Source commit: c8faa34, worktree wt-web
Generated: 2026-08-17
Model prices as of: 2026-08-16 (OpenRouter /api/v1/models), corroborated 2026-08-17 (platform.claude.com/docs/en/about-claude/pricing)
FX rate: 95.50 INR/USD. Sources: x-rates monthly average Aug 2026 = 95.30; Wise spot 95.60 on 2026-08-16; RBI reference rate 95.410 on 2026-08-13; midpoint used. Reverse-charge GST is OUTSIDE every INR cost figure in this file. USD vendor costs are converted at 95.50 and nothing else is added. The 18 percent RCM on imported services is a separate cash item, recoverable but paid in cash first, and it is never folded into a COGS or margin figure here.
Zernio: 4.80 USD per connected account per month. This is the VOLUME rate as documented, not a launch or introductory rate. The source sentence reads "a per-account cost line, roughly $4.80/account at volume" at docs/17_One_Week_Beta_Plan_SAHODA_LABS.md:63, and the same sentence instructs asking Zernio what the cap counts. No rate card exists in the repo, so this figure is DISPUTED. Cap scenario assumed in this file: S1 (per connected account) for the fully-loaded column; the AI-only columns are scenario-independent.
Plan resolution assumption: the subscriptions table is assumed EMPTY in production. Nothing in the repo writes it, so every workspace resolves to DEFAULT_PLAN 'free' and the AS-IS cost figures follow from that. The recommended tier table assumes subscriptions will be written in future so that the channel and site fences actually operate.
This file: 8 MEASURED, 4 INFERRED

## A credit is the wrong meter for this product

COGS per credit varies 10.7 times across the six chargeable actions.

| Action | Credits | COGS | COGS per credit | Index |
|---|---:|---:|---:|---:|
| brand_research | 50 | ₹2.879 | ₹0.0576 | 1.0x |
| loop_cycle | 20 | ₹1.958 | ₹0.0979 | 1.7x |
| site_generate | 100 | ₹10.567 | ₹0.1057 | 1.8x |
| caption_rewrite | 1 | ₹0.137 | ₹0.1366 | 2.4x |
| post_variants | 3 | ₹0.529 | ₹0.1762 | 3.1x |
| image_standard | 6 | ₹3.696 | ₹0.6160 | 10.7x |

One currency across a spread this wide means the credit price is set by the blend, and the blend moves with behaviour. The variable that matters is the image attach rate, because image generation is 48.8 percent of AI COGS at the base mix and no cost lever touches it.

| Image attach rate | Monthly AI COGS | Credits burned | COGS per credit |
|---:|---:|---:|---:|
| 10% | ₹23.21 | 150 | ₹0.154 |
| 30%, the base case | ₹34.41 | 169 | ₹0.204 |
| 60% | ₹51.21 | 196 | ₹0.261 |

A 70 percent swing in COGS per credit from one behavioural variable would be acceptable if the credit price carried enough headroom to absorb it. But that is not the real problem.

## The required credit price, and why the exercise breaks

```
price_per_credit = COGS_per_credit / (1 - target_gross_margin)
```

| Target gross margin | AS-IS, AI only | AS-DESIGNED, AI only | AS-IS, fully loaded |
|---|---:|---:|---:|
| 70% | ₹0.680 | ₹0.585 | ₹20.33 |
| 75% | ₹0.816 | ₹0.701 | ₹24.40 |
| 80% | ₹1.020 | ₹0.877 | ₹30.50 |
| 85% | ₹1.360 | ₹1.169 | ₹40.67 |

The PRD's placeholder credit value is ₹0.30. The AI-only column sits in that neighbourhood, which is exactly why the placeholder looked plausible when it was written. The fully-loaded column is twenty-five to thirty times higher, because it carries the aggregator the PRD never modelled. For reference, the fully-loaded figure it divides is ₹1,029 per workspace per month at 100 active workspaces with two channels under the S1 reading, of which ₹917 is the Zernio per-connected-account line.

A credit cannot price this product. Two of the largest cost drivers do not vary with credits consumed at all. Zernio varies with channels connected. The platform floor varies with workspaces existing. A meter that charges for generation while the cost is driven by connection is measuring the wrong thing, and no credit price fixes that. It only moves the error around.

The recommendation that follows is therefore to keep credits as a fair-use ceiling on generation and price the subscription on channels. Credits stop being the pricing mechanism and become the abuse guard they are actually shaped like.

## The top-up check

| Plan | Placeholder price | Grant | Implied ₹ per credit |
|---|---:|---:|---:|
| Starter | ₹499 | 1,500 | ₹0.333 |
| Growth | ₹1,499 | 5,000 | ₹0.300 |
| Agency | ₹3,999 | 15,000 | ₹0.267 |

The placeholder top-up of ₹49 per 100 credits is ₹0.49 per credit, which clears all three of these. But the check as usually stated is the wrong one. The binding comparison is the cheapest plan-implied rate, not the dearest. A customer weighing a top-up against an upgrade compares it to the best per-credit deal available on the ladder, which among the placeholders is Agency at ₹0.267. Price a top-up below that and it eats the upgrade path rather than protecting it. The placeholder happens to clear ₹0.267 as well, so it survives the corrected test too.

No top-up SKU exists in code in any case. `pricing.config.json` has no top-up rate field and no production path writes a TOPUP ledger entry, so it contributes nothing today.
