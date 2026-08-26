# 47 · Scope — grounding the writing tasks in the knowledge library

**25 August 2026, research lane, at `60cf74d`.** Step 2 of the `docs/46` repairs.

**BUILT on 25 August, to the recommended shape.** What shipped, what changed
against this scope, and what is still open is at the bottom under
"What was actually built". The body below is the scope as written, unedited, so
the two can be compared.

---

## What it does

`caption_rewrite` and `content_variants` receive the Brand Brain today and
nothing else. This adds a second grounded block: passages retrieved from the
workspace's knowledge library, so a caption can name a real dish at a real price
instead of a plausible one.

`packages/mesh` currently has **zero** references to knowledge. The retrieval
half already exists — `resolveFromLibrary` reads passages today — so this is
mostly a matter of moving that read somewhere the mesh can call it.

---

## The cost, which decides the shape

Economy tier routes to `claude-haiku-4.5` at **$1.00 per 1M input tokens**.
`caption_rewrite` costs the customer **1 credit**, and a credit is worth
**$0.0053 (agency) to $0.0080 (starter)** — from `pricing.config.json`:
USD 12/29/79 against grants of 1500/5000/15000.

Passages are `CHUNK_TARGET_CHARS = 1200`. At roughly four characters per token:

| passages | chars  | ~tokens | added input, uncached | cached (~0.1x) | % of a starter credit |
| -------- | ------ | ------- | --------------------- | -------------- | --------------------- |
| 3        | 3,600  | 900     | $0.0009               | $0.00009       | 11%                   |
| 5        | 6,000  | 1,500   | $0.0015               | $0.00015       | 19%                   |
| 8        | 9,600  | 2,400   | $0.0024               | $0.00024       | 30%                   |
| 12       | 14,400 | 3,600   | $0.0036               | $0.00036       | 45%                   |
| **25**   | 30,000 | 7,500   | **$0.0075**           | $0.00075       | **94%**               |

**So `MAX_EVIDENCE_CHUNKS = 25` cannot be reused here.** At 25 passages the
retrieval alone eats 94% of a starter credit and **141% of an agency credit**,
before the existing prompt, the Brand Brain prefix and the output tokens. That
is a loss-making caption on the biggest plan.

The four-characters-per-token figure is an ESTIMATE. Firm it up with
`count_tokens` against real passages before committing; every other number above
is read from the config or the source.

---

## Four decisions

### D1 · Query-relevant retrieval, or a cached fixed set?

`searchLibrary` already does full-text search over the generated `tsv` column,
so relevance is available. But the Brand Brain prefix is prompt-cached, and
passages that change per request cannot be.

- **Query-relevant** (recommended): search on the brief, take the top K. Better
  output, no cache benefit, costs the uncached column above.
- **Cached fixed set**: the same top-K passages per workspace, cached beside the
  brand prefix. Roughly ten times cheaper on a hit and much blunter — a caption
  about a birthday cake gets whatever the first passages happen to be.

Note the interaction: the cacheable prefix minimum is around 1,024 tokens, so a
three-passage set (~900) would not cache at all. Caching only becomes real at
five passages and up.

### D2 · How many passages?

**Recommended: 5**, and a separate constant from `MAX_EVIDENCE_CHUNKS` with its
own name and its own reason. 19% of a starter credit, 28% of an agency one.
Reusing the 25 constant because it exists would be the expensive mistake here.

### D3 · Trust, and the boundary that is not RLS

`brand-context.ts` reads with a **service key**, and
`knowledge_current_chunks` is `security_invoker = true`. A service-role read
therefore **bypasses RLS entirely**, and the explicit `workspace_id` filter
becomes the only tenant boundary. A knowledge provider must follow the same
pattern and be reviewed on that basis: a missing filter is a cross-tenant leak
that no policy will catch.

Passage text is also untrusted — it comes from uploaded PDFs and crawled pages,
and `to-resolve-input.ts` records that a live crawl has already met a real
prompt injection. Passages must be fenced with `quarantineInline`, the same way
door text is.

### D4 · What happens when there is nothing

An empty library, a failed read and a search with no hits are three different
situations. The brand-context path treats a fetch failure as "proceed
brand-less", which is right and should be copied: grounding is best-effort and
must never fail a paid action. The caption is simply less specific.

