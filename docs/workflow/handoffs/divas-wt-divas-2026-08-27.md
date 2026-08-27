# Handoff — divas — wt-divas — 2026-08-27

**Branch** `claude/advisor-qvz5wn`. Lane `wt-divas`. Pushed: yes.
Base `wt-core` at `3137bc3`, 13 commits ahead.

This session is one long thread: `/connections`. The founder reported a defect,
I fixed it, they tested, and reported the next one. Seven rounds. **Four of the
seven were caused by the round before it**, which is the single most useful
thing in this file.

## What shipped

| # | What | Proof | Covered by |
|---|---|---|---|
| 1 | A slot holds an ACCOUNT, not a channel. The screen was the whole blocker; the database and billing gate already agreed | `faa8426`, `lib/connections/slots.ts` | `slots.test.ts` |
| 2 | A connect only creates a row for the platform that was pressed | `147c499`, `return/route.ts` create-scoping | `route.test.ts` "a connect only ever creates a row for the platform that was pressed" |
| 3 | Disconnect removes the account AT ZERNIO, then deletes our row; refuses if upstream fails | `67f8df2`, `actions/connections.ts:85-96` | `connections.test.ts` |
| 4 | Preview returns to the preview, not production | `29ccd0e`, `lib/zernio/return-url.ts` | `return-url.test.ts` |
| 5 | Zernio's connect name, not ours — `x`→`twitter`, `gbp`→`googlebusiness` | `f68dff2`, `lib/zernio/connect-platform.ts` | `route.test.ts` vocabulary block |
| 6 | Popup signals home over `BroadcastChannel`, which Google's COOP cannot cut | `2c309ab`, `use-connect-flow.ts:115-133` | `use-connect-flow.test.tsx` |
| 7 | Connect intent rides the return URL as well as the cookie | `ae21d14`, `return-url.ts` `RETURN_MODE_PARAM` | `return-url.test.ts` |
| 8 | **The closer page was a 303 with a `Location`, so no browser ever rendered it** | `81fb659`, `return/route.ts` `popupCloser` | `route.test.ts` "is a page the browser will RENDER" |
| 9 | Thirteen platforms connectable; `ConnectionPlatform` 6→14 while `Channel` stays 6 | `06147bb`, `packages/shared/src/enums.ts` | `catalogue.test.ts` |
| 10 | **`reconcileAccounts` filtered on OUR id against Zernio's `platform`** | `b903ef4`, `packages/publishing/src/zernio/connect.ts` | `connect.reconcile-vocabulary.test.ts` |
| 11 | One `listAccounts` per trip, not thirteen | `16fe547`, `return/route.ts` | `route.test.ts` "reaches every platform from ONE read" |
| 12 | Tiles refresh when the tab regains focus | `16fe547`, `use-connect-flow.ts` | `use-connect-flow.test.tsx` focus tests |

**Both migrations were APPLIED to production** on the founder's explicit
instruction, and verified. MEASURED after applying:

```
connections_platform_check  = 14 platforms   (was 4)
post_variants_channel_check = 6 channels     (UNCHANGED)
app.is_connection_platform('tiktok') = true ; app.is_channel('tiktok') = false
public.upsert_zernio_connection overload count = 1
```

## What was NOT done, and why

**`turbo run test:smoke` (Playwright) is UNRUN on this entire lane.** Not
passed. Chromium in this sandbox cannot complete any outbound HTTPS request and
every `@smoke` spec signs in through Clerk.

**The `/connections` layout has never been SEEN render.** Twenty tiles across
three groups, verified by types and unit tests only. The Playwright MCP browser
reconnected mid-session so I tried it: `browser_navigate` to the preview
returned `net::ERR_CONNECTION_RESET`, and so did `https://example.com/` as a
control. MEASURED, settled, do not retry — it needs a human with a browser or
the `smoke` job on `gate.yml` dispatched by hand.

**Google Business — the earlier entry here was wrong and is retracted.** It read
"not fixable here ... needs a question to Zernio". The zero-accounts measurement
was right; the conclusion drawn from it was not. GBP has the same missing
selection step as Facebook, and it is built this round. **It has not been
exercised against a real Google account.**

