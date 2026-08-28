# 56 · The Marketing Brain — what it can do, and what it can do for the next feature

**Status: reference. Written 2026-08-28 on `claude/lead-research-kickoff-qexr94`
(owner girija, `sahoda.lane=wt-girija2`), measured against `wt-core` at
`bf46eaa4`.**

Supersedes nothing. `docs/55` remains the build plan and is the file to edit when
a step lands. **This file answers a different question:** not "what is left to
build" but "what does this thing already do, and how do I judge whether a
proposed feature should route through it". Read it before designing any feature
that wants to measure, report, or optimise something about a customer's business.

`docs/51` (the ruling) → `docs/52` (the design) → `docs/53` (the integration
audit) → `docs/54` (what was built) → `docs/55` (the plan) → **this file (what it
can do)**.

---

## 1 · The five abilities, in the sentence the user actually reads

Each is a function in `apps/web/src/lib/brain/observe/`. None of the five imports
the mesh, so **no claim about a customer's own business can be invented** — the
one class of statement this product may never fabricate, because a fabricated one
reads exactly like a true one.

| Kind | The sentence | Reads | The decision it changes |
| --- | --- | --- | --- |
| `channel_return` | "Your Instagram posts earn more attention per reader than your Facebook: 6% against 3%, across 14 posts." | `post_metric_snapshots` | Where to spend the next hour |
| `format_effect` | "Your shorter posts earn more attention per reader: 7% across your 8 shortest, against 3% across your 9 longest." | captions + metrics | What to write when you get there |
| `audience_growth` | "Your Instagram audience is shrinking: 40 fewer followers than 28 days ago, 610 to 570." | `audience_snapshots` | Am I growing or just busy |
| `tone_drift` | "You have stopped using exclamation marks. 1.4 per post across your 6 earlier posts, none in the 7 since." | published captions | Did I drift from how I sound |
| `edit_distance` | "You are changing less of what Sahoda drafts: about 12% of a caption lately, against 31% earlier." | draft against final | Is the product learning me |

Runs weekly, `30 21 * * 0`, `/api/cron/brain`, declared in
`apps/web/vercel.json`. **Costs nothing**: no model call anywhere in the pass,
which is why it does not ride the Loop's paid switch.

Every pass also records that it LOOKED, per workspace, in `marketing_pass_runs`.
That row is what lets an empty report name the day it was last examined and what
it is still short of, which is the difference between a product that is waiting
and one that has stopped.

### The second ability, which is worth more than the first

The claims are not only printed on `/report`. `packages/mesh/src/market-context.ts`
injects them into the model as a system block carrying two hard instructions:

> "Do not quote these back to the reader: they are notes about the business, not
> copy for its audience. Do not state any other fact about how this business has
> performed. **If it is not in the list above, it has not been measured.**"

The planner therefore plans around what worked without ever telling the
customer's audience about the customer's numbers. **Reach as of 2026-08-28: 3 of
8 mesh tasks** — `plan_week`, `caption_rewrite` and `content_variants`. It read
1 of 8 until that date, the figure this sentence carried until now; the two that
write copy were added because planning is the wrong end of the pipe to stop at.
The plan decides what gets made; those two decide how it reads. Brand block above
market block in all three, which is the only place RULING 1 is enforced, and
`market-injection.test.ts` names the permitted set so the next widening is also a
decision rather than a drift.

---

## 2 · The four properties that make it reusable

These are the reason to route a new measurement through this store rather than
building a fresh one beside it. They transfer to ad data, site data, CRM data and
anything else that arrives as numbers.

**1 · No model call in a claim.** Structural, not a policy. The database comment
on `claim` says so too, so the guarantee survives someone reading only the schema.

**2 · The floors are the feature.** Every computer refuses rather than softens,
and returns the REASON. `too_close_to_call` is a real outcome. Minimum arm sizes
of 5, windows of 14 to 21 days, a minimum baseline rate, and a minimum gap of
1.5× before one thing is called better than another. **A product whose main skill
is declining to call a winner too early is worth more to a small advertiser than
one that reports every fluctuation**, because the fluctuation is what burns their
budget.

**3 · A fall is stated as plainly as a rise.** `audience-growth.ts` carries the
reason in a comment: a product that only speaks when the news is good is a
product whose silence is bad news.

**4 · Brand has veto, market has voice.** `docs/51` RULING 1, enforced today as
prompt ordering in `plan-week.ts` and at publish time by the gate reading
`taboo.red_lines`. This becomes load-bearing the moment money is spent: an
optimiser's gravity is always toward the market mean, and the mean is discount
language and the same three hooks everyone runs.

---

## 3 · The filing rule for any new measurement

