# Handoff — divas — wt-divas — 2026-08-27

**Branch** `claude/advisor-qvz5wn`. Lane `wt-divas`. Pushed: yes.
Base `wt-core` at `42c35e85`, 2 commits ahead. PR #14 was MERGED mid-session,
so the branch was rebased onto the trunk and these two are follow-up work.

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

**The Facebook picker HAS now been seen render**, by the founder, in its empty
state. The GBP one has not. Chromium here cannot complete an outbound HTTPS
request, so anything further needs the founder or the `smoke` job.

**The headless redirect's exact parameters are still INFERRED, and now largely
moot.** They were read from `https://zernio.com/openapi.json`; the redirect can
only be observed by completing a real OAuth. Round eleven stopped the flow
depending on the guess — the TOKEN is what triggers the picker now — and the
founder reaching our page proves the reading works in practice.

**Whether a Facebook Page can actually be connected is still unproven.** Zero
accounts exist on the key. The next attempt has to use **Edit settings** on
Facebook's reuse prompt rather than Continue.

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


## Round ten: the founder's question, and the answer to all of it

**"check instagram and linkedin why are they perfectly working?"** They are not
better built. **Their name is the same string in every Zernio vocabulary, and
there are FOUR.**

| Zernio surface | instagram | linkedin | X | Google Business |
|---|---|---|---|---|
| `GET /v1/connect/{platform}` | `instagram` | `linkedin` | `twitter` | `googlebusiness` |
| `GET /v1/accounts` -> `.platform` | `instagram` | `linkedin` | `twitter` | `googlebusiness` |
| `POST /v1/posts` (publish) | `instagram` | `linkedin` | **`x`** | **`google`** |
| `edit` / `unpublish` / `validate` | `instagram` | `linkedin` | `twitter` | `googlebusiness` |

Every name-shaped defect in this lane was invisible on the two channels anybody
tests by hand and live on the other two. Three shipped that way: `connectUrl`
given `x` (400 on every press), `reconcileAccounts` matching `x` against a stored
`twitter` (a completed connect wrote no row), and `health.ts` reading X's
two-hour rotating token as a sixty-day deadline.

`packages/publishing/src/zernio/vocabularies.test.ts` pins all four side by side.
It asserts the maps **DISAGREE**, because a tidy-up that unified them would
satisfy two rewritten equality checks and break publishing.

**RETRACTED mid-investigation.** I read `ZERNIO_PLATFORM_NAME`'s `x: 'x'` and
`gbp: 'google'` as the same bug a fourth time and was about to correct them.
`recovery.ts` records both as **[LIVE]-measured** — real posts have gone out
through those exact strings — and the publish endpoint genuinely is the odd one
out. An absence in our client is not an absence in their API, and the reverse
holds too: a value that looks wrong may be the only one that works.

### And the focus fallback could never have fired

`popupCloser` posts on the BroadcastChannel and THEN calls `window.close()`. The
message lands while the tab is still behind the popup: `finish()` runs, `pending`
goes false, the effect is torn down and **the focus listener is removed** — all
before the popup is gone and before focus returns. The refresh that did start,
started in a background tab and was throttled. The safety net was taken down a
moment before the fall.

The test that covered it dispatched `focus` with no message first, which is not
the order the browser runs in. It passed against a listener that cannot work.

`finish()` now records an OWED repaint when `document.hasFocus()` is false —
`hasFocus`, not `visibilityState`: a tab behind a popup is still "visible", it
simply lacks focus. A separate effect, deliberately not gated on `pending`,
spends that one owed repaint.

| Guard | Mutation applied | Went red |
|---|---|---|
| A repaint is owed from the background | restore the shipped shape | 1 |
| Only ONE repaint is owed | never clear the flag | 1 |
| The four vocabularies disagree | unify publish with recovery | 3 |
| A provider-held row shows no countdown | carry `daysLeft` through | 3 |
| A native row still counts down | delete the countdown | 2 |


## Rounds eleven and twelve: Facebook, and what "no Page" actually proved

**The founder reached our own "No Facebook Page came back" page.** That single
fact settles most of the open questions: headless mode is accepted, the redirect
parses, the tenant check passes, `listConnectChoices` reaches Zernio and our
picker renders. **Facebook returned zero Pages.** Nothing in the mechanism is
broken.

