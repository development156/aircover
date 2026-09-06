# Handoff — divas / wt-core (2026-09-06, /home deep audit)

**Four fixes shipped in `c845e641`, then the three delegated decisions in
`a0ddbbfc`, all verified live on the wt-core preview.** The full report is
published as an artifact:
https://claude.ai/code/artifact/a1a78ffa-4c7e-4462-bfac-b8f12ea943ae

Audited in a real Chromium against
`https://sahodalabs-git-wt-core-development-4417s-projects.vercel.app/home`,
signed in as the QA account (`sahoda.qa.mtoy3biltfnr4k+clerk_test`) through a
Clerk sign-in ticket minted from the same development instance the preview uses.

## What was measured

| Area                    | Result                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Preview database        | **Production** (`rloztdhz`). The QA workspace `83bcafc4` exists there and not in staging. Every write in this audit landed in prod |
| Landing rule            | No brain → /onboarding; Save & exit → dashboard. Correct in the browser                                                          |
| Plan offer              | Opens as a modal over the first full dashboard after ONE saved draft, 100 of 100 credits unspent                                |
| Queue                   | Only the Loop writes `review`; prod has 1 review + 4 failed posts across 35 workspaces. The lead region is empty for ~33 of 35   |
| Greeting vs board       | "Nothing in flight yet" over "Waiting on you · 1 post" — **fixed**                                                               |
| Back after an edit      | Served the pre-edit dashboard (router cache); composer writes did not revalidate /home — **fixed**                               |
| Empty-state lead door   | /brain (empty page) → /onboarding, two hops — **fixed** to one                                                                    |
| Week strip long title   | ~10 chars, no tooltip — **fixed** (`title` attribute)                                                                            |
| Queries per render      | 22 PostgREST calls in 674 ms; 9 belong to the shell                                                                             |
| Prefetch                | 20 route renders within 0.5 s of every arrival (rail links, default prefetch), seen in Vercel function logs                     |
| Load                    | TTFB 59 ms, first paint 516 ms, load 1.16 s, CLS 0.006 (populated, 1440)                                                         |
| Widths                  | 1440 / 1024 / 768 / 390: no overflow; 768–1180 collapses to one column (2,014 px tall)                                           |
| Contrast                | 9 of 10 samples at 6.9–7.2:1; today's day label 2.94:1 (brand text on wash, 11 px)                                              |
| RLS                     | Enabled with member SELECT policies on all 16 tables Home reads (pg_policy, prod)                                                |
| Unit tests              | 129 green before, 113 in the touched suites after, plus 4 new files; the revalidation test proven by mutation (2/2 red without) |

## Commit

`c845e641` — greeting names review and failed posts (new `greeting.test.ts`);
`startSteps` brain door → /onboarding; week entry carries `title`; `createPost`
and `savePost` revalidate `/home` (new `posts.revalidate.test.ts`). Verified on
`dpl_DhRz7BvizH282fqbxAnzDTxAux79`: greeting "1 post waiting for review." beside
"Waiting on you · 1 post"; week entry tooltip present; empty-state lead href
`/onboarding`.

## The founder's answers (11:41 IST) and what was done with them

| Decision | Ruling | Done in `a0ddbbfc` |
| --- | --- | --- |
| 1. Plan offer | Delegated | `planOfferDecision` takes `creditsAvailable`; silent (`credits-remain`) while more than half of Free's 100 credits remain, silent (`unknown`) when the balance is unreadable. Threshold read from `PLAN_CATALOG`. e2e `plan-offer.spec.ts` seeds a 60-credit DEBIT through `app.apply_ledger_entry` and fails loudly without `SUPABASE_DB_URL` |
| 2. Queue | Delegated | `needsAPerson(post)` admits a draft or idea with a date and at least one channel (a decision, since `canApprove` admits drafts). Six call sites; Home and /approvals empty-state sentences rewritten; "every post reaches this queue" removed |
| 3. "Scheduled" | Delegated | Counts approved, scheduled, publishing only; note "Approved for the next seven days" |
| 4. Preview database | Production is production, staging is for development | NOT changed: the Preview env's four Supabase variables must be repointed at `yoxmzwkx`, which needs the staging service-role key and pooler password (not held here). See "Needs a decision" |

