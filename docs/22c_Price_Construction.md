# 22c — Bottom-up price construction (Phase 3)

Source commit: c8faa34, worktree wt-web
Generated: 2026-08-17
Model prices as of: 2026-08-16 (OpenRouter /api/v1/models), corroborated 2026-08-17 (platform.claude.com/docs/en/about-claude/pricing)
FX rate: 95.50 INR/USD. Sources: x-rates monthly average Aug 2026 = 95.30; Wise spot 95.60 on 2026-08-16; RBI reference rate 95.410 on 2026-08-13; midpoint used. Reverse-charge GST is OUTSIDE every INR cost figure in this file. USD vendor costs are converted at 95.50 and nothing else is added. The 18 percent RCM on imported services is a separate cash item, recoverable but paid in cash first, and it is never folded into a COGS or margin figure here.
Zernio: 4.80 USD per connected account per month. This is the VOLUME rate as documented, not a launch or introductory rate. The source sentence reads "a per-account cost line, roughly $4.80/account at volume" at docs/17_One_Week_Beta_Plan_SAHODA_LABS.md:63, and the same sentence instructs asking Zernio what the cap counts. No rate card exists in the repo, so this figure is DISPUTED. Cap scenario assumed in this file: All three carried side by side: S1 per connected account, S2 per active account, S3 per profile.
Plan resolution assumption: the subscriptions table is assumed EMPTY in production. Nothing in the repo writes it, so every workspace resolves to DEFAULT_PLAN 'free' and the AS-IS cost figures follow from that. The recommended tier table assumes subscriptions will be written in future so that the channel and site fences actually operate.
This file: 9 MEASURED, 5 INFERRED

## Minimum viable price

```
net_required   = (marginal_COGS + fixed_allocation + support) / (1 - target_GM)
gross_received = net_required / (1 - effective_MDR)
display_price  = gross_received x 1.18            [GST-inclusive presentation]
```

Effective MDR is 2.301 percent, being the 1.95 percent Cashfree UPI headline rate plus 18 percent GST on the fee. At 100 active workspaces, base usage, 75 percent target gross margin:

| Channels | Cost S1 | Min price S1 | Cost S2 | Min price S2 | Cost S3 | Min price S3 |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | ₹570 | ₹2,755 | ₹341 | ₹1,648 | ₹570 | ₹2,755 |
| 2 | ₹1,029 | ₹4,970 | ₹570 | ₹2,755 | ₹570 | ₹2,755 |
| 4 | ₹1,946 | ₹9,399 | ₹1,029 | ₹4,970 | ₹570 | ₹2,755 |

Read the S1 column against the placeholder table of ₹499, ₹1,499 and ₹3,999. Under the literal reading of Zernio's billing the placeholder Starter price does not cover the cost of the channels it grants, and the placeholder Agency price does not cover four channels either. This is not a pricing preference; it is arithmetic on the one vendor figure that exists.

## The worst-case bound

A tier whose worst-case COGS exceeds net revenue has unbounded downside and cannot ship. Worst case here means the entire allotment spent on the dearest reachable action, at the high token band, with a repair on every call.

| Plan | Grant | Placeholder price | Net revenue | Worst-case COGS | Verdict |
|---|---:|---:|---:|---:|---|
| Free | 100 | ₹0 | ₹0 | ₹62 | UNBOUNDED |
| Starter | 1,500 | ₹499 | ₹413 | ₹924 | UNBOUNDED |
| Growth | 5,000 | ₹1,499 | ₹1,241 | ₹3,080 | UNBOUNDED |
| Agency | 15,000 | ₹3,999 | ₹3,311 | ₹9,240 | UNBOUNDED |

All four fail, free included. The lever is not the price. It is that the allotment does not bind, so spending the whole allotment on the expensive action is a scenario the product permits at every tier. Cutting the allotment to something near actual consumption is what closes this, and it costs nothing in customer value because at the designed cadence of 169 credits per month nobody can reach the current ceiling anyway.

## Fencing

Scored on the only dimensions the code can enforce today.

| Fence | Tracks value | Tracks cost | Enforceable | Gameable | Verdict |
|---|---|---|---|---|---|
| channels | yes, more reach | yes, Zernio bills per account | yes, `oauth/zernio/start/route.ts:89-91` | no | PRIMARY |
| sites | yes, a website is a distinct job | partly, a one-off opus call | yes, `site-generate.ts:126-134` | no | SECONDARY |
| seats | yes | weak | no, there is no invite path at all | n/a | unavailable |
| loopLevel | yes | yes | no, feature unbuilt | n/a | unavailable |
| twinSize | yes | yes | no, feature unbuilt | n/a | unavailable |
| credits | weak | no, misses Zernio and the fixed floor entirely | yes | does not bind | not a fence |
| client workspaces | yes | yes | no, not a plan dimension | n/a | unavailable |

Channels is the good fence, and rarely so: it tracks willingness to pay and tracks cost one for one. A customer who wants more reach is a customer who costs more to serve, in the same proportion. That is the honest kind of fence, where the customer self-selects and the price follows the cost without anyone having to police it.

The constraint is that only four channels exist. `packages/shared/src/enums.ts:8` is `z.enum(['x', 'gbp', 'linkedin', 'instagram'])`, while the placeholder plan table sells eight to Growth and Agency. A ladder of one, two and four separates at most three tiers.

## The top-up rate on the recommended ladder

Derived rather than asserted. Implied per-credit rates on the recommended ladder, whose prices are ₹2,499 for 1,500 credits, ₹4,999 for 4,000 and ₹9,999 for 12,000:

| Tier | Implied ₹ per credit, gross | Implied ₹ per credit, net of GST |
|---|---:|---:|
| Solo | ₹1.666 | ₹1.412 |
| Business | ₹1.250 | ₹1.059 |
| Studio | ₹0.833 | ₹0.706 |

The floor a top-up must clear is ₹0.833, the cheapest rate on the ladder, not the dearest. A pack at ₹499 for 400 credits, which is ₹1.25 per credit, clears it by 50 percent, so upgrading stays strictly cheaper per credit than topping up at every point on the ladder.

## Tier count and shape

Three paid tiers is convention rather than law, and here the fences happen to support exactly three. Channels gives one, two and four. Sites gives a second axis at zero, one, three and ten. A fourth tier aimed at agencies has no enforceable fence: client workspaces are not a plan dimension, seats cannot be enforced, and channels is already exhausted at four. The recommended ladder adds a fourth tier anyway, fenced only on sites, and that is its weak point rather than its strength.
