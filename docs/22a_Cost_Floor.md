# 22a — The true cost floor (Phase 1)

Source commit: c8faa34, worktree wt-web
Generated: 2026-08-17
Model prices as of: 2026-08-16 (OpenRouter /api/v1/models), corroborated 2026-08-17 (platform.claude.com/docs/en/about-claude/pricing)
FX rate: 95.50 INR/USD. Sources: x-rates monthly average Aug 2026 = 95.30; Wise spot 95.60 on 2026-08-16; RBI reference rate 95.410 on 2026-08-13; midpoint used. Reverse-charge GST is OUTSIDE every INR cost figure in this file. USD vendor costs are converted at 95.50 and nothing else is added. The 18 percent RCM on imported services is a separate cash item, recoverable but paid in cash first, and it is never folded into a COGS or margin figure here.
Zernio: 4.80 USD per connected account per month. This is the VOLUME rate as documented, not a launch or introductory rate. The source sentence reads "a per-account cost line, roughly $4.80/account at volume" at docs/17_One_Week_Beta_Plan_SAHODA_LABS.md:63, and the same sentence instructs asking Zernio what the cap counts. No rate card exists in the repo, so this figure is DISPUTED. Cap scenario assumed in this file: S1 (per connected account) as headline, with S2 and S3 shown as sensitivity.
Plan resolution assumption: the subscriptions table is assumed EMPTY in production. Nothing in the repo writes it, so every workspace resolves to DEFAULT_PLAN 'free' and the AS-IS cost figures follow from that. The recommended tier table assumes subscriptions will be written in future so that the channel and site fences actually operate.
This file: 24 MEASURED, 9 INFERRED

## Cost per action

Formula for a text action:

```
cost        = (input_tokens x input_rate + output_tokens x output_rate) / 1,000,000
repair_cost = ((input + output + 40) x input_rate + output x output_rate) / 1,000,000
expected    = cost + repair_rate x repair_cost
```

The repair resends every original message plus the failed output, so its input is larger than the original's (`packages/mesh/src/engine.ts:131-144`). There is no retry loop, no backoff and no timeout anywhere in `packages/mesh/src`, so a repair is the only thing that doubles a call.

Output token counts are MEASURED from `packages/mesh/src/token-budget.ts`. Input counts are INFERRED by rendering the real prompt strings at roughly 4 characters per token, because no prompt_tokens measurement exists for six of the eight tasks. Repair rate 5 percent is INFERRED from the only observation that exists: brand_extract went from 5-in-6 before the token-ceiling fix to 0-of-7 after.

| Action | Credits | Model | AS-IS | AS-DESIGNED | Engine saves | Low | Worst case |
|---|---:|---|---:|---:|---:|---:|---:|
| caption_rewrite | 1 | haiku-4.5 | ₹0.137 | ₹0.117 | 14.5% | ₹0.123 | ₹0.377 |
| post_variants | 3 | haiku-4.5 | ₹0.529 | ₹0.503 | 4.9% | ₹0.475 | ₹1.243 |
| loop_cycle | 20 | sonnet-5 | ₹1.958 | ₹0.953 | 51.3% | ₹1.833 | ₹4.172 |
| image_standard | 6 | gemini-2.5-flash-image | ₹3.696 | ₹3.696 | 0.0% | ₹3.696 | ₹3.696 |
| brand_research | 50 | sonnet-5 | ₹2.879 | ₹1.440 | 50.0% | ₹2.698 | ₹6.358 |
| site_generate | 100 | opus-4.8 | ₹10.567 | ₹10.413 | 1.5% | ₹9.942 | ₹43.621 |

The worst case for site_generate is more than four times its base because its output figure is a floor rather than a measurement, as `token-budget.ts:81-82` says outright, and the hard ceiling is twice that floor.

## What each Margin Engine lever is actually worth