**Neither picker has been SEEN render.** Both are proven by unit tests and by the
API spec, not by a browser. Chromium here cannot complete an outbound HTTPS
request, so this needs the founder or the `smoke` job.

**The exact query parameters on Zernio's headless redirect are INFERRED, not
measured.** The endpoints, the required fields and the `step` values are all read
from `https://zernio.com/openapi.json`; the redirect itself can only be observed
by completing a real OAuth, which cannot be done from here. `readPendingSelection`
is written to fail closed — an unrecognised `step` falls through to the ordinary
reconcile, which is exactly today's behaviour. **This is the first thing to check
if Facebook still does not connect.**

**The X spend meter still inflates its grid row** by roughly 135px across three
of four cards (`items-stretch` grid, `h-full` tiles, `mt-auto` footer). Seen in
the founder's screenshot, not fixed. Thirteen tiles in a four-column grid also
leaves Reddit alone on its own row.

**The `/post/new` UX rework was asked for early and never started.**

**`actions/radar.ts` filters connections against a literal
`['x','gbp','linkedin','instagram']`,** so Radar silently ignores facebook and
telegram. FLAGGED, not fixed — widening it changes what Radar reports, which is
a product decision outside "make these platforms connectable". More visible now
that facebook can actually be connected.

**The PR body is current only as of `06147bb`.** `b903ef4` and `16fe547` are not
described in it.


## Round eight and nine: X, and Facebook

The founder came back with "still the same problem with X and facebook is not
connecting properly". Two defects, two different causes, and **neither one was a
connect that failed**. Both connects worked. What was wrong was what happened
next.

### X — a sentence that called a working account dead

MEASURED from the live API, minutes after a real connect:

| Field | Value |
|---|---|
| `platform` | `twitter` |
| `createdAt` | 2026-08-27T05:35:16.436Z |
| `tokenExpiresAt` | 2026-08-27T07:35:16.167Z |
| `needsReconnection` | `false` |
| `platformStatus` | `"active"` |

**Two hours, not sixty days.** Our row was written correctly two seconds later.
`lib/connections/health.ts` opened by asserting, from doc 13 §2.5, that "Zernio
issues 60-day tokens with NO auto-refresh", read `expires_at` as the day the
connection dies, and so told the customer **"Reconnect X. Its access has run out
and scheduled posts will not go out."** about a healthy account, within two hours
of every X connect. X grants `offline.access`, so Zernio holds a refresh token and
rotates that two-hour credential itself.

The fix is the distinction the row already carried: **whose token it is.** A
provider-held connection has `profileId` in `external_account` and nothing in
`connection_secrets` — its expiry is an internal detail of somebody else's
credential store. A native connection has no `profileId` and there `expires_at` is
our deadline and means what it says. The expiry branches are unchanged for the
connections they are true of.

Nothing is lost by dropping the claim: MEASURED on the same trip, the Instagram
rows that really were broken carried `needsReconnection: true` and
`platformStatus: "not listed under this profile"` **with their expiry two months
in the future**. Expiry never caught them. Zernio's flag did, and still does.

### Facebook — the connect was one step short of existing

MEASURED: `GET /v1/accounts` held **zero** facebook accounts across every profile
on this key, while `GET /v1/connect/facebook` returned a valid authUrl every time
it was asked. Nothing was failing.

Facebook does not resolve to one account on approval. It resolves to every Page
the customer administers, Google Business to every location, and **Zernio creates
no account until one is picked**. Our return trip asked for the accounts under our
profile, was correctly told there were none, and reported that honestly.

Zernio hosts that picker itself, on zernio.com. **The founder has already reported
that screen**, in round six, without knowing what it was: *"it opens a popup and it
opens another new website and connects there ... change the logo and add sahodalabs
logo and also change from social media connector to Sahodalabs."* I attributed
that entirely to our own 303 bug at the time. Both were real.

`headless=true` turns Zernio's screen off and returns the browser to our return
route carrying the OAuth state. The picker is now ours: our words, our origin, one
question, no script, no colour, and the platform token never touches the markup.

