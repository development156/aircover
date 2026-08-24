# 22d — Top-down market validation (Phase 4)

Source commit: c8faa34, worktree wt-web
Generated: 2026-08-17
Model prices as of: 2026-08-16 (OpenRouter /api/v1/models), corroborated 2026-08-17 (platform.claude.com/docs/en/about-claude/pricing)
FX rate: 95.50 INR/USD. Sources: x-rates monthly average Aug 2026 = 95.30; Wise spot 95.60 on 2026-08-16; RBI reference rate 95.410 on 2026-08-13; midpoint used. Reverse-charge GST is OUTSIDE every INR cost figure in this file. USD vendor costs are converted at 95.50 and nothing else is added. The 18 percent RCM on imported services is a separate cash item, recoverable but paid in cash first, and it is never folded into a COGS or margin figure here.
Zernio: 4.80 USD per connected account per month. This is the VOLUME rate as documented, not a launch or introductory rate. The source sentence reads "a per-account cost line, roughly $4.80/account at volume" at docs/17_One_Week_Beta_Plan_SAHODA_LABS.md:63, and the same sentence instructs asking Zernio what the cap counts. No rate card exists in the repo, so this figure is DISPUTED. Cap scenario assumed in this file: Not scenario-dependent. This file contains no COGS figures; the ₹1,834 four-channel carry quoted once is the S1 reading.
Plan resolution assumption: the subscriptions table is assumed EMPTY in production. Nothing in the repo writes it, so every workspace resolves to DEFAULT_PLAN 'free' and the AS-IS cost figures follow from that. The recommended tier table assumes subscriptions will be written in future so that the channel and site fences actually operate.
This file: 31 MEASURED, 4 INFERRED

## The competitor band

Of the nine global tools checked, being Ocoya, Predis, Blaze, Simplified, ContentStudio, SocialBee, FeedHive, Buffer and Later, none publishes INR pricing. FeedHive prices in euros and the other eight in dollars. Predis is a Bengaluru company and still prices in dollars; the discriminator that settles this is that Techjockey, an Indian marketplace, lists Zoho Social in rupees and Predis in dollars on the same site. All fetched 2026-08-17.

What a $29 per month plan actually costs an Indian buyer:

| Buyer | Landed cost | Uplift over spot | Why |
|---|---:|---:|---|
| GST-registered business | ₹2,889 | +4.13% | card FX markup 3.5 percent plus 18 percent GST on the markup; OIDAR GST reclaimable |
| Unregistered consumer | ₹3,409 | +22.87% | same, plus 18 percent OIDAR IGST charged by the vendor and not reclaimable |

The absence of INR pricing among global competitors is a real opportunity, but it is worth about 4 percent to a registered business rather than the 20 percent it first appears. The larger uplift only applies to unregistered buyers, and those are the ones least able to pay in the first place.

The INR-native competition is where the pressure actually is.

| Tool | ₹ per month | What it buys | Tax |
|---|---:|---|---|
| Buffer Free | ₹0 | 3 channels, 10 posts each | n/a |
| PostDesi Pro Creator | ₹399 | 100 post credits, 30 images | not stated |
| Zoho Social Standard | ₹900 | 12 channels, 1 brand, 1 user | ex-GST |
| ZocialOne Essential | ₹1,999 | 3 accounts, 600 AI credits | plus 18 percent GST |
| Zoho Social Professional | ₹2,400 | 12 channels plus publishing tools | ex-GST |
| ZocialOne Professional | ₹4,999 | 10 accounts, 1,500 credits | plus 18 percent GST |

Zoho Social sells twelve channels for ₹900. This product can enforce four, because `packages/shared/src/enums.ts:8` defines exactly four, and under the per-connected-account reading four channels cost ₹1,834 per month to carry. Zoho cannot be beaten on channel count at any price. The competitive position has to be the work removed, not the connections offered.

One dated data point on direction: Later raised Starter 12.5 percent and Growth 25 percent while cutting Growth's social sets and seats by a third, and eliminated its free plan (socialchamp.com/blog/later-pricing, published 2026-06-30). The category is moving up, not down.

## The real alternative

The positioning is an employee rather than a tool, so the honest anchor is a fraction of a salary. All figures fetched 2026-08-17.

