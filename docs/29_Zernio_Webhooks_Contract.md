# 29 — Zernio Webhooks: the contract, parsed

Source of truth for this file: **`https://docs.zernio.com/api/openapi`**, fetched
2026-08-21. `application/x-yaml`, **2,298,592 bytes**, `openapi: 3.1.0`,
`info.version: 1.0.4`. Parsed with PyYAML (duplicate-key detector run over it:
**0 duplicate keys**, so nothing was silently collapsed). Prose quotes come from
`https://docs.zernio.com/llms-full.txt` (4,173,873 bytes, same date).

Everything below is quoted or extracted, never summarised. Where the two Zernio
sources disagree, both are printed and the conflict is called out.

---

## 0. The counting trap that hides the whole contract

The brief that commissioned this work said the document has **397 paths**. It has
**399**. That is not the important part. The important part:

```
top-level keys: components, info, openapi, paths, security, servers, tags, webhooks, x-documentation
paths:     399
webhooks:   49        <-- a SEPARATE top-level object, new in OpenAPI 3.1
schemas:   189
```

**OpenAPI 3.1 added a top-level `webhooks:` object.** The entire webhook contract
lives there, not under `paths`. Anyone who counts or greps `.paths` — which is what
"397 paths" implies was done — sees **none of it**, concludes the contract is
undocumented, and starts inventing. That is the same failure mode that produced
`/v1/post` and `platformSpecificOptions`.

Three endpoints DO live under `paths`, and they are the management plane:

| path | methods | summary |
|---|---|---|
| `/v1/webhooks/settings` | GET, POST, PUT, DELETE | List / create / update / delete subscriptions |
| `/v1/webhooks/test` | POST | Send test webhook (`event: "webhook.test"`) |
| `/v1/webhooks/logs` | GET | List webhook delivery logs |

There is **no replay / redeliver / dead-letter-requeue endpoint in the API.** The
spec's prose refers to redelivery and dead-letter requeue as things that exist and
are permission-checked, but no path implements them: a `replay|redeliver|dead|dlq|requeue`
scan over all 399 paths returns nothing. Replay is dashboard-only. **Reconciliation
therefore cannot be "ask Zernio to resend"; it has to be a pull.** See §7.

---

## 1. Signature verification — exact construction

`X-Zernio-Signature`. From the webhooks overview, verbatim:

> If the webhook has a secret configured, every delivery includes an
> `X-Zernio-Signature` header. The signature is the lowercase hex `HMAC-SHA256`
> of the raw request body keyed by your webhook secret.

So, precisely:

| element | value |
|---|---|
| header | `X-Zernio-Signature` |
| legacy alias | `X-Late-Signature` ("kept for backward compatibility") |
| algorithm | HMAC-SHA256 |
| key | the `secret` we supply at subscription creation |
| **signed bytes** | **the raw request body, and nothing else** |
| encoding | **lowercase hex** |
| prefix | **none** — not `sha256=`, not `t=…,v1=…` |

Three consequences that are easy to get wrong:

1. **No timestamp is signed.** Unlike Cashfree, there is no `t=` to bind. A replay
   window cannot be built out of the signature, and §3 explains why one must not be
   built out of `payload.timestamp` either.
2. **The body must be read raw, before JSON parsing.** `await req.json()` then
   `JSON.stringify` re-serialises and changes the bytes — key order, whitespace,
   unicode escaping — and the HMAC will not match. Read `await req.text()` once.
3. **The signature is OPTIONAL on Zernio's side** — the spec's Webhooks tag says
   "optional HMAC-SHA256 signature in X-Zernio-Signature header. Configure a secret
   key to enable verification." A subscription without a secret sends no header at
   all. That is a property of the *subscription*, not of the request, so our
   receiver must fail closed: **a missing header is a rejection, not a skip.**
   Otherwise anyone who can POST to the URL is trusted.

---

## 2. Idempotency — the key is given to us, twice

> Webhook deliveries use **at-least-once** semantics: the same event may arrive
> more than once if a previous attempt's response was lost or your endpoint took
> too long to acknowledge. Your handler must therefore be idempotent.

> - `payload.id`, the canonical event ID (UUID).
> - `X-Zernio-Event-Id`, the same value, repeated as a header for convenience.
> - `X-Late-Event-Id`, legacy alias of the above, kept for backward compatibility.

