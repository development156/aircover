# Handoff — divas — wt-divas — 2026-08-27

**Branch** `claude/advisor-qvz5wn` at `16fe547`. Lane `wt-divas`. Pushed: yes.
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

**Google Business is not fixed and is not fixable here.** MEASURED: zero
accounts exist at Zernio across every profile on the key, so approving GBP
creates nothing at the provider and our code never sees it. The screen's
`nothing` notice already reports it honestly. Needs a question to Zernio.

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
