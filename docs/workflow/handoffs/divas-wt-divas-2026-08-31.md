# Handoff — divas — wt-divas — 2026-08-31

> **Superseded by [`divas-wt-divas-2026-09-01.md`](./divas-wt-divas-2026-09-01.md).**
> Same session, filed before it crossed midnight UTC. That file carries the
> sections `/handoff` requires and one retraction this one does not. Read it instead.

**Branch** `wt-divas` at `da2d0b84`, fully contained in `wt-core` at `a953a2e2`.
Lane `wt-divas`. Pushed: **yes**. **PR #28 and PR #35 are both merged.** Nothing
of this lane is open.

**This lane's preview:**
<https://sahodalabs-git-wt-divas-development-4417s-projects.vercel.app/loop>
**Live:** `wt-web` is at `3718bd31`, **49 commits behind `wt-core`**. Autopilot
has not reached production and nothing in this handoff is on
<https://app.sahodalabs.com>.

---

## The one thing to read before anything else

**The three repository secrets the smoke suite needs still do not exist, and we
now know they were not merely mistyped.** The founder added the six names on 30
August. Run **33357806266** on `wt-core` at `a953a2e2` was dispatched to prove
it. MEASURED: the guard step failed in **20 seconds** and the runner's env block
printed **six empty values, not three**:

| Guard read | Value |
| ---------- | ----- |
| `CLERK_PUBLISHABLE`, `CLERK_SECRET`, `SUPABASE_URL` (secrets context) | all empty |
| `VAR_CLERK_PUBLISHABLE`, `VAR_CLERK_SECRET`, `VAR_SUPABASE_URL` (variables context) | all empty |

The guard reads **both** contexts on purpose. Both being empty means the values
did not land on the Actions Variables tab either. Wherever the six were added,
it was not GitHub repository settings — most likely the Vercel project or the
Claude cloud environment, both of which store the same names and neither of
which a workflow can read.

**The remedy, exactly:** GitHub → the repository → Settings → Secrets and
variables → **Actions** → the **Secrets** tab → **Repository secrets** →
*New repository secret*. Three names, spelled as the workflow reads them:
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`. The suite also consumes
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_DB_URL`, so add all six. The Dependabot tab and Settings →
Environments both store secrets and neither reaches this job.

**Do not work around it.** Do not inline a key, relax the guard, or un-skip a
spec that skipped for want of one. Until those exist, the honest statement
stands: this project has no automated way to run its own end-to-end suite. The
last real smoke run remains **2026-08-24: 115 passed, none skipped, 15.6m**.

---

## What shipped today

One commit of product code and one merge.

| # | What | Where |
| - | ---- | ----- |
| 1 | The cap and window control, on `/loop` | `components/loop/autopilot-limits.tsx` |
| 2 | Both values accepted and bounded on the write path | `app/actions/loop-dial.ts` |
| 3 | Six bounds constants, so form / action / column cannot drift | `packages/shared/src/db/loop.ts` |
| 4 | The bounds pinned against the migration's own CHECKs, read as text | `app/actions/loop-settings-bounds.test.ts` |
| 5 | The three trigger refusals as sentences somebody wrote | `lib/loop/autopilot-refusal-copy.ts` |

`autopilot_daily_cap` and `autopilot_cancel_minutes` are `not null` with defaults
of **3** and **30**. They always governed; nothing in the product wrote or
displayed them, so every workspace ran at those two figures with no screen
saying so.

**The copy claim that needed care.** The tick runs every ten minutes, so a
cancel window under ten closes *between* ticks and the post goes out on the
following one — later than the number says, never earlier. The sentence is
**"Sahoda waits at least this long before handing a post over"** and
`autopilot-limits.test.tsx` holds it. "Your post goes out after N minutes" would
be a claim the schedule cannot keep.

