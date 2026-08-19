# 30 · Loose ends from runs 1–27 — measured

**Date:** 2026-08-19 · **Branch:** `wt-loose-ends` (cut from `wt-design` @ `1447f72`)

Every claim here is **MEASURED** unless marked INFERRED. Where a premise handed to this run turned
out to be wrong, the correction is stated first and the evidence follows — three of them were.

> **Numbering note:** this file took `30_` rather than `28_` on purpose. Four design sessions were
> running in parallel and `28_`/`29_` were plausible next numbers for their output. A doc number is
> not worth a merge conflict.

---

## P1 · The metrics cron has never collected

### The premise handed to this run is wrong

The brief said the cause was that "the deployment is `target:null`, a preview". That is true of the
deployment (MEASURED: `latestDeployment.target = null`, and all 20 most recent deployments are
previews from `wt-ui-port`/`wt-design`), **but it is not the cause**, and it cannot be — Vercel does
not schedule some of a project's crons and not others.

### The actual cause

**Production does not contain the route.** MEASURED against the live production alias:

| request | status | reading |
| --- | --- | --- |
| `sahodalabs.vercel.app/api/cron/sweeps` | **401** `Unauthorized` | the route exists; its cron-secret guard fired |
| `sahodalabs.vercel.app/api/cron/metrics` | **404** | no such route |
| `sahodalabs.vercel.app/api/definitely-not-a-route` | **404** | the control — a path never written |

The two 404s are byte-identical, down to the Next.js build id `mocvFbXcPVMH5q2jScRHy`. The 401 is
the control that matters: it comes from the **same deployment**, so the 404 cannot be blamed on
deployment protection, on auth, or on the preview target. One route is in the build and one is not.

Confirmed in git, which says the same thing:

```
git show wt-web:apps/web/vercel.json     -> crons: [ /api/cron/sweeps  */5 * * * * ]     (metrics absent)
git ls-tree wt-web -- .../api/cron/      -> sweeps/route.ts only                          (metrics absent)
```

`apps/web/vercel.json` on `wt-design` declares **both** crons. The metrics entry and its route were
authored on the `wt-ui-port` → `wt-design` lineage and have never been merged into `wt-web`, which is
the branch production builds from. Vercel cannot schedule a path that is not in the deployed build.

### What it has cost so far

MEASURED in production: `post_metric_snapshots` holds **27 rows across 3 distinct days** —
`measured_on` 2026-08-16 to 2026-08-18, last written 2026-08-19 10:06 UTC. Those are the three
by-hand runs. **Nothing has been recorded for 2026-08-19.** Every day this stands is a day of
platform metrics that no later request can recover.

### P1b · What a full merge would carry

MEASURED `wt-web...wt-design`:

| | |
| --- | --- |
| commits | **79** (75 from `wt-ui-port`, 4 from `wt-design`) |
| files changed | **410** |
| lines | **+38,732 / −1,277** |
| authorship | all 79 `SAHODALABS <development@sahodalabs.com>` |
| merge shape | **fast-forward** — `wt-design..wt-web` is 0 commits, so nothing reconciles |

**No human has walked any of it.** It is proven by automated tests only. That is not a hedge added
for form: it is the largest untested surface in the product and it is item 5 of `docs/25`.

### P1c · Can collection start without a full merge?

Two routes, and the first is the real answer.

**1. Run the job as a plain program, off the website entirely.** `runMetricCapture` has no
Trigger.dev SDK and no Next.js dependency — the route is a 60-line wrapper around it. It needs a
database URL and the Zernio credentials, both of which exist outside Vercel. A nightly `node` task on
any machine that is switched on, or a free scheduled GitHub Action, writes the same rows into the
same table with no deploy of any kind. This is a stopgap and should be described as one: it puts a
second thing to remember in a second place.

**2. Cherry-pick, if a smaller merge is preferred to the whole 79.** MEASURED — the metrics path
needs exactly five new files and two edits, and its two `@sahoda/publishing` dependencies
(`createZernioReads`, `ZernioPostAnalyticsResult`) **already exist on `wt-web`**:

```
new    apps/jobs/src/metrics/{capture,deps,store}.ts        (+ 2 test files)
new    apps/web/src/lib/cron/metrics-enabled.ts
new    apps/web/src/app/api/cron/metrics/route.ts
edit   apps/jobs/src/publish.ts        one export line
edit   apps/web/vercel.json            one cron entry
```

