# 22f — Unit economics and break-even (Phases 6 and 7)

Source commit: c8faa34, worktree wt-web
Generated: 2026-08-17
Model prices as of: 2026-08-16 (OpenRouter /api/v1/models), corroborated 2026-08-17 (platform.claude.com/docs/en/about-claude/pricing)
FX rate: 95.50 INR/USD. Sources: x-rates monthly average Aug 2026 = 95.30; Wise spot 95.60 on 2026-08-16; RBI reference rate 95.410 on 2026-08-13; midpoint used. Reverse-charge GST is OUTSIDE every INR cost figure in this file. USD vendor costs are converted at 95.50 and nothing else is added. The 18 percent RCM on imported services is a separate cash item, recoverable but paid in cash first, and it is never folded into a COGS or margin figure here.
Zernio: 4.80 USD per connected account per month. This is the VOLUME rate as documented, not a launch or introductory rate. The source sentence reads "a per-account cost line, roughly $4.80/account at volume" at docs/17_One_Week_Beta_Plan_SAHODA_LABS.md:63, and the same sentence instructs asking Zernio what the cap counts. No rate card exists in the repo, so this figure is DISPUTED. Cap scenario assumed in this file: All three shown: S1 per connected account, S2 per active account, S3 per profile. S1 is the headline case.
Plan resolution assumption: the subscriptions table is assumed EMPTY in production. Nothing in the repo writes it, so every workspace resolves to DEFAULT_PLAN 'free' and the AS-IS cost figures follow from that. The recommended tier table assumes subscriptions will be written in future so that the channel and site fences actually operate.
This file: 7 MEASURED, 11 INFERRED

## Blended ARPU and contribution

Plan mix assumed at Solo 65 percent, Business 30 percent and Studio 5 percent. INFERRED, because a self-serve SMB product skews hard to the entry paid tier and no data exists. Strategy A is the price-leader ladder at ₹1,499 and ₹2,999; Strategy B is the recommended ladder at ₹2,499, ₹4,999 and ₹9,999.

| Zernio scenario | A ARPU | A contribution | B ARPU | B contribution |
|---|---:|---:|---:|---:|
| S1 per connected account | ₹1,618 | ₹347 | ₹2,986 | ₹1,683 |
| S2 per active account | ₹1,618 | ₹950 | ₹2,986 | ₹2,302 |
| S3 per profile | ₹1,618 | ₹1,095 | ₹2,986 | ₹2,462 |

## LTV, maximum affordable CAC, payback

```
LTV                = monthly_contribution / monthly_churn
max affordable CAC = LTV / 3
payback months     = CAC / monthly_contribution
```

Maximum affordable CAC is derived from the prices rather than assumed as a target. Under the per-connected-account reading:

| Monthly churn | A LTV | A max CAC | B LTV | B max CAC | B payback at max CAC |
|---|---:|---:|---:|---:|---:|
| 5% | ₹6,946 | ₹2,315 | ₹33,664 | ₹11,221 | 6.7 months |
| 8% | ₹4,342 | ₹1,447 | ₹21,040 | ₹7,013 | 4.2 months |
| 12% | ₹2,894 | ₹965 | ₹14,026 | ₹4,675 | 2.8 months |

Under the per-profile reading, Strategy B's LTV at 5 percent churn is ₹49,249 and maximum CAC ₹16,416.

India-specific SMB SaaS CAC was not obtainable after six targeted searches across Chargebee, SaaSBoomi, Bessemer, Chiratae-Zinnov and Inc42. The global band is $200 to $500, which is ₹19,100 to ₹47,750 at 95.50, with the source set stating comparable regions run 40 to 60 percent lower, so ₹9,550 to ₹23,875 is the honest Indian estimate and it is an estimate.

Product-led and founder-led content have effectively zero marginal CAC and fit under both strategies. This is the only channel that certainly works. WhatsApp communities and agency partner programs are low cost and unmeasured, and fit the product's WhatsApp-native positioning. Paid acquisition fits under Strategy B at 5 to 8 percent churn only, and only at the bottom of the plausible CAC band; it does not fit under Strategy A at any churn rate. That is a strategy constraint rather than a footnote. Strategy A is an organic-only business whether or not that was intended.

## Churn, and the retention the top tier must carry

At 12 percent monthly churn a customer lasts 8.3 months. Strategy B clears three-to-one LTV to CAC at all three modelled churn rates provided CAC stays at or below ₹4,675, which only organic channels achieve. Strategy A clears three-to-one at 5 percent churn and ₹2,315 CAC, a combination no paid channel delivers.

Indian SMB SaaS at low price points churns hard and there is a specific local driver: RBI's recurring-mandate rules produce involuntary churn, and the mandatory 24-hour opt-out notice fires before every debit. Modelling below 8 percent would be optimistic. At 8 percent churn on the recommended ladder the top tier has to carry the blend. Studio's ₹6,365 contribution is 3.8 times Solo's ₹1,073, so a Studio customer is worth nearly four Solo customers, and the expansion path from Solo upward is where net revenue retention has to come from. There is no seat expansion available because seats are unenforceable, so retention expansion must come from tier upgrades and channel additions and nothing else. That is a narrow base, and it argues for building the seat fence before it is needed.

