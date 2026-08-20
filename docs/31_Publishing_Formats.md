# 31 — Publishing Formats

**Status:** Research complete. Phase 2 scope boundary is §5.
**Written:** 20 August 2026, lane `wt-editor2`, cut from `wt-composer`.
**Primary sources:** the Zernio OpenAPI document (`3.1.0`, `info.version 1.0.4`,
397 paths, 2.29 MB) parsed mechanically; the rendered platform guides at
docs.zernio.com; this repository at `949cf97`; and one live read of production.

---

## 0. How to read this, and one warning about how it was made

Doc 13's marker convention applies and is extended by one:

| Marker | Meaning |
|---|---|
| `[LIVE]` | Observed in a real API response or a real database. Raw evidence exists. |
| `[SPEC]` | Read out of the OpenAPI document by a parser, not by a summariser. Exact. |
| `[DOC]` | Stated on a rendered docs.zernio.com page, read through a summarising model. |
| `[CODE]` | True of this repository, with a `file:line`. |
| `[OPEN]` | Unknown. |

**`[SPEC]` outranks `[DOC]`, and the difference is not pedantry.** The first
attempt at this research asked a model to summarise the OpenAPI document. It
returned an endpoint named `POST /v1/post` and a request field named
`platformSpecificOptions`. Both are wrong. The real endpoint is `POST /v1/posts`
and the real field is `platformSpecificData`, nested inside each entry of
`platforms[]` rather than sitting at the root. Code written against that summary
would have compiled, passed review, sent a payload Zernio ignores, and reported
success.

So every field name, enum value and numeric bound marked `[SPEC]` below was
extracted by loading the YAML and walking the schema tree. Everything marked
`[DOC]` came through a summariser and is good enough to plan with and **not good
enough to enforce**. Where the two overlap they agree — LinkedIn's poll bounds
are identical in both — which is the only reason `[DOC]` is trusted at all.

---

## 1. What we send, and what Zernio accepts

### 1.1 The payload this product sends today `[CODE]`

`packages/publishing/src/adapters/zernio.ts:221-241`, one call per channel:

```ts
mediaItems = media.map((m) => ({ type: 'image', url, mimeType, altText }))
createPost({
  content:  bodyOf(req.content),
  mediaItems,
  platforms: [{ platform, accountId }],
  publishNow: true,
  timezone: 'UTC',
}, requestId)
```

Four fields. The client type that bounds it is
`packages/publishing/src/zernio/client.ts:204-211`, and it is narrower than the
wire format — `platforms[]` is typed `{ platform, accountId }[]` with nothing
else permitted.

### 1.2 The payload Zernio accepts `[SPEC]`

`POST /v1/posts` takes **18 root properties**:

`title`, `content`, `mediaItems`, `platforms`, `scheduledFor`, `publishNow`,
`isDraft`, `timezone`, `tags`, `hashtags`, `mentions`, `crosspostingEnabled`,
`metadata`, `tiktokSettings`, `facebookSettings`, `recycling`,
`queuedFromProfile`, `queueId`.

And each entry of `platforms[]` takes **five**:

| Field | Type | What it does `[SPEC]` |
|---|---|---|
| `platform` | string, **required** | |
| `accountId` | string, **required** | |
| `customContent` | string | *"Platform-specific text override. When set, this content is used instead of the top-level post content for this platform."* |
| `customMedia` | `MediaItem[]` | Per-platform media, overriding the root `mediaItems`. |
| `scheduledFor` | date-time | *"Optional per-platform scheduled time override."* |
| `platformSpecificData` | `oneOf` 15 schemas | The per-format controls. §3. |

> ### The finding that reorders everything
>
> **Zernio has one-body-per-channel built into its wire format, and this product
> — whose entire differentiator is one body per channel — does not use it.**
> `customContent`, `customMedia` and per-platform `scheduledFor` exist on the
> platform entry. We send one platform per call with a root-level `content`,
> which reaches the same outcome for the body and reaches *nothing at all* for
> `platformSpecificData`, which has no root-level equivalent.

