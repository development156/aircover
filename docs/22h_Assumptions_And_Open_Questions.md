# 22h — Assumptions, open questions and audit trail

Source commit: c8faa34, worktree wt-web
Generated: 2026-08-17
Model prices as of: 2026-08-16 (OpenRouter /api/v1/models), corroborated 2026-08-17 (platform.claude.com/docs/en/about-claude/pricing)
FX rate: 95.50 INR/USD. Sources: x-rates monthly average Aug 2026 = 95.30; Wise spot 95.60 on 2026-08-16; RBI reference rate 95.410 on 2026-08-13; midpoint used. Reverse-charge GST is OUTSIDE every INR cost figure in this file. USD vendor costs are converted at 95.50 and nothing else is added. The 18 percent RCM on imported services is a separate cash item, recoverable but paid in cash first, and it is never folded into a COGS or margin figure here.
Zernio: 4.80 USD per connected account per month. This is the VOLUME rate as documented, not a launch or introductory rate. The source sentence reads "a per-account cost line, roughly $4.80/account at volume" at docs/17_One_Week_Beta_Plan_SAHODA_LABS.md:63, and the same sentence instructs asking Zernio what the cap counts. No rate card exists in the repo, so this figure is DISPUTED. Cap scenario assumed in this file: All three treated as an open range; the scenario is itself the largest single assumption in the pack.
Plan resolution assumption: the subscriptions table is assumed EMPTY in production. Nothing in the repo writes it, so every workspace resolves to DEFAULT_PLAN 'free' and the AS-IS cost figures follow from that. The recommended tier table assumes subscriptions will be written in future so that the channel and site fences actually operate.
This file: 46 MEASURED, 19 INFERRED

## Two inconsistencies found while splitting

Reported rather than resolved, because resolving them would change a number.

1. The free-workspace carry figure appears twice with different values. The Phase 6 free-tier analysis and the pricing engine both give ₹39 per month for a zero-channel free workspace, and the engine reproduces it. The prose note attached to the recommended tier table gives ₹34 per month for the same quantity. ₹39 is the figure the engine produces and the one every derived result uses; ₹34 appears to be an earlier value that survived an edit. Nothing downstream depends on the ₹34.

2. The rupee-depreciation sentence in the margin-killers list states that about 9 percent annual depreciation costs roughly a third of the price-leader gross margin and about a sixth of the value-priced gross margin. The first half reproduces: 9 percent of ₹951 marginal COGS is ₹86 against a price-leader gross margin of ₹275, which is 31 percent. The second half does not: ₹86 against a value-priced gross margin of ₹1,103 is 7.8 percent, not a sixth. The direction and the ranking are right; the second fraction overstates by roughly two times.

## Every INFERRED input

| Input | Low | Base | High | Basis | Conclusion that moves if wrong |
|---|---:|---:|---:|---|---|
| Input tokens per task, six of eight tasks | varies | varies | varies | rendering the real prompt strings at about 4 characters per token; no prompt_tokens measurement exists | per-action COGS for four of the six chargeable actions |
| Repair rate | 0% | 5% | 20% | brand_extract went 5-in-6 before the token-ceiling fix to 0-of-7 after; n of 7, one task | worst-case COGS and the unbounded-downside verdict |
| Loops per month | 2.0 | 4.33 | 4.33 | 4.33 is one Loop per week, the designed cadence; low is fortnightly, the behaviour of a user who must press the button manually | the whole usage profile and therefore AI COGS |
| Brief to variants conversion | 0.4 | 0.7 | 1.0 | share of the five briefs a user actually drafts; no telemetry | credits burned and AI COGS |
| Variants to image attach rate | 0.15 | 0.30 | 0.60 | images are the largest AI COGS line so this matters more than any other behavioural input | COGS per credit, which swings 70 percent across the range |
| Caption rewrites per month | 2 | 4.3 | 20 | about 20 percent of drafted posts get one rewrite | minor; smallest COGS line |
| Site generates per month | 0 | 0.05 | 0.25 | one in twenty workspaces per month; has never executed in production | the dearest action's contribution to the blend |
| Cached prefix size in tokens | 150 | 175 | 2,500 | rendering buildBrandMessage over the only complete real payload in the repo gives 701 characters | whether caching can ever fire; at every value in the range it fails the 4,096 minimum on haiku |
| Support minutes per customer per month | 3 | 10 | 30 | no ticket data, no support tooling, no customer-facing email exists | contribution at the bottom tier |
| Support cost per minute | ₹2.00 | ₹2.50 | ₹3.60 | junior salary ₹26,400 to ₹31,400 per month over about 176 working hours | contribution at the bottom tier |
| Plan mix | n/a | Solo 65%, Business 30%, Studio 5% | n/a | self-serve SMB products skew to the entry paid tier | blended ARPU and contribution, and therefore break-even |
| Monthly logo churn | 5% | 8% | 12% | global SMB benchmark 3 to 5 percent, raised because Indian recurring-mandate rules add involuntary churn | LTV, maximum affordable CAC, whether three-to-one clears |
| Indian SMB SaaS CAC | ₹9,550 | n/a | ₹23,875 | global band $200 to $500 with the source set stating comparable regions run 40 to 60 percent lower | whether paid acquisition fits at all |
| Free-to-paid conversion, freemium | 2% | 3.5% | 5% | global self-serve freemium band; weaker provenance than the trial figures | the free tier decision |
| RCM lockup months | 2 | 4 | 7 | 60-day statutory refund window plus the practical filing cycle | working capital, not margin |
| Opex, founders paid | ₹1,96,667 | ₹2,91,810 | ₹4,22,916 | AmbitionBox CTC bands adjusted down from funded-employer medians | break-even customer count |
| Direct-integration build cost | ₹2,71,257 | ₹5,42,513 | ₹10,85,026 | 6 engineer-weeks per platform times four, plus 3 weeks for Meta App Review, at ₹86,250 per engineer-month | the aggregator versus direct crossover volume |
| Direct-integration maintenance | 0.25 FTE | 0.5 FTE | 1.0 FTE | platform APIs deprecate regardless of user count | the crossover volume |
| Direct variable cost per workspace | ₹5 | ₹10 | ₹25 | R2 storage at $0.015 per GB-month with free egress, plus transcode and token refresh | the crossover volume, weakly |