MEASURED round eleven, before any of that was known:

| Question | Answer |
|---|---|
| Is `headless=true` accepted? | Yes. Zernio carries our `redirect_url`, with `headless` appended, inside the OAuth `state` |
| Do `tempToken` and `userProfile` really arrive as redirect params? | Yes. The spec states it in prose on both the list and the commit endpoint |
| Facebook accounts on the key? | **Zero**, then and now |
| Is Zernio's Meta app real? | App `712341431446535`, "Social Media Connector" by zernio.com, a live Business app |

### Round eleven: a guess that would have failed silently

The picker keyed on `step=select_page` / `step=select_location`, **the only part
of the redirect never observed on the wire.** A wrong guess returns null, the
trip falls through to the ordinary reconcile, finds no facebook account (Zernio
creates none until a Page is picked) and answers `zernio=nothing` — the original
failure, with nothing recorded anywhere.

So the **token** is the evidence now. `step` is still read first when
recognised; the platform the customer pressed is the fallback, which is safe as
a fallback in a way it would not be as a trigger. Both paths still require a
token AND a `profileId` compared against our own table.

And a facebook/gbp trip with no account and no readable pick is a **502
`pick-not-received`**, with a report naming the PARAMETERS THAT ARRIVED and never
their values.

### Round twelve: two defects in one screenshot

**The Connect button never stopped spinning.** `useConnectFlow` waits for one of
four signals and every one of them was emitted by `popupCloser` — the page a
FINISHED connect ends on. The empty state and the select route's failure page are
the other two ways a connect can end, and both emitted nothing. Both now post on
the `sahoda-connect` channel; neither calls `window.close()`, because each
carries a sentence that has to be read. **The picker deliberately stays silent**
and that is asserted: signalling mid-flow would refresh the opener and leave
"Not connected" behind a window still asking which Page.

**The remedy named the rarer cause first.** MEASURED from the screenshot,
Facebook showed *"You've previously linked Social Media Connector to Facebook.
Would you like to continue with your previous settings?"* — pressing Continue
reuses a grant that included no Page. The empty state now leads with that and
says to choose **Edit settings** rather than Continue. `PickerCopy` gained
`extra` so GBP gets its own sentence: a location is verified by Google, often by
post, so "create one and connect again" is a remedy that cannot work there.

| Guard | Mutation applied | Went red |
|---|---|---|
| The token is the evidence, not the step | require the exact step again | 2 |
| A missing pick is reported as itself | answer `nothing` again | 1 |
| Only selection platforms can owe a pick | claim one for every platform | 3 |
| A token alone cannot name a platform | let it default to facebook | 2 |
| The diagnostic carries names, not values | report the values too | 2 |
| The empty page tells the opener | make it silent again | 2 |
| The picker does NOT tell the opener | make it signal too | 3 |
| The remedy names "Edit settings" | soften it to "the other option" | 1 |


## Round thirteen: why the other eleven do not connect

The founder: X, Instagram and LinkedIn connect, the rest do not. **Measured each
one rather than assuming a shared cause, and there is no shared cause.**

| Platform | `GET /v1/connect/{p}` | What actually stops it |
|---|---|---|
| twitter, instagram, linkedin | 200 + authUrl | nothing — these work |
| facebook | 200 + authUrl | needs a Page in the grant. Picker built |
| googlebusiness | 200 + authUrl | needs a location. Picker built, never seen render |
| discord, pinterest, reddit, slack, threads, tiktok, whatsapp, youtube | 200 + authUrl | **nothing measurable.** Untested only because of the slot cap |
| telegram | 200 + **code, no authUrl** | our own code refused it. **Built this round** |
| snapchat | **403** `PLATFORM_BETA_RESTRICTED` | upstream, not fixable here |

**Zernio is not a cap.** MEASURED `GET /v1/billing`: `plan.isPaid: true`,
`isUsageBased: true`, `hasAccess: true`, `limits.profiles: -1`, not suspended.
It will create as many accounts as we ask for.

**The real cap is ours.** Free allows 2 channels
(`packages/shared/src/billing/plans.ts:52`) and workspace
`8846b067-5662-4e1e-9bba-cf1830c01fe5` has **no subscription row**, so it is on
Free with one connection (x) and one slot left. Connecting a third is refused by
our own gate — correctly, and that refusal is very likely most of what "the rest
are not connecting" has meant.