That is not a defect on its own — one call per channel is a defensible design and
it buys per-channel failure isolation, which `post_variants.publish_status`
depends on. It becomes a defect only where a control exists **on the platform
entry and nowhere else**, because then not sending a platform entry with data
means the control is unreachable. Every format below is in that position.

### 1.3 `MediaItem` `[SPEC]`

```
type      enum[image, video, gif, document]
url       uri
title     string   # LinkedIn document title, falls back to post title then filename
altText   string   # IG feed images only (not Reels/Stories), FB, Threads, X (≤1000),
                   # LinkedIn, Bluesky, Pinterest (≤500). Ignored on TikTok, YouTube,
                   # Snapchat, Telegram, Reddit, Google Business, WhatsApp.
filename  string
size      integer
mimeType  string
thumbnail uri      # FB video/Reels, LinkedIn video. Max 10MB.
instagramThumbnail uri   # IG Reel cover
```

`type` is a four-value enum. **We hardcode `'image'`** at
`packages/publishing/src/adapters/zernio.ts:222`. A LinkedIn document post and an
Instagram Reel are unreachable by that single literal, which is exactly what
migration `20260819000200`'s own header warned about before the column was added.

---

## 2. Per-platform, every format

`[SPEC]` where the field is from the parsed schema. Numeric media bounds are
`[DOC]` — they live on the rendered guides, not in the OpenAPI — and are recorded
here to plan against, never to enforce.

### 2.1 Instagram

Selected by: `platformSpecificData.instagram.contentType` (enum: `story` — the
**only** value) plus the shape of the media. `[SPEC]`

| Format | How it is chosen | Items | Image aspect | Video aspect | Max size | Duration |
|---|---|---|---|---|---|---|
| Feed | default; 1 media | 1 | 0.8–1.91 | 4:5–1.91 | 8 MB img / 300 MB vid | 60 min |
| Carousel | default; 2–10 media | ≤10 | 0.8–1.91 | — | 8 MB each | — |
| Reel | default; 1 **video** | 1 video | — | 9:16 | 300 MB | 90 s |
| Story | `contentType: 'story'` | 1 | **9:16** | **9:16** | 8 MB img / 100 MB vid | 60 s |

Caption 2,200 chars; media mandatory (no text-only post); 100 posts / 24 h
rolling. `[DOC]`, and the caption/mandatory-media pair is `[LIVE]` in doc 13 §6.

> **Story's aspect ratio is why format cannot be a post-level property.** 9:16 is
> 0.5625. The feed range is 0.8–1.91. A single photo is legal as a Story and
> illegal as a feed post, on the same channel, on the same day. Our engine holds
> exactly one `aspectRange` per channel
> (`packages/shared/src/publishing/constraints.ts:170`), so it can express one of
> those two and not both.

Other `platformSpecificData.instagram` fields `[SPEC]`: `shareToFeed`,
`collaborators` (≤3 usernames), `firstComment`, `userTags`, `audioName`,
`audioConfiguration`, `thumbOffset`, `instagramThumbnail` / `reelCover`,
`trialParams`, `isAiGenerated`.

### 2.2 LinkedIn

Selected by: the media types present, plus `platformSpecificData.linkedin`. `[SPEC]`

| Format | How it is chosen | Items | Limits |
|---|---|---|---|
| Text | no media | 0 | 3,000 chars |
| Image | 1 image | 1 | 8 MB, min 552×276, max 8192², JPEG/PNG/GIF |
| Multi-image | 2+ images | **≤20** | 8 MB each |
| Video | 1 video | 1 | 5 GB, 3 s – 10 min personal / 30 min company page |
| Document | `MediaItem.type: 'document'` + `documentTitle` | 1 | PDF/PPT/DOC, 100 MB, **300 pages** |
| Poll | `platformSpecificData.linkedin.poll` | 0 media | question ≤140, 2–4 options ≤30 each, `ONE_DAY\|THREE_DAYS\|SEVEN_DAYS\|FOURTEEN_DAYS` |
| Reshare | `platformSpecificData.linkedin.reshareUrl` | — | with `content` it becomes a quote-reshare |

