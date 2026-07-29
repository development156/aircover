# 13 — Zernio Integration Reference

**Status:** Vendor selected. Integration not started.
**Last updated:** 29 July 2026
**Supersedes:** `02-aggregator-impact.md` §5 (see §12 below — that section is wrong)

---

## 0. Why this document exists

Zernio (formerly getlate.dev) is our publishing transport. This file records what
we have **verified** about it, what we have only **read**, and what is still
**unknown** — so nobody re-derives it, and nobody trusts a marketing page.

Every claim carries a marker:

| Marker | Meaning |
|---|---|
| `[LIVE]` | Observed in a real API response. Raw payload exists. |
| `[DOC]` | Stated in docs.zernio.com. Not yet observed. |
| `[OPEN]` | Unknown. Must be answered before the code that depends on it. |

**Rule: never promote a `[DOC]` to a design assumption without a `[LIVE]`
confirmation, and never write `[LIVE]` without a raw payload behind it.**

---

## 1. Connection basics

| Item | Value | Marker |
|---|---|---|
| Base URL | `https://zernio.com/api/v1` — **exactly this** | `[LIVE]` |
| Auth | `Authorization: Bearer sk_...` | `[LIVE]` |
| Key format | `sk_` + 64 hex = 67 chars. Shown once. Stored as SHA-256. | `[LIVE]` |
| ID format | 24-char Mongo-style string in `_id`. **Not UUIDs.** | `[LIVE]` |
| Error envelope | `{ error, type, code }` | `[LIVE]` |
| Body validation | Happens before the platform is called | `[LIVE]` |
| Rate limit headers | `x-ratelimit-limit` / `-remaining` / `-reset` | `[LIVE]` |
| Rate limit (free tier) | 60/min | `[LIVE]` |
| Rate limit (paid) | 600/min | `[DOC]` |
| SDK | `@zernio/node`, TypeScript | `[DOC]` |
| OpenAPI spec | `docs.zernio.com/api/openapi` | `[DOC]` |

**Key handling:** Vercel environment variables only. Never in `.env`, never
committed, never pasted into a chat. Rotate via Settings → API Keys if exposed.

---

## 2. The five traps

These have each already cost us time. Read them before writing any client code.

### 2.1 `api.zernio.com` is an HTML catch-all

`api.zernio.com/<anything>` returns **HTTP 200 with `text/html`** — including
nonsense paths like `/v1/v1/profiles`. A health check asserting only on status
code passes against a page that is not the API. `[LIVE]`

**Rule: assert on `content-type` and a body field. Never on the status line
alone.** This is the same defect class as our `exit 0` lint and our unseen cron
500s. It is now a house rule, not a Zernio-specific note.

### 2.2 `llms-full.txt` silently omits the platform table

The unrendered `[PlatformConnectTable]` component means the LLM-oriented docs
file lists **no platforms at all**. This is why Google Business Profile appeared
unsupported and why `02-aggregator-impact.md` §5 is wrong. `[LIVE]`

**Rule: rendered docs pages + OpenAPI spec are primary. `llms-full.txt` is a
convenience file and is not authoritative.**

### 2.3 `GET /accounts` is not scoped to a profile

An unfiltered call returned an account belonging to profile
`6a69d2ac81d9920d149afc18` (Default) while we were working in
`6a69f554887a67d81931b292`. `[LIVE]`

The naive picker — *"first account whose platform is instagram"* — publishes to
the wrong customer. See §3.

### 2.4 Media URLs must not redirect

Docs require *"publicly accessible, no authentication, no redirects"*, serving
real bytes with the correct `Content-Type`. A `302` fails. Google Drive,
Dropbox, OneDrive and iCloud fail because they serve an HTML interstitial rather
than image bytes. `[DOC]` + `[LIVE]` (302 observed on a test image)

Implication: **any CDN of ours that 302s to signed storage is unusable.**

### 2.5 Tokens expire in 60 days with no proactive warning

`expires_in: 5184000` (exactly 60 days), with `tokenExpiresAt`,
`needsReconnection`, `platformStatus` and `platformStatusReason` fields. `[LIVE]`

