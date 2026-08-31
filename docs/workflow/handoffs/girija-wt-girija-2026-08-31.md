# Handoff — girija — wt-girija — 2026-08-31

**Branch** `wt-girija` at `1c8422f2`. Lane `wt-girija`. Pushed: **yes**.
PR [#37](https://github.com/development156/sahodalabs/pull/37), draft, into `wt-core`.

The session ran across 30 and 31 August; the commits carry 30 August, this file is
filed under the date `date +%F` returned when it was written.

**One task, given once: audit the product's workflows input by input, then fix what
it found.** Five defects, all five fixed. Everything below is that.

---

## What shipped

| # | What | Proof | Covered by |
| --- | --- | --- | --- |
| 1 | The keyword-brackets box reaches the publisher. `loadVariant` reads it, `PublishVariant` carries it, the draft passes it | `60e20aac`, `apps/jobs/src/publish/store.ts` `readKeywordBrackets`, `runPublishPost.ts` draft literal | `apps/jobs/src/publish/keyword-brackets.test.ts` (7), `load-variant.pglite.test.ts` (6, real Postgres) |
| 2 | The dry run and the stored `char_count` measure the same caption the publisher sends | `60e20aac`, `apps/web/src/app/actions/posts-publish.ts`, `actions/posts.ts` | the two files above, at the publisher's end |
| 3 | `/brain` stops promising a reply and a campaign. Four surfaces rewritten | `60e20aac`, `components/brain/confidence-card.tsx`, `brain-sections.tsx` ×2, `app/(app)/brain/page.tsx` | `components/brain/brain-claim.test.ts` (4) |
| 4 | The claim is tied to the code: all eight mesh tasks listed, four read the brain | `60e20aac`, `packages/mesh/src/brand-readers.test.ts` | itself, mutated both directions |
| 5 | `lib/time/zone.ts` — validate a zone, resolve a workspace's, label it, and convert a wall clock to an instant | `1c8422f2`, `apps/web/src/lib/time/zone.ts` | `zone.test.ts` (21) |
| 6 | Every scheduled time renders in the workspace's zone and carries its label | `1c8422f2`, `lib/posts/schedule-format.ts`; wired at `app/(app)/posts/page.tsx`, `planner/page.tsx` and 5 components | `lib/time/setting-reach.test.ts` (4) |
| 7 | `/loop` tells "will plan" from "the schedule is switched off", keeping the workspace's own reason | `1c8422f2`, `lib/loop/eligibility.ts` `explain(verdict, { autoSchedule })`, wired at `app/(app)/loop/page.tsx:84` | `lib/loop/auto-schedule.test.ts` (6) |
| 8 | The three duplicate intake columns pinned as non-authoritative | `1c8422f2`, `lib/onboarding/intake-source-of-truth.test.ts` | itself, mutated |

**The report for the founder** is an Artifact, `Said, Not Done`:
<https://claude.ai/code/artifact/3dda2d66-58c7-4456-b3a4-2ccb492a7477>

### The defect worth carrying forward

Every one of the five is the same shape: **a sentence a screen states as fact that
the code does not keep.** None is a crash. The keyword box was the clearest — its
own label reads "Followers see the words on their own" and the publisher sent
`[chai] [pune]` on every real send, because the value was stored, read by the
character meter, and read by nothing else.

Both ENDS of that chain had tests and agreed with each other. The seam between
them had none. That is the same hole the Google CTA button sat in for weeks, one
field earlier, and `runPublishPost.ts`'s own hoisting comment warns about the
drift while the drift sat two lines below it.

---

## What was NOT done, and why

- **The @smoke leg is UNRUN. It is not passed.** The reason CHANGED today and that
  is the useful part. It is no longer the sandbox: dispatched on the `smoke` job
  (runs [33273598024](https://github.com/development156/sahodalabs/actions/runs/33273598024)
  and [33357808902](https://github.com/development156/sahodalabs/actions/runs/33357808902)),
  it fails in ~20s at `Refuse without the keys the suite needs`. MEASURED, both
  runs: `CLERK_PUBLISHABLE`, `CLERK_SECRET` and `SUPABASE_URL` all render EMPTY on
  the runner. The founder added the six keys on 31 August and the second run still
  failed identically — **they went to the Claude cloud environment, not to GitHub
  Actions repository secrets.** MEASURED: all six are present in this sandbox's
  `apps/web/.env.local`, written by `scripts/cloud-setup.sh`. Two different places.
  Nothing was written to the production database on either dispatch: the refusal
  step precedes the browser install.
- **The suite was NOT run from this sandbox either**, and this is a decision rather
  than an obstacle. `sandbox-probe` now reports `LOCAL_ONLY` with
  `SAHODA_BROWSER_VIA_NODE=1`, which its own output says makes the suite runnable
  here. It writes to the one production Supabase project, and the acknowledgement
  `SAHODA_E2E_ACK_TARGET` exists precisely so a PERSON types the destination per
  run. The founder typed it for the runner twice; nobody has authorised a sandbox
  run. **Do not set that variable on somebody's behalf.**
- **The time PICKER still builds on the reader's device clock.** Moving it means
  moving the month grid, the day buckets, the now-line and `combine()` together —
  its own change. The gap is now visible instead of silent: the picker's screen
  says which clock it used, the display screens say which clock they are in, and
  the settings row says the picker does not follow the setting.
- **24 files still pin `Asia/Kolkata`** for non-scheduling timestamps (wallet,
  inbox, admin, assets). MEASURED: 31 behavioural pins across 25 files before this
  change; `schedule-format.ts` is the one that moved.
- **`business_model`, `regime`, `locale` were deliberately not wired.** See
  Contract section.
- **`loop_settings.plan_at_minute` untouched.** Nothing writes it, no screen offers
  it, so there is no customer-facing claim to correct.
- **The cron heartbeat still records before the switch check**, so an operator
  watching cron health reads green on a switched-off Sunday. `route.ts:86`'s own
  comment argues that ordering deliberately for a different failure mode; changing
  it is a call for whoever owns that signal, not a drive-by.
- **How many production variants carry `keywordBrackets:false` is unknown.** No
  database access from this session, so the blast radius of defect 1 is a
  mechanism, not a headcount.

---

## Shared surfaces touched

| Surface | Change | Who breaks |
| --- | --- | --- |
| `apps/jobs/src/publish/runPublishPost.ts` `PublishVariant` | **new OPTIONAL field** `keywordBrackets?: boolean` | nobody. Optional, so no constructor breaks; `undefined` preserves the old default exactly |
| `apps/jobs/src/publish/store.ts` | **new export** `readKeywordBrackets` | additive |
| `apps/web/src/lib/posts/schedule-format.ts` | both functions take a **new optional second argument**; `formatScheduledTime` now returns a zone label it never returned before | **READ THIS ONE.** Any test asserting an exact bare time string from `formatScheduledTime` will now see a label appended. None existed on this lane; a lane that adds one while this is in flight will collide |
| `PostCard`, `PlannerRow`, `PlannerSummary`, `WeekGrid`, `WeekTimeline` | **new optional `zone` prop** | nobody; optional everywhere |
| `apps/web/src/lib/time/zone.ts` | **new module** | breaks nothing, imported by `schedule-format` only |

`packages/shared` untouched. No token, fixture or config another lane consumes was
changed. `apps/web/src/lib/brand/brand-theme.dark.test.ts` carries a
**formatting-only** reflow of a file that arrived in the `0522c045` merge
non-compliant with prettier; no behaviour changed and it is not this lane's code.

---

## Contract, migration or money

**No migration. No price. No ledger path. Nothing under `packages/shared`.**

One money-adjacent fact was READ and not changed: `SAHODA_LOOP_CRON_MODE` gates a
job that spends **20 credits per workspace per week**, which is why it defaults
off. Finding 4 makes the screen honest about that switch; it does not change the
switch, and must not.

**A standing hazard recorded rather than fixed.** `workspaces.business_model`,
`.regime` and `.locale` are a COPY of `brand_memory.payload.intake`. The intake
copy is the one that decides anything — `packages/shared/src/gate/resolve-ruleset.ts`
`packsFor(regime, locale)` selects the refusal rule packs from it. The columns are
written once at onboarding (`app/actions/brand-resolve.ts:201`) and never updated,
so a reader who trusts them judges a changed business against the wrong rule pack.
`intake-source-of-truth.test.ts` fails the moment anything reads them for
behaviour. Deleting them is a migration against a table this lane does not own.

---

## Guards written, and the mutation that proved each

19 mutations in the final set, each applied and **watched**. 18 red, 1 survives.

| # | Mutation | Result |
| --- | --- | --- |
| 1 | Publisher stops carrying `keywordBrackets` (the original bug) | RED ×2 |
| 2 | `loadVariant` stops reading the column | **GREEN — the finding** |
| 3 | Absence collapsed into `false` | RED ×2 |
| 4 | #2 again, after `load-variant.pglite.test.ts` exists | RED ×3 |
| 5 | The `/brain` overclaim restored in one file | RED |
| 6 | A fifth task reads the Brand Brain | RED |
| 7 | The website builder stops reading it | RED |
| 8–11 | Zone: drop the day-before sample · drop the day-after · repeated hour takes the LAST · skipped hour resolves backwards | RED, each |
| 12 | Zone: round-trip stops comparing minutes | **SURVIVES — disclosed** |
| 13–16 | Loop: switch ignored · system sentence replaces the workspace's reason · goes quiet instead of naming the state · the armed sentence quietly reworded | RED (×3, ×1, ×2, ×1) |
| 17–18 | Settings: the disclosure widened to "every time in Sahoda" · the page stops passing the zone | RED, each |
| 19 | Something starts reading `workspaces.regime` for behaviour | RED |

**Mutation 2 is the finding of the session.** `keyword-brackets.test.ts` hands the
publisher a variant built by hand, so deleting the loader's read left the whole of
`apps/jobs` green — the same both-ends-tested, seam-untested shape as the bug it
was written for. `load-variant.pglite.test.ts` runs the real loader against real
Postgres and closes it. `store-options.test.ts` has the identical shape and is
still open to it.

**Mutation 12 survives and is not hidden.** No case could be constructed where the
minute comparison changes the answer, so it stands as defensive rather than
proven. Stated here rather than quietly counted as a pass.

### Two more worth carrying

- **A mutation that silently failed to apply looks exactly like a surviving
  guard.** MEASURED: the first attempt at #17 used a `perl -0pi` whose pattern did
  not match across a line break. The suite stayed green and the guard read as
  weak. Asserting the file actually changed is what caught it. Any mutation run
  should verify the edit landed before believing the result.
- **A clever line was deleted rather than shipped unproven.** `zone.ts` first
  carried the textbook second corrective pass. It survived every mutation because
  nothing could tell it was there. MEASURED over **210,240 wall clocks in 12
  zones**, including the 45-minute offsets of Kathmandu and Chatham: it changed the
  answer **zero times** once the day-either-side candidates existed. Removed.

---

## Anything retracted

**The PR body's "23 other files still name IST" was wrong by one.** MEASURED on
this branch: 31 behavioural pins (`timeZone: 'Asia/Kolkata'`) across **25** files;
`schedule-format.ts` moved, so **24** remain. The 42-occurrence figure quoted from
the audit counts every mention including comments and a placeholder, which is a
different question from how many places pin behaviour.

**An audit finding was corrected by its own hostile re-check, and the correction
matters.** The first reader reported the scheduling drift as "the picker is
browser-local, every display is IST". MEASURED by the auditor: the composer's own
confirmation line is ALSO browser-local (`calendar-month.ts:101-108`, no
`timeZone`), so pick and echo agree INSIDE the composer. The defect lives
downstream, and the worst case is `formatScheduledTime`'s bare unlabelled time in
the week grid — which is what this change fixed first.

**CLAUDE.md's "3 of 8 mesh tasks read the Brand Brain" conflates three separate
channels.** MEASURED: **4** of 8 declare `cachePrefix: 'brand_context'` (the Brand
Brain); **2** declare `knowledgeQuery` (the document library — this is the pair
CLAUDE.md's sentence is actually about, and it is correct about them); **3**
declare `wantsMarketContext`. `packages/mesh/src/brand-readers.test.ts` now pins
the first set. `plan-week.ts:110-117` still claims it is "the FIRST and only task
reading the Marketing Brain" and it is one of three — a stale comment, not fixed.

---

## What the next session in THIS lane should pick up

1. **Add the six keys as GitHub Actions repository secrets**, then dispatch the
   `smoke` job. They are in the Claude cloud environment today and Actions cannot
   see them. This is a settings action, not a code change, and it is the only
   thing standing between this lane and a real browser run.
2. **Move the time picker into the workspace zone** — `calendar-month.ts`
   `combine()`, the month grid, `week.ts`'s day buckets, `now-line.tsx`,
   `week-nav.tsx`. `lib/time/zone.ts` already has `instantAtWallClock` and
   `partsInZone` tested for it. This closes the last half of finding 3.
3. **The remaining 24 IST files**, same helper, starting with the planner's own
   `DAY_LABEL` so a cell's date and its time agree.
4. **`store-options.test.ts` has mutation 2's hole.** It calls `readOptions`
   directly and never the loader that must call it. One test in
   `load-variant.pglite.test.ts` already covers `options`; extend it rather than
   leaving the seam half-guarded.
5. Yesterday's four unapplied migrations, `20260823000000_dpdp_erasure` first, and
   the credential-in-test-output finding in `packages/db/tests/live-guard.test.ts`.
   Neither was touched and neither has an owner.

---

## Gate

MEASURED at `1c8422f2` unless stated. Nothing piped; exit codes read directly.

| Leg | Result |
| --- | --- |
| `@sahoda/web` vitest, full | **PASS** — 6,234 passed, 13 skipped, 495 files, 3 skipped files |
| `@sahoda/jobs` vitest, full | **PASS** — 409 passed, 36 files |
| `@sahoda/mesh` vitest, full | **PASS** — 199 passed, 27 files |
| `turbo run typecheck lint`, whole workspace | **PASS** — 18/18 tasks |
| `prettier --check .` | **PASS**, repo-wide |
| `turbo test:smoke` (Playwright) | **UNRUN** — not passed. See above |
| GitHub `gate` on `469a4fa5` | **PASS** — run [33271853226](https://github.com/development156/sahodalabs/actions/runs/33271853226), 11 minutes, the first green CI this lane has had |
| GitHub `gate` on `0522c045` | **PASS** — run [33330565161](https://github.com/development156/sahodalabs/actions/runs/33330565161) |
| GitHub `gate` on `1c8422f2` | **IN PROGRESS** at handoff time — run [33357808902](https://github.com/development156/sahodalabs/actions/runs/33357808902). Its `smoke` job already failed on the missing secrets; the `checks` job had not finished |

**GitHub Actions is working again, but not uniformly.** MEASURED across ~30 runs
on 29–31 August: most execute for 8–14 minutes and reach real conclusions, and a
minority still die in 3–4 seconds with `get_job_logs` returning HTTP 404 — the
"no runner was ever assigned" pattern `wt-karunesh` registered. Both shapes appear
on the same workflow minutes apart.

`ops/state/qa.pending.json` is left MODIFIED and uncommitted on purpose: the
pre-commit hook refuses it as scratch, and it is rewritten by every gate run.