## Which of these are load-bearing on the strategy choice

Three inputs decide whether the value-priced ladder beats the price-leader ladder. The rest move numbers without moving the verdict.

**The Zernio cap scenario is the only input that flips the recommendation.** Under the per-connected-account reading the price-leader ladder produces ₹347 blended contribution and a maximum affordable CAC of ₹2,315 at 5 percent churn, which is below the bottom of the plausible Indian CAC band of ₹9,550 to ₹23,875, so paid acquisition is foreclosed and the ladder is organic-only. Under the per-profile reading the same ladder produces ₹1,095 contribution and a maximum affordable CAC of ₹7,300, which sits inside the plausible band. **If the cap counts profiles rather than connected accounts, the price-leader ladder becomes viable with paid acquisition and the argument for value pricing weakens sharply.** This is the single most important number in the pack and it rests on one hedged sentence.

**The Indian SMB CAC range decides whether either ladder can buy customers.** The recommendation assumes the plausible band is ₹9,550 to ₹23,875. If real Indian CAC turns out at or below ₹2,315, both ladders can afford paid acquisition, and the price-leader ladder's larger addressable market becomes an argument in its favour rather than against it. That is the value that flips it. If real CAC is above ₹11,221, neither ladder can buy customers and both are organic-only, at which point the choice is decided by addressable market rather than by unit economics and the price-leader ladder gains again. The recommendation is strongest in the middle of the band and weakest at both ends.

**The churn assumption sets the size of the gap but does not flip it.** At 5 percent churn the value-priced maximum CAC is ₹11,221 against the price-leader's ₹2,315, a ratio of 4.8. At 12 percent it is ₹4,675 against ₹965, the same ratio. Churn scales both ladders together, so no churn value reverses the ordering. Churn above roughly 15 percent makes three-to-one unreachable on any paid channel for either ladder, which is a reason to abandon paid acquisition rather than a reason to change price.

Two further inputs are worth watching but do not reach the verdict. The image attach rate swings AI COGS from ₹23 to ₹51 per workspace per month, which is a ₹28 movement against a ₹917 aggregator line and cannot change a strategy. The plan mix moves blended contribution but moves both ladders in the same direction.

## The ten open questions, ranked by money