### Telegram, built

`GET /v1/connect/telegram` returns no `authUrl`. MEASURED, it returns
`{ code: "ZRN-DLPTJW", botUsername: "LateScheduleBot", expiresIn: 900,
instructions: [...] }`. The customer adds the bot as an administrator of their
channel and messages it the code; the link completes inside Telegram.

| Piece | File |
|---|---|
| Issue a code, poll for the landing | `api/oauth/zernio/telegram/route.ts` |
| The code panel on the card | `components/connections/telegram-connect.tsx` |
| The code, held server-side | `lib/connections/pending-telegram.ts` |
| Which rail a platform travels on | `lib/zernio/connect-platform.ts` `needsPairingCode` |

`telegram` rejoins `ZERNIO_PLATFORMS`. That list was always the wrong place to
express "no authUrl" — it governs whether a workspace may HOLD the connection,
and membership is what lets the reconcile sweep find the account at all.

**Nothing the poll returns is trusted.** The account is re-derived from
`listAccounts` under the profile read from our own table. The code rides an
httpOnly cookie, because `PATCH /connect/telegram?code=` answers for ANY code
with its status and, once landed, the channel's title.

| Guard | Mutation applied | Went red |
|---|---|---|
| The poll re-derives the account | trust the poll's own | 2 |
| The plan gate precedes the code | issue first, gate after | 2 |
| No attempt in flight is not `pending` | report pending | 1 |
| Telegram is off the OAuth rail | put it back on | 1 |
| Only Telegram gets the code panel | give it to every card | 4 |
| The refusal names the control that works | restore "isn't built yet" | 1 |
| The code cookie validates its shape | — asserted directly, 5 tests |


## Round fourteen: the leg that never ran

**The Vercel build went RED on `282b18c`, and it was ours.** Not the runner
outage: a real failure, on the only check in this lane that actually executes.

```
js-budget FAILED — 1 route(s):
  /(app)/connections  683.7 kB > 675.4 kB budget +8 kB slack  (+8.2 kB)
```

**Nothing this lane runs could have caught it.** `pnpm build` is
`next build && node scripts/perf/js-budget.mjs`, and neither `pnpm gate` nor
`turbo run typecheck lint test` runs either one. Twenty-seven green local gates
this session, and a build-breaking change walked through all of them.

### The first attribution was a guess, and it was wrong

"The new Telegram component is 8 kB" was an assumption. Three trees were built
and the same number read out of each:

| Tree | `/connections` client JS | Over the recorded budget |
|---|---|---|
| Budget recorded at `3d7935b`, before this session | 675.4 kB | — |
| `3f016f1`, before Telegram | **680.4 kB** | +5.0 kB, inside the slack |
| `282b18c`, with Telegram | **683.2 kB** | +7.8 kB, on the line |

**Telegram is 2.8 kB of it.** The other 5.0 came from this session's earlier
connections work and had been riding inside the 8 kB slack unnoticed — passing
locally at 683.2 and failing on Vercel at 683.7, which is what a route parked on
the slack line does.

Fixed in `3fd6f78` by regenerating the budget for **that one route** to the
measured 699554 bytes. One line changes; the other 80 routes are untouched. The
precedent is `3d7935b`'s own "regenerate against the merged tree", and the rule
it respects is LEARNINGS': never a blanket rewrite, because a blanket rewrite
absorbs regressions nobody looked at.

Not fixed by lazy-loading, and that is a judgement: the panel would be fetched on
the same page load either way, so it would be a smaller number for the check and
not for the customer.

**Vercel deployed `3fd6f78` Ready at 09:52Z**, which is the proof.

### Before calling any future head good

```
cd apps/web && npx next build && node scripts/perf/js-budget.mjs
```

The founder was asked whether to add this to `pnpm gate` and has not answered.
Do not add it unprompted.


## Round fifteen: the error we were handed and threw away

The founder connected several channels, got nothing useful from our screen, and
**went to Zernio's own dashboard to find out why.** It told them at once:

```
Google Business Profile token exchange failed: 400
{ "error": "invalid_grant", "error_description": "Bad Request" }
```

