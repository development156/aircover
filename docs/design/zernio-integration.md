# Zernio integration — design

**Status:** draft · **Created:** 2026-07-29 · **Evidence base:** `~/zernio-smoke/FINDINGS.md`
(docs read + partial live verification against `https://zernio.com/api/v1`).

> **Note on numbering.** This file was created on 2026-07-29 to hold Phase A items **10** and **11**
> as specified. Items **1–9 are not in this file** — they were not found anywhere in the repo
> (`grep -rli zernio --include='*.md'` returned nothing, and `docs/design/` did not exist). They
> live wherever the rest of Phase A is being drafted; merge them in above §10 rather than
> renumbering these two.

---

## Phase A

### 10. Split `publishable` into transport availability and payload validity

#### The problem: one boolean is carrying two unrelated claims

`packages/shared/src/publishing/constraints.ts` has a single `publishable: boolean` per channel. It
is being read as both *"a rail exists for this channel"* and *"a post to this channel would be
accepted"*. Those are independent, and conflating them has already produced two live defects in
opposite directions:

| Channel | `publishable` | Reality | Failure mode |
|---|---|---|---|
| `linkedin` | `true` | **No adapter exists.** | Clears the dispatcher's `canAttempt` guard, then fails `NO_ADAPTER` *permanently* at publish. Production post `c36d3757` (workspace `8073bf58`) carried `linkedin:pending`. Filed in `apps/jobs/REQUESTS.md`. |
| `instagram` | `false` | Rail is coming; **payload rules are broken in three places**. | The `false` masks the defects. They all go live the moment the flag flips — which the aggregator switch requires. |

The Instagram defects, confirmed by reading the engine (see FINDINGS.md for the greps):

1. **Media is never required, only capped.** The one media check is `mediaCount > maxMediaCount` —
   an upper bound. No `MEDIA_REQUIRED` code exists anywhere in `packages/shared`. A caption-only IG
   variant returns `violations: []`. Instagram has no text-only post, so that draft is a
   100 %-certain publish failure that our validator calls valid.
2. **No aspect-ratio check.** Instagram is the only channel with no `imageDims` key, and
   `validateMedia` guards on `if (spec.imageDims && …)`. `PlatformSpec` already declares
   `aspectRange?: [number, number]` — **the field exists and is unused for the one channel that
   most needs it.** IG feed accepts 0.8–1.91 only; a 1080×1920 phone photo (0.56) passes us and is
   rejected by Meta.