| Alternative | ₹ per month | What the buyer gets |
|---|---:|---|
| DIY stack, lean | ₹1,210 | Canva Pro annual plus ChatGPT Go plus Buffer 1 channel. Buyer does all the work |
| DIY stack, standard | ₹3,932 | Canva Pro plus ChatGPT Plus plus Buffer times 3 channels |
| Small agency, published floor | ₹7,000 | DigitalFLO Silver: 2 platforms, 12 static posts plus 2 reels, branded designs, calendar, ad setup, report |
| Small agency, mid | ₹12,000 | 3 platforms, 12 posts plus 4 reels, 2 Meta campaigns |
| Freelancer, floor | ₹15,000 | 8 to 12 posts, 1 to 2 platforms, no video, no ads |
| Junior hire, tier-2 city | ₹26,400 | A whole person. CTC ₹3.0L plus device; employer PF already inside |
| Junior hire, tier-1 city | ₹31,400 | A whole person. CTC ₹3.4 to 3.8L plus device |

The salary comparison flatters and the agency comparison does not.

| Price | Of a tier-1 junior hire | Of the agency floor | Of the standard DIY stack |
|---:|---:|---:|---:|
| ₹1,499 | 4.8% | 21.4% | 38.1% |
| ₹2,499 | 8.0% | 35.7% | 63.6% |
| ₹2,999 | 9.6% | 42.8% | 76.3% |
| ₹4,999 | 15.9% | 71.4% | 127.1% |

The agency floor is the uncomfortable one. ₹7,000 buys twelve static posts plus two reels with design across two platforms from a real agency with a human in it. At ₹2,999 the product is 43 percent of that, which is a discount but not an obvious one, and the agency does the work while this product asks the customer to approve it.

And the demand ceiling sits below all of it. 62.5 percent of Indian MSME owner-managers spend under ₹10,000 a month on digital marketing in total, and only 13 percent actively use digital marketing at all (SIDBI 2025 via India SME Forum, secondary, the primary PDF was not fetched). A ₹4,999 product is half the entire monthly marketing budget of the median addressable buyer.

## Value delivered, honestly

With no users this is thin and INFERRED. The designed output is five briefs a week, roughly twenty posts a month across up to four channels, against an agency's twelve posts plus two reels for ₹7,000. On output alone the product delivers more, at lower design quality, with the customer approving. At ₹300 an hour of founder time and four hours saved a month, that is ₹1,200 a month of time value. It is a floor, it is INFERRED, and it should not be used as a benefit claim until a real cohort produces a real number.

## Willingness to pay, and how to actually find out

WTP cannot be measured without customers and this document will not pretend otherwise. What the alternatives support is a plausible band of ₹1,200 to ₹7,000 per month, bounded below by the DIY stack the buyer already pays for and above by the agency that does the work for them. The MSME spend ceiling argues for the lower half of that band.

One tension has to be named rather than left for the reader to find. The recommended entry price of ₹2,499 is roughly a quarter of the entire monthly marketing budget of the median addressable Indian MSME, and above the midpoint of the plausible WTP band. That is deliberate and it is defensible on one condition: the product is not competing for a slice of a ₹10,000 marketing budget, it is competing to replace the ₹7,000 agency retainer or the ₹3,932 DIY stack that already consumes most of it. If it is bought as an addition rather than a replacement then ₹2,499 is too high and the price is wrong. That is the single most important thing the design-partner cohort should be asked: not what would you pay, but what would you stop paying for.

To get a real answer inside sixty days, three instruments, in this order.

A price-sensitivity ladder on the design-partner cohort. Van Westendorp's four questions, being too cheap, cheap, expensive and too expensive, at n of 20 to 30. Small n is fine for locating a range and is not fine for a point estimate, so the output should be read as an acceptable band rather than as a price.

A launch-page A/B on the entry tier. Three prices, one page, measuring click-through to checkout rather than completed purchase, because checkout does not exist yet and a click on a price is the cleanest signal available before it does. Instrument the price shown, the click and the drop-off point. This needs no billing code and can run immediately.

A cohort of paid design partners at the recommended price. Twenty customers paying the real price for three months tells you more than any survey. What must be instrumented before they arrive: credit_ledger rows by action so the real action mix is known rather than inferred; ai_provider_logs with repaired populated so the real repair rate replaces the 5 percent assumption; connected-channel counts per workspace so the aggregator cost driver is measured rather than modelled; and a support-time log, because support cost per customer is the line most likely to be wrong and it is currently a pure guess.

Given the answer is not in yet, the safer direction to be wrong is high. Raising prices later is close to impossible, because the RBI pre-debit notice puts an opt-out in front of every customer at every renewal, so a price rise is a churn event with a scheduled trigger. Lowering a price is a promotion. Start above where you expect to land.

## The RBI e-mandate ceiling

The governing instrument is the Digital Payments E-mandate Framework 2026, RBI/DPSS/2026-27/396, issued 21 April 2026, MEASURED from rbi.org.in. Section 8, verbatim:

> "All recurring transactions may be authorised without AFA up to ₹15,000/- per transaction. Transactions above this amount shall be subject to AFA. Payment of insurance premiums, subscription to mutual funds, and credit card bill payments may be made without AFA up to ₹1,00,000/- per transaction."

