# 43 · Image models, and the routing decision

**Status: current as of 2026-08-29.** This field moves monthly, so every figure below is dated
and sourced, and the section that matters most is the last one: what a hostile checker knocked
down.

## How this was produced, and what that buys you

Three researchers fetched provider pages and APIs. Three separate agents were then told to
**refute** what the first three returned, defaulting to refuted where they could not confirm.
All three came back **PARTLY_WRONG**: 26 claims were refuted, including six prices and two
"MEASURED" figures with no reachable source.

Nothing refuted appears below as fact. That is the entire point of the exercise, and it is why
this document is shorter than the research behind it.

**Nothing here was measured by calling a provider.** No key was used and no credit was spent, so
every latency and price is somebody else's published number, marked INFERRED. The one class of
fact marked MEASURED is our own code, read directly.

---

## 1 · What we already have, which is more than the brief assumed

**MEASURED**, by reading `packages/mesh`:

| Fact | Where |
| --- | --- |
| An image rail exists end to end | `Mesh.runImage`, `packages/mesh/src/mesh.ts:180` |
| It is deliberately NOT `runTask` | the answer is bytes and is never zod-parsed |
| Image spend is cost-isolated | `OPENROUTER_API_KEY_IMAGE`, overridden in `planImage` |
| `standard` routes to `google/gemini-2.5-flash-image` | `IMAGE_ROUTES`, `routing.ts:104` |
| `premium` (`openai/gpt-image-1`) is UNREACHABLE | `imageGenerateDef.tier` is hardcoded `'standard'` |
| A picture costs the customer 6 credits | `image_standard` in `pricing.config.json` |

Three defects in that rail, all MEASURED and none fixed by this lane:

- **`imageGenerateDef.outputSchema` is declared and never applied.** The engine returns
  `{base64, mime}` straight off the provider with no `safeParse`. The mesh skill's own mandate
  that all model output is zod-parsed is not true on this one path.
- **`cost_usd` on an image row is fiction.** `estimateCostUsd` applies chat token rates of
  $3/$15 per million to a model billed per image. Any margin figure read from that column is
  invented.
- **Nothing tested the image path.** Before this lane, `grep -rln runImage` found four files and
  one of them was a stub that throws.

---

## 2 · The routing decision

**Stay on OpenRouter. Do not add fal.ai in Phase 1.**

Three reasons, in order of weight:

1. **The three cost-isolated keys already exist and the IMAGE one is already the key image calls
   draw from.** A second provider means a second key, a second failure mode and a second place
   for spend to hide.
2. **OpenRouter's billing rule matches our ledger doctrine exactly.** Its docs state, verbatim:
   *"Image generation billing is all-or-nothing. A generation is either completed and billed in
   full, or it fails and is not billed."* (CONFIRMED by the refuter.) That is the same promise
   `withCredits` makes by releasing the hold on a throw. Two systems that agree by construction
   are worth more than a cheaper one that does not.
3. **Everything Phase 1 needs is on it.** Phase 3's editing tools are the honest reason to add
   fal later, and §5 lists them.

### The change worth making first

**MEASURED: our client uses the wrong endpoint.** `Provider.image` posts to
`/chat/completions` with `modalities:['image','text']` and digs the picture out of
`choices[0].message.images[0].image_url.url` (`providers/openrouter.ts:107-157`).

OpenRouter has a **dedicated `POST /api/v1/images`** (CONFIRMED verbatim at the docs page,
survived refutation). It takes `model`, `prompt`, and optionally `n`, `resolution`,
`aspect_ratio`, `size` and **`input_references`**, and returns
`{created, data:[{b64_json, media_type}], usage:{…, cost}}`.

Two things follow, and the second is a correction to what this lane reported earlier:

- `usage.cost` is the **real** per-generation cost, which is what `provider_cost_micro_usd` on
  `studio_generations` was added to hold. Today that column can only stay null, because the chat
  endpoint does not report it.
- **Reference conditioning is reachable.** `input_references` entries are
  `{"type":"image_url","image_url":{"url":"…"}}` and the docs state they may be HTTP(S) URLs or
  base64 (CONFIRMED). Earlier in this lane I reported that Match-this and Series were blocked
  because the mesh has no image-input path. That is true of the CHAT path and false of the
  Images API. The blocker is smaller than stated: it is a client change, not a missing
  capability.