The table itself is already applied to production (verified above), so no migration is involved.

**Not done here, deliberately.** No merge into `wt-web` and no cherry-pick branch was pushed.
Merging into the branch that serves customers is a decision, and it is `docs/25` item 2.

### P1d · The sentence for `docs/25`

> The nightly numbers job has never collected anything because the live site is built from a branch
> that does not contain it, so it starts the night that branch is merged, and nothing else needs
> switching on.

---

## P2 · `docs/25_Founder_Actions.md`

**It existed** (151 lines, committed in `77f3aeb`) and run 27 simply never reported it. It has been
rewritten rather than replaced, because two of its claims had gone false and one was never checked.

Corrections, all MEASURED on 2026-08-19:

| the old page said | measured |
| --- | --- |
| the recent work is on `wt-ui-port` | it is on `wt-design`, which contains `wt-ui-port` plus 4 commits |
| the metrics schedule "starts the moment item 1 happens" | true, and now for the *stated* reason — see P1 |
| — (never mentioned) | `app.sahodalabs.com` is **already live on Vercel**; nothing is blocked on DNS |
| — (never mentioned) | production runs **Clerk test keys**, and Clerk says so itself |

### The Clerk finding, because it is the one with a deadline

MEASURED, from the live production page's own browser console:

> Clerk: Clerk has been loaded with **development keys**. Development instances have strict usage
> limits and should not be used when deploying your application to production.

The publishable key served by both `sahodalabs.vercel.app` and `app.sahodalabs.com` begins
`pk_test_`, and the Clerk instance is `leading-hyena-7.clerk.accounts.dev`. Test-instance accounts do
not migrate to a live instance, so every signup between now and the switch is an account to be
handled by hand. It is a one-way door that gets more expensive daily.

### `app.sahodalabs.com` — already done

MEASURED. DNS: `CNAME fdc10d9b03fdc86e.vercel-dns-016.com`. Served by Vercel, and identical to the
production alias — the same Next.js build id on `/` and `/home`, `200` on `/sign-in`. Opened in a
real browser: `https://app.sahodalabs.com/` redirects to
`/sign-in?redirect_url=…` and renders **"Sign in · Sahoda"**. The marketing site on
`sahodalabs.com` / `www.sahodalabs.com` is a separate Framer deployment and is unaffected.

One cosmetic defect: `GET /favicon.ico` → 404 on production.

### Supabase MCP

MEASURED, verbatim, on this run:

> Unauthorized. Please provide a valid access token to the MCP server via the `--access-token` flag
> or `SUPABASE_ACCESS_TOKEN`.

Every database fact in this document was therefore obtained through a **read-only** Postgres
connection that sets `default_transaction_read_only = on` and refuses any statement not beginning
`select`/`with`/`explain`/`show`. **No write was made to the database on this run.**

---

## P3a · `site_generate` fabricated attributed testimonials — FIXED

`docs/22` finding F3. `testimonials` was one of six section kinds the prompt offered, and the only
grounding instruction was "ground every line in the brand and the goal". A brand has a voice; it does
not have customers. Asked for the section, a model writes five-star quotes and attributes them to
people who do not exist — published under a real business's name, with the business as publisher.

**The refusal is in the normalizer, not the prompt.** `packages/sites/src/normalize/attested.ts`
holds `UNATTESTABLE_KINDS`, and `normalizeSections` refuses those kinds **before** the content
normalizer runs, labelling each one `refused-fabricated:/path[i]:kind`. That label is deliberately
distinct from `dropped-section:` — "we declined to publish invented quotes" and "the model produced
nothing usable" are different claims, and collapsing them would hide the refusal from anyone
auditing it.

