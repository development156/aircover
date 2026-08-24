# 22g — Scale and margin risk (Phase 8)

Source commit: c8faa34, worktree wt-web
Generated: 2026-08-17
Model prices as of: 2026-08-16 (OpenRouter /api/v1/models), corroborated 2026-08-17 (platform.claude.com/docs/en/about-claude/pricing)
FX rate: 95.50 INR/USD. Sources: x-rates monthly average Aug 2026 = 95.30; Wise spot 95.60 on 2026-08-16; RBI reference rate 95.410 on 2026-08-13; midpoint used. Reverse-charge GST is OUTSIDE every INR cost figure in this file. USD vendor costs are converted at 95.50 and nothing else is added. The 18 percent RCM on imported services is a separate cash item, recoverable but paid in cash first, and it is never folded into a COGS or margin figure here.
Zernio: 4.80 USD per connected account per month. This is the VOLUME rate as documented, not a launch or introductory rate. The source sentence reads "a per-account cost line, roughly $4.80/account at volume" at docs/17_One_Week_Beta_Plan_SAHODA_LABS.md:63, and the same sentence instructs asking Zernio what the cap counts. No rate card exists in the repo, so this figure is DISPUTED. Cap scenario assumed in this file: S1 per connected account for the trajectory and the aggregator comparison; S3 per profile shown alongside.
Plan resolution assumption: the subscriptions table is assumed EMPTY in production. Nothing in the repo writes it, so every workspace resolves to DEFAULT_PLAN 'free' and the AS-IS cost figures follow from that. The recommended tier table assumes subscriptions will be written in future so that the channel and site fences actually operate.
This file: 14 MEASURED, 12 INFERRED

## Per-unit cost trajectory

| Workspaces | Fixed total | Fixed per workspace | AI per workspace | Zernio S1 | Total S1 | Total S3 |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | ₹5,253 | ₹52.53 | ₹34 | ₹917 | ₹1,004 | ₹545 |
| 1,000 | ₹10,983 | ₹10.98 | ₹34 | ₹917 | ₹962 | ₹504 |
| 10,000 | ₹23,875 | ₹2.39 | ₹34 | ₹917 | ₹954 | ₹495 |
| 100,000 | ₹2,05,325 | ₹2.05 | ₹34 | ₹917 | ₹953 | ₹495 |

Almost nothing falls with scale. The fixed allocation collapses from ₹52 to ₹2, which is worth ₹50 per workspace and then stops mattering. AI does not fall AS-IS because the levers that would make it fall are absent: batch is never called and caching delivers zero. Aggregator publishing does not fall at all, because it is linear in connected accounts by construction, and no volume discount is known to exist because no rate card is known to exist.

Clerk gets actively worse. It is priced per monthly retained user, flat while under the 50,000 included and then rising toward the marginal rate. At 100,000 monthly retained users with the B2B add-on the bill is roughly $1,125 a month against $125 at 10,000. This is a per-customer vendor cost. Cost of exit: Clerk is a dependency of apps/web only, but the session JWT is the Supabase RLS credential, it gates 18 server actions and 4 route handlers, and both keys are boot-fatal. That is a contained but real migration and it is cheapest to do before the production-key cutover rather than after.

## Aggregator versus direct platform integration

Stated as a cost comparison, not a recommendation. The aggregator cost is per connected account and does not fall with scale. Direct integration converts that into engineering cost, which is largely fixed.

The aggregator side, at two connected channels per workspace and ₹917 per workspace per month:

| Workspaces | Aggregator total per month | Per workspace |
|---:|---:|---:|
| 1,000 | ₹9,17,000 | ₹917 |
| 10,000 | ₹91,70,000 | ₹917 |
| 100,000 | ₹9,17,00,000 | ₹917 |

The direct side, all INFERRED, priced at the engineer cost of ₹86,250 per month used in the opex floor:

| Component | Value | Basis |
|---|---:|---|
| Build, four platforms | ₹4,77,825 one-off | 6 engineer-weeks per platform for OAuth, token refresh, publish, media and error handling, times four platforms, at ₹86,250 per engineer-month |
| Meta App Review preparation | ₹64,688 one-off | 3 engineer-weeks for screencasts, privacy policy and business verification |
| Build amortised over 36 months | ₹15,070 per month | total one-off ₹5,42,513 divided by 36 |
| Ongoing platform API maintenance | ₹43,125 per month to 10,000 workspaces, ₹1,29,375 at 100,000 | 0.5 FTE rising to 1.5 FTE; platform APIs deprecate on their own schedule regardless of user count, but incident surface grows |
| Variable direct cost per workspace | ₹10 per month, low ₹5 and high ₹25 | media processing, storage and egress on R2 at $0.015 per GB-month with free egress, plus token refresh calls |