Two questions, in order. They settle most design arguments before they start.

**Q1 · Which hemisphere?** From `docs/55`: identity and consistency-with-identity
are the Brand Brain; outcome and decision-from-outcome are the Marketing Brain.

**Q2 · Name the decision that changes.** If a customer reads the sentence and
does nothing differently, the measurement does not ship. This test is why
`tone_drift` is scheduled to move to the Brand Brain (`docs/55` step 6).

And one mechanical test for where a statement goes:

> A count stands behind every word → it is an **observation**, and it goes in the
> store. A conclusion drawn from counts → it is a **proposal**, and it goes in
> `memory_events` where a person accepts or rejects it.

---

## 4 · Applying this to next month's features

Recorded 2026-08-28 in answer to: *"we are planning website generation with CTA
and sales fed back in, plus ad campaign management. Can the Marketing Brain
improve ROAS?"*

### The blocking fact

**Nothing in the platform holds a revenue number.** MEASURED across every
migration on `wt-core`: no orders table, no conversions table, no revenue or
purchase column anywhere outside our own Stripe billing. `leads` carries a
`status` reaching `'won'` and **no amount**. `campaigns` holds a name, an
objective and dates; its own schema comment says the fixed lists belong to the ad
platforms and borrowing one "would imply a connection to them that does not
exist".

ROAS is revenue ÷ spend. **Today the platform has neither number.** Website
generation with a sales feed supplies the numerator; ad management supplies the
denominator. The Marketing Brain is the right place to divide them, but the value
comes from closing the loop, not from the brain. The brain is where the loop
becomes a sentence somebody acts on.

### The standard ROAS levers, against this architecture

| Lever | Fit | Why |
| --- | --- | --- |
| Refine audience targeting | **Partial, later** | It can observe which cohort converts; it cannot write a lookalike audience into Meta's API. Needs demographics, which `audience_snapshots` does not collect |
| Optimise post-click experience | **Strong** | Sahoda generates the page, so it owns both sides of the join. "This page converts 2 in 100, that one 6 in 100" is a typed observation. Nobody else in the stack can say it |
| A/B test ad creatives | **Strong, nearly free** | `format_effect` already splits into two arms at the customer's own median and refuses below a 1.5× gap. Point the same arithmetic at ad creatives |
| Increase AOV | **No** | A merchandising decision, not a marketing measurement. The brain can report that it moved; it cannot design an upsell |
| Customer retention | **Observe yes, execute no** | It can price a repeat buyer against a new one. Sending the retargeting is the publishing layer's job |

### The one thing that must not be deferred

**Every generated site must carry the origin of the visit, and every lead and
every sale must carry it back.** `docs/55` step 5 (`leads.post_id`), widened:
which post, which ad, which campaign, which CTA. Put it in the schema in the same
migration as the sites work.

Ship website generation and ad management without it and you will hold both
numbers and still be unable to divide one by the other. **Attribution cannot be
retrofitted onto traffic that has already happened** — the history before the fix
is permanently unattributable. Everything else on the ROAS list can be added
incrementally. `docs/55` already warns: do not fake it with a `source` string
parse.

---

## 5 · Standing limits, so nobody rediscovers them

- **None of this is in production.** `origin/wt-web` contains no file under
  `apps/web/src/lib/brain/`. MEASURED 2026-08-28.
- **The data is thinner than the floors.** Last production reading, 2026-08-26:
  5 published posts spanning 1 day, 0 observations ever written.
  `channel_return` needs 5 posts *per channel* across 14 days. The expected first
  result in production is honest declines, not sentences. The floors are right;
  the posting volume has to catch up.
- **Declines are no longer discarded, as of 2026-08-28.** `marketing_pass_runs`
  records one row per workspace per pass: the day it looked, what it wrote, and
  the reason each computer produced nothing. `/report` turns that into "Sahoda
  last looked on … and is waiting for …" instead of a static "Nothing yet". A
  workspace whose pass THREW writes no row, so a missing row still reads as "we
  could not look" and never as patience. `docs/55` step 10, built. **The
  migration is not applied to any database yet** — it ships with the code.
- **Nothing records whether an observation was seen, believed or acted on.**
  Every threshold is a constant somebody chose rather than a number the product
  earned. `docs/55` step 8, and the difference between a brain and a filing
  cabinet.

## In plain terms

Sahoda can currently notice five specific things about a business, always with
real counts behind them, and it stays quiet unless it has enough data to be sure.
It also feeds what it knows quietly into the weekly plan. What it cannot do is
say whether anyone made money, because the platform stores no money. Websites and
ads would give it that for the first time. The one step that must happen on day
one is tagging every visitor with where they came from, because that link cannot
be added to the past.