No auto-refresh is documented. The only signal is a **reactive**
`account.disconnected` webhook. `[DOC]`

A customer who connects in January silently stops publishing in March and learns
from a failed post. **By our own rule that is a fake success state on a delay.**
See §8.

---

## 3. ⚠️ The tenant boundary problem — read this twice

> **Profiles are organisational, not authorisational.**

Zernio validates `accountId` against **your whole team**, not against the profile
in the request. `[DOC]`, corroborated by the `[LIVE]` finding in §2.3.

**There is no server-side tenant boundary on publish.** A wrong `accountId`
does not error. It publishes successfully to another customer's account, returns
HTTP 200, and hands back a `platformPostUrl`. Nothing in our stack or theirs
raises an exception.

At 100 workspaces, an off-by-one in a query, a stale cached ID, or a mis-joined
row puts one shop's post on another shop's Instagram.

### Required guard — structural, not procedural

1. **Never call `GET /accounts` unfiltered.** Always scope by `profileId`.
2. **No `accountId` may reach a publish call unless it came from a query already
   scoped to the calling workspace.** Make this a type-level or function-level
   impossibility, not a convention a reviewer must remember.
3. **Independent pre-publish assertion in the dispatcher** — re-verify that the
   account belongs to the profile mapped to this workspace. Belt and braces.
4. **RLS on `connections` is now doing cross-tenant publishing safety**, not just
   data privacy. Its importance is upgraded accordingly.
5. **One permanent test** that attempts a cross-profile publish and proves it is
   refused — asserting on the **outcome** (nothing appeared on the other
   account), not on a returned error. There will be no error.

This deserves the same adversarial treatment the `ops_*` RPCs received.

---

## 4. Data model

| Zernio | Sahoda | Notes |
|---|---|---|
| Team (API key) | Sahoda Labs — one key | Billing and rate limits are per-team |
| Profile | **Workspace, 1:1** | A `Default` profile is auto-created |
| Account | Row in `connections` | Store Zernio `_id` **and** `profileId` |
| Post | `posts` + `post_publish_logs` | Zernio `_id` is our external reference |

`connections` schema additions: Zernio account `_id` (24-char string),
Zernio `profileId`, `tokenExpiresAt`, `needsReconnection`, `platformStatus`.

There is a dedicated multi-tenant guide at `docs.zernio.com/multi-tenant` —
one profile per customer, scoped keys, webhook routing. **Read it before
designing the connections schema.**

---

## 5. Publishing

### Status model

```
scheduled → publishing → published
                       → failed
                       → partial     ← we have no equivalent today
```

`partial` = landed on Instagram, failed on Facebook, **in the same call**. `[DOC]`

**This is the most important contract change.** `post_publish_logs` must carry
**per-channel** outcomes. The UI must show one post with two different truths —
no single green tick, no single red cross. Design this before writing code.

### One endpoint, three modes

| You set | Result |
|---|---|
| `scheduledFor` + `timezone` | Publishes at that time |
| `publishNow: true` | Publishes immediately |
| Neither | Saved as draft |

Cross-posting is additional entries in the `platforms` array.

### Certainty System binding

On success the response carries **`platformPostUrl` per platform** — a live link
to the actual post. `[DOC]`

> **`.is-real` keys off the presence of `platformPostUrl`, never off which code
> path ran.**

A post is real if there is a link to it on the internet. This is the honest
version of the Certainty System and it is far simpler than the refactor the
audit feared. The provider's identity is metadata, not certainty.

### Idempotency — keep our CAS claim

Zernio's idempotency is a ~5-minute request window keyed on a client-supplied
request id. `[DOC]` Two of our workers minting different ids defeats it
entirely.

**Decision:** CAS claim stays primary. Derive the Zernio request id
deterministically as `${postId}:${channel}:${scheduledAt}` so that if two
workers do race, they mint the *same* id and Zernio collapses it.

`[OPEN]` Same key, different body — undocumented. If it returns the original,
a content mutation between retries would be invisible.

---

## 6. Platforms