The prompt change (`testimonials` removed from the listed kinds, plus an explicit "never invent a
customer quote") is a **cost saving, not the safeguard**: `SectionKind` is a frozen enum in
`@sahoda/shared` that still contains `testimonials`, so a model emitting one anyway parses fine.
Only the normalizer can hold.

`renderTestimonials` is untouched. A section built from real rows — or one stored before this rule
existed — renders exactly as it always did. The rule governs what the **generator** may author.

### Proof

`packages/sites/src/normalize/draft-fabricated.test.ts` — 9 tests, all against a fixture carrying
three fully-formed invented quotes with names and job titles, each with a **control** proving the
same slot admits an ordinary section. It asserts the invented strings are absent from the whole
draft, not merely that no section of that kind survived.

Four mutants, all caught:

| mutant | result |
| --- | --- |
| `UNATTESTABLE_KINDS` emptied (refusal removed) | **8 of 9 failed** |
| refusal moved to run *after* the content normalizer | **1 failed** |
| the distinct label collapsed into `dropped-section:` | **1 failed** |
| guard reads only the first section (`index === 0`) | **6 of 9 failed** |
| restored | 9 passed |

Package suite after the change: **1566 passed**, 53 files.

---

## P3b · The rule of three is hardcoded in FOUR places, one of them immutable

`docs/22` finding F2. Reported, **not changed** — and the reason is stronger than "the contract is
frozen".

| # | where | what it says |
| --- | --- | --- |
| 1 | `packages/mesh/src/tasks/brand-guidelines.ts:23,33` | the output contract line, and "EXACTLY 3 items each" |
| 2 | `packages/shared/src/brand/resolve.ts:15,21,31` | `z.array(z.string()).length(3)` ×3 — **frozen package** |
| 3 | **`app.resolve_brand_memory`, in the database** | `jsonb_array_length(...) <> 3 → INVALID_PAYLOAD` |
| 4 | `apps/web/.../editable-list.tsx` | `fixedLength` — the Add/Remove buttons are disabled |

(3) is the one that settles it. The check lives inside a **migration that has already been applied**,
and `CLAUDE.md` states applied migrations are immutable and only `wt-db` may write to that directory.
Relaxing the rule is not a schema edit; it is a new migration that replaces a live function, plus a
frozen-contract change, plus the mesh prompt, plus two UI accommodations.

**What it costs today, visibly:** a founder cannot add a fourth signature phrase or delete one that
is wrong — the buttons are disabled by (4). And `apps/web/src/lib/brand/prune-blank-entries.ts`
exists *solely* to work around it: it strips blank entries from the two open-ended lists and
deliberately leaves the three fixed ones alone, because filtering them would make the payload
`INVALID_PAYLOAD`. So a blank signature phrase is unremovable and is prepended to every model call
forever.

**Read-compatibility, MEASURED:** all **37** stored `brand_memory` payloads are exactly 3/3/3. A
relaxation to `.min(1).max(n)` would parse every existing row unchanged. The migration is the
obstacle, not the data.

**A latent inconsistency worth knowing:** `packages/shared/src/brand/audiences.ts:133` already
declares `signature_phrases: z.array(z.string())` with **no length constraint**. Two schemas in the
same frozen package disagree about the same field. Nothing depends on the difference today.

---

## P3c · "Model tier not recorded" — and the 21% that DO show one are demo seed

The wallet renders `Model tier not recorded` on settled charges. The code comment
(`entry-copy.ts:319`) explains it as "`withCredits` writes `model_tier: null` on every DEBIT today,
so the missing tier is the common case."

**MEASURED in production, and it is worse than the comment says.** 66 DEBIT rows exist; 14 carry a
`model_tier`. Every single one of those 14 has `actor = demo_seed_chai-and-chapters`:

| entry | action | tier | actor | n |
| --- | --- | --- | --- | --- |
| DEBIT | post_variants | economy | demo_seed_chai-and-chapters | 8 |
| DEBIT | caption_rewrite | economy | demo_seed_chai-and-chapters | 3 |
| DEBIT | brand_research | standard | demo_seed_chai-and-chapters | 1 |
| DEBIT | site_generate | premium | demo_seed_chai-and-chapters | 1 |
| DEBIT | campaign_plan | standard | demo_seed_chai-and-chapters | 1 |
| **HOLD** | post_variants | economy | demo_seed_chai-and-chapters | 1 |

So: **no real charge has ever recorded a tier — 52 of 52.** The only tiers the wallet has ever
displayed are hand-written fixture values on demo rows where no model call happened. One of them is
on a `HOLD`, which is written *before* any model runs and can have no tier at all. In the demo
workspace the tier line is not a measurement; it is decoration.

### Can it be recorded?

**The plumbing already exists.** `app.apply_ledger_entry` takes `p_model_tier text DEFAULT NULL`,
and `withCredits` already has the right seam: `resolveExternalCost` runs **after** the wrapped action
and **before** the settle, specifically so a figure that is only knowable post-run can ride the same
statement as the charge. A tier resolver belongs on that seam.

**For five of six model actions it is a function.** `caption_rewrite`→economy,
`content_variants`/`post_variants`→economy, `plan_week`/`loop_cycle`→standard,
`site_generate`→premium, `image_generate`→standard.

**For the sixth it is not, and this is the part that cannot be papered over.** `MESH_TASK_ACTION`
maps **two** tasks onto `brand_research` — `brand_guidelines` (**economy**) and `brand_extract`
(**standard**) — and the comment there states that one `withCredits` call deliberately wraps
crawl → extract → resolve so the founder pays 50 once. So a single `brand_research` charge spans
several model calls at **two different tiers**, and `credit_ledger.model_tier` is one scalar column.
There is no true single value to write. The demo seed picked `standard`; that was a choice, not a
measurement.

**Not changed on this run, and why.** The change lands in `packages/billing/src/withCredits.ts` —
a shared primitive, carrying an explicit "owner ruling #3" that `model_tier` stays null until it is
enriched through the mesh seam, with 5 call sites in `apps/web`. Four sessions were running in
parallel. Changing a shared money primitive under those conditions, to solve a display line, is the
wrong trade.

**Recommended, when it is taken:** report the tier from the wrapped action rather than deriving it
from the action name — the derivation is provably ambiguous — and decide `brand_research`
explicitly rather than letting a "last one wins" fall out of the implementation.

---

## P6 · Scheduled posts land 73–199 seconds late

### The measured distribution

`post_publish_logs.job_run_id` is the discriminator: `cron:` rows are scheduler deliveries, `web:`
rows are somebody pressing Publish now, `demo_fixture_*` are seed rows. Averaging all 21 rows
together is meaningless — it would include a **−594 s** "lag" from a post published by hand before
its own scheduled time.

The scheduler deliveries, all of them, MEASURED:

| scheduled (UTC) | log written | lag | next `*/5` tick after due | job runtime after tick |
| --- | --- | --- | --- | --- |
| 2026-08-10 09:08:00 | 09:11:19 | **199 s** | 09:10:00 | 79 s |
| 2026-08-10 09:25:00 | 09:26:12 | **73 s** | 09:25:00 | 72 s |
| 2026-08-10 09:25:00 | 09:26:12 | **73 s** (2nd channel, same tick) | 09:25:00 | 72 s |
| 2026-08-10 11:54:00 | 11:55:49 | **110 s** | 11:55:00 | 49 s |

n = **4 rows across 3 distinct scheduled times**, all on one day, all one workspace. The founder's
original "73–199 seconds" is exactly this set. **This is a small sample and should not be quoted as a
distribution** — it is consistent with the mechanism, which is what it is good for: a `*/5` cron
means the wait-for-tick component is uniform on [0, 300) s, and the observed post-tick job runtime is
49–79 s.

### The recommendation: make the UI honest, do not speed up the cron

The picker's own copy is already honest — `SCHEDULE_FIELD_NOTE_LIVE` reads *"This goes out on its own
at **around** that time"*. The lie is downstream of it, in the status reader, and it is a bigger
defect than the latency:

```ts
// apps/web/src/lib/posts/schedule-status.ts, autoPublishTruth
return due < now.getTime() ? 'overdue' : 'awaiting'
```

There is **no grace window**. The instant a scheduled post comes due it renders
`overdue` — a `TriangleAlert` icon and the words *"This time has passed and it has not gone out yet
— check the channel status on the post"* (compact: **"Late · check"**). Every correctly-delivered
scheduled post therefore shows a false alarm for the 73–199 seconds the system is working exactly as
designed. The screen contradicts the picker two inches away.

Raising the cron to `*/1` would cost 5× the invocations and 5× the sweep queries, and would **not**
remove the problem: the observed job runtime alone is 49–79 s, so `overdue` would still fire on every
healthy post. No polling scheduler can promise a minute. The honest fix is the only one that works.

**Fixed in this branch** — see the commit. The grace window is *derived* from
`apps/web/vercel.json`, not typed as a literal, with a test that parses the cron expression and fails
if the schedule and the constant stop agreeing.

---

## P7a · The `.gitignore` line — not in this lineage, and already moot in it

The brief describes an appended line missing its slash and its trailing newline, leaving
`docs/ui-package/` unprotected. MEASURED:

**It is not on this branch.** The line `/homedocs/ui-package/sahoda-labs` (a mangled absolute path —
`/home` + `docs/...` with the middle removed — and no trailing newline) is an **uncommitted change in
the primary worktree, on the `squashed-root` branch**, whose `.gitignore` is a different 42-line
file. `wt-design`'s `.gitignore` is 100+ lines, carefully maintained, and carries `!/docs/**/*.md` at
line 93.

**And in this lineage it could not do anything anyway:** `docs/ui-package` is **already tracked** on
`wt-design` — 65 files, 5.3 MB, already in history. `.gitignore` does not apply to tracked files, so
the stated risk ("one careless `git add -A` puts 6 MB in history permanently") is not a future risk
here; it is a past event. `git check-ignore` confirms the path is not ignored and not ignorable.

**Not fixed, and deliberately:** the file that carries the defect belongs to a different branch,
checked out in another worktree, with the change uncommitted. Editing it from this lane means
committing to `squashed-root`. The one-line correction, for whoever owns that tree, is
`/docs/ui-package/sahoda-labs/` with a trailing newline — and it will still not untrack anything
already committed.

---

## P7d · `savePost` has no version column — real, and bounded

MEASURED: `information_schema` carries a `version` column on **`post_variants`** and **not** on
`posts`. So the canonical body is last-write-wins, and only the per-channel variants have a
compare-and-set.

**What a two-tab edit of the shared body does.** Both tabs' writes succeed. The 2-second debounce
autosave means each tab writes its whole body every couple of seconds, so they alternate and the last
writer wins each round. `detectConflict` then reports **divergence** — honestly, and it is careful to
claim nothing more: it states the row moved and that it did not move here, and explicitly refuses to
name a direction or an author, because post-write `updated_at` timestamps cannot prove either. The
user is told. The overwritten text is already gone from the row, and the "load that version"
affordance offers whatever the caller captured on its last read.

**Is it a real risk? Bounded, and here is why.** Publishing reads `post_variants.body`
(`apps/jobs/src/publish/store.ts:37`, `runPublishPost.ts:300`) and **never** `posts.body`. Every word
that reaches a platform comes from a variant row, and variant rows have the CAS. `posts.body` is the
shared draft the channel variants are written from — losing it costs a working draft, not a publish.

**The defect worth naming is the asymmetry, not the absence.** Two text boxes in the same editor
behave differently on the identical collision: the variant refuses the stale write and shows a
conflict UI *before* the overwrite; the canonical body takes it and reports afterwards. A user has no
way to know which box they are in. Closing that needs a `posts.version` column, which is a migration,
which is `wt-db`'s.

---

## What this run did NOT do

Stated so a silent gap does not read as coverage.

- **No merge and no push to `wt-web`.** P1's cherry-pick was sized, not branched.
- **No database write of any kind.** The runner used is read-only by construction.
- **P3b and P3c were reported, not changed** — reasons above, both about immutable or shared code.
- **P7a was reported, not changed** — it lives on another branch.

---

## P4c · The dead-letter view — blocked, and not on a migration I should write

Failed jobs do **not** vanish. MEASURED: `post_publish_logs` retains them — 7 rows with
`status = 'failed'` in production, 6 live and 1 fixture, each carrying `error` jsonb, `attempt`,
`channel` and `job_run_id`. What is missing is a way to LOOK at them.

**Why the view cannot be built from `apps/web` today.** MEASURED from `pg_policies`:
`post_publish_logs` has exactly one policy —

```
t_select  SELECT  (workspace_id IN (SELECT app.member_workspace_ids()))
```

An ops admin is authorised against `ops_admins` and **need not be a member of the workspace whose
job failed**, so the rows return empty for exactly the person who needs them. `ops-reset.ts` already
documents this identity mismatch as one of its three reasons for using an RPC.

And there is no way around it: `lib/supabase/server.ts` states "No service-role client in apps/web —
RLS is the security boundary." Adding one for an admin panel would put a key that bypasses every
tenant boundary into the web app, to render a list.

**What it needs:** one migration adding an ops-visible SELECT policy, e.g.
`create policy t_select_ops on post_publish_logs for select using (app.is_ops_admin())` — the same
predicate `ops_admins` already uses elsewhere. That is `wt-db`'s directory, four sessions were live,
and shipping an inert panel plus an unapplied migration is precisely the state
`ops_workspace_reset` has been in for weeks (see docs/31). Specified rather than half-built.

---

## P7b · NOTIFY-ME on coming-soon screens — cut, and stated

Deferred in run 12 for needing a migration; it still needs one. An additive table with
`workspace_id`, RLS and four policies is small, but it is `wt-db`'s to write, and — like P4c — a
table nobody has applied plus a button that writes nowhere is worse than the absence.

**One thing worth knowing before it is built.** The value proposed for it was "which coming-soon
features people actually click". MEASURED: `templates`, `campaigns`, `campaign_posts`, `assets` and
`asset_usages` are all at **0 rows**, and `/campaigns`, `/assets` and `/approvals` still render an em
dash for every figure. There is no traffic to measure yet, because there are no beta users on this
branch — it has never been merged to the branch production builds from. The instrument is worth
having; it is not urgent until somebody is there to be measured.

---

## P7c · The 44px touch floor — the probe cannot confirm anything, and that is the finding

Run 13 fixed six shell controls that fell under the 44px touch floor. The brief asks whether they
are still fixed after the design system landed.

**They are not verifiable, and nothing protects them.** `apps/web/e2e/shell-probe.spec.ts` exists and
measures exactly this — "does anything overflow the viewport at 390, and which controls fall under
the 44px touch floor" — but:

- it **asserts nothing**. Its own header says so: "A read-only probe. Asserts nothing; PRINTS what
  the shell actually is." It `console.log`s a count and a list.
- it is `test.skip` unless `DESIGN_AUDIT=1`.
- it carries no `@smoke` tag, so `pnpm gate` never runs it.

So the six fixes from run 13 are held in place by nothing at all. A probe that prints is a
measurement of one moment; the regression it was written to find can return the next day and no
check anywhere will say so. **This is the same shape as P4d's probe and P4a's missing heartbeat: an
instrument that reports and an instrument that ENFORCES are different objects, and this project keeps
building the first and counting it as the second.**

**Not measured on this run, and why.** Running it needs a signed-in browser against a local dev
server. Five other worktrees were running full Playwright suites against one machine for the whole
session — load average 19-57, 13 of 15 GB resident, eight Next dev servers — and this session's own
dev server was OOM-killed mid-run (`ECONNREFUSED` on its port; `turbo build` separately exited 137,
SIGKILL). A number produced under that contention would not be worth quoting. Stated rather than
guessed.

**The fix worth making is not a re-measurement.** It is to turn the probe into an assertion, tag it
`@smoke`, and let the gate hold the floor — measuring the current value first, so the threshold that
ships is one the design system actually meets rather than one that lands red.

---

## The gate, honestly

`pnpm gate` is five parts. Four of them are deterministic and all four are **green** on every commit
in this branch:

| stage | result |
| --- | --- |
| `turbo run typecheck lint test` | **27/27 tasks**, 3,221 tests in apps/web plus every package |
| root `vitest run` (scripts/) | **174 passed** |
| `prettier --check .` | **clean** |
| `turbo run build` | **passes** |

The fifth, `turbo run test:smoke` (58 Playwright tests), **could not produce a trustworthy result**
and is reported as unrun rather than as passed or failed. The evidence that it is the environment
and not the code:

- the failures begin partway through and then affect **83 specs**, most failing in **1.8-2.0 s** —
  the signature of a server that is not answering, not of assertion failures;
- they include `design-system.spec.ts`, `no-impossible-remedy.spec.ts` and `/assets` — surfaces none
  of this branch's changes touch;
- **the dev server was dead**: `fetch http://127.0.0.1:3206/sign-in` → `ECONNREFUSED`, while a
  sibling session's server on 3400 was still listening;
- `turbo run build` exited **137** (SIGKILL, the OOM killer) on the first attempt and **0** on the
  retry, with no code change in between.

Root cause: five worktrees — `wt-composer`, `wt-conn`, `wt-money`, `wt-signal`, `wt-camp` — each ran
a full Playwright suite with its own Next dev server, concurrently, on one 15 GB machine. Load
average peaked at 57.7.

**What that leaves unverified:** whether the schedule-status change (P6) renders correctly in a real
browser. Its logic carries 46 unit tests and four mutants, and it touches one pure function's
boundary, but the on-screen result was not seen. Anyone re-running this should run
`E2E_PORT=<free> pnpm turbo run test:smoke` on a quiet machine before trusting the label change.