`poll` is `[SPEC]` and its bounds are confirmed identically by `[DOC]` — the one
place both sources overlap, and they match exactly.

Other fields `[SPEC]`: `organizationUrn`, `firstComment`, `disableLinkPreview`,
`geoRestriction`. Poll *"cannot be combined with media or reshareUrl"*.

### 2.3 X

Selected by `platformSpecificData.x`. `[SPEC]`

| Format | How it is chosen | Notes |
|---|---|---|
| Post | default | 280 chars free, **25,000 Premium** `[DOC]` |
| Thread | `threadItems: [{ content, mediaItems }]` | first item is the root, rest chain as replies |
| Media | `mediaItems` | ≤4 images 5 MB each; 1 video MP4/MOV ≤512 MB ≤140 s; 1 GIF ≤15 MB `[DOC]` |
| Poll | `poll: { options[2–4] ≤25 chars, duration_minutes 5–10080 }` | *"Mutually exclusive with media attachments and threads."* |
| Article | `article` (`XArticle`) | Premium long-form |
| Quote | `quoteTweetId` | *"Mutually exclusive with media and poll."* |
| Reply | `replyToTweetId` | |

`replySettings` enum `[SPEC]`: `following`, `mentionedUsers`, `subscribers`,
`verified`. Also `longVideo`, `paidPartnership`, `madeWithAi`, `sensitiveMedia`,
`geoRestriction`.

> **The thread trap, quoted from the spec:** *"When `threadItems` is provided,
> the top-level `content` field is used only for display and search purposes, it
> is NOT published. You must include your first tweet as `threadItems[0]`."*
>
> This has a consequence for the refusal gate, not just the editor. §6.2.

### 2.4 Google Business Profile

Selected by `platformSpecificData.googlebusiness.topicType`, enum
`STANDARD | EVENT | OFFER`. `[SPEC]`

| Format | Required extra `[SPEC]` |
|---|---|
| What's new (`STANDARD`) | none — the default when `topicType` is omitted |
| Event (`EVENT`) | `event.title` + `event.schedule.startDate {year,month,day}` / `endDate`; optional `startTime` / `endTime` `{hours,minutes}`. *"Uses Google's date format (NOT ISO 8601)."* Google returns 400 if omitted. |
| Offer (`OFFER`) | `offer.{redeemOnlineUrl, termsConditions, couponCode}` — all optional per Google, at least one recommended |

**`callToAction` is `{ type, url }` and `required: ['type','url']`.** `[SPEC]`
The `type` enum is exactly:

```
LEARN_MORE  BOOK  ORDER  SHOP  SIGN_UP  CALL
```

which is **the same six values**, as a set, that
`packages/shared/src/publishing/constraints.ts:110` already declares. That is a
happy accident worth recording: our list was right. **The `url` beside it is not
optional, and we collect no URL anywhere.** §6.1.

Text ≤1,500 chars; 1 image; JPEG/PNG; min 400×300; ≤5 MB; **video not
supported**. `[DOC]`

### 2.5 The platforms that are not channels here

Facebook, YouTube and Pinterest are fully specified by Zernio and are **not
values of `ChannelSchema`** (`packages/shared/src/enums.ts:8`, four values:
`x`, `gbp`, `linkedin`, `instagram`). They are recorded for completeness because
the brief asked for them, and because their absence is a different kind of
unreachable from "Zernio cannot do it" — see §5's third axis.

**Facebook** `[SPEC]` `contentType: story | reel`, plus `title` (reel only),
`firstComment`, `pageId`, `geoRestriction`, `facebookSettings`.
`[DOC]`: feed ≤10 images 4 MB each, 1 video ≤4 GB ≤240 min, text 63,206 chars
truncated at ~480; story 1 image 1080×1920 or video ≤120 s, captions not shown;
reel single vertical video 3–60 s.

