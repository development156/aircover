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