3. **`formatForPlatform` cannot emit a legal IG payload.** Its Instagram arm is
   `{ channel: 'instagram'; caption: string }` — one field, no media. Even a draft *with* media
   loses it at format time. (Same class as the filed complaint that it drops GBP's CTA and offer.)

#### Why the aggregator makes this urgent rather than academic

Routing through Zernio makes **transport nearly universal** — one adapter reaches every channel it
supports. The question "does a rail exist?" stops being interesting. What remains, and becomes the
*only* real gate, is **"would this specific draft be accepted?"** — and that is exactly the half we
currently do not model.

#### The design

**Two separate concepts, neither a hand-maintained boolean.**

```ts
/** A: transport — derived, never authored. */
type Rail = { kind: 'aggregator' } | { kind: 'native'; adapter: AdapterId } | { kind: 'none' }
function railFor(channel: Channel, routing: PublishRouting): Rail
```

`routing` is the `app_settings` config row from `02-aggregator-impact.md` §6 — the escape hatch that
lets a channel be flipped back to a native adapter without a deploy. Transport availability is
*computed* from it. Nobody writes `publishable: true` by hand again, so it cannot lie about LinkedIn.

**B: validity is a function, not a flag.**

```ts
function validateForPublish(spec, draft, media): ConstraintViolation[]
```

It must answer for *this* draft, and it must include the checks that are missing today:

- `MEDIA_REQUIRED` — driven by a new `minMediaCount` on `PlatformSpec` (Instagram: 1; X, GBP,
  LinkedIn: 0).
- `MEDIA_ASPECT` — populate `imageDims.aspectRange` for Instagram as `[0.8, 1.91]`. The field is
  already declared; this is wiring, not new API surface.
- Keep the existing char, hashtag and media-count checks unchanged.

#### The structural guarantee: dispatchable ⇒ the formatter can emit a valid payload

A runtime check is not enough — it can be forgotten, exactly as it was for Instagram. Make it a
**type error** instead, so a channel whose formatter cannot express a legal post fails to compile.

Give each arm of `FormattedContent` the fields that channel actually requires, using a non-empty
tuple where media is mandatory:

```ts
type NonEmpty<T> = [T, ...T[]]

type FormattedContent =
  | { channel: 'x';         text: string;    media?: MediaRef[] }
  | { channel: 'linkedin';  text: string;    media?: MediaRef[] }
  | { channel: 'gbp';       summary: string; ctaType?: string; ctaUrl?: string
                            offer?: { title: string; terms?: string }; media?: MediaRef[] }
  | { channel: 'instagram'; caption: string; media: NonEmpty<MediaRef> }   // ← media MANDATORY
```

Now `formatForPlatform` **cannot return an Instagram payload without media** — it is not
constructible. The compiler enforces the rule the reviewer would otherwise have to remember. It also
closes the GBP CTA/offer gap in the same change.

Then derive dispatchability rather than declaring it:

```ts
function isDispatchable(channel, routing, draft, media) {
  return railFor(channel, routing).kind !== 'none'
      && validateForPublish(CONSTRAINTS[channel], draft, media).length === 0
}
```

#### Tests that must land with it

1. **A zero-media Instagram draft is REJECTED** — the exact case that passes today. Write it first
   and watch it fail against current code.
2. **A 1080×1920 image is rejected for Instagram** and accepted for a channel without an aspect
   range.
3. **Registry completeness:** enumerate every `Channel`; for each with a non-`none` rail, assert a
   formatter exists and its output satisfies that channel's required fields. This is the test that
   would have caught LinkedIn.
4. **Mutation-prove each one** — delete the check, watch the test go red, restore. A test nobody has
   seen fail is not evidence.

#### Migration

`publishable` is referenced by the editor, `posts-publish.ts`, and the dispatcher's `canAttempt`
guard. This is a `packages/shared` contract change and therefore lands with all consumers in one
commit, alongside the `Channel` / `ConnectionPlatform` / `post_publish_logs.mode` change already
scheduled for Day 17 of the 30-day plan. **Do not flip Instagram's rail on before this ships.**

---

### 11. Media pipeline — how bytes reach Zernio

#### The constraint, verbatim from the docs

Media must be *"publicly accessible (no authentication required)"* and must return *"actual media
bytes with the correct `Content-Type` header."* Explicitly broken: *"Google Drive, Dropbox, OneDrive,
and iCloud links do not work."* Zernio also exposes a media upload endpoint; direct CDN URLs are
stated to work best.

Our media lives in Supabase storage.

#### One correction to the framing

**Supabase signed URLs are not rejected by Zernio.** A `createSignedUrl` result carries its token in
the query string — no `Authorization` header, correct `Content-Type` from object metadata. It
satisfies the stated requirement. Drive/Dropbox/iCloud fail for a different reason: they serve an
HTML interstitial instead of image bytes.

So the real risk with signed URLs is **not rejection — it is expiry**, which is worse: it is
intermittent, time-dependent, and it fails at publish time when nobody is watching.

#### The three options

| | Approach | Publish-time dependency | Privacy | Expiry risk |
|---|---|---|---|---|
| **A** | Public bucket, permanent URL | Our storage must be up | ❌ every customer's media world-readable | none |
| **B** | Signed URL with a long TTL | Our storage must be up **and** the token unexpired | ⚠️ a 30-day token is effectively public | ❌ **high** |
| **C** | **Upload bytes to Zernio at schedule time** | none — Zernio holds a copy | ✅ bucket stays private | none |

#### Recommendation: **C — upload at schedule time.**

Four reasons, in order of weight:

1. **It moves the failure earlier, to where a human is present.** If the upload fails, it fails
   while the user is scheduling and can pick another image. Options A and B fail at publish time —
   9 a.m. on a Saturday, unattended, on a post the shop owner believes is going out. Our product
   rule is no fake success; a scheduled post whose media has silently expired is exactly that.
2. **It removes our storage from the publish critical path.** With C, our Supabase going down at
   9 a.m. does not stop the 9 a.m. post. With A or B it does.
3. **Privacy survives.** The bucket stays private. Option A makes every customer's uploaded photos
   world-readable, and if object paths are guessable, enumerable across tenants — unacceptable for a
   multi-tenant product serving real businesses.
4. **Option B's privacy is illusory anyway.** A post scheduled three weeks out needs a three-week
   token. A long-lived signed URL is a public URL with extra steps: you take the privacy cost of A
   *and* the expiry risk of B.

Cost is one extra transfer per scheduled post. At the volumes in the 30-day plan this is not a
consideration.

#### What to verify before committing to C  **[PENDING — needs the live run]**

- Upload endpoint path, auth, and multipart vs JSON+base64.
- **Retention**: how long does Zernio keep uploaded media? If it is shorter than our maximum
  scheduling horizon, C breaks for far-future posts and we need a re-upload step near dispatch.
- Size ceiling vs Instagram's 8 MB image / 300 MB video.
- Whether an uploaded asset is reusable across posts (matters for carousels and re-posts).

Until those are answered, implement the port so the *strategy is swappable* — one `MediaSource`
seam with `upload` and `publicUrl` implementations — rather than hard-wiring either.

#### If media becomes unreachable between schedule and publish

This must never reach the platform as a generic failure. With C it largely cannot happen; the
handling below is the safety net and covers the fallback path too.

1. **Pre-flight at dispatch.** The dispatcher issues a `HEAD` on every media URL immediately before
   handing off, asserting `2xx` **and** an image/video `Content-Type` — not status alone. Zernio's
   own `api.zernio.com` host taught us that lesson: it returns `200` with `text/html` for any path,
   so a status-only check passes against something that is not media at all.
2. **Classify as permanent, not transient.** An expired token or a deleted object will not fix
   itself on retry. It maps to `AdapterError{ classification: 'permanent' }` and must not consume
   the retry budget.
3. **Release the credit hold.** Users never pay for failures. The hold releases via
   `apply_ledger_entry` on the same path as any other permanent failure.
4. **Say something true and specific.** Not *"publish failed"* — *"The image for this post is no
   longer available. Re-upload it and reschedule."* That is a sentence a shop owner can act on,
   which is the standard §4 of the smoke test is measuring Zernio's own errors against.
5. **Record it.** A `post_publish_logs` row with the reason, so the failure is auditable rather than
   living only in a job run's return value — the gap `apps/jobs/CLAUDE.md` already documents for
   expiry reasons.
