# packages/research

The **URL door** (doc 18 §5): turn a customer's website into a voice corpus. Server-only.

**This package acquires and quarantines. It never calls a model.** The quarantined extraction
is `brand_extract` in `@sahoda/mesh` — every model call in this codebase lives there.

- **TinyFish Fetch is a DIRECT vendor integration, not a mesh route.** doc 18 opens by correcting
  exactly this: OpenRouter routes inference; TinyFish's fetch is a separate
  service with its own key. Routing them through the mesh would make a scraping failure look
  like a model failure and bill a fixed credit price against a per-call vendor cost.
- **Crawl several pages, not one.** One page yields the category's voice, not the company's.
  `MAX_PAGES` caps the spend; `CrawlSuccess.skipped` names what the cap dropped — a silent
  top-N reads as "we crawled your site" when it did not.
- **Cost is zero vendor credits with TinyFish Fetch** (it was `pages + 1` Firecrawl credits); the day's 1,000 fetches are the budget, knowable before
  spend. `TINYFISH_API_KEY` must be in `turbo.json`'s `@sahoda/web#build` allowlist or the
  Vercel build will not see it while every local gate stays green.
- **Fail honestly.** Six named reasons, each its own sentence, each falling back to asking.
  `js_only` must never read as "your site is empty", and `crawler_error` (our bad key, our
  exhausted credits) must never be reported as a fact about their website. **Never invent a
  brand voice and present it as extracted** — there is no fallback payload here by design.
- **Everything crawled is untrusted.** Pass it through `quarantineCorpus()` before it reaches
  any model: delimited, provenance-tagged, and stated to be evidence. The delimiters are the
  second line of defense, not the first — the first is that `brand_extract` has no tools and
  its `confirmed` field is `z.literal(false)`, so a page that wins the argument still cannot
  confirm anything or reach a publish, a token, or a credit.
- Inject `fetchImpl` — every test here runs on fixtures, with no network and no key.