**YouTube** `[SPEC]` `title` (≤100), `visibility` `public|private|unlisted`,
`madeForKids`, `categoryId`, `playlistId`, `firstComment` (≤10,000),
`containsSyntheticMedia`. Root `tags` — *"each tag max 100 chars, combined max
500 chars"*.
`[DOC]`: **there is no Short flag.** *"A video that is 3 minutes or shorter AND
has a vertical (9:16) aspect ratio is classified as a Short."* Description
5,000 chars. Max file 256 GB.

**Pinterest** `[SPEC]` `title` (≤100), `boardId`, `link`, `coverImageUrl`,
`coverImageKeyFrameTime`.
`[DOC]`: image pin 1 image ≤32 MB, optimal 2:3 (1000×1500), min 100×100; video
pin 1 video ≤2 GB, 4 s–15 min; description ≤500. **Idea Pins are explicitly
listed as not supported.**

**Eleven more platforms have schemas we have never looked at** `[SPEC]`:
TikTok (18 fields incl. commercial-content disclosure), Threads, Bluesky,
Reddit (13 fields incl. subreddit/flair/NSFW/spoiler), Telegram, Discord
(10 fields incl. forum threads and polls), Slack, Snapchat, and the two Ads
schemas.

---

## 3. What Zernio supports that this product never asks for

Ordered by what it would be worth here, not by how hard it is.

| Capability | Where it lives `[SPEC]` | Why it matters |
|---|---|---|
| **`customContent` per platform** | `platforms[].customContent` | Our entire differentiator, on their wire format, unused |
| **`customMedia` per platform** | `platforms[].customMedia` | Media is post-level here (`post_media.post_id`); Zernio would take it per channel |
| **X threads** | `x.threadItems` | The single highest-value channel-specific format for a 280-char channel |
| **GBP CTA button** | `googlebusiness.callToAction` | We *collect* it and drop it. §6.1 |
| **GBP event / offer** | `googlebusiness.topicType` + `event` / `offer` | The two post types an Indian SMB actually wants from GBP |
| **Instagram Story** | `instagram.contentType: 'story'` | Reachable with our image-only pipeline today |
| **LinkedIn document** | `MediaItem.type: 'document'` + `documentTitle` | PDF carousels — the highest-reach LinkedIn format |
| **Polls** | `x.poll`, `linkedin.poll` | No media needed; pure text + options |
| **Dry-run validation** | `POST /v1/tools/validate/post` | §4 |
| **First comment** | `instagram`/`linkedin`/`facebook`/`youtube`.`firstComment` | The standard hashtag-in-first-comment practice |
| **Per-platform schedule** | `platforms[].scheduledFor` | Stagger a post across channels in one call |
| **Alt text** | `MediaItem.altText` | We pass it already — worth recording that this one *is* wired |
| **Draft posts** | `isDraft` | A Zernio-side draft, distinct from ours |
| **Queue slots** | `queuedFromProfile`, `queueId` | "Best time" scheduling without us computing it |
| **Post editing** | `POST /v1/posts/{id}/edit`, `/unpublish`, `/retry` | We have no post-publish edit path at all |
| **AI disclosure labels** | `instagram.isAiGenerated`, `x.madeWithAi`, `youtube.containsSyntheticMedia` | We generate images and never label them |

The last row deserves a sentence of its own. This product generates images
(`image_generate`, 6 credits) and attaches them to posts that go to Instagram and
X, and both platforms expose a self-disclosure flag that we do not set. That is
not a format gap; it is a policy gap, and it should be somebody's item.

---

## 4. `POST /v1/tools/validate/post` — the endpoint that ends the argument

`[SPEC]`, quoted:

