# 34 · Radar — where the data comes from, what it costs, and what we have taken on

**Written for the founder, not for engineers.** Radar watches competitors: what they
posted, what changed on their website, what they are charging. This page says exactly
where each of those facts comes from, what each one costs in real money, which companies'
rules we are relying on, and what breaks if one of them changes its mind.

Every number below was measured on 2026-08-22 against real accounts and real websites. None
is taken from a price list. Where a number could not be measured, it says so.

---

## 1. The short version

| What Radar watches | How | What it costs, per competitor per day |
| --- | --- | --- |
| Their Instagram | Apify scraper | **$0.0026** — measured |
| Their website & prices | Our own server fetches it | **$0.00** on 16 of 16 real checks |
| A website that blocks us | Zyte, only then | ~$0.001 — **estimated, not measurable** |
| Their ads | **Not covered.** See §5 | — |

A customer watching three competitors — one Instagram account each, plus their websites —
costs about **$0.0078 a day, or ₹0.65**. At a hundred such customers, with no sharing at
all, that is **$23 a month**. Sharing (§3) takes it lower.

---

## 2. The cost is almost entirely social, and that is not an accident

Websites are nearly free because we can read them ourselves. Every night Radar asks the
site "has this changed since you last showed me?" — a standard web request that costs
nothing but a moment of our own bandwidth. Most nights the answer is no and there is
nothing further to do.

**Measured, on eight real Indian small-business sites:** on the second and third looks, 16
checks out of 16 came back unchanged, and not one of them cost anything.

Social is different, and the difference is structural rather than technical. **No platform
offers a way to read an account you do not own.** Instagram will show us a customer's own
account, because they have connected it and given us permission. A competitor has given us
nothing. The only route to "what did they post yesterday" is a service that reads the
public page the way a visitor's browser would. That service charges, and it is the entire
cost of Radar.

### One trap worth knowing about

Apify bills per result, and the answer it gives immediately after a job finishes says the
job cost **zero** — the charge is added a few seconds later. If we had believed that first
answer, your cost report would have said Radar was free right up until the invoice arrived.
Radar asks again, up to three times, and if it still cannot get a figure it records the
price list instead and **marks it as an estimate rather than a measurement**. Any total you
are shown states the split between the two. This matters more than it sounds: a report that
adds estimates to measurements and calls the sum "what Radar cost" is a guess with a
decimal point in it.

---

## 3. Why ten customers watching the same rival cost about the same as one

A competitor is stored **once**, globally, and each customer *subscribes* to it. Ten
bakeries in one city tracking the same three rivals means Radar fetches those three rivals
once each night, not thirty times. Cost grows with the number of **distinct** competitors,
which grows far more slowly than the customer list.

**This assumption has not been measured and cannot be yet** — it needs real customers with
real competitor lists, and there are none. What has been measured is that the mechanism
works: two workspaces adding the same Instagram account written two different ways
(`@handle` and `instagram.com/Handle/`) landed on one row, verified against the live
database. The moment customers start subscribing, the real overlap becomes readable from
`radar_fetch_log.subscriber_count`, which records how many customers each fetch served at
the moment it was made.

**The risk that comes with sharing, and how it is closed.** If a customer could read the
shared list, they could work out **who is watching whom** — and a bakery discovering that
the bakery across the road tracks it is a fact about our own paying customers, disclosed to
each other. That is worse than an ordinary data leak and no apology repairs it.

Two separate things are therefore prevented, and both were tested separately against the
live database from a signed-in customer's position:

- a customer cannot see a competitor they do not subscribe to; and
- a customer cannot see **anyone else's subscriptions**, even to a competitor they share.

The second is the one that matters here. Asked "how many people are watching this rival?",
about a competitor two workspaces genuinely shared, the database answered **1** — its own —
when the truth was 2. 24 checks, all passing, plus 12 deliberate attempts to break the rules
in the code, all of which the tests caught.

---

## 4. A spending limit that refuses before it spends

Radar is the first part of Sahoda that spends real money in a loop with no person in it. A
bug that fetches in a circle does not fail loudly — it succeeds, repeatedly, on your card.

So nothing is fetched until the database has agreed to it, and the agreement is recorded
**before** the request goes out. Two limits, both adjustable without a code change:

- **$2.00 a day across all customers.** Roughly a hundred times a normal day, so an ordinary
  night never touches it and a runaway loop hits it within minutes.
- **$0.05 a day per customer**, applied to the share of spending that customer actually
  *causes* — which is only the competitors they alone watch. For a rival six customers
  share, one of them unsubscribing saves nothing, so refusing their fetch would punish the
  other five for a neighbour's spending.

When a limit is reached, the night is not cancelled: the pass carries on with what it can
still afford, and the sources it skipped are recorded as **"we stopped checking"** rather
than as **"nothing happened"**.

---

## 5. Ads: deliberately not covered, and why

Radar does not track competitors' ads. This is a decision, not an omission, and it is worth
your reading because **you will be offered tools that claim otherwise**.

**Meta's official Ad Library API does not cover commercial ads in India.** Verified against
Meta's own documentation, which states in as many words:

> "Ads that did not reach any location in the EU will only return if they are about social
> issues, elections or politics."

An Indian bakery's Instagram ads are visible on Meta's public Ad Library website and
**absent from the API**. The API is a compliance instrument Meta built to satisfy
transparency law, not a marketing-intelligence product.