1. What does the aggregator's cap count, and what does the next tier cost? Worth ₹4,58,400 per month at 1,000 workspaces, being the difference between the per-connected-account and per-profile readings. It moves gross margin by 22 points, break-even by 55 customers, decides whether a free tier is affordable in any form, and is the only input that can flip the strategy choice. Answered by the vendor's billing page, an invoice, or the order form accepted at signup.
2. Does any subscriptions row exist in production? If not, no tier fence has ever operated, site_generate has never run, and every workspace is on the free plan's limits regardless of payment. Answered by query 1 below, in under a minute.
3. What is the real number of connected channels per workspace? The aggregator bill is linear in it and the model assumes two. Answered by query 4 below.
4. What is the real action mix and the real repair rate? The image attach rate alone swings COGS per credit by 70 percent, and the repair rate is a pure assumption at 5 percent. Answered by queries 2 and 3 below.
5. Are the four publish flags on in production, and does the aggregator bill for a connected account that never publishes? Determines whether the ₹917 is being incurred today or only after the flags flip. Answered by the Vercel environment page plus one question to the vendor.
6. What does Cashfree charge for a refund and a chargeback, and what is its FX markup on international cards? Not published anywhere fetchable. On a dollar tier an unpublished FX spread can exceed the 2.99 percent international MDR itself. Answered by the merchant agreement.
7. Is the 0 percent Cashfree promotion per month or lifetime cumulative? Two official pages disagree, ₹20 lakh GMV per month against ₹20 lakh cumulative. It excludes subscriptions and international entirely, so it does not touch recurring revenue either way, which is why it ranks here rather than higher.
8. What is the true single-pass output size for site_generate? Its cost figure is a floor built on a ceiling used as a lower bound. The action prices at 100 credits and has never executed in production. Answered by query 2 once any row exists.
9. What is Indian SMB SaaS churn at this price point? Not obtainable from published sources after six targeted searches. The model runs 5, 8 and 12 percent. Answered only by a real cohort.
10. Does the inference endpoint accept the pinned model string `anthropic/claude-opus-4-8`? The dotted `anthropic/claude-opus-4.8` is the catalogue id and the hyphenated form is not in it, verified live on 2026-08-16. It is the sole consumer of the premium tier and the 100-credit action depends on it. One authenticated call answers it.

## The four SQL queries

Column names verified against the DDL in `packages/db/supabase/migrations`. One caveat travels with query 2: `ai_provider_logs.repaired` was added by migration `20260812000000` on branch wt-db3 and is not in the migration set tracked on wt-web. It exists in production by out-of-band application. If the query errors, drop the where clause and re-run.

Query 1, does any subscription row exist:

```sql
select
  coalesce(s.plan_id, '(no subscription)') as plan_id,
  coalesce(s.status,  '(none)')            as status,
  coalesce(s.provider,'(none)')            as provider,
  count(s.id)                              as rows_n,
  count(distinct s.workspace_id)           as workspaces_n,
  (select count(*) from workspaces)        as all_workspaces
from subscriptions s
group by rollup (s.plan_id, s.status, s.provider)
order by 1, 2, 3;
```

Query 2, real token distributions per task excluding repaired rows:

```sql
select
  task,
  tier,
  model,
  count(*)                                                   as rows_n,
  percentile_disc(0.5) within group (order by tokens_in)     as tokens_in_p50,
  percentile_disc(0.9) within group (order by tokens_in)     as tokens_in_p90,
  percentile_disc(0.5) within group (order by tokens_out)    as tokens_out_p50,
  percentile_disc(0.9) within group (order by tokens_out)    as tokens_out_p90,
  round(avg(cost_usd)::numeric, 6)                           as avg_cost_usd_estimator,
  count(*) filter (where coalesce(cached_tokens, 0) > 0)     as rows_with_cache_hit
from ai_provider_logs
where repaired = false
group by task, tier, model
order by rows_n desc;
```

`tokens_out` is a sumUsage figure that adds both attempts on a repaired call, which is why repaired rows must be excluded. `rows_with_cache_hit` settles the caching question outright; the model predicts zero.

Query 3, credit ledger volume by action:

```sql
select
  action_type,
  entry_type,
  count(*)                                         as rows_n,
  sum(amount)                                      as credits_sum,
  count(distinct workspace_id)                     as workspaces_n,
  count(*) filter (where cogs_usd_est is not null) as rows_with_cogs,
  min(created_at)                                  as first_at,
  max(created_at)                                  as last_at
from credit_ledger
group by action_type, entry_type
order by rows_n desc;
```

`rows_with_cogs` is expected to be zero on every row, because no createWithCredits call site passes a cost resolver.

Query 4, connected accounts, the direct driver of the aggregator bill:

```sql
select
  platform,
  status,
  count(*)                      as connections_n,
  count(distinct workspace_id)  as workspaces_n,
  round(count(*)::numeric / nullif(count(distinct workspace_id), 0), 2) as avg_per_workspace
from connections
group by platform, status
order by connections_n desc;
```

`avg_per_workspace` on status active is the multiplier the entire aggregator cost line runs on. The model assumes 2; if the real figure is 1.2, every aggregator figure in this pack falls by 40 percent. Expect no workspace to show more than two active connections, because nothing writes subscriptions and the free plan grants two; if that is what comes back, the four-channel tier has never been exercised and its cost is entirely modelled.