We had that fact. Zernio's spec: *"On failure every platform appends error
details, starting with `error` and `platform`."* This route ignores every query
parameter by design — a rule that is **right about IDS**, which can name somebody
else's account, and **wrong about this one**. An error string names no resource
and decides nothing, and dropping it is how a customer ends up reading a third
party's dashboard to use our product.

### What the refusal page claims, and what it refuses to claim

Read FIRST, before the session is even resolved: a refusal is a refusal whether
or not the workspace reads cleanly.

| Code seen | Our sentence | Remedy |
|---|---|---|
| `invalid_grant` / `token_exchange` | "…didn't finish signing in. The approval sat too long or was used twice." | connect again, without going back a step |
| `no_facebook_pages` | "Facebook sent back no Page." | Edit settings, not Continue |
| `access_denied` | "The sign-in was cancelled." | **none, and none is needed** |
| anything else | "…refused the connection… in a way Sahoda does not recognise." | **none — guessing is forbidden** |

The provider's own words go underneath, escaped, small, never as the headline.
`error_description` is third-party text arriving through the customer's browser:
a string like `400 {"error":"invalid_grant"}` is evidence for whoever reads a
report, not an instruction for whoever is trying to connect.

**Our own `reason` parameter is deliberately NOT read as an upstream error.** It
is a status this route sets itself, and reading it would report our own notices
as the platform's.

### Pinterest's picker is ours

The founder also photographed Zernio's hosted **"Pick a default board"** screen
mid-connect: its wordmark, its domain, asking a Sahoda customer which board to
pin to. Pinterest's endpoints fit the picker built for Facebook and Google
Business with no new shape.

### Branding: what is and is not fixable here

| Where | Fixable in this repo? |
|---|---|
| "Pick a default board" / Page / location pickers | **Yes, and now done** |
| "Social Media Connector" on X and Facebook consent | **No** |
| "Seamlessly connect your account to Zernio" (WhatsApp) | **No** |

MEASURED: **Zernio has no general bring-your-own-app surface.** `BYOK` appears
twice in the entire spec, both `403 · "BYOK required for AppSumo Twitter"`. The
"white-label support" line in their overview has no API behind it. Those consent
screens are Zernio's app registrations at X, Meta and Google. Either Zernio
renames them, or Sahoda registers its own developer apps per platform and stops
using Zernio for connecting. **Founder's decision, asked and unanswered.**

| Guard | Mutation applied | Went red |
|---|---|---|
| The refusal is shown, not swallowed | throw the error away again | 5 |
| No invented remedy for an unknown code | add "Try again." | 1 |
| Our own `reason` is not an upstream error | read it as one | 1 |
| Pinterest has a picker | drop it from the allowlist | 3 |

**One guard went red and was RETARGETED, not weakened.**
`pending-selection.test.ts` asserted pinterest is refused because no picker
existed. That is the guard working: adding a platform to the headless path is
exactly the change that must not pass unnoticed, since the half that renders the
picker and the half that parses the redirect have to arrive together. `whatsapp`
and `snapchat` replace it as live examples, and a new test asserts Pinterest is
now accepted.

## Round sixteen: the loopback reset was an https reset wearing a localhost url

The founder asked for one thing: **"merge wt-core into this branch so playwright
can run"**. The merge was the easy half.

`wt-core` merged clean, eight commits, twelve files, no conflicts. Then the
suite still could not run, and the reason it could not run had been recorded
WRONG in three places, including this repository's own `CLAUDE.md`.

Every authenticated spec died on

```
net::ERR_CONNECTION_RESET at http://127.0.0.1:3100/sign-in
```

and `node-transport.ts`'s note 1 read that as proof that loopback must not be
intercepted. The suite has carried that reading for two days.

**MEASURED 2026-08-27, through a logging TCP proxy placed in front of the dev
server.** The request REACHES Next. Clerk's middleware answers

```
307 -> https://<fapi>.clerk.accounts.dev/v1/client/handshake?redirect_url=...
```

and Chromium follows THAT hop on its own socket, which is the network that does
not work. Playwright reports a navigation failure against the url the navigation
STARTED at, so an https reset is printed as a localhost one.

Four measurements, in the order that made it obvious:

| Probe | Result |
|---|---|
| Chromium → `http://127.0.0.1:3199/` (python static, loopback-bound) | **200** |
| Chromium → `http://127.0.0.1:3198/` (python static, `0.0.0.0`-bound) | **200** |
| Chromium → `http://127.0.0.1:3100/sign-in` (Next dev) | **ERR_CONNECTION_RESET** |
| Node/`curl` → the same Next url | **200** |

The first two are what proved loopback innocent, and the bind address innocent
with it. Two dead ends were eliminated on the way: it is not compression (a 404
route with `accept-encoding: identity` resets the same), and it is not a scheme
upgrade (MEASURED: the response carries no `Strict-Transport-Security`).

**The fix is one rule, symmetric with the transport's own note 5: whoever can
make the hop, makes it.** Every request now goes through Node; the chain is
handed BACK to Chromium the moment its next hop is loopback, and picked up again
the moment that hop redirects out. Node carries the browser's own `Cookie`
header, so the app sees the same session Chromium does. Note 1 has been
rewritten in place to say what was measured rather than what was assumed.

MEASURED, `connections-honesty.spec.ts --grep @smoke`: **3 failed → 3 passed.**
That is the first Clerk-authenticated spec ever to pass in this sandbox.

### Three stale claims, and none of them was the transport's fault

Once sign-in worked, the spec started failing on its own assertions — every one
stale, and stale because nothing has read these lines while the screen beneath
them changed twice.

| Assertion | Was | Is | Why it moved |
|---|---|---|---|
| planned channels | `4` | `1` | The tile branch moved from `asChannel` (six publishable) to `asPlatform` (fourteen linkable), so three cards drawn as unbuilt are connectable. MEASURED off the catalogue: 15 entries, 1 with no platform, `snapchat` |
| a coming-soon tile offers no control | any `button, a, [role=button], [aria-disabled]` | the same, minus the details disclosure | `ChannelHeader` is shared between both tile shapes on purpose and carries the disclosure on every tile. The rule is about a control that offers an action and does nothing; one that opens a panel is not that |
| the X allowance | `X posts this month \d+ of \d+` | `\d+ posts remaining this month` | The meter counts DOWN since `wt-core`'s `741418ef`. Both claims survive: a real numeral, and attribution |

The third needs its own line, because the attribution MOVED. `allowance is ours
rather than X` is now inside the pricing disclosure, so it is not in the page's
text while that disclosure is closed. The visible attribution is the meter's
second line, and `x-ration-meter.tsx` is explicit that dropping it makes the
line above it a false claim about X. That is the line the guard now reads.

The planned-channel figure stays a **literal** on purpose. Derived from the
catalogue it would agree with itself forever and guard nothing; a literal is
what makes the next platform to land show up as a red test rather than as a
silently different screen.

### One duplicate withdrawn

This branch carried its own `SAHODA_CHROMIUM_PATH` opt-in, so a sandbox whose
bundled Chromium build does not match `@playwright/test` can point at the one it
has. **It is not in the branch.** `wt-core` reached the same fix independently
under `PLAYWRIGHT_CHROMIUM_PATH`, the rebase surfaced it as a conflict, and two
env vars for one hatch is worse than either. Theirs is upstream, so theirs
stands. Use `PLAYWRIGHT_CHROMIUM_PATH`.

## Shared surfaces touched

- **`packages/shared/src/enums.ts`** — `ConnectionPlatformSchema` 6→14 values,
  `ZERNIO_PLATFORMS` 5→13, **then 13→14 when telegram rejoined it in round
  thirteen**. Anything iterating `ZERNIO_PLATFORMS` now sees telegram. **`ChannelSchema` is UNCHANGED at 6.** These are
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
| Planned channels are counted | `asPlatform('discord')` → `null` | 1 — expected 1, got 2 |
| A coming-soon tile offers no control that ACTS | a `<button>Connect</button>` on the tile | 1 — expected 0, got 1 |
| The X allowance is attributed | delete the "From Sahoda's ration" line | 1 |
| The X allowance is a real figure | replace `{remaining}` with an em dash | 1 |

Every one of the four above was mutated in the PRODUCT, not in the test, and
each was WATCHED going red before the mutation was reverted. The em-dash
mutation is the exact shape (`100 of —`) this guard was originally written
against, which is why it is the one worth keeping.

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