---

## 3 · The models, with real prices

All figures **INFERRED** from OpenRouter's own `/api/v1/images/models` and model pages, fetched
2026-08-29, and each one survived refutation. Prices are per image unless the unit says
otherwise.

| Model | Price | Max references | Max n |
| --- | --- | --- | --- |
| `google/gemini-2.5-flash-image` (Nano Banana) | $0.00003 / output token | 3 | 1 |
| `google/gemini-3.1-flash-lite-image` | $0.00003 / output token | 14 | 1 |
| `google/gemini-3.1-flash-image` | $0.00006 / output token | 14 | 1 |
| `google/gemini-3-pro-image` | $0.00012 / output token | 14 | 1 |
| `bytedance-seed/seedream-4.5` | **$0.04 flat** | 14 | **10** |
| `bytedance-seed/seedream-5-0-lite` | **$0.035 flat** | 14 | 4 |
| `black-forest-labs/flux.2-pro` | $0.015/MP in; $0.03 first MP out, $0.015 each after | — | — |
| `openai/gpt-image-1` and `gpt-5-image` | $0.00004 / token, **identical pair for pair** | — | — |

Three billing units are in play (per image, per megapixel, per token) and they do not map
cleanly onto vendors: `microsoft/mai-image-2.5` is token-billed while its neighbours are not. A
cost model that assumes one unit per vendor is wrong.

### Latency, and why the draft/finish split is about cost rather than speed

**INFERRED** from IMG.LY's pilot-0 suite, p50, ~111 runs each, benchmarked endpoint `fal:*`:

| Model | p50 | Price | Typography |
| --- | --- | --- | --- |
| FLUX.2 / FLUX.2 [dev] Turbo | **2.0s** | $0.013 | 4.0 / 5 |
| Nano Banana 2 Lite | 4.0s | $0.020 | **4.2 / 5**, the highest in the suite |
| Qwen-Image | 6.9s | $0.030 | — |
| Gemini 2.5 Flash Image | 7.4s | $0.039 | 3.9 / 5 |
| FLUX.2 [pro] | 11.5s | $0.040 | 3.7 / 5 |
| Seedream 4.5 | 12.4s | $0.048 | 4.1 / 5 |
| Nano Banana 2 | 13.2s | $0.100 | 3.6 / 5 |
| Nano Banana Pro | 23.3s | **$0.360**, dearest measured | — |
| Seedream 5.0 Lite | 30.7s | $0.020 | — |
| GPT Image 1.5 | **34.0s**, slowest measured | $0.120 | — |

**The brief's "2–17s draft, 86–206s finish" does not hold in this data.** The slowest model
measured is 34 seconds, not three minutes. The spread that is real is **28x in price**
($0.013 to $0.360) against **17x in time**, so draft-cheap-finish-premium is sound reasoning
about MONEY and weak reasoning about waiting.

That has a direct product consequence. The queue-and-notify UX is still right, because a row
that survives a Back press is right at any latency, but "generation takes up to three minutes"
should not appear in customer copy on this evidence.

---

## 4 · The India question, answered precisely

**The load-bearing fact survives: India is absent from BytePlus Model Service's availability
list.** VERIFIED TWICE by the refuter, who called it the most important finding in the report.

Two corrections to how the brief states it:

- It is **not Singapore**. BytePlus names the ModelArk `ap-southeast` region **Asia Pacific
  (Johor)**, in Malaysia, in its own SDK documentation.
- BytePlus does not describe the Seedream endpoint as Singapore anywhere reachable. That
  attribution has no source.

**The instruction stands unchanged**: reach Seedream through OpenRouter, fal or Replicate, never
BytePlus directly. It is right for the reason given, stated more accurately.

---

## 5 · Phase 3's editing tools, and what they cost

**INFERRED** from fal's own model pages, each price confirmed verbatim by the refuter. This is
the honest case for adding fal as a second provider, and it is a Phase 3 case, not a Phase 1 one.

| Operation | Model | Price |
| --- | --- | --- |
| Background removal | `fal-ai/bria/background/remove` | $0.018 / generation |
| Generative fill | `fal-ai/bria/genfill` | — |
| Erase object | `fal-ai/bria/eraser` | needs a `mask_url` |
| Expand / outpaint | `fal-ai/bria/expand` | $0.04 / generation |
| Upscale, cheapest | `fal-ai/seedvr/upscale/image` | **$0.001 / MP** |
| Upscale, per image | `fal-ai/recraft/upscale/crisp` | $0.004 / image |
| Upscale, diffusion | `fal-ai/clarity-upscaler` | $0.03 / MP |
| Relight | `fal-ai/iclight-v2` | $0.1 / MP |