**The trap to know about, and the limit of what was checked.** `IN` is a country the API
*accepts*. Combined with the rule above, that means an Indian commercial-ads query is
expected to come back **successful and empty** rather than refused — which would be
indistinguishable from "this competitor runs no ads" unless somebody wrote down that it is
not.

That expectation follows from Meta's documented rule; it was **not** separately measured,
and it is worth being precise about why. The Ad Library API needs an access token from an
identity-verified account, and this repository has none: `META_APP_ID` holds a 90-character
value that Meta refuses outright with *"Cannot parse access token"*, so the request never
reaches the country filter at all. The check that would settle it is
`scripts/radar/probe-meta-adlibrary.mjs`, which will answer the question the moment a real
token exists.

Either way the instruction for the screen is the same, and it is the safe one: if Radar ever
shows an ads panel it must say *"Sahoda cannot see ads in India"* and never *"they are not
running ads."*

**The only other route is scraping Meta's Ad Library website**, and scraper services do sell
exactly that. It was declined for three reasons:

1. It is against Meta's terms of service. Meta actively litigates against companies that
   scrape its properties, and it is the one platform where Sahoda also holds an app
   registration that could be withdrawn.
2. It is the most legally exposed thing anyone has proposed putting in this product, and it
   would be for a feature that is a nice-to-have beside the ones that work.
3. It breaks constantly. A scraped page changes without notice and takes the feature down
   with it, silently.

The database is built so ads can be added later without a migration if you decide the trade
is worth it — a competitor already has a list of *sources*, and an ads source would simply
be one more kind.

---

## 6. What we are relying on, company by company

| Provider | What they do for us | What their rules say | If they change |
| --- | --- | --- | --- |
| **Apify** | Reads public Instagram profiles | A marketplace of community-maintained scrapers. Reading public pages is what the service is sold for. | Scrapers break when Instagram changes; actors are usually updated within days. Radar records a **gap**, never a zero. |
| **Zyte** | Fetches websites that block our own server | A commercial scraping API. Only successful responses are billed. | It is only a fallback. If it vanished, we would lose the small number of sites that refuse us directly. |
| **Our own server** | Fetches most websites | An ordinary web request, with an honest user-agent that identifies Sahoda and links to this page. | Nothing to change. |

### The uncomfortable part, stated plainly

**Instagram's terms of service prohibit automated collection of data from its site.** Apify
sells the tool; using it is our choice and our exposure, not theirs. In practice: reading
public profile pages is widespread, it has been litigated inconclusively for a decade, and
the realistic downside is that the technique stops working, not that anyone is sued. But it
is not a settled legal position and you should not be told it is.

There is no version of "track what competitors post on Instagram" that avoids this. The
alternative is not a safer supplier — it is not offering the feature.

Two things reduce the exposure meaningfully and both are already true: Radar reads only
**public** pages, and it stores what it read as evidence with the source attached, so
everything shown to a customer can be traced back to a page anyone could have visited.

---

## 7. What Radar will not do, whatever a competitor's website says

A competitor's page is text written by someone who does not wish us well, and this is not
hypothetical here — a live crawl during onboarding hit a **real** attempt to give
instructions to whatever machine was reading the page.

**No AI model runs anywhere in Radar's collection.** Whether something changed is decided by
comparing two numbers and two lists of words. There is no prompt for a hostile page to talk
to, so there is nothing to talk it into. That is a property of the design rather than a
filter, and unlike a filter it does not get weaker as the attacks get better.

Tested against a page carrying six different attacks at once — including one demanding its
price be reported as ₹1 and one demanding the other businesses on your list be handed over.
Radar read the real prices, ₹250 and ₹120, and reported *"Their page added 69 words."*

---

## 8. Two things that are set up but not switched on

1. **The nightly job is not armed.** `.github/workflows/radar-nightly.yml` exists and can be
   started by hand from the Actions tab. It will not run on a schedule until a repository
   variable points it at the right branch and three secrets are set. The first night it
   runs, it starts spending — so that should be a decision somebody makes rather than
   something that happens.
2. **`APIFY_TOKEN` and `ZYTE_API_KEY` are in `apps/web/.env` but not in the repository root
   `.env`.** Everything server-side reads the root file, so the social side is dark until
   they are copied across. Radar handles this honestly rather than crashing — it records
   those competitors as **"could not check"** — but that is a gap in your data, every night,
   until it is fixed. The same two values must also be added as GitHub Actions secrets for
   the nightly job.

Env files are deliberately not edited by this work.

---

## 9. Where the numbers came from

Every figure above can be re-derived:

- `scripts/radar/probe-keys.mjs` — do the provider keys authenticate at all
- `scripts/radar/probe-cheap-check.mjs` — the two-pass hash-stability measurement
- `scripts/radar/probe-apify.mjs` and `probe-apify-cost.mjs` — the real cost of one social check
- `scripts/radar/probe-zyte-cost.mjs` — the demonstration that Zyte reports no cost anywhere
- `scripts/radar/probe-meta-adlibrary.mjs` — the Ad Library check, currently blocked on a token
- `packages/db/scripts/radar-rls-live-proof.mjs` — the 24 access-control checks against the
  live database
- `packages/db/scripts/radar-seed-measure.mjs report` — the running cost ledger
