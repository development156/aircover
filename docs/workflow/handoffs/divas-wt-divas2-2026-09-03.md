# Handoff — divas — wt-divas2 — 2026-09-03

**Branch** `wt-divas2` at `9cb0e831`. Lane `wt-divas2`. Pushed: yes.

Worked the Sahoda System Map artifact end to end. **Six of its seventeen findings
were already fixed** on current `wt-core`, including two of the three it names as
launch blockers. **Ten were real and all ten are fixed here.** One is a founder
decision and one was not a defect at all, so nothing on the map is left
unaccounted for.

In plain terms: the map is a few days old and the product has moved. It says the
business cannot take a customer's payment; it can. What was genuinely broken was
a set of screens making confident statements they had no evidence for, and one
of those overclaims was mine from earlier in this lane.

## What shipped

| What was wrong | Proof | Test that covers it |
| --- | --- | --- |
| Emptying a 500-file trash deleted 200 and said it deleted everything | `apps/web/src/app/actions/assets.ts:563` dropped the read's `capped` flag | `assets-empty-trash.test.ts` (5), `trash.test.ts` (+6) |
| A failed credit-history read printed "No credit activity yet" and "Nothing has happened yet" | `lib/wallet/read.ts:161` returned `{entries: []}` for an error | `read.test.ts` (+3), `wallet/page.test.tsx` (+4), `activity-feed.ledger-sign.test.tsx` (+3) |
| The Planner day view drew ZERO columns on any week but this one | `planner/page.tsx` filtered the week to today, and a filter can return nothing | `week-window.test.ts` (6, new file) |
| Studio sold four separate pictures as "a set that matches" | `modes.ts` gated Series on the provider's ability, not on what the mesh can ask for | 4 guards retargeted to the schema |
| The one paid Brand Brain button linked to a screen that cannot show what it bought | `/brain/resolve` never queries `memory_events`; only `/loop` does | `resolve-from-library.test.tsx` (+3) |
| The CMO report printed "610 impressions on gbp." | `report/page.tsx` interpolated the metric key and the channel enum | `strings.test.ts` (+6) |
| The billing Address field promised an invoice line that has no column | `InvoiceDraft` and `invoices` carry no recipient address | `billing-details-form.test.tsx` (5, new file) |
| A website could never be deleted, so a bad first attempt was permanent on Starter | `generateSite` was the only mutation; the gate counts drafts | `site-delete.test.ts` (6) + `site-delete.test.tsx` (6), both new |
| Five Analytics sections each apologised for the same one cause | the rebuild disconnected `analyticsReadiness`; `reasonStated` pinned to `false` | `readiness-line.test.tsx` (6, new file) |
| A stored Inbox conversation could not be opened | `readThread` resolved messages only through Zernio, while the list read the store | `read-thread.test.ts` (7, new file) |

Also corrected two sentences in `roadmap-figures-scan.spec.ts` that were the
inverse of the truth about which guard owns which route. Comment only.

**MEASURED**: twelve commits, `8325ed45` through `9cb0e831`.

## What was NOT done, and why

- **Playwright `@smoke` is UNRUN, not passed.** Unchanged from 2026-09-01:
  Chromium here cannot complete an outbound HTTPS request, and the CI job's guard
  step still exits in under a second because the three Clerk and Supabase names
  read empty as repository secrets AND as variables. That is a settings problem
  and the rules say report it, so it is reported and not worked around.
- **`SAHODA_HOLD_SWEEP_MODE` untouched.** It is a founder decision about real
  money, written up below.
- **`p_billing_email` left in place.** An RPC argument the form never fills, so
  always null. Removing dead-but-harmless plumbing is not a fix and would trade
  nothing for a small risk if somebody later adds the field.
- **The Ads area left alone.** The map calls it a defect; it is a declared state
  under a founder ruling, marked in the nav, captioned per screen, rendered as
  non-focusable elements so a screen reader never offers an action that does not
  exist, and pinned by a @smoke test. No code change is correct there.
- **`wt-core` push not done.** The gate is green, but pushing to another branch
  needs explicit permission and I do not have it.

## Shared surfaces touched

