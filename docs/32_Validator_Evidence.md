# 32 — What Zernio's Validator Actually Says

**Status:** primary evidence. Every number below was MEASURED against
`POST /v1/tools/validate/post` on 20 August 2026, lane `wt-zernio`.
**Reproduce:** `node scripts/zernio/validate-probe.mjs` (82 cases, prints
disagreements). `--json` for the raw log.
**Supersedes:** docs/31 §6.3's "they belong to whoever runs the validator
experiment", and answers two of docs/31 §7's six `[OPEN]` items.

---

## 0. The headline, because it inverts the brief

docs/31 §4 said one call to this endpoint *"would answer all six with primary
evidence."* **It does not, and the reason is worth more than the answer would
have been.**

The validator checks a narrow band of rules and **returns `valid: true` for
everything else it was handed** — including platform names it does not
recognise and media it never fetched. So a bare `valid: true` is not evidence
that anything was examined. It settles **one** of the six bounds in §6.3, and
its silence on four of the others is not a verdict about those bounds at all.

Both of those blind spots were measured with a control, not inferred.

---

## 1. Two controls, run before anything was believed

### 1.1 An unrecognised platform name is silently skipped `[LIVE]`

A 200,000-character body is refused by every platform name the validator knows.
So `valid: true` on that body means **the platform entry was skipped whole**.

| Name sent | Result |
|---|---|
| `twitter` | ✗ refused — *"exceeds the 280 character limit"* |
| **`x`** | **✓ `valid: true` — NOT CHECKED** |
| `X`, `Twitter` | ✓ `valid: true` — NOT CHECKED |
| `googlebusiness` | ✗ refused — *"exceeds the 1500 character limit"* |
| **`gbp`** | **✓ `valid: true` — NOT CHECKED** |
| `google_business`, `googleBusiness` | ✓ `valid: true` — NOT CHECKED |
| `instagram`, `linkedin` | ✗ refused |
| `facebook` `tiktok` `threads` `bluesky` `reddit` `pinterest` `telegram` `snapchat` `youtube` `slack` | ✗ refused |
| `discord`, `notaplatform`, `''` | ✓ `valid: true` — NOT CHECKED |

**`x` and `gbp` are the two names this product uses internally.** Both are
invisible to the validator. docs/31 §4 flagged this asymmetry as *"exactly the
shape of bug that returns a clean pass for a platform that was never checked"*
and asked that it be tested before any validate call ships. It is now tested and
it is real: **any validator wiring must map `x → twitter` and `gbp →
googlebusiness`, and must treat an unrecognised name as NOT CHECKED rather than
as valid.**

> **And the publish adapter must not be "tidied" to match.** `POST /v1/posts`
> accepts `platform: 'x'` — that is `[LIVE]`, we have published real posts
> through it. Only the *validator* insists on `twitter`. Unifying the two names
> would break live publishing to fix a dry run.

> **One correction, recorded because the first run got it wrong.** The control
> body was originally 40,000 characters, and `reddit`'s limit is *exactly*
> 40,000 — so Reddit returned a 100%-used warning rather than an error and was
> misread as skipped, taking `facebook` (63,206) and `slack` (40,000) with it. A
> control that does not exceed the bound it is testing proves the opposite of
> what it appears to prove.

### 1.2 Media is fetched for Instagram, and for nothing else `[LIVE]`

The same post, with an image URL that returns 404:

| Platform | Result |
|---|---|
| `instagram` | ✗ *"Image 1: Image not found at the provided URL."* |
| `linkedin` | ✓ `valid: true` |
| `googlebusiness` | ✓ `valid: true` |
| `twitter` | ✓ `valid: true` |
| `pinterest` | ✓ `valid: true` |

**This is the finding that decides §2.** The validator cannot have an opinion
about a LinkedIn image's dimensions, because it never downloads the LinkedIn
image. Its silence there is absence of evidence.

---

## 2. docs/31 §6.3's six bounds, settled and unsettled

| Bound | Ours | docs/31 `[DOC]` | Validator says | Verdict |
|---|---|---|---|---|
| `instagram.imageDims.aspectRange` | `[0.8, 1.91]` | — | **`0.75 to 1.91`, boundary-exact** | **CHANGED to `[0.75, 1.91]`** |
| `x.maxChars` | 280 | 280 free / 25,000 Premium | 280, flat | **KEPT.** The validator knows no Premium tier |
| `linkedin.imageDims` | absent | min 552×276 | *never fetched the image* | **UNSETTLED — not changed** |
| `gbp.imageDims.minW/H` | 250×250 | 400×300 | *never fetched the image* | **UNSETTLED — not changed** |
| `linkedin.maxMediaCount` | 9 | 20 | 21 images pass — no count check at all | **UNSETTLED — not changed** |
| `instagram.perDayCap` | 25 | 100 / 24 h | not a validator concern | **UNSETTLED — not changed** |

### 2.1 The one that changed, and why it changed in the loosening direction

`aspectRange` was `[0.8, 1.91]`. Measured at the boundary rather than near it:

| Image | Ratio | Validator |
|---|---|---|
| 750×1000 | 0.7500 | **accepted** |
| 749×1000 | 0.7490 | refused — *"outside Instagram's allowed range (0.75 to 1.91)"* |
| 1910×1000 | 1.9100 | **accepted** |
| 1911×1000 | 1.9110 | refused |
| 1000×1000 | 1.0000 | accepted |

So the range is `[0.75, 1.91]`, inclusive at both ends, and **our floor was wrong
in the direction that costs a customer a post**: every upright crop between 0.75
and 0.80 was refused by us and would have been accepted by Instagram.