---

## Build order

1. Lift the passage read out of `resolveFromLibrary` into a helper that takes a
   workspace id and a query, so the action and the mesh share one implementation.
2. A `KnowledgeContextProvider` in `packages/mesh`, mirroring
   `BrandContextProvider`: same PostgREST shape, same service key, same
   best-effort failure, explicit workspace filter.
3. Engine: extend the `cachePrefix === 'brand_context'` branch to also attach
   knowledge, or add a second `groundsIn` flag. The second is cleaner — brand
   and knowledge have different cache behaviour and should not share a switch.
4. Declare it on `caption_rewrite` and `content_variants` only. Not
   `gate_classify`, for the reason its own header gives: the checker must not
   read what the post was written from.
5. The guard that makes the Knowledge screen's old promise true: a caption
   containing a figure must trace to a passage, or the figure does not render.

---

## Guards, and the mutation each needs

- Passages reach the model → mutate the provider to return null; the grounded
  assertion must red.
- The workspace filter is present → mutate the query to drop it; a cross-tenant
  test must red. **This is the one that matters**, because RLS is bypassed.
- Passages are fenced → mutate `quarantineInline` away; an injection fixture
  must red.
- A failed read does not fail the action → mutate the provider to throw; the
  caption must still be produced.
- K is bounded → mutate the constant to 25; a cost-ceiling assertion must red.

---

## What this does not do

It does not ground `plan_week` or `site_generate`, which also receive the Brain;
they are larger prompts and the same cost arithmetic has to be redone for each.
It does not ground image generation, which receives nothing today. It does not
make the library searchable by the model — retrieval is chosen by our code, not
by the model calling a tool.

And it does not measure whether captions get better. That needs someone reading
the output against a real library, which is the same missing input `docs/46`
ends on.

---

## What was actually built

Shipped in `packages/mesh`: `knowledge-context.ts` (the provider, the query
builder and the fenced block), the engine seam, and the declaration on
`caption_rewrite` and `content_variants`. Nine files, 19 new tests, every guard
below proved by mutation.

### Where it followed the scope

- **D1 query-relevant, D2 five passages.** `KNOWLEDGE_PASSAGE_LIMIT = 5`, its own
  constant with the cost table above written beside it. `MAX_EVIDENCE_CHUNKS`
  (25) is not reused and the test that counts blocks reds if it ever is.
- **D3 the boundary.** Service key, `security_invoker` view, so the
  `workspace_id=eq.` term is the whole tenant boundary. The test's fake is a
  two-tenant table that reads the filters off the URL, so dropping the filter
  serves the other business's row and the assertion reds. Proved.
- **D3 fencing.** Passages go through `buildEvidenceSet`, which is
  `quarantineBlock`'s fence and `neutralize`'s markers. Not a second fence.
- **D4 nothing.** Empty query, no match, and a failed read are three paths and
  none of them fails the action: the caption is produced ungrounded.

### Where it did not

- **Build order 1 is not done.** `resolveFromLibrary`'s read was not lifted into
  a shared helper. The mesh provider is a second read of the same view through a
  different transport (PostgREST + service key vs. the server Supabase client),
  because the mesh has no Supabase client and adding one to reuse eight lines
  would be the larger change. Two reads of one view is a drift risk and is
  recorded here rather than hidden.
- **Build order 5 is not done.** No guard traces a figure in a caption back to a
  passage. It needs the model to cite, and neither task's output schema has a
  field to cite in: `CaptionRewriteOutput` is `{ text }`. That is a shared
  contract change and a separate piece of work.
- **The retrieval is not ranked.** The scope assumed `searchLibrary`'s relevance
  carried over. It does not: `plainto_tsquery` ANDs every lexeme, which matches
  nothing when the query is a whole caption, so the query builder ORs the terms
  instead. That buys recall and gives up ordering, because PostgREST cannot sort
  by `ts_rank`. **The five passages are five of the matches, not the best five.**
  A `ts_rank` RPC is the fix and only the db lane can write it:
  `apps/web/REQUESTS.md` §20.

### Still not measured

Whether captions get better. Unchanged from the scope, and unchanged from
`docs/46`: it needs somebody reading output against a real library.