| Action | Baseline | Caching would save | Batch would save | Routing would save |
|---|---:|---:|---:|---:|
| caption_rewrite | ₹0.137 | 14.5% | n/a | n/a |
| post_variants | ₹0.529 | 4.9% | n/a | n/a |
| loop_cycle | ₹1.958 | 2.6% | 50.0% | n/a |
| brand_research | ₹2.879 | 0.0% | n/a | 50.0% |
| site_generate | ₹10.567 | 1.5% | n/a | n/a |

Caching is the lever the spec pack leans on hardest and today it saves nothing at all. The mechanism ships and is syntactically correct: `packages/mesh/src/providers/openrouter.ts:14-16` sets cache_control ephemeral on the Brand Brain block. But that block renders to 701 characters, about 175 tokens, and the minimum cacheable prefix is 4,096 tokens on Haiku 4.5 and 1,024 on Sonnet 5 and Opus 4.8 (MEASURED, platform.claude.com/docs/en/about-claude/pricing, 2026-08-17). It fails on all four tasks that declare it under either reading of how the minimum is measured. The column above is what caching would save if the prefix qualified.

Batch is worth a real 50 percent on loop_cycle and nothing anywhere else, because loop_cycle is the only genuinely deferrable action. The other five are interactive and a user watching a spinner cannot wait four hours.

Routing is worth 50 percent on brand_research alone. That is the one tier divergence in the codebase: `routing.ts:61` records the decision to run brand guidelines on Haiku after a bake-off that measured equal specificity at a fraction of the cost, and `brand-guidelines.ts:39` still says standard. TASK_TIER is dead code and each task file's own def.tier wins.

## The usage profile, derived from product defaults

PlanWeekOutputSchema ends in `.length(5)` (`packages/shared/src/mesh/tasks.ts:241`) and the system prompt says "EXACTLY 5 briefs". One Loop deterministically produces five post ideas. Everything else is a conversion rate off those five.

| Band | Loops per month | Variants | Images | Rewrites | Sites | Credits burned |
|---|---:|---:|---:|---:|---:|---:|
| Low | 2.0 | 4.0 | 0.6 | 2.0 | 0 | 58 |
| Base, the designed weekly cadence | 4.33 | 15.2 | 4.5 | 4.3 | 0.05 | 169 |
| High | 4.33 | 21.6 | 13.0 | 20.0 | 0.25 | 274 |

| Plan | Grant | Multiple of designed burn | Multiple of heaviest burn |
|---|---:|---:|---:|
| Free | 100 | 0.6x | 0.4x |
| Starter | 1,500 | 8.9x | 5.5x |
| Growth | 5,000 | 29.6x | 18.2x |
| Agency | 15,000 | 88.9x | 54.6x |

A credit allotment that is nine to eighty-nine times what the product can actually consume is not a limit. It cannot create upgrade pressure, cannot cap downside, and cannot differentiate a tier. The placeholder grants were set against placeholder consumption; real consumption is bounded by what the product can do, and the product does five briefs a week.

## AI COGS per active workspace per month

| Band | AS-IS | AS-DESIGNED | Engine saves |
|---|---:|---:|---:|
| Low | ₹8.52 | ₹6.37 | 25.3% |
| Base | ₹34.41 | ₹29.57 | 14.0% |
| High | ₹78.92 | ₹73.45 | 6.9% |

Image generation is 48.8 percent of AI COGS at the base mix and no lever touches it, because it is a per-image meter rather than a token meter. That single fact is why the entire Margin Engine is worth 14 percent rather than the 50 to 80 percent the spec pack implies. The levers are aimed at tokens and half the token bill is not tokens.

## Zernio, and the arithmetic in full

This multiplies through every COGS figure in every part, so it is reconstructed here line by line rather than left as a number.

```
Rate                     $4.80 per connected account per month
                         VOLUME rate as documented, not launch or introductory pricing
                         Source: docs/17_One_Week_Beta_Plan_SAHODA_LABS.md:63
                         "a per-account cost line, roughly $4.80/account at volume"
                         Tag: DISPUTED. No rate card exists in the repo.

Accounts per workspace   2      (the free plan grants 2 channels; PLAN_CATALOG free.channels)
Monthly USD              $4.80 x 2                       = $9.60 per workspace per month
FX                       x 95.50 INR/USD                 = ₹916.80 per workspace per month
Rounded                  ₹917

Reverse-charge GST       EXCLUDED from the ₹917 and from every COGS figure in this pack.
                         If included as a cash item: ₹916.80 x 1.18 = ₹1,081.82 per month,
                         recoverable under section 54(3) but paid from the cash ledger first
                         and locked up an inferred 2 to 7 months on export-heavy revenue.
```

