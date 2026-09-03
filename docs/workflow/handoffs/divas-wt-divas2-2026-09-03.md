# Handoff — divas — wt-divas2 — 2026-09-03

**Branch** `wt-divas2` at `0c7e8075`. Lane `wt-divas2`. Pushed: yes.

Worked the Sahoda System Map artifact end to end. **Six of its seventeen findings
were already fixed** on current `wt-core`, including two of the three it names as
launch blockers. Seven were real and are fixed here. Three remain, each with a
verified root cause and a written fix. One is a founder decision and one was not
a defect at all.

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

Also corrected two sentences in `roadmap-figures-scan.spec.ts` that were the
inverse of the truth about which guard owns which route. Comment only.

**MEASURED**: eight commits, `8325ed45` through `0c7e8075`.

## What was NOT done, and why

- **Playwright `@smoke` is UNRUN, not passed.** Unchanged from 2026-09-01:
  Chromium here cannot complete an outbound HTTPS request, and the CI job's guard
  step still exits in under a second because the three Clerk and Supabase names
  read empty as repository secrets AND as variables. That is a settings problem
  and the rules say report it, so it is reported and not worked around.
- **Three findings verified and left for the next session.** Each has a root
  cause quoted from source and a named fix; none is a guess. They are listed
  under "What the next session should pick up" with enough detail to start cold.
  I stopped here rather than half-doing them.
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

**One mutation was rejected as proof and re-done.** The first planner run went
red with `dayColumn is not a function`, which is an absent symbol rather than a
behavioural regression. It was re-run after the fix existed, restoring the exact
old expression, and four tests went red on the behaviour.

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

1. **Inbox: a stored conversation cannot be opened.** `readThread` still resolves
   messages only through `scoped.reads.listMessages`, so it goes back to Zernio
   for data the database already holds; the LIST was migrated to the store and
   the THREAD was not. When Zernio is unreachable the thread renders zero
   messages. Fix: `readStoredThreadMessages(platformThreadId)` in
   `lib/inbox/store-read.ts`, used in `readThread` when the live read throws or
   returns nothing. Risk: medium.
2. **Analytics shows five apologies at once.** `analyticsReadiness` and
   `ReadinessLine` implemented docs/40 §3.4 ruling 1 and the 2026-08-29 rebuild
   replaced them with a whole-page early return, so five sections each diagnose
   the same shared cause. `readiness.ts` and its tests are still in the tree with
   no importer. Fix is a page-file change reusing code that already exists;
   `readiness-line.tsx` is recoverable from `6a4fda80^`. Risk: medium.
3. **Websites cannot be deleted.** `generateSite` is the only mutation and the
   entitlements gate counts drafts, so on Starter the first generation is the
   last and the only remedy offered is a bigger plan. Members already hold a
   `t_delete` policy and the cascade exists. Fix: a `deleteSite` action modelled
   on `deletePost`, with `.select()` so a zero-row delete is not reported as
   success. Risk: low, but it is a destructive customer-facing action.
4. **Then the smoke suite**, if the secrets ever land.

## Gate

MEASURED 2026-09-03 on `wt-divas2` at `0c7e8075`, `--force` on every leg, not
piped.

| Leg | Result |
| --- | --- |
| `turbo run typecheck lint test --force` | **PASS — 27 of 27 tasks** |
| `@sahoda/web` | PASS — 633 files / 8178 tests (3 files, 13 tests skipped) |
| `@sahoda/db` | PASS — 966 passed / 198 skipped |
| `@sahoda/jobs` | PASS — 472 passed (41 files) |
| `@sahoda/sites` | PASS — 1566 passed |
| `@sahoda/billing` | PASS — 417 passed / 13 skipped |
| `@sahoda/mesh` | PASS — 235 passed |
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