| Surface | Change | Who it breaks |
| --- | --- | --- |
| `@sahoda/shared` `describeEmptyTrash` | gained a **required** third argument `more` | its callers, deliberately. One production call site plus tests, all updated. An optional flag would let the next screen forget it exactly as this one did |
| `apps/web` `readLedger` | return type gained a **required** `unreadable` | two mock constructors, both updated. tsc caught them, which is the point |
| `apps/web` `EmptyTrashState` | ok arm gained `more: boolean` | Studio and assets only |
| `apps/web` `dayColumn` | **new export** from `lib/planner/week-window.ts` | nobody; additive |
| `apps/web` `metricInWords` | **new export** from `lib/report/strings.ts` | nobody; additive |
| `apps/web` `ActivityFeed` | gained an OPTIONAL `unreadable` prop | nobody |
| `apps/web` `ruleFor('series', …)` | now false for every model | any lane assuming Series is offered. Nothing outside the Studio reads it |
| `apps/web` `SitePreview` | gained a **required** `siteId` prop | one call site, updated |
| `apps/web` `deleteSite` | **new server action** | nobody; additive |
| `apps/web` `readStoredThreadMessages` | **new export** from `lib/inbox/store-read.ts` | nobody; additive |
| `apps/web` `ReadinessLine` | **restored** from `6a4fda80^`, unchanged | nobody; it had no callers to break |

No migration, no price, no ledger change. `packages/shared` changed in one
function signature; the schemas are untouched.

## Contract, migration or money

No migration written and none applied. No price touched; nothing reads
`pricing.config.json` differently.

Two changes are money-adjacent and neither moves a credit:

- The wallet and Home now distinguish a failed read from an empty ledger. That
  changes what a customer is TOLD about their credits, never a balance.
- Studio Series is closed. It was charging four presses for four unrelated
  pictures sold as a set, so this removes a spend that was being taken under a
  false description. No refund path is implicated: each press was charged and
  delivered a picture, just not the thing the sentence promised.

## Guards written, and the mutation that proved each

Every mutation was applied, **grepped for in the file to prove it landed**, the
suite run, and the red watched.

| Guard | Mutation | Result |
| --- | --- | --- |
| `assets-empty-trash.test.ts` | action returns `more: false` again | RED, 1 |
| `trash.test.ts` | (new cases were red before the fix existed) | RED, 3 |
| `wallet/page.test.tsx` | force the unreadable branch to `false` | RED, 3 |
| `activity-feed.ledger-sign.test.tsx` | same mutation in the component | RED, 2 |
| `week-window.test.ts` | restore the today-only selection | RED, 4 |
| `modes.test.ts` + `models.test.ts` + `studio-workbench.test.tsx` | restore `model.maxPerPress > 1` | RED, 4 across 3 files |
| `resolve-from-library.test.tsx` | point the link back at `/brain/resolve` | RED, 2 |
| `strings.test.ts` | restore `{ranking.top.metric}` | RED, 1 |
| `billing-details-form.test.tsx` | restore the blanket invoice claim | RED, 2 |
| `site-delete.test.ts` | remove the zero-row branch | RED, 2 |
| `site-delete.test.tsx` | delete on the first press | RED, 4 |
| `readiness-line.test.tsx` | pin `reasonStated` to `false` again | RED, 1 |
| `readiness-line.test.tsx` | stop the panel deferring | RED, 2 |
| `read-thread.test.ts` | remove both store fallbacks | RED, 2 |
| `read-thread.test.ts` | report a failure decision over rendered messages | RED, 1 |

**Three of my own guards were rejected and re-done.** This is the part of the
session most worth reading, because each was green and worthless.

1. The first planner mutation went red with `dayColumn is not a function`, which
   is an absent symbol rather than a behavioural regression. Re-run after the fix
   existed, restoring the exact old expression: four tests red on behaviour.
2. The Analytics "offers the remedy once" test counted links NAMED "Connect a
   channel". The panel's own link reads "Open connections", so breaking the
   collapse left it matching exactly one link while TWO were on screen. It counts
   the `href` now, which is the property, and then it failed correctly.
3. `read-thread.test.ts` spied on the exported `scopedAccount`. `readThread`
   calls the module-LOCAL binding, so the real one ran, got `{}` for its reads,
   and **six of seven tests passed while every one of them hit the catch arm**.
   The fake moved to the reader, where the network actually is. A fourth
   assertion in the same file read a `kind` field that does not exist on
   `SurfaceDecision`; it asserts `showList`, which is what the screen branches on.

## Anything retracted