> *"Dry-run the full post validation pipeline without publishing. Catches issues
> like missing media for Instagram/TikTok/YouTube, hashtag limits, invalid thread
> formats, Facebook Reel requirements, and character limit violations. Accepts the
> same body as `POST /v1/posts`. Does NOT validate accounts, process media, or
> track usage. […] Returns `errors` for failures and `warnings` for near-limit
> content (>90% of character limit)."*

It takes `platforms[].platformSpecificData` and `customMedia`. Its `platform`
enum is the authoritative list of 15 publishable platforms `[SPEC]`:

```
twitter instagram tiktok youtube facebook linkedin bluesky threads
reddit pinterest telegram snapchat googlebusiness discord slack
```

**Note `twitter`, not `x`.** `ZERNIO_PLATFORM_NAME`
(`packages/publishing/src/adapters/zernio.ts:69`) maps our `x` → `'x'`. The
publish endpoint's own example is `"example": "twitter"`. Whether `POST /v1/posts`
accepts `'x'` as an alias is `[LIVE]`-true — we have published through it — but
the validate endpoint's enum does not list it, so a validation call would have to
send `twitter`. **This asymmetry must be tested before any validate call ships.**
It is exactly the shape of bug that returns a clean pass for a platform that was
never checked, which is worse than not checking.

This endpoint is the honest answer to "would this payload be accepted?" — the
question doc 13 §10 identified as the half we do not model, and then answered by
proposing we model it ourselves. Zernio models it. We have never called it.

---

## 5. The scope boundary — three axes, not one

The brief asked for `PUBLISHES TODAY / ZERNIO SUPPORTS, WE DON'T CALL IT / NOT
SUPPORTED`. That collapses two different blockers, so a third and fourth column
are added: whether the channel exists in this product at all, and whether the
format is **storable** — `post_variants.format` is a `CHECK` constraint over
exactly four strings (`packages/db/supabase/migrations/20260819000200_post_variant_format.sql`),
and a format that cannot be written down cannot be built on.

**`post_variants.format` is `[LIVE]` in production**, confirmed 20 Aug 2026 by a
service-role read: `select id, channel, format from post_variants limit 3`
returned `200` with three rows, every `format` null. The control — the same query
with a bogus column — returned `400 / 42703 column does not exist`, so the probe
can distinguish a present column from an absent one.

| Channel | Format | In `ChannelSchema`? | Storable in `format`? | Zernio? | Verdict |
|---|---|---|---|---|---|
| Instagram | Feed image | yes | `image` | yes | **PUBLISHES TODAY** |
| Instagram | Carousel | yes | `carousel` | yes | **PUBLISHES TODAY** |
| Instagram | Story | yes | **no** | `contentType:'story'` | ZERNIO SUPPORTS, WE DON'T CALL IT |
| Instagram | Reel | yes | `video` | yes | BLOCKED — media ingest, §5.1 |
| LinkedIn | Text | yes | `text` | yes | **PUBLISHES TODAY** |
| LinkedIn | Image | yes | `image` | yes | **PUBLISHES TODAY** |
| LinkedIn | Multi-image | yes | `carousel` | yes (≤20) | **PUBLISHES TODAY** (capped at 9, §6.3) |
| LinkedIn | Video | yes | `video` | yes | BLOCKED — media ingest, §5.1 |
| LinkedIn | Document | yes | **no** | `MediaItem.type:'document'` | BLOCKED — media ingest, §5.1 |
| LinkedIn | Poll | yes | **no** | `linkedin.poll` | ZERNIO SUPPORTS, WE DON'T CALL IT |
| X | Post | yes | `text` | yes | **PUBLISHES TODAY** |
| X | Media | yes | `image` / `carousel` | yes (≤4) | **PUBLISHES TODAY** |
| X | Thread | yes | **no** | `x.threadItems` | ZERNIO SUPPORTS, WE DON'T CALL IT |
| X | Poll | yes | **no** | `x.poll` | ZERNIO SUPPORTS, WE DON'T CALL IT |
| X | Article | yes | **no** | `x.article` | ZERNIO SUPPORTS — Premium only, out of scope |
| GBP | What's new | yes | `text` / `image` | `topicType:'STANDARD'` | **PUBLISHES TODAY** |
| GBP | + CTA button | yes | n/a | `callToAction {type,url}` | **COLLECTED AND DROPPED**, §6.1 |
| GBP | Event | yes | **no** | `topicType:'EVENT'` | ZERNIO SUPPORTS, WE DON'T CALL IT |
| GBP | Offer | yes | **no** | `topicType:'OFFER'` | ZERNIO SUPPORTS, WE DON'T CALL IT |
| Facebook | post / story / reel / link | **no** | — | yes | NOT A CHANNEL HERE |
| YouTube | short / video | **no** | — | yes | NOT A CHANNEL HERE |
| Pinterest | pin / video pin | **no** | — | yes | NOT A CHANNEL HERE |
| Pinterest | idea pin | **no** | — | **no** | NOT SUPPORTED BY ZERNIO |