Two things follow and one of them corrects a widely held belief.

UPI AutoPay does not carry a higher limit than cards. The framework applies to cards, PPIs and UPI alike and section 8 draws no distinction. The ₹15,000 ceiling is common to all three rails. A software subscription does not qualify for the ₹1,00,000 enhanced ceiling; the list is closed and enumerated.

₹15,000 is a hard ceiling on any auto-renewing charge. Net of 18 percent GST that is ₹12,711.86 of revenue per debit. Consequences for annual plans at the conventional two-months-free discount:

| Tier | Annual at 10 times monthly | Renews AFA-free? |
|---|---:|---|
| Price-leader Solo at ₹1,499 | ₹14,990 | yes, barely |
| Price-leader Business at ₹2,999 | ₹29,990 | no, card-only or invoice |
| Recommended Solo at ₹2,499 | ₹24,990 | no |
| Recommended Business at ₹4,999 | ₹49,990 | no |
| Recommended Studio at ₹9,999 | ₹99,990 | no |

So annual billing above roughly ₹1,250 per month equivalent cannot auto-renew on the Indian rails at all. Either annual is invoiced and collected manually, or annual is card-only and accepts the authentication friction, or annual is not offered. Monthly billing is unaffected at every price contemplated here.

Separately, section 6(a) requires a pre-debit notification at least 24 hours before every debit with an opt-out presented. That applies at ₹499 exactly as much as at ₹14,999. Every renewal is a scheduled prompt to cancel. That is a structural involuntary-churn surface with no workaround and a specific reason to prefer fewer, larger customers over many small ones.

## GST presentation

There is no Indian statute requiring tax-inclusive display for services. The Legal Metrology MRP rules govern pre-packaged goods and do not reach a subscription. What binds is Consumer Protection (E-Commerce) Rules 2020, Rule 4: show the total in a single figure with the breakup, including applicable tax. The CCPA has penalised sellers for showing a tax-inclusive price and then adding GST at checkout. The requirement is transparency, not inclusivity.

| Headline | If inclusive, net revenue | If exclusive, customer pays | Revenue given up by inclusive |
|---:|---:|---:|---:|
| ₹1,499 | ₹1,270.34 | ₹1,768.82 | ₹228.66, 15.3% |
| ₹2,499 | ₹2,117.80 | ₹2,948.82 | ₹381.20, 15.3% |
| ₹2,999 | ₹2,541.53 | ₹3,538.82 | ₹457.47, 15.3% |
| ₹4,999 | ₹4,236.44 | ₹5,898.82 | ₹762.56, 15.3% |

The recommendation is inclusive for buyers without a GSTIN and exclusive for buyers with one, decided by a GSTIN field at checkout. A registered business reclaims the 18 percent as input credit and genuinely does not care about the gross, so charging them exclusive costs them nothing and preserves 15.25 percent of headline revenue. An unregistered sole proprietor cannot reclaim it, and for them the clean round number is worth the 15.25 percent. The code captures no GSTIN today, so this has to be decided before the first invoice. It is cheap now and expensive to unwind later.

## India versus global, and arbitrage

Setting the dollar price on global purchasing power and the rupee price on Indian purchasing power gives implied rates well below market, which is the correct outcome rather than an error.

| Tier | INR | USD | Implied rate | Market |
|---|---:|---:|---:|---:|
| Recommended Solo | ₹2,499 | $29 | 86.2 | 95.5 |
| Recommended Business | ₹4,999 | $59 | 84.7 | 95.5 |
| Recommended Studio | ₹9,999 | $119 | 84.0 | 95.5 |

An implied rate of about 85 against a market rate of 95.5 means the Indian price is about 11 percent cheaper than a straight conversion. That is a modest and defensible India discount rather than the 40 to 60 percent global vendors typically apply, and it is deliberately modest because the rupee tier has to clear the same aggregator cost floor as the dollar tier.

On arbitrage, what the code can actually enforce:

| Mechanism | Enforceable today | How | Leakage |
|---|---|---|---|
| Payment instrument | yes | the Cashfree order path is INR-hardcoded and there is no USD path at all | nil, the dollar tier does not exist |
| Billing country | no | no country field is captured anywhere in checkout | n/a |
| GSTIN presence | no | not captured; would also be the inclusive versus exclusive switch | n/a |
| IP geolocation | no | not implemented, and defeated by any VPN | high if used alone |

The honest position is that there is no arbitrage risk today because there is no dollar tier and no working checkout. When one is built, the payment instrument is the fence: an Indian UPI mandate is genuinely hard for a US buyer to obtain, which is a far stronger control than IP geolocation and requires no new enforcement code.