**A correction I made in flight, recorded so it is not re-derived.** I claimed
autopilot would "silently do nothing" because both settings columns could be
null. They cannot: both are `not null` with defaults. The claim was wrong and
was corrected in chat, in the commit message and in the PR body.

---

## The state of autopilot

Unchanged from yesterday and worth restating, because it is the whole safety
posture:

- **`SAHODA_AUTOPILOT_ENABLED` is set nowhere.** One environment variable stands
  between this code and unattended publishing. Eleven plausible "yes" values are
  each a no; `autopilot-enabled.test.ts` has fourteen tests on it.
- **The database trigger** in `20260828120000_loop_autopilot_l3.sql` refuses
  level 3 to any workspace without a supervised cycle that reached `reported`
  and a Brand Brain with four fields confirmed.
- **No autopilot run has ever happened.** Neither the cap nor the window has
  governed a real post.

To turn it on, in order: set `SAHODA_AUTOPILOT_ENABLED` on the production
environment, promote `wt-core` → `wt-web` (crons run on production deployments
only), then set a channel to autopilot on `/loop` and let the database decide
whether that workspace qualifies.

---

## Gate

`pnpm gate` on `da2d0b84`: turbo **27/27** (`@sahoda/web` 6733, `@sahoda/shared`
519), root vitest **223**, prettier clean. CI green. The Playwright leg is unrun
for the reason above.

---

## What I did NOT do, and why

- **Did not promote `wt-core` → `wt-web`.** That is the one gated step in the
  system and it is a person's call. A stale `--no-ff` promotion commit
  `093e0f31` exists only in a deleted local branch; re-cut it from `a953a2e2`
  rather than reusing it.
- **Did not set `SAHODA_AUTOPILOT_ENABLED`.** Deliberate. It is the only real
  gate left and it is not mine to flip.
- **Did not touch the six secrets.** `.env*` and prod resources are on the
  do-not-touch list; a settings problem gets reported, never worked around.
- **Did not re-measure the @smoke test count.** CLAUDE.md carries **118 tests in
  37 files**, MEASURED 2026-08-26. It cannot be re-measured on this lane —
  Chromium in this sandbox cannot complete an outbound HTTPS request and every
  @smoke spec signs in through Clerk.

## Needing a decision

1. **Add the six repository secrets** (the remedy above). Nothing else unblocks
   the end-to-end suite.
2. **Promote `wt-core` → `wt-web`?** 49 commits, autopilot among them, still
   switched off by the flag.
3. ~~`DEVOPS_INGEST_TOKEN` returns 401~~ — **resolved, and the earlier claim was
   wrong by the time it was written.** MEASURED this session: the sync posted,
   the server acknowledged, and `ops-sync.mjs` drained both pending queues by
   sent-count. `post()` returns null on any non-2xx and `if (!ack) return`
   guards the drain, so a drained queue is proof the endpoint accepted the
   POST. The printed `changelog 0 · qa 0` is `ack[k]`, what the server stored,
   which is legitimately 0 for an idempotent re-send.
4. The **Claude GitHub App is not installed** on this repository, so PR webhooks
   never arrive and no session is woken by CI.

## The two pending queues are not one rule

They look alike and are governed oppositely. I got this wrong twice in one
session, so it is written down.

| File | On a dirty tree | Why |
| ---- | --------------- | --- |
| `ops/state/changelog.pending.json` | **commit it** | Doc 13 sec 9.1: committed and reviewable in every PR. `ops-sync.mjs` drains it only after an ack, so a drained queue is proof the server stored those rows. |
| `ops/state/qa.pending.json` | **revert it, always** | REQUESTS sec 18: the capture hook stamps every gate run with whatever card is open. It has been depositing `pass` and `fail` rows on SL-054, the card recording that production was down for 22h40m. |

A pre-commit hook refuses the second and names the reason. It is the guard that
caught this, and it worked. `ALLOW_QA_PENDING=1` exists only for a genuine change
to that file's shape.