| Workspaces | Direct total per month | Per workspace | Aggregator per workspace |
|---:|---:|---:|---:|
| 1,000 | ₹68,195 | ₹68.20 | ₹917 |
| 10,000 | ₹1,58,195 | ₹15.82 | ₹917 |
| 100,000 | ₹11,44,445 | ₹11.44 | ₹917 |

Crossover volume, being the workspace count at which direct integration becomes cheaper than the aggregator, solving fixed_direct plus 10n equals 917n:

| Case | Crossover | Assumptions |
|---|---:|---|
| Low | 32 workspaces | half the build cost, 0.25 FTE maintenance |
| Base | 64 workspaces | the table above |
| High | 128 workspaces | double the build cost, 1.0 FTE maintenance |
| Base under the per-profile reading | 130 workspaces | aggregator at ₹458 per workspace instead of ₹917 |

Four things this comparison excludes, each of which favours the aggregator and none of which is priced here. Time to market: the build is calendar months during which nothing publishes. Platform risk: Instagram publishing depends on Meta App Review, which can be delayed or refused, and there is no cost line for that outcome. Switching cost: only the aggregator has a credential today, because openSecret is deliberately unwired at `apps/jobs/src/publish/deps.ts:74-76`, so direct is not a switch but a build. And the input itself: the $4.80 rate is DISPUTED, so the crossover moves with it.

## Scaling levers, ranked by rupees saved

| Lever | ₹ per workspace per month saved | Basis |
|---|---:|---|
| Renegotiate or replace the aggregator | ₹458 | S1 to S3 on two channels; the single largest line in the model |
| Cut the image attach rate, or self-host rendering | ₹16.80 | images are 48.8 percent of AI COGS and no lever touches them |
| Batch the weekly Loop | ₹4.24 | minus 50 percent, and a four-hour SLA is fine for a scheduled job |
| Honour the recorded routing decision for brand_guidelines | ₹1.44 | one-off per signup; the bake-off already justified it |
| Make the cached prefix clear the minimum | ₹0.71 | needs a prefix above 4,096 tokens on haiku; currently about 175 |
| Supabase Storage to R2 for media egress | not quantified | R2 egress is free against $0.09 per GB; per-attachment byte volumes unknown |

The ranking is unambiguous and uncomfortable. The entire Margin Engine sits below the vendor conversation in value by roughly two orders of magnitude. At 1,000 active workspaces, finishing every remaining lever is worth ₹4,834 a month. Getting a different answer on what the aggregator's cap counts is worth ₹4,58,400 a month.

## The margin killers, named

1. A power user on the dearest action inside an allotment that does not bind. The allotment is 9 to 89 times the designed burn, so it is not a cap.
2. The free first brand resolve. A full sonnet call, zero credits, no counter, no rate limit, unbounded by design and documented as such in the code at `apps/web/src/lib/onboarding/read-brain.ts:43-47`.
3. inbox_reply and the publish platform write. Both reachable, both spending real vendor budget, both charging nothing. There is no action key for the publish write at all.
4. A repair billing twice for one output, with a larger input the second time because it resends everything.
5. Free-tier conversion below plan while consuming the onboarding research and, worse, the ₹458 to ₹917 per month aggregator carry for as long as the workspace exists.
6. A model price rise with no hot repricing path. `pricing.config.json` is a build-time import and `turbo.json` lists it under globalDependencies, so repricing one credit is a code edit plus a full cold rebuild plus a deploy.
7. Rupee depreciation at about 8.9 percent a year against USD-denominated vendor costs with a fixed INR price.
8. The 18 percent reverse charge on foreign vendor spend, paid in cash and locked up an inferred 2 to 7 months. Section 49(4) forbids paying reverse charge from input credit, and export-heavy revenue produces no output GST to offset it against, so it accumulates as a permanently outstanding receivable proportional to vendor spend.
9. Support at the bottom tier. ₹108 a month at the high band against a price-leader contribution of ₹245.
10. Involuntary churn from the mandatory 24-hour pre-debit opt-out notice, at every price, on every renewal.
