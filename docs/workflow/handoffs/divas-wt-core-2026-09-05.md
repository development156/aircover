# Handoff — divas / wt-core (2026-09-05)

**Full application audit done: browser QA on a production build + five parallel code audits.** Report: `docs/51_Full_App_Audit_2026-09-05.md` (24 findings, 3 fixed here, 1 migration written). Unit gate 27/27 green, 3m26s.

## Fixed in this lane

| What | Where | Proof |
| --- | --- | --- |
| Publish transport had no timeout | `packages/publishing/src/transport.ts` | 3 new tests; deleting `signal:` turns 2 red |
| Unknown checkout order said "could not reach the payment provider" and paged Sentry | `billing/checkout/[orderId]/page.tsx` | 2 new tests; 404 → `notFound()`, not reported |
| Two `h1` on `/brain/knowledge` | `brain/knowledge/page.tsx` | aria snapshot |
| 7 FK columns with no index | `20260905100000_fk_indexes_for_deletes.sql` | **written, NOT applied**; applies clean on PGlite (219 tests) |

## The finding that matters

Onboarding's Brand Brain build is not persisted until the reveal's confirm. MEASURED: 3 model calls ok, 0 `brand_memory` rows, then a 24 h lockout with a "Try again" button. `brand_memory.status` already allows `draft`. Fix in `onboarding-resolve.ts` + `use-build.ts`. This is the NOW item.

## Environment notes

- Chrome extension was not connected; Playwright MCP + a scratchpad driver using the repo's own seeded-user method (Clerk ticket) did the QA. One throwaway user, cleaned up and verified (0 workspaces, Clerk 200 on delete).
- `next start -p 3100` from this worktree was left running; kill it before deleting `.next`.
- `@smoke` UNRUN (needs the ack variable typed by a person). Cashfree refuses this environment's keys (known). Nothing published.

## Open, unchanged from 2026-09-04

Rotate the prod DB password · re-run @smoke · promote `wt-core` → `wt-web` · Supabase MCP unauthorised.

## Session 4, same day: the three decisions from the audit, executed

Founder: "i have applied the secrets, start executing all the decisions".

| Decision | What happened | Proof |
| --- | --- | --- |
| Apply the FK-index migration | Already on production: session 3 applied it under `20260905100000 fk_indexes_for_deletes` before this session started | Supabase MCP `list_migrations`, MEASURED |
| Move the plan modal off the first dashboard | `planOfferDecision` takes `{ hasStarted }` (the `workspaceHasStarted` verdict) and answers `silent / not-started`; the empty dashboard gets no offer | `7a8036ae`; the home test that pinned the opposite retargeted; 80 tests green |
| Run the smoke leg on CI | Dispatched with the six production secrets: the guard passed for the first time ever, then the suite refused `refused-production` in 9 s (`e2e-target.ts` no longer accepts production; staging `yoxmzwkxweasfaahhvpj` is the only target). Rewired the job to `E2E_SUPABASE_*` secrets so the nightly production jobs keep theirs; brought staging level (3 migrations applied via MCP); set the two public values | `fb73e00f`; runs 33961015055 and 33962162511 |

**Blocked on two values only a person holds.** Run 33962162511 refuses naming
exactly `E2E_SUPABASE_SERVICE_ROLE_KEY` and `E2E_SUPABASE_DB_URL` (staging's
service-role key and pooler URL, Supabase dashboard → sahoda-staging → Settings
→ API / Database). Then:

    gh workflow run gate.yml -R development156/aircover --ref wt-core -f ack_target=yoxmzwkxweasfaahhvpj

Also noticed: staging carries `20260820144500 variant_formats_story_thread`
under a different version than production's unnamed `20260820144500`; a
name-only drift, not investigated.

## Session 4, continued: three smoke runs, each one step further

| Run | Got as far as | Why it stopped | Fix |
| --- | --- | --- | --- |
| 33965242498 | suite started on the dev server | 45-min job limit, no output flushed | `b395eace`: build step + `next start`, 60 min, artifacts on `always()` |
| 33968304482 | suite on the built app | `Invalid supabaseUrl`: `E2E_SUPABASE_URL` had been re-saved with a non-https value | `571d3259`: guard checks shape; both public values re-set |
| 33976271461 | **sign-in works, app renders, real assertions run** | every read to staging answers **401** | Staging does not trust Clerk's tokens (below) |

**MEASURED from staging's API logs, 15:55–16:55 UTC:** 251 × 401 on
`/rest/v1/workspaces` and `/rest/v1/ops_admins`, 29 × 200, 50 × 204.
Production, same Clerk instance, during the morning's browser QA: 1,630 × 200,
0 × 401. `createServerSupabase` hands Supabase the Clerk session token; a
project only accepts it when Clerk is registered as a third-party auth
provider on THAT project. Production has it; staging, restored today, does not.

**One dashboard action, then re-dispatch:** Supabase → `sahoda-staging` →
Authentication → Sign In / Providers → Third-Party Auth → Add provider → Clerk,
domain `leading-hyena-7.clerk.accounts.dev`. Then:

    gh workflow run gate.yml -R development156/aircover --ref wt-core -f ack_target=yoxmzwkxweasfaahhvpj

**First real result from the suite, before the 401s stopped it:**
`accent-area-budget` fails on `/settings`: 7,012 px² of brand fill against a
2,000 px² ceiling ("configuration — §2.3 says approximately zero"). That is a
genuine design regression on the trunk, not an environment artefact; the
selected "Plan & credits" nav item is the likely fill. Not fixed here.

Clerk test users minted by the three runs were purged (34 + 34 + this run's);
18 older `sahoda.e2e.*` users from before today remain on the dev instance.