## The free tier decision

Per-signup cost is the free brand resolve at ₹6.96, plus the monthly carry of a free workspace until it converts. The channel grant, not the trial shape, is what decides this, so both free-tier designs are computed. The comparison column is the recommended ladder's maximum affordable CAC at 5 percent monthly churn, ₹11,221.

With one channel granted, the placeholder shape, carry is ₹497 per month, because the workspace holds a connected account for as long as it exists and a free user has no reason to ever leave.

| Option | Conversion | Months carried | COGS per signup | Effective CAC per paid customer | Versus max affordable CAC |
|---|---:|---:|---:|---:|---|
| Open free tier, no card | 3.5% | 6 | ₹2,990 | ₹85,429 | exceeds by 7.6 times |
| Time-limited trial, 14 days, no card | 18.0% | 0.5 | ₹256 | ₹1,420 | affordable |
| Card-required trial, 14 days | 25.0% | 0.5 | ₹256 | ₹1,022 | affordable |

With zero channels granted, the recommended shape, carry falls to ₹39 per month because all that remains is a little inference and a share of the fixed platform floor.

| Option | Conversion | Months carried | COGS per signup | Effective CAC per paid customer | Versus max affordable CAC |
|---|---:|---:|---:|---:|---|
| Open free tier, no card | 3.5% | 6 | ₹240 | ₹6,846 | affordable |
| Time-limited trial, 14 days, no card | 18.0% | 0.5 | ₹26 | ₹146 | affordable |
| Card-required trial, 14 days | 25.0% | 0.5 | ₹26 | ₹105 | affordable |

Every ₹1 of free-tier COGS becomes ₹1 divided by the conversion rate of CAC per paid customer. At the 3.5 percent freemium rate that multiplier is 28.6 times, which is why a cost that looks trivial per signup becomes decisive per customer. Conversion figures are global benchmarks; no India-specific figure exists.

The recommendation is an open free tier with zero connected channels. Generation, planning and drafting are free, and connecting a channel, which is where the entire cost sits, is what requires payment. At ₹6,846 effective CAC that is comfortably inside the affordable band even at the pessimistic 3.5 percent freemium conversion, and it puts the paywall exactly where the marginal cost is rather than at an arbitrary usage threshold.

This inverts the intuition and is worth stating plainly. The instinct is that a free tier is unaffordable and needs a card-required trial to fix it. The arithmetic says the free tier was never the problem; the free channel was. Take the channel away and the open free tier is fine, which matters commercially because Buffer's free plan at three channels is the competitive floor in this category and a card-required trial cannot answer it. A card-required trial remains the right choice if top-of-funnel quality matters more than volume, since it produces the lowest effective CAC of any option at ₹105, but it is now a positioning decision rather than a financial necessity.

## The monthly opex floor

| Scenario | ₹ per month | Basis |
|---|---:|---|
| Founders unpaid, survival | ₹96,810 | one paid engineer, founders drawing nothing, CA retainer |
| Founders paid at lean rates | ₹2,91,810 | engineer ₹86,250, designer ₹65,000, founder ₹1,00,000, marketer ₹30,000, CA ₹10,000 |
| Full market rate | ₹4,22,226 | AmbitionBox 3 to 6 year medians at face value |

Salary figures are annual CTC from AmbitionBox, so employer PF is already inside them and adding 12 percent on top would double-count. Excluded and not guessed at: office or coworking rent, team laptops, software licences, insurance. Every opex figure is a floor.

## Customers to break even

```
customers = monthly_opex / blended_contribution_per_customer
```

| Zernio | Opex scenario | Opex | A contribution | A customers | B contribution | B customers |
|---|---|---:|---:|---:|---:|---:|
| S1 | Founders unpaid | ₹96,810 | ₹347 | 279 | ₹1,683 | 58 |
| S1 | Founders paid | ₹2,91,810 | ₹347 | 841 | ₹1,683 | 174 |
| S1 | Full market | ₹4,22,226 | ₹347 | 1,216 | ₹1,683 | 251 |
| S2 | Founders paid | ₹2,91,810 | ₹950 | 308 | ₹2,302 | 127 |
| S3 | Founders paid | ₹2,91,810 | ₹1,095 | 267 | ₹2,462 | 119 |

The spread is the whole story. The recommended ladder needs 174 paying customers to pay four people at lean rates. The price-leader ladder needs 841. Reaching 174 is a plausible first year for a founder-led Indian SMB product. Reaching 841 is a different company with a different funding profile, and it has to be reached on organic acquisition only, because the price-leader ladder cannot afford paid.

## Where the margins get good

Blended gross margin reaches 75 to 85 percent and net operating margin clears 20 percent on the recommended ladder somewhere around 500 to 600 customers under the per-connected-account reading, and around 250 to 300 under the per-profile reading. What must be true there: the Supabase compute step to medium has fired at plus $60 a month, Clerk has cut over to a production instance at plus $25 a month and stays flat to 50,000 monthly retained users, the free brand resolve has a bound on it, and support is still one person's part-time job rather than a hire. That last condition is the fragile one. At 500 customers and 10 minutes each, support is 83 hours a month, which is half a person.