| Platform | API value | Status |
|---|---|---|
| Instagram | `instagram` | `[LIVE]` connected, BUSINESS account |
| Facebook | `facebook` | `[LIVE]` authUrl issued, connect not completed |
| Google Business | `googlebusiness` | `[DOC]` — **supported**, see §12 |
| LinkedIn, TikTok, YouTube, Threads, Pinterest, Reddit, Bluesky, Snapchat | | `[DOC]` |
| WhatsApp, Telegram, Discord | | `[DOC]` |

### Instagram

**Media is mandatory — there is no text-only Instagram post.** `[DOC]`

| Constraint | Value |
|---|---|
| Formats | JPEG, PNG (video MP4/MOV, H.264, 30fps) |
| Size cap | 8 MB (auto-compressed above) |
| Feed aspect range | 0.8 (4:5) → 1.91 (1.91:1) |
| Recommended | 1080×1350 (4:5, best engagement) |
| Story/Reel | 1080×1920 (9:16) — outside feed range |
| Carousel | ≤10 items |
| Publish cap | 100 posts / 24h rolling, all types |
| Account type | Business or Creator only — personal cannot publish |

Scopes requested (5): `instagram_business_basic`,
`instagram_business_content_publish`, `instagram_business_manage_insights`,
`instagram_business_manage_comments`, `instagram_business_manage_messages`
`[LIVE]`

**`manage_comments` + `manage_messages` mean Inbox is real for Instagram.
`manage_insights` means analytics are real.** Both were conditional. Both are in.

### Facebook — a conversion risk

The Page consent screen requests **13 scopes**, including `ads_management`,
`ads_read`, `leads_retrieval`, `pages_manage_ads` and `business_management`.
`[LIVE]`

To schedule a post to their own Page, a shop owner must approve *"manage your
ads and retrieve your leads."* That is a realistic drop-off point on our most
important funnel step.

**Action:** ask Zernio support whether scope sets can be narrowed per
integration. If not, the connect screen must pre-explain what is coming.

### Google Business Profile

- Publishing: Updates, Photos `[DOC]`
- **Reviews API: list and reply** `[DOC]` — the Inbox use case Indian SMBs
  actually care about
- **Performance API: impressions, clicks, calls, directions, bookings** `[DOC]`
  — business outcomes, not vanity metrics
- ⚠️ **Per-post analytics deprecated by Google, no replacement.** Location-level
  only. We cannot say *"this post got you three calls."* We can say *"this week
  you got twelve calls and thirty direction requests."* Design the weekly report
  around this limit and state it plainly in the UI.

---

## 7. Meta app review — the thesis, confirmed

The Instagram `authUrl` carries `client_id=1387147079198980` and
`redirect_uri=https://zernio.com/api/v1/connect/instagram/callback`.
Facebook carries `client_id=712341431446535`. `[LIVE]`

**Our app never appears. A real Instagram Business account was authorised with
`instagram_business_content_publish` and Sahoda Labs filed no Meta app review.**

This was the entire bet of the aggregator pivot. It holds. Meta app review is
off our critical path.

---

## 8. Token lifecycle — a launch requirement

Because there is no proactive expiry signal (§2.5), we build it:

1. Store `tokenExpiresAt` on every connection.
2. Poll for connections expiring within 7 days.
3. Warn the customer in-app and by email, with a one-click reconnect.
4. Subscribe to `account.disconnected` as the backstop, not the primary.

**This ships in the launch slice.** Silent failure two months after signup is
exactly the failure mode our product rules forbid.

---

## 9. Media pipeline — decision

**Upload bytes to Zernio at schedule time.** Do not pass our storage URLs.

Reasoning: Supabase signed URLs are *not* rejected by Zernio — the token rides
in the query string and `Content-Type` comes from object metadata. The risk is
**expiry**, which is silent, time-dependent, and lands at publish time when
nobody is watching. A three-week-out post needs a three-week token, so you take
the privacy cost *and* the expiry risk together.

Uploading moves the failure to where a human is standing: if it fails while
scheduling, the user picks another image. If a URL expires at 9am Saturday, the
post silently doesn't go out and the customer believes it did.