### 5.1 Why video, Reel and document are blocked, precisely

Not by the picker, and not by Zernio. By **ingest**.

`apps/web/src/lib/posts/sniff-image.ts` reads a file's own magic bytes and
recognises exactly four containers — JPEG, PNG, WebP, GIF — and refuses
everything else outright, with no fallback to the browser-supplied `File.type`.
That refusal is correct and load-bearing: it is the only thing standing between
`validateMedia` and a 40 MB video renamed `photo.jpg`. `[CODE]`

So a video cannot enter the system. Not "is not offered" — cannot be stored.
`formatsFor` (`packages/publishing/src/format.ts:78`) derives `video` from
`spec.mediaTypes.some(m => m.startsWith('video/'))`, no channel declares a video
mime, and therefore `video` is never offered — which is the derivation working
exactly as designed, refusing a format the pipeline cannot feed.

**Reel, LinkedIn video and LinkedIn document all require an ingest path that
sniffs and stores non-image bytes.** That is a different lane's work — a new
sniffer, a size ceiling four orders of magnitude higher than
`MEDIA_UPLOAD_CAP_BYTES`, a thumbnail story, and a Supabase upload path that does
not run through a server action's body limit. **They stay coming-soon, and the
reason shown to a writer is the true one.**

### 5.2 What Phase 2 may therefore build

Storable today, publishable today, enforceable today:

- `text`, `image`, `carousel` — per channel, with per-format media rules.

Needs the `CHECK` widened by one additive migration, and nothing else:

- **`story`** (Instagram) — one image, 9:16, `contentType: 'story'`.
- **`thread`** (X) — text plus per-segment media, `threadItems`.

Both are reachable with the image-only ingest we have. Both are the highest-value
format on their channel. Everything else in §5 stays coming-soon with the reason
stated where the control would be.

---

## 6. Defects found while reading, in severity order

### 6.1 The GBP call-to-action is a control that does nothing `[CODE]`

`apps/web/src/components/composer/version-options.tsx:85-99` renders a `<select>`
of the six CTA types and writes the choice to `post_variants.extras.gbpCta`.

The choice then dies. `formatForPlatform`
(`packages/shared/src/publishing/constraints.ts:333`) never reads `extras` and
never sets `ctaType` or `ctaUrl` — the two fields its own `gbp` arm declares at
`constraints.ts:58-59`. The Zernio adapter sends no `platformSpecificData` at
all. The native GBP adapter *does* read `content.ctaType`
(`packages/publishing/src/adapters/gbp.ts:132-138`) but is never reached, because
`openSecret` is unwired and it ends at `CONNECTION_UNAVAILABLE` every time.

So: the writer picks "ORDER", sees it saved, and Google shows no button.
**Against NO DEAD ENDS this is worse than the control being absent** — an absent
control makes no promise.

And the fix is not just plumbing: `callToAction.url` is `required` alongside
`type` `[SPEC]`, and there is no URL field anywhere in the composer. A CTA
without a URL is not a partial feature; it is a payload Zernio rejects.

