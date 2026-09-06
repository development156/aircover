# Handoff — divas / wt-core (2026-09-06, /home deep audit)

**Four fixes shipped in `c845e641` and verified live on the wt-core preview.** The
full report is published as an artifact:
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

## Cleanup done

The audit's post `87e589c2` (and its one variant) was deleted from the QA
workspace in production. The QA workspace itself was left as found.

## Not done, and why

- Smoke suite not run locally: needs the e2e keys, which this session may not read into a shell.
- Composer "Schedule it" rendered no date field once (dynamic client chunk, share cookie refreshing at that moment). Needs a re-test on a clean session before it is called a defect.
- H-01 (plan offer), H-03 (queue definition), H-07 ("Scheduled" semantics), H-16 (preview → staging) not changed: each needs a decision.

## Needs a decision

1. What signal shows the plan offer, and whether a modal is ever right for it.
2. Whether a dated, channelled draft counts as "waiting on you" (and the /approvals sentence "every post reaches this queue", which the code does not do).
3. Whether "Scheduled" counts only approved posts.
4. Whether the Vercel Preview environment should point at staging instead of production.