**Loosening on primary evidence is safe in a way tightening on a summarised page
is not.** That asymmetry is the whole reason the other five are untouched. The
two docs/31 called *"the wrong direction — our engine shows green on something
the platform refuses"* (LinkedIn and GBP dimensions) are exactly the two the
validator never looked at, so changing them would still be acting on `[DOC]`.
They stay as they are, and §1.2 is the control that says why.

### 2.2 The four character limits are confirmed, at the boundary

Exactly-at-limit passes with a 100%-used warning; one character more is refused.

`twitter` 280 · `instagram` 2,200 · `linkedin` 3,000 · `googlebusiness` 1,500 —
all four match `CONSTRAINTS` exactly. Nothing to change.

---

## 3. Two of docs/31 §7's `[OPEN]` items, answered

**§7 item 5 — "does Zernio accept a 9:16 image at 1080×1920 through the same
`mediaItems` path, or is a Story media upload separate?"**

**Answered: the same path, and `contentType: 'story'` is what unlocks it.**
1080×1920 (0.5625) is refused as a feed post and **accepted as a Story**, through
an unchanged `mediaItems` array. Zernio's own feed-refusal message ends *"If you
intended to publish a Story, set platformSpecificData.contentType to
\"story\"."* — which is precisely the mechanism `wt-editor2` built.

This also confirms, from the vendor, that `decideAttach` dropping the engine's
`MEDIA_ASPECT` verdict for a Story is correct rather than convenient.

> **One thing it does NOT confirm.** A Story at 1910×1000 — landscape — also
> passes. So `FORMAT_MEDIA.story.maxAspect: 1` is **our** rule, not Zernio's, and
> it refuses something Zernio would accept. It is kept: a landscape photo in a
> Story is a mistake far more often than an intention. But it must be recorded as
> a product decision rather than a platform limit, because it is one.

**§7 item 6 — "`threadItems[].mediaItems` — is it the full `MediaItem`?"**

**Partially answered, and the honest verdict is the weaker one.** It is accepted
structurally: a segment carrying `mediaItems` validates, with a live URL and
equally with a URL that 404s, and five images on one segment pass too. So the
validator accepts the shape and **checks nothing inside it**. That is *accepted
on the wire*, which is not *X will publish it*. It stays **SENT, NOT YET
OBSERVED** (docs/31 §5.4).

**§7 item 2 — "does `platformSpecificData` apply with one platform entry?"** —
answered YES for the validator at least: `contentType: 'story'` changes the
verdict on identical media, so the block is unmistakably read.

---

## 4. What the validator DOES enforce — worth enforcing ourselves

These are primary evidence and are now enforced in this product.

### 4.1 X threads

| Case | Validator |
|---|---|
| 3 short segments | valid |
| **a 400-character segment** | **valid — NOT CHECKED** |
| segment with empty/non-string `content` | refused — *"threadItems[0] is missing or has an empty \"content\" field"* |
| **root `content` of 400 chars, segments legal** | **refused — *"Twitter content is 400 characters, exceeds the 280 character limit"*** |
| root `content` = `threadItems[0].content`, both 280 | valid |
| root `content` omitted, or `''` | valid |
| 25 segments | valid |

Two rules fall straight out of this, and they pull in opposite directions:

1. **Zernio does NOT enforce X's 280 per segment. We must.** A 400-character
   segment sails through the dry run and would be refused by X itself.
2. **The root `content` IS still character-limited even though it is not
   published.** docs/31 §2.3 quotes the spec: with `threadItems` present the root
   *"is NOT published"*. It is nonetheless validated against 280 — so the long
   body cannot be parked there. Mirroring `threadItems[0].content` into the root
   passes, and is ≤280 by construction once segment 0 is checked.

### 4.2 Polls — the one `platformSpecificData` block fully enforced

**X** `[LIVE]`: 2–4 options; each 1–25 characters; `duration_minutes` an integer
5–10,080; *"Cannot create a poll with media attachments"*; *"Polls cannot be
added to threads"*.

**LinkedIn** `[LIVE]`: `question` ≤140; `options` 2–4; `duration` one of
`ONE_DAY | THREE_DAYS | SEVEN_DAYS | FOURTEEN_DAYS`; *"Polls are mutually
exclusive with images and videos"*.

Every bound tested one step either side of the limit.

### 4.3 Nothing else

Measured to be unchecked, and therefore **ours to enforce or ours to leave**:

- **Google Business `platformSpecificData` is entirely unvalidated.**
  `topicType: 'BANANA'` passes. `callToAction` with a bogus `type` passes.
  `callToAction` with **no `url` at all** passes — although the OpenAPI document
  marks it `required: ['type','url']` `[SPEC]`. `topicType: 'EVENT'` with no
  `event` object passes. There is **no safety net here whatsoever**.
- Media **count** on every platform: LinkedIn × 21, X × 5, Instagram × 11, GBP × 2
  all pass.
- Instagram `collaborators` × 4 (the docs say ≤3), `firstComment`,
  `isAiGenerated`, X `madeWithAi`, LinkedIn `documentTitle` — accepted, unchecked.

---

## 5. Consequences for wiring the validator into the product

It is a **useful second opinion and a catastrophic primary check**. If it is ever
put on the publish path:

1. Map `x → twitter`, `gbp → googlebusiness`, in a table **separate** from
   `ZERNIO_PLATFORM_NAME` (§1.1).
2. **Fail closed.** A name not in the validator's own list must read as *not
   checked* — never as valid.
3. A validator pass must **never** suppress a Constraint Engine refusal. It
   checks a strict subset, and §1.2 and §4.3 are the measurement that proves it.
