# 22e — The fork and the recommendation (Phase 5)

Source commit: c8faa34, worktree wt-web
Generated: 2026-08-17
Model prices as of: 2026-08-16 (OpenRouter /api/v1/models), corroborated 2026-08-17 (platform.claude.com/docs/en/about-claude/pricing)
FX rate: 95.50 INR/USD. Sources: x-rates monthly average Aug 2026 = 95.30; Wise spot 95.60 on 2026-08-16; RBI reference rate 95.410 on 2026-08-13; midpoint used. Reverse-charge GST is OUTSIDE every INR cost figure in this file. USD vendor costs are converted at 95.50 and nothing else is added. The 18 percent RCM on imported services is a separate cash item, recoverable but paid in cash first, and it is never folded into a COGS or margin figure here.
Zernio: 4.80 USD per connected account per month. This is the VOLUME rate as documented, not a launch or introductory rate. The source sentence reads "a per-account cost line, roughly $4.80/account at volume" at docs/17_One_Week_Beta_Plan_SAHODA_LABS.md:63, and the same sentence instructs asking Zernio what the cap counts. No rate card exists in the repo, so this figure is DISPUTED. Cap scenario assumed in this file: S1 (per connected account) for the headline tables, with S3 (per profile) quoted alongside as the optimistic bound.
Plan resolution assumption: the subscriptions table is assumed EMPTY in production. Nothing in the repo writes it, so every workspace resolves to DEFAULT_PLAN 'free' and the AS-IS cost figures follow from that. The recommended tier table assumes subscriptions will be written in future so that the channel and site fences actually operate.
This file: 11 MEASURED, 8 INFERRED

## Strategy A, price leader

The original intent: materially undercut everyone, win on volume and word of mouth, accept thinner margins. Modelled at the aggressive end of what the cost floor permits.

| Tier | INR incl GST | USD | Channels | Sites | Credits |
|---|---:|---:|---:|---:|---:|
| Free | ₹0 | $0 | 1 | 0 | 200 |
| Solo | ₹1,499 | $19 | 2 | 1 | 1,500 |
| Business | ₹2,999 | $39 | 4 | 3 | 4,000 |

Consequences under the per-connected-account reading:

| Tier | Net revenue | Marginal COGS | Gross margin | Contribution |
|---|---:|---:|---:|---:|
| Free | ₹0 | ₹493 | n/a | −₹493 |
| Solo | ₹1,226 | ₹951 | 22.4% | ₹245 |
| Business | ₹2,468 | ₹1,868 | 24.3% | ₹570 |

Blended ARPU ₹1,618 and blended contribution ₹347. Under the per-profile reading those become ₹1,618 and ₹1,095.

## Strategy B, value priced

Priced against the employee and agency anchor rather than the SaaS anchor. Fewer customers, higher ARPU, headroom to absorb a model price shock or a support surprise.

| Tier | INR incl GST | USD | Channels | Sites | Credits |
|---|---:|---:|---:|---:|---:|
| Free | ₹0 | $0 | 0 | 0 | 200 |
| Solo | ₹2,499 | $29 | 2 | 1 | 1,500 |
| Business | ₹4,999 | $59 | 4 | 3 | 4,000 |
| Studio | ₹9,999 | $119 | 4 | 10 | 12,000 |

Consequences under the per-connected-account reading:

| Tier | Net revenue | Marginal COGS | Gross margin | Contribution |
|---|---:|---:|---:|---:|
| Free, zero channels | ₹0 | ₹39 | n/a | −₹39 |
| Solo | ₹2,054 | ₹951 | 53.7% | ₹1,073 |
| Business | ₹4,124 | ₹1,868 | 54.7% | ₹2,226 |
| Studio | ₹8,264 | ₹1,868 | 77.4% | ₹6,365 |

Blended ARPU ₹2,986 and blended contribution ₹1,683. Under the per-profile reading those become ₹2,986 and ₹2,462, with Solo at 76.0 percent and Business at 88.1 percent gross margin.

## The argument, bluntly

Strategy B. Strategy A is not a strategy, it is a loss.