Additional guard: a `HEAD` pre-flight before publish asserting status **and**
`Content-Type` — status alone is worthless here (§2.1).

Build behind a swappable `MediaSource` seam. `[OPEN]` retention window for
uploaded media — could force a redesign.

---

## 10. Constraint Engine defects (found, not fixed)

In `packages/shared/src/publishing/constraints.ts` at `ef50fb6`:

1. **Media is never required, only capped.** The single check is an upper bound
   (`constraints.ts:146`). A caption-only Instagram variant returns
   `violations: []` — the editor shows green on a post that cannot publish.
2. **Instagram has no `imageDims`, so aspect ratio is never checked.**
   `validateMedia` guards on `if (spec.imageDims && …)`. `PlatformSpec` has an
   `aspectRange` field built for this and unused for IG. A 1080×1920 phone photo
   (0.56) passes. **This is the failure a real shop owner will actually hit.**
3. **`formatForPlatform` cannot express a legal Instagram post.**
   `case 'instagram': return { channel: 'instagram', caption: variant.body }` —
   one field, no media. The formatter structurally drops it.
4. Pre-existing: LinkedIn marked `publishable: true` with no adapter behind it.
5. `perDayCap: 25` is conservative against Instagram's real 100/24h.

### The root cause

> **`publishable` conflates "we have a rail" with "the payload we'd send is
> valid."** The engine only ever answered the first question.

These are latent today only because Instagram is `publishable: false` — and the
Zernio switch flips exactly that flag. **All three defects go live the instant
it flips, on the channel with the strictest media rules we support.**

### The fix — structural

Split the boolean:

- **Transport** — derived, never authored. `railFor(channel, routing)` computed
  from the `app_settings` routing row. Nobody hand-writes `publishable: true`
  again, which is the mechanism that let LinkedIn claim a rail it never had.
- **Validity** — would this specific draft be accepted?

Dispatchability falls out as `rail !== none && violations.length === 0`.

Make invalid payloads **unconstructible** rather than merely detected:

```ts
type NonEmpty<T> = [T, ...T[]]
| { channel: 'instagram'; caption: string; media: NonEmpty<MediaRef> }
```

A runtime check can be forgotten — which is precisely what happened. A compile
error cannot. The same change closes the GBP CTA/offer gap in `REQUESTS.md`.

**Note the inversion:** today "does a rail exist?" is the interesting question,
because we hand-built two adapters and claimed a third. Route through Zernio and
transport becomes nearly universal — so the only remaining gate is *"would this
payload be accepted?"*, which is exactly the half we do not model. The switch
relocates the risk from availability to validity.

---

## 11. `[OPEN]` — must be answered by the smoke test

The script is at `~/zernio-smoke/run-smoke.sh`. Raw payloads land in `raw/`.

1. Does `?profileId=` on `GET /accounts` actually filter? (§2.3)
2. **Cross-profile publish: does it succeed?** Assert on the outcome — check the
   other account — not on a returned error. (§3)
3. What does a real `partial` response look like? (§5)
4. Is the failure reason specific enough to show a shop owner? Does it
   distinguish retryable from permanent?
5. Does Zernio follow redirects on media URLs? (§2.4, §9)
6. Webhook: signing scheme, retry behaviour, and **does the event carry the
   profile ID for workspace routing?**
7. Idempotency: same key, different body. (§5)
8. Uploaded-media retention window. (§9)
9. Does Zernio auto-refresh tokens? (§8)
10. Can Facebook scope sets be narrowed? — ask support. (§6)

---

## 12. Correction to `02-aggregator-impact.md` §5

> ~~"GBP stays ours — the only channel where our own adapter is mandatory."~~
> **WRONG.** Corrected 29 July 2026.

Zernio supports Google Business Profile natively (`googlebusiness`), including
Reviews and Performance APIs. The original claim came from `llms-full.txt`,
which omits the platform table entirely (§2.2).

**Consequence:** GBP returns to launch scope, and it brings the Reviews API —
the Inbox use case with the clearest value for an Indian SMB — with it.

`03-30-day-plan.md` cut GBP on the basis of the wrong claim. That cut is
reversed.