| Piece | File |
|---|---|
| Which platforms need a pick, and reading the redirect | `lib/zernio/selection.ts` |
| The picker document | `lib/zernio/picker-page.ts` |
| Facebook Page / GBP location wording | `lib/zernio/picker-copy.ts` |
| The token, held server-side for one click | `lib/connections/pending-selection.ts` |
| `headless=true`, for those two platforms only | `oauth/zernio/start/route.ts` |
| Render the picker instead of a verdict | `oauth/zernio/return/route.ts` |
| Commit the pick, then hand back | `oauth/zernio/select/route.ts` (new) |

**Only Facebook and Google Business are switched.** Zernio publishes selection
endpoints for LinkedIn organizations, Pinterest boards, Snapchat profiles and more.
Instagram and LinkedIn connect end to end today, and moving a working flow onto a
second half nobody has written would trade a fix for a regression. That narrowness
is asserted, not assumed: `start/route.test.ts` pins `linkedin:false`.

### The token is not in the page, and that is deliberate

`tempToken` is a live Facebook user access token. Zernio's own error text says it
"starts with EAA". The obvious build puts it in a hidden form field; CLAUDE.md's
rule is that OAuth tokens are never logged or returned, and writing one into a page
body is returning it. It rides an httpOnly cookie instead, dead in ten minutes,
which is Zernio's own token lifetime rather than a round number.

### Guards written this round, and the mutation that proved each

| Guard | Mutation applied | Went red |
|---|---|---|
| A provider-held expiry is not the customer's deadline | remove the `isProviderHeld` branch | 5 |
| A native expiry still expires | make `isProviderHeld` always true | 3 |
| A `step` redirect renders a picker | force `selection` to null | 7 |
| The token never reaches the markup | add it as a hidden input | 1 |
| `headless` is on for exactly two platforms | set it true for all | 2 |
| The chosen id is checked against OUR list | accept whatever was submitted | 1 |
| The owning account comes off that list | read it from the form | 1 |
| Our channel id is handed back, not Zernio's | hand back `pending.platform` | 2 |
| Third-party text cannot become markup | delete `escapeHtml`'s body | 5 |

## Shared surfaces touched

- **`packages/shared/src/enums.ts`** — `ConnectionPlatformSchema` 6→14 values,
  `ZERNIO_PLATFORMS` 5→13. **`ChannelSchema` is UNCHANGED at 6.** These are
  additive widenings of a union: they break EXHAUSTIVE `Record<…>` maps and
  `switch` statements, not readers. Six files in `apps/web` became compile
  errors and were fixed; another lane holding a `Record<ConnectionPlatform, …>`
  will too.
- **`packages/shared/src/publishing/constraints.ts`** — facebook and telegram
  specs added earlier in the lane. Exhaustive over `Channel`, so a new channel
  is a compile error by design.
- **`packages/publishing/src/zernio/connect.ts`** — `reconcileAccounts`'s
  parameter renamed `platform`→`zernioPlatform`, and new `reconcileFromAccounts`
  exported. **This is a breaking rename for any caller outside this lane.** One
  existed and was updated.
- **`packages/publishing/src/index.ts`** — exports `reconcileFromAccounts`.
- **`packages/publishing/src/zernio/client.ts`** — `ZernioClient` gained
  `listConnectChoices` and `selectConnectChoice`, and `connectUrl` gained an
  optional fourth argument. **The two new methods are a breaking addition for any
  hand-written `ZernioClient` stub outside this lane** — one existed
  (`adapters/zernio.test.ts`) and was updated. `connectUrl`'s new argument is
  optional and absent means the behaviour every platform already had.
- **`apps/web/src/components/posts/channel-label.ts`** — new `PLATFORM_LABELS`
  beside `CHANNEL_LABELS`. Use the first when the subject is an account being
  linked, the second when it is a post going out.

## Contract, migration or money

Two migrations, **both applied to production this session**:

- `20260826120000_widen_channels_facebook_telegram.sql` — 10 table CHECKs,
  `app.is_channel`, `app.is_channel_set`, and three PL/pgSQL guards. Its own
  header claims FOUR guards including `publish_claim`; MEASURED, **that function
  does not exist in this database**, so the header over-counts and nothing was
  left half-migrated.