Three cap readings are carried forward rather than averaged.

| Channels | S1 per connected account | S2 per active account at 50% | S3 per profile |
|---:|---:|---:|---:|
| 1 | ₹458 | ₹229 | ₹458 |
| 2 | ₹917 | ₹458 | ₹458 |
| 4 | ₹1,834 | ₹917 | ₹458 |

Against ₹34.41 per month of AI, a two-channel workspace under S1 costs 27 times more to keep on the publishing rail than to run the AI for. The PRD's headline target of at least 75 percent blended gross margin on AI COGS measures a denominator that is roughly 4 percent of the marginal cost of serving a customer.

One caveat with teeth. All publish-driven cost is currently zero, because SAHODA_PUBLISH_MODE defaults to fixture and three other flags default off (`apps/jobs/src/env.ts:90,:113,:115,:171`), and their runtime values are unknown. But Zernio bills on connected accounts, and connecting a channel is a live OAuth flow that works today, so the account cost may accrue even while publishing is switched off.

## One-time cost per signup, charged to nobody

| Path | Billed calls | Cost | Credits collected |
|---|---:|---:|---:|
| URL or sentence door | 1 | ₹2.72 | 0 |
| PDF door, free engine succeeds | 2 | ₹6.96 | 0 |
| PDF door, OCR escalation, both calls repair | 5 | ₹34.36 | 0 |

The first brand resolve is free and unbounded. The gate asks whether the workspace has ever saved a Brand Brain, not whether it has ever spent credits, and `apps/web/src/lib/onboarding/read-brain.ts:43-47` records the hole in its own words. No rate limiter guards the server action.

## Per-transaction, support, and the fixed floor

UPI MDR is 1.95 percent exclusive of GST, which the vendor states explicitly, giving 2.301 percent effective. UPI AutoPay charges ₹5 per debit below ₹1,000 and ₹15 at or above, a threshold that triples the fee. Mandate creation is ₹7.50 one-time. Refund and chargeback fees are not published on any fetchable Cashfree page.

Support is ₹25 per customer per month at the base band and ₹108 at the high band, INFERRED, because there is no ticket data, no support tooling in the repo, and no customer-facing email exists at all.

The fixed platform floor is $55 per month, or ₹5,253 per month, today. Clerk is $0 because production runs a development instance. Trigger.dev, Cloudflare, Resend and Sentry are $0 because they are not deployed, not used, or on free tiers.

## Fully-loaded cost to serve one active workspace for one month

At 100 active workspaces, two connected channels, Zernio S1:

| Band | AI | Zernio | Fixed allocation | Support | AS-IS total | AS-DESIGNED total |
|---|---:|---:|---:|---:|---:|---:|
| Low | ₹9 | ₹917 | ₹53 | ₹25 | ₹1,003 | ₹1,001 |
| P50 base | ₹34 | ₹917 | ₹53 | ₹25 | ₹1,029 | ₹1,024 |
| P90 high | ₹79 | ₹917 | ₹53 | ₹108 | ₹1,156 | ₹1,151 |

Marginal cost is stated separately from the fixed allocation. The fixed line falls with scale, Zernio does not, and Zernio is the largest component at every band. The AS-IS and AS-DESIGNED columns differ by five rupees, which is the honest measure of what the unbuilt Margin Engine is worth at the workspace level.

| Scenario | 1 channel | 2 channels | 4 channels |
|---|---:|---:|---:|
| S1 per connected account | ₹570 | ₹1,029 | ₹1,946 |
| S2 per active account | ₹341 | ₹570 | ₹1,029 |
| S3 per profile | ₹570 | ₹570 | ₹570 |
