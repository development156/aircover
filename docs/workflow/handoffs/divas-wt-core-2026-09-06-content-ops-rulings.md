# Handoff — divas / wt-core (2026-09-06, the three content-ops rulings executed, 19:00–19:55 IST)

**Done, verified live on build dpl_JBYVPcEt (commit f99c4b65).** Report section 34: https://claude.ai/code/artifact/032b3c05-cba9-4bae-8ebb-19e0e2c80887

| Ruling | Shipped | Live proof |
| --- | --- | --- |
| Role in the database | `posts_lifecycle_role_guard` trigger; migration `20260906190000` APPLIED to prod (one transaction, recorded); 44 PGlite tests, mutation 21 red | QA user's own token: status → scheduled/partial 400 POST_LIFECYCLE_ROLE; approved_by direct 400; draft ↔ review 200 |
| Approval is a recorded gate | `approve_posts(uuid[])` records approved_by/at, dated → scheduled, undated → approved; schedule RPCs record self-approval; backfill; app approves via RPC with plain sentences | dated draft approved from the queue → status scheduled, approved_by = user, approved_at set |
| Planner in the workspace zone | `lib/time/day-key.ts`, zone threaded through every planner surface and the picker; WeekGrid deleted; `DEFAULT_ZONE` the one literal | workspace pinned to America/New_York: 2026-09-08T00:30Z post sits on the 7th, "08:30 pm GMT-4", caption "Times are shown in GMT-4" |

**Temporary by design:** the guard's compatibility path lets owner/editor/approver still write `approved` directly because production (wt-web) does the old update. When wt-core is promoted: drop that clause (the migration header lists it) and re-run the one-line backfill.

**Not done:** reject/resubmit (F-06), an approvals history table, the wt-db batch (log cascade, dispatcher index, scheduled_at CHECK, anon revokes), composer address after first save (F-14), zone label "GMT-4" vs "EDT" under en-IN, prod schema snapshot refresh.

**Traps this session:** the shared Playwright MCP browser was taken by another session; a fresh context opens the demo workspace unless `sahoda_ws=<slug>` is set before sign-in; share links and Clerk tickets are single-use; another session commits to this worktree (stage by path). QA workspace restored: zone Asia/Calcutta, 0 posts, 0 assets.