- `20260826180000_widen_connection_platforms.sql` — one CHECK, one new
  predicate, one guard. Written this session.

No price, no ledger, no credit path touched.

## Guards written, and the mutation that proved each

| Guard | Mutation applied | Went red |
|---|---|---|
| Popup closer must RENDER | restore `status: 303` + `Location` | 2 |
| Route asks in Zernio's vocabulary | pass our channel id again | 2 |
| `reconcileFromAccounts` still filters | delete the filter entirely | 2 |
| A failed read is never "nothing" | make the catch return `[]` | 5 |
| Intent rides the return URL | drop the `platform` param | 2 |
| Every platform has its own mark | remove one; give two the same one | 2 |
| Popup is raised on reuse | delete `popup.focus()` | 1 |
| Focus refreshes the tiles | delete the `focus` listener | 1 |
| Focus listener is removed | delete the `removeEventListener` | 1 |
| Disconnect copy is true | restore "stays linked at the publishing provider" | 2 |

**One guard was written, watched, and found NOT to guard.** After adding `x` to
the route test's mocked platforms I restored the vocabulary defect and **all 49
tests still passed** — the fixture translated the name back, so both spellings
reached the same key. Replaced with an assertion on the literal string the route
hands over, then a faithful reimplementation of the real filter. That version
does go red.

## Anything retracted

**"A genuine CI failure on `06147bb` is plausible."** I said that when the
GitHub tools were disconnected and I could only infer. When they returned I
MEASURED job `98268584827`: 17:56:45→17:56:48Z, three seconds, `runner_id: 0`.
It was the outage. The large change was never implicated.

**The disconnect sentence.** It read "The account stays linked at the publishing
provider, so connecting this channel again brings it back." True until this
lane wired `DELETE /v1/accounts`. MEASURED: after a real disconnect, Zernio held
zero accounts across every profile. The sentence was telling a customer their
account was somewhere it is not.

**Zernio's documented connect list.** `docs.zernio.com/llms-full.txt` names
`x`, `mastodon`, `medium` and `substack` as connectable — **all four answer
400** — and omits `reddit`, `slack` and `googlebusiness`, **all three of which
answer 200**. Every platform in this lane was probed individually instead.

## What the next session in THIS lane should pick up

1. **Ask the founder to test the preview.** The database now accepts all
   fourteen platforms and the code is deployed; nobody has confirmed a single
   connect end to end since the migrations landed. Facebook is the sharpest
   test — it was purely database-blocked.
2. **The X spend meter's row height.** Smallest real win left, needs no CI.
3. **The Zernio question about Google Business.** Offered twice, never answered.
4. **Refresh the PR body** before requesting review.
5. **`/post/new`** — owed since the second message of the session.

## Gate

Run on `16fe547`, `--force --concurrency=1`, not piped.

| Leg | Result |
|---|---|
| `turbo run typecheck lint test` | **PASS** — 27/27 tasks, `Cached: 0`, exit 0 |
| — `@sahoda/web` | **PASS** — 5053 passed, 13 skipped |
| — `@sahoda/publishing` | **PASS** — 469 passed |
| — `@sahoda/jobs` | **PASS** — 396 passed |
| — `@sahoda/db` | **PASS** — 622 passed, 207 skipped |
| — `@sahoda/billing` | **PASS** — 401 passed, 13 skipped |
| `prettier --check .` | **PASS** |
| `turbo run test:smoke` (Playwright) | **UNRUN** — not passed. Chromium here cannot reach any HTTPS host |
| GitHub Actions `gate` | **RED, and not this lane's.** MEASURED across 13 consecutive checks: every job 2-3s with `runner_id: 0`, `runner_name` empty, no step executed. No run created at all since 20:29Z on 26 Aug. A real gate here takes 10-12 minutes |

One environmental failure worth knowing: `lib/privacy/export-drift.test.ts`
cannot resolve `db.<project>.supabase.co` from this sandbox. It fails
identically on an unmodified tree — MEASURED by stashing.