> A typical pattern is to insert the event ID into a unique-indexed table or cache
> before processing the payload, and skip processing when the insert conflicts.

The id is in **two places**, and they are not equally trustworthy. The header is
outside the signed bytes; `payload.id` is inside them. **Dedupe on `payload.id`.**
A forger who cannot produce a valid HMAC can still set any header they like, so a
unique index over the header value would let an attacker suppress a real event by
pre-claiming its id. The header is a convenience for routing, not an identity.

`WebhookPayloadPost.id` is typed `string` in the spec and described as "Stable
webhook event ID"; the prose additionally says UUID. **We store it as `text`, not
`uuid`** — the two sources disagree on precision and a `uuid` column would reject
a delivery outright, turning a documentation inconsistency into dropped events.

---

## 3. `timestamp` is NOT delivery time, and must never be used as a freshness window

`WebhookPayloadPost.timestamp`, verbatim:

> UTC time at which Zernio generated this event (set once when the event payload
> is built, before delivery is queued). **Retries and redeliveries keep the
> original value, so it reflects the event, not the delivery attempt.**

The Cashfree receiver rejects deliveries outside a timestamp window. **Copying that
here would be a bug.** The retry schedule (§4) runs to ~51 hours, and a
dead-letter requeue can be days later — every one of those legitimate deliveries
carries the *original* timestamp. A 5-minute window would reject attempt 4 onward
of every event whose first attempt we missed, which is exactly the set of events
we most need.

Freshness is not the defence here. The HMAC is, and the unique index is.

---

## 4. Delivery, retries, timeout

> A delivery is considered successful when your endpoint returns a `2xx` response
> **within 5 seconds**. Any other outcome (non-`2xx` status, request timeout,
> connection error) triggers a retry on an exponential backoff schedule capped at
> 24 hours.

| Attempt | Delay before this attempt | Cumulative |
|---|---|---|
| 1 | immediate | 0 |
| 2 | 10s | ~10s |
| 3 | 1m 40s | ~1m 50s |
| 4 | 16m 40s | ~18m 30s |
| 5 | 2h 46m 40s | ~3h 5m |
| 6 | 24h (capped) | ~27h 5m |
| 7 | 24h (capped) | ~51h 5m |

> After the 7th attempt fails the event is moved to a dead-letter queue and is no
> longer retried automatically.

**The 5-second budget is a design constraint on the receiver, not a note.** It
means: verify, insert the raw event, return 200. No enrichment, no Zernio call, no
fan-out inside the request. Anything else risks a timeout, which Zernio counts as
a failure and retries — turning a slow handler into a duplicate storm.

### 4a. A CONTRADICTION between Zernio's own two documents

| source | claim |
|---|---|
| OpenAPI `POST /v1/webhooks/settings`, description | "Webhooks are **automatically disabled after 10 consecutive delivery failures**." |
| llms-full.txt, Webhooks overview | "Webhooks are **never auto-disabled based on failure count**, you can pause or remove them from your webhook settings." |

These cannot both be true. Unresolved, and **not resolvable from the documents** —
it needs a support answer or an observed 10-failure run, and deliberately neither
was performed against production. We build for the **worse** case: assume a
sustained outage can silently disable the subscription. That assumption is exactly
why §7's reconciliation sweep must not depend on webhooks working, and why it is
driven by our own pending rows rather than by anything Zernio pushes.

---

## 5. Workspace routing — the answer to doc 13 §11 Q6

Doc 13 §11 lists as an open question:

> 6. Webhook: signing scheme, retry behaviour, and **does the event carry the
>    profile ID for workspace routing?**

**Answer: sometimes, and specifically NOT on the events we need most.** Scanned
across all 26 `WebhookPayload*` schemas:

- `profileId` present on **18 of 26** (always at `.account.profileId`)
- `accountId` present on **25 of 26** (absent only from `WebhookPayloadTest`)

The 8 payloads with **no `profileId` at all**:

```
WebhookPayloadComment          <- comment.received      (INBOX)
WebhookPayloadReviewNew        <- review.new            (INBOX)
WebhookPayloadReviewUpdated    <- review.updated        (INBOX)
WebhookPayloadPost             <- post.published/failed/... (PUBLISH STATE)
WebhookPayloadPostPlatform     <- post.platform.*       (PUBLISH STATE)
WebhookPayloadExternalPost     <- post.external.*
WebhookPayloadLead             <- lead.received
WebhookPayloadTest             <- webhook.test          (no ids at all)
```

Every surface this lane exists to fix — the inbox and publish state — is in that
list. **So routing is by `accountId`, never by `profileId`.** A summariser reading
the question would answer "yes, it carries profileId" (it does, on 18 of 26) and
build a router that silently drops every post and comment event.

`accountId` is documented on the post payload as:

> SocialAccount id this platform target published through. Use it to route events
> by connected account (e.g. separate staging vs production endpoints). A post can
> span multiple accounts.

That maps onto `connections.external_account->>'id'` — the same join
`@/lib/zernio/scope` already mints `ScopedAccountId` from. Note the last sentence:
**a single `post.published` event can carry several `platforms[]` entries with
different `accountId`s**, so one event can legitimately belong to more than one
connection. It cannot belong to more than one *workspace* (a connection row has one
`workspace_id`), but the router must handle the fan-out rather than reading
`platforms[0]`.

`WebhookPayloadTest` carries **neither** id. A `webhook.test` delivery is
un-routable by construction and must be accepted and recorded without being
attributed to any workspace.

---

## 6. The 49 events

From the top-level `webhooks:` object. Grouped by the resource group the spec
assigns each one (relevant because a restricted `zrk_` key can only subscribe to
groups it holds):

| group | events |
|---|---|
| publishing | `post.scheduled` `post.published` `post.failed` `post.partial` `post.cancelled` `post.recycled` `post.platform.published` `post.platform.failed` `post.platform.deleted` `post.tiktok.url_resolved` `post.external.created` `post.external.updated` `post.external.deleted` |
| messages | `message.received` `message.sent` `message.edited` `message.deleted` `message.delivered` `message.read` `message.failed` `conversation.started` `reaction.received` `referral.received` `call.received` `call.ended` `call.failed` `call.permission_request` `whatsapp.automatic_event` |
| engagement | `comment.received` `review.new` `review.updated` |
| contacts | `lead.received` |
| ads | `ad.status_changed` |
| accounts | `account.connected` `account.disconnected` `account.ads.initial_sync_completed` `whatsapp.template.status_updated` `whatsapp.template.category_updated` |
| telephony | `whatsapp.number.*` (9) `verification.approved` `verification.failed` |
| webhooks | `webhook.test` |

The subscription enum in `POST /v1/webhooks/settings` lists **48** — every event
above except `webhook.test`, which is fired by `/v1/webhooks/test` rather than
subscribed to. The `webhooks:` object has all 49 because it documents what can
*arrive*.

---

## 7. Reconciliation surface

`GET /v1/webhooks/logs`:

> Retrieve recorded webhook delivery attempts for the authenticated user, most
> recent first. **Logs are retained for 30 days.** Supports filtering by status,
> event type, webhook ID, and event ID, plus offset-based pagination.

Filters: `limit`, `skip`, `status` (`success`|`failed`), `event`, `webhookId`,
`eventId`. Each `WebhookLog` row carries `requestPayload` — **the full JSON payload
that was sent** — plus `statusCode`, `attemptNumber`, `errorMessage`, `createdAt`.

That makes a missed event recoverable: the payload can be re-processed from the log
without Zernio resending anything. Two limits that matter:

- It is scoped to the **authenticated user (the team API key)**, not to a profile.
  Rows for every tenant on the key come back together, so anything built on it must
  re-route by `accountId` exactly as a live delivery would, and must never be
  exposed to a workspace directly.
- 30-day retention. An event missed for longer is gone from this surface too, and
  the only remaining truth is the resource itself (`GET /v1/posts/{id}`).

---

## 8. What is still `[OPEN]`

- The §4a auto-disable contradiction.
- Whether `X-Zernio-Event-Id` is present on **every** delivery or only some. The
  prose asserts it; no live delivery has been observed by this lane. Nothing is
  built on it — `payload.id` is the key — so this is recorded, not depended on.
- Whether the signature is computed over the body before or after any transport
  encoding (e.g. gzip). Not stated. Assumed: the bytes as received.