### 6.2 The refusal gate cannot see a thread `[CODE]`

`apps/jobs/src/publish/runPublishPost.ts:365` gates on
`publishedTextOf(formatForPlatform(spec, draft))`, which returns
`content.text` — the single body.

Per §2.3, when `threadItems` is present the top-level `content` **is not
published**. A red line written into segment three would go out having never been
put to the classifier, while the classifier returned a clean pass on a string
nobody will read.

**Threads must not ship until the gate reads every segment.** A guard that
silently narrows its input is the failure this product's rules name explicitly.

### 6.3 Constraint Engine values that disagree with the vendor `[DOC]` vs `[CODE]`

| Spec field | Ours | Zernio's guide | Effect |
|---|---|---|---|
| `linkedin.maxMediaCount` | 9 `(constraints.ts:148)` | 20 | We refuse 10 images LinkedIn would take. Conservative — safe. |
| `linkedin.maxMediaMB` | 5 `(constraints.ts:147)` | 8 | Conservative — safe. |
| `linkedin.imageDims` | absent | min 552×276 | **A 100×100 image passes our checks and LinkedIn rejects it.** |
| `gbp.imageDims.minW/H` | 250×250 `(constraints.ts:136)` | 400×300 | **A 300×300 image passes ours and fails there.** |
| `x.maxChars` | 280 `(constraints.ts:119)` | 280 free / 25,000 Premium | A Premium account is capped at 280 by us. Under-promising. |
| `instagram.perDayCap` | 25 `(constraints.ts:171)` | 100 / 24 h | Already noted in doc 13 §10. Conservative. |

The two marked in bold are the wrong direction — our engine shows green on
something the platform refuses — and both are the exact class doc 13 §10 called
the root cause: *"`publishable` conflates 'we have a rail' with 'the payload we'd
send is valid.'*"

They are `[DOC]`-sourced and therefore **not fixed in this lane**; tightening a
limit on the strength of a summarised page could refuse posts that are fine.
They belong to whoever runs the `/v1/tools/validate/post` experiment in §4, which
would answer all six with primary evidence in one call.

### 6.4 Operational facts the adapter does not handle `[SPEC]`

Not format work. Flagged, not fixed.

- **Content-hash dedup returns `409` within 24 h**, keyed on
  `(platform, accountId, content + media URLs)`, independently of `x-request-id`.
  `ZernioError.classification` (`packages/publishing/src/zernio/client.ts:64`)
  maps every 4xx that is not 429 to `permanent`. A legitimate re-post of
  identical copy — the same "Open today 9–6" a shop sends twice — is therefore
  filed as a permanent failure. The 409 body carries `existingPostId`, so it
  could be recognised and reported as "already posted" with a link.
- **`429` covers four different things**: API rate limit, **a velocity limit of
  25 posts/hour per account**, account cooldown, and daily quota. We treat all
  four as one transient retry.
- **`403` distinguishes `ACCOUNT_DISCONNECTED`** by a `code` field — the reactive
  signal doc 13 §8 asks for, available on the publish response itself.

---

## 7. `[OPEN]`

1. Does `POST /v1/posts` accept `platform: 'x'`, or only `'twitter'`? We publish
   with `'x'` `[LIVE]`, and the validate enum lists only `'twitter'` `[SPEC]`.
2. Does `platforms[].platformSpecificData` apply when the array has one entry and
   the content is at the root? (Everything in Phase 2 assumes yes.)
3. Does `customContent` change the content-hash dedup fingerprint?
4. What does `/v1/tools/validate/post` return, exactly? Shape unspecified in the
   schema beyond *"errors"* and *"warnings"*.
5. Instagram Story: does Zernio accept a 9:16 image at 1080×1920 through the same
   `mediaItems` path, or is a Story media upload separate?
6. `threadItems[].mediaItems` — is it the full `MediaItem`, and does the root
   `mediaItems` still apply if omitted?

Every one of these is answerable by a single smoke call, and none of them should
be answered by reading.