Also: the greeting says "N drafts in progress", so "waiting" belongs to the board alone.
RED first (12 failures across five suites), 294 green after across 27 files; typecheck, lint and prettier clean.

## The design pass (12:11 IST, "implement the best UI and UX")

`3b47cd61`, held to docs/37. One setup ladder under the greeting (`lib/home/setup.ts`,
`components/home/setup-strip.tsx`) says a missing brain or channel once, with its door;
the Performance card drops its copy of the remedy; the rail leads with Connections and
Brand Brain until setup is done. The empty spend card draws its baseline at content
height (`ChartSparse compact`). Today's day label is ink. The rail runs two columns
between 700 and 1180. The loading skeleton mirrors the real layout. Every shell link
carries `prefetch={false}` (guarded by `shell-prefetch.test.ts`). `onboardingStateRead`
derives from the cached `readBrain`. The greeting reads the workspace timezone.
697 tests green in the touched areas; typecheck, lint, prettier clean.

## Close-out (14:05 IST, "proceed as is")

The founder ruled the Preview stays on production. `15707051`: the composer's
Confirm schedule writes `scheduled` (walked live), so the greeting now says
"1 post scheduled." over the board's "Scheduled · 1 post" (mutation-proven);
`readSubscription` is one select with a split-read fallback for a missing
column (four tests count the selects). H-18 closed: on a clean session
"Schedule it" renders presets, a calendar and a time picker; the earlier blank
was the Vercel share cookie lapsing under the dynamic chunk.

## The visual pass (14:43 IST, "visually stunning, great contrast, graphs")

`079e8d26` + `8e5f2e90`, inside docs/37. `lib/home/balance-history.ts` reads the
wallet's total day by day off `balance_after` in the fifty ledger rows the feed
already holds (no query; complete ledger → real zeroes before the first row,
capped → `null`). `components/charts/sparkline.tsx`: a line with soft fill and
endpoint (revealed once by `.spark-draw`, reduced-motion collapses it) and
`MiniBars` with a baseline stub per bucket. The board: credits line, week bars
(today in the accent), and "Waiting on you" wears the brand wash over its own
opaque surface while something waits. MEASURED on the preview in both themes
with a private headless Chromium (both MCP browsers were held by another
session): washed figure 20.1:1 light / 19.4:1 dark, label 6.9 / 6.7; both
charts announce themselves ("Credits over the last 30 days, from 0 to 100",
"Approved posts by day: … Tue 1 … Thu 1"). 160 tests in the touched areas.

`8e5f2e90`'s Vercel build failed on `/brain`'s js-budget (+8.2 kB), which is
`1a3c6eb8` (another session's Brand Brain map), not Home; the same failure hit
their own build. `079e8d26` is what the branch alias serves until that is fixed.
The QA workspace holds three seeded posts for the capture (titles begin
"Audit visual:"); delete them when done.

## Cleanup done

The audit's post `87e589c2` (and its one variant) was deleted from the QA
workspace in production. The QA workspace itself was left as found.

## Not done, and why

- Smoke suite not run locally: needs the e2e keys, which this session may not read into a shell.
- H-16 (Preview → staging): the founder ruled, 14:05 IST, that the Preview stays on production. Not changed; QA on the preview keeps writing to prod, so delete what you create.
- Not folded: the two logo pointer reads (`readBrandLogo`, `readBrandLogoDark`) each select `workspaces` once; one query, eleven mocked tests to retarget, left for a later pass.
- No @smoke spec was added for the board's numbers: it cannot be run from this machine (the e2e target guard refuses production, and staging keys are not in `.env.local`), and an unrun guard is not a guard.
- The retargeted `plan-offer.spec.ts` was not run: it needs `SUPABASE_DB_URL`.

## Needs a decision

Nothing needs a decision. One action needs a person with dashboards: set the
Vercel **Preview** environment's `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_DB_URL` to the staging project (`yoxmzwkxweasfaahhvpj`), after
resetting the staging database password once so the same value can go into the
`E2E_SUPABASE_DB_URL` GitHub secret.