At ₹1,499 for two channels gross margin is 22.4 percent. That is not a thin margin taken deliberately in exchange for volume; it is below the level at which the business can absorb anything at all. One support ticket at the high band costs ₹108 against a contribution of ₹245, so two tickets erase the customer. Rupee depreciation of about 9 percent a year against USD-denominated vendor costs takes roughly a third of the remaining gross margin every year, with no repricing path faster than a full rebuild and deploy.

The acquisition arithmetic closes the argument. Strategy A's maximum affordable CAC at the three-to-one threshold is ₹2,315 at 5 percent monthly churn and ₹965 at 12 percent. The global SMB SaaS CAC band is $200 to $500, and the source set states comparable regions run 40 to 60 percent lower, so a plausible Indian figure is ₹9,550 to ₹23,875. Paid acquisition does not fit inside Strategy A by a factor of four to ten. That means Strategy A can only be built on organic and founder-led channels, which is not a choice being made deliberately here. It is a constraint the price imposes.

Strategy B's maximum affordable CAC is ₹11,221 at 5 percent churn and ₹4,675 at 12 percent. At the low end of the plausible Indian CAC band paid acquisition is marginal but not foreclosed. That is the difference between having an option and not having one.

The known risk of price leadership in SMB SaaS is real and all of it applies here: it selects for the customers who churn hardest and support heaviest, it caps affordable CAC to the point of foreclosing paid acquisition, and raising prices later is close to impossible. In this market it is worse than usual, because RBI puts an opt-out notice in front of every customer 24 hours before every renewal. A price rise on a base acquired at ₹1,499 would meet that notice on the way out.

The known risk of value pricing is equally real: an unknown brand with no proof cannot command a premium. The mitigation is that ₹2,499 is not a premium against the right anchor. It is 8.0 percent of a tier-1 junior hire at ₹31,400 a month and 35.7 percent of the cheapest published agency package at ₹7,000 a month. The premium only looks like a premium against Buffer and Zoho, and against those the product is not competing on the same axis. Zoho gives twelve channels and no autonomy; this gives four channels and does the work.

What breaks first if Strategy B is wrong is the top of the funnel. At ₹2,499 against a median MSME digital-marketing budget under ₹10,000 a month, the addressable population is materially smaller than at ₹999. If conversion comes in below 2 percent the answer is not to cut the price. It is that the buyer is wrong, and the product should be sold to agencies and multi-location businesses where Studio's economics are strongest and ₹9,999 is a rounding error against a real marketing budget.

What breaks first if Strategy A is wrong is everything at once, and quietly. Thin contribution means the loss per customer only becomes visible at volume, by which time the base is acquired at a price that cannot be raised.

## Two consequences of the recommendation, in plain terms

What a free user at zero channels can actually do: everything except the last step. They can complete onboarding and build a Brand Brain, run the weekly Loop and get five briefs, generate per-channel post variants, rewrite captions, generate images, and preview a generated site in the app. What they cannot do is connect a social account, and therefore cannot publish or schedule anything or read an inbox. The product demonstrates itself completely and stops at the point where it starts costing ₹458 per connected account per month. That is the whole reason a free tier is affordable at all: carry falls from ₹497 a month with one channel to ₹39 a month with none.

What the RBI per-debit cap does to annual billing: it removes the cash flow that an annual discount normally buys. A two-months-free annual plan is conventionally worth taking because it collects twelve months of revenue up front. Here, every paid tier on the recommended ladder prices above the ₹15,000 AFA-free ceiling when billed annually, Solo included at ₹24,990. That means no annual plan can auto-renew on the Indian rails. Annual becomes an invoice you chase or a card charge the customer must re-authenticate, so you give away two months of revenue and get manual collection in return. On the recommended ladder the annual discount is not worth offering unless a customer specifically asks for it and is willing to be invoiced.

## The condition on all of it

Both strategies are computed against a Zernio figure that is one hedged sentence in a beta plan. Under the per-connected-account reading the recommended Solo tier earns 53.7 percent gross margin; under the per-profile reading it earns 76.0 percent. That single unanswered question moves gross margin by 22 percentage points and break-even by 55 customers. No pricing decision here should be treated as final until Zernio's rate card is in hand. What the model does support today is the shape: channels as the primary fence, three paid tiers, value-priced rather than price-led, and credits demoted from meter to fair-use guard.