- **The map's three launch blockers are not three.** MEASURED: the checkout page
  renders a real `CashfreeCheckout` handoff with its own test, and
  `processPaymentEvent` calls `store.activate` at line 106 through
  `createPgSubscriptionWriter`, whose SQL inserts into `subscriptions`. The claim
  "no code in the product inserts or updates a subscription row, the writers
  simply do not exist" is false at HEAD. The Cashfree webhook route is wired end
  to end. Only the hold sweep survives, and it is a decision rather than a defect.
- **`SiteLeadSubmitSchema` already accepts a phone-only enquiry.** MEASURED:
  `blankIsAbsent` preprocessing turns the blank email into `undefined` before the
  email validator runs, and `sites.lead-submit.test.ts` covers it.
- **"Approve to publish" and the empty approvals list** both verified
  ALREADY_FIXED against source.
- **My own Studio overclaim, withdrawn.** Earlier in this lane I opened Series
  for models that draw several pictures per call. That was the wrong question:
  `ImageGenerateInputSchema` carries no count and `ImageGenerateOutput` returns
  one picture, so the delivery path was N separate calls with the same prompt.
  The Studio action said so in its own words the whole time. The guards now bind
  to the SCHEMA, so they flip by themselves when the capability lands rather than
  rotting back into an overclaim.
- **The `@sahoda/jobs` failure I attributed to trunk on 2026-09-01 was two
  different things.** At that commit it was a real `x-ration` assertion; that
  code has since changed and the test passes. In the 2026-09-03 baseline run the
  same package failed with three `Hook timed out in 30000ms` errors, all in
  `new PGlite()` inside `beforeEach` — resource starvation under 27 concurrent
  turbo tasks, since the package passes 472/472 alone. It is green in the final
  full run. **INFERRED**: contention, not a defect. Worth watching rather than
  worth a fix from this lane.
- **The Ads finding is not a defect**, per the ruling in `components/roadmap/inert.tsx`.

## What the next session in THIS lane should pick up

Every finding on the map is now closed, so this lane has no inherited queue.

1. **The smoke suite, if the secrets ever land.** It is the only thing about
   this lane that is unverified end to end, and it has been unverified for three
   sessions running.
2. **Watch `/sites` for the delete.** It is the one CUSTOMER-DESTRUCTIVE control
   added here. It asks first, states what is lost and what survives, and refuses
   rather than reporting a deletion that did not happen — but it has never been
   exercised against the real database, only against a faked client.
3. **`/analytics` and `/inbox` deserve a look on the preview**, for the same
   reason: both changes are about what a screen says when a read fails, and that
   is exactly the state a unit test simulates rather than reproduces.
4. **The founder decision on `SAHODA_HOLD_SWEEP_MODE`** is still open.

## Gate

MEASURED 2026-09-03 on `wt-divas2` at `9cb0e831`, `--force` on every leg, not
piped. Re-run in full after the last three fixes.

| Leg | Result |
| --- | --- |
| `turbo run typecheck lint test --force` | **PASS — 27 of 27 tasks** |
| `@sahoda/web` | PASS — 8204 passed / 13 skipped |
| `@sahoda/db` | PASS — 966 passed / 198 skipped |
| `@sahoda/jobs` | PASS — 472 passed (41 files) |
| `@sahoda/sites` | PASS — 1566 passed |
| `@sahoda/billing` | PASS — 417 passed / 13 skipped |
| `@sahoda/mesh` | PASS — 235 passed |
| `@sahoda/publishing` | PASS — 510 passed |
| `@sahoda/research` | PASS — 195 passed |
| `prettier --check .` | PASS |
| `design-lint` | PASS — no new violation in any category |
| Playwright `@smoke` | **UNRUN** |

Both legs that were red at the start of this session are green: `@sahoda/jobs`
(the PGlite timeouts did not recur) and `@sahoda/db` (the live-guard passes with
`SAHODA_ALLOW_LIVE_TESTS` absent, as designed).

One lint failure was caused by this work and fixed: the new wallet alert copied
`text-[13px]` from the alert beside it, and that value is a BASELINED violation
rather than an approved one, so copying it registered as new.

**Look at it:** the screens changed are
`https://sahodalabs-git-wt-divas2-development-4417s-projects.vercel.app` at
`/wallet`, `/home`, `/planner?view=day&week=1` (the one that used to draw
nothing), `/studio`, `/brain/knowledge`, `/report` and `/settings`. That is the
lane preview, **not** `https://app.sahodalabs.com`, which still carries the
previous build because nothing here has been promoted.