**OpenRouter is not empty here.** `google/gemini-3-pro-image` advertises localized edits and
lighting control on its own OpenRouter page, so "OpenRouter offers zero of the six operations"
was refuted as an absolute.

### Two traps in fal's set generation, both CONFIRMED verbatim

- **The reference ceiling is 10, and overflow is SILENT**: *"Presently, up to 10 image inputs are
  allowed. If over 10 images are sent, only the last 10 will be used."* An eleventh reference is
  dropped without an error, which is the shape of a bug nobody reports.
- **References count against the image total** on the edit endpoints: *"The total number of
  images (image inputs + images to generate)"*. A set of six with five references is not six
  slides.

Seedream v4 on fal is $0.03 per image on both text-to-image and edit. The per-generation
coherent set is capped at 6, not 15.

---

## 6 · What a hostile reader knocked down

Recorded because a reader of this document should know which way the errors ran, and because
every one of these was presented to me as a fact first.

| Claim as researched | What the refuter found |
| --- | --- |
| FLUX.2 Pro input at $0.03/MP | **$0.015/MP.** Overstated 2x |
| `birefnet/v2` at $0.0008 per compute second, marked MEASURED | fal's own page says **$0 per compute second**. No source page existed |
| Recraft crisp is an order of magnitude cheaper than diffusion upscalers | `seedvr/upscale/image` is **$0.001/MP**, cheaper still up to 4MP |
| Recraft V4 Styles has a $0.005 style-creation charge | It is a per-request **input reference** charge. No style charge exists |
| "16 Recraft models" | **15** |
| `gpt-image-1-mini` price sourced to `/api/v1/images/models` | That URL carries **no pricing at all** |
| The `gpt-5-image` family is cheaper or better | **Priced identically**, pair for pair. No benchmark cited for "better" |
| OpenRouter carries "exactly 48" image models | The 48 ids are real; "exactly" is not. Three fetches reported totals of 56, 60 and 68 |
| Only Nano Banana 2 Lite is draft-speed | **FLUX.2 and FLUX.2 [dev] Turbo are both 2.0s**, faster and cheaper |
| Nano Banana Pro is the slowest | Dearest, yes. Slowest is **GPT Image 1.5 at 34.0s** |
| FLUX.2 [pro] has "the top text score" | **Five models tie at 5.0/5**. Not a distinction |
| Seedream's 89.5% is for 5.0 Pro specifically | Atlas Cloud's row is labelled **"Seedream 5.0"**. The qualifier ran the other way |
| GPT Image 2's launch sequencing | Source returns **HTTP 403** and cannot be read. The ~99% figure itself survives |
| A quoted "verbatim" line from OpenRouter's docs | Was the researcher's own **fetch summary**, quoted back as source. The underlying fact was true |

**The pattern worth carrying forward:** every refuted claim was either a price with no reachable
page, a superlative ("only", "exactly", "the top", "the slowest") that a wider fetch disproved,
or a summary mistaken for a quotation. Superlatives in this field are almost always wrong within
a month.

---

## 7 · What this means for the build

1. **Keep OpenRouter. Add fal at Phase 3**, for the editing operations in §5 and for nothing else.
2. **Move `Provider.image` to `POST /api/v1/images`.** It unlocks `usage.cost` (which
   `provider_cost_micro_usd` exists to hold) and `input_references` (which Match-this and Series
   need). Not done in this lane.
3. **Draft/finish is a cost decision.** Route drafts to FLUX.2 at $0.013 and finishes to
   Seedream 4.5 at $0.04 flat, which also carries 14 references and n up to 10. Do not sell it
   to customers as a speed difference.
4. **Fix the three defects in §1** before any margin figure is reported from a `cost_usd` column.
5. **Stop saying up to three minutes.** The slowest model anybody measured is 34 seconds.

## What is NOT in this document

No latency measured from our own infrastructure, and no price confirmed by a real call. Both need
a key and real spend, and this lane had neither. Until a generation runs from our servers, every
number here is somebody else's.
