# Handoff — divas / wt-core (2026-09-06, content-ops wave 2, 20:30–21:00 IST)

**Landed at `cd760f95`, pushed. Migration `20260906213000_content_ops_integrity` APPLIED to prod in one transaction (MEASURED: `COMMITTED.`, anon gets 401 on `send_post_for_review` and `delete_asset`, `post_approvals` / `post_comments` exist).**

Five implementer agents were stopped by the founder mid-wave ("finish fast, not that important"). What they had finished was kept, what they had not was dropped, and the result was gated in one session.

| Area | Kept | Dropped (never built) |
| --- | --- | --- |
| DB | whole integrity batch, 32 PGlite tests, every part mutation-red | nothing |
| Jobs | publish log + mark in one tx, idempotency_key, claim guard, index-shape test, storage reconcile task, quota fails closed | doctrine sentence + service-role allowlist test |
| Assets | doors, paged/search reads, batched empty-trash with cursor, thumb minter, trash undo ids, storage meter fails closed | page-level trash count + folder counts (page.tsx reverted to HEAD + `thumbUrl`), URL state, picker/a11y/copy items |
| Planner | week offset, plan order, windowed read (lib only, 37 tests) | every component change: month nav, day columns, focus, phone first screen, row Send back/Send for review |
| Approvals | posts-review actions, comments action + components, history + context libs, review controls, send-back form, queue preview/row, composer address test | wiring those into /approvals page and the composer finish panel, approve-flow e2e |

Gate: apps/web tsc clean for this task's files; vitest green except nine files owned by the loop/inbox/webhooks/turbo sessions in the same worktree; apps/jobs 520/520; packages/db 1082 pass with the one pre-existing `loop_migrations` failure; packages/shared 507/507; eslint clean on the touched directories.

**Not done:** no headless preview verification of the new screens, because the new approvals UI is not wired to a page yet. The scorecard in the audit artifact was NOT re-scored; sections whose UI was dropped stay at their audited numbers.

**Needs a decision:** whether `return_post_to_draft` should also walk scheduled variants back to `pending` (it does, mirroring `cancel_scheduled_post`).

Preview: https://sahodalabs-git-wt-core-development-4417s-projects.vercel.app/approvals
