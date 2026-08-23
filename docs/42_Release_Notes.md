# 42 · Release Notes — the `wt-release` cut

Written by the release session, 2026-08-24. Every number is **MEASURED** unless the
line says INFERRED or NOT RUN.

> ## Read this first
>
> **Nothing has been pushed. `wt-web` is untouched, production is untouched.**
>
> The work sits on the local branch `wt-release`, 521 commits ahead of `wt-web`.
> The session was asked to go fast on a limited budget, and the one thing that
> cannot be done fast is the proof that belongs in front of a push to trunk. So
> the merging, the conflict resolution and the gate were done here, and the single
> irreversible step was left for you. §7 has the exact command.

---

## 1 · What production is right now (the rollback record)

Captured **2026-08-23 21:04:30 UTC**, read-only (`begin read only` — never
`set default_transaction_read_only`, which the pooler hands to the next client).

| thing | value |
|---|---|
| `wt-web` SHA before | `c8faa3477790ac27f8471c3576b6bf16943bdf23` |
| `wt-release` SHA now | `77237c473f2970c63114efb61c25058f521608e3` |
| `schema_migrations` rows | **69** |
| newest recorded migration | `20260823030000` |
| `workspaces` | 26 |
| `posts` | 131 |
| `credit_ledger` | 224 |
| `users_profile` | 25 |
| `plans` ids | `agency`, `free`, `growth`, `starter` |
| Vercel production deployment id | **NOT CAPTURED** |

**The Vercel deployment id could not be read, and you must capture it before you
deploy.** There is no `VERCEL_TOKEN` in any env file, no `.vercel/project.json`,
the Vercel CLI is not installed, and the Vercel MCP server is unauthenticated (its
OAuth flow needs your browser). Without it you have no named rollback target.

```bash
npx vercel login && npx vercel ls --prod   # top row = your rollback target
```

### What a rollback would and would not undo

**Rolls back:** the application code, via Vercel Instant Rollback. `git` history is
safe regardless — nothing is force-pushed, `wt-web` only fast-forwards, so
`c8faa347` stays reachable for ever.

**Does NOT roll back: anything applied to the database.** Applied migrations are
permanent. If you apply §5's held migrations and then roll the code back, production
runs **old code against a new schema**, which is the more dangerous direction. Roll
code back first; decide about schema second.

**Also not undone:** rows written between deploy and rollback. The ledger is
append-only by design.

---

## 2 · Lanes: what is in, what is out, and why

Established from: report present, working tree clean, last commit completion-shaped,
and whether a process still held its port.

### IN — six merges, five of them real

| lane | pinned SHA | evidence it was finished |
|---|---|---|
| `wt-integrate3` | `fe9fab33` | docs/35–39, clean tree, own gate `ok:true` |
| `wt-dash2` | `445e26ab` | docs/41 written, clean tree, last commit is docs |
| `wt-boot` | `7d5a0b0c` | docs/43, clean tree, own gate `ok:true` all 5 legs |
| `wt-page-rest` | `4b25b4d8` | clean tree, own gate `ok:true` |
| `wt-voice` | `ba765a52` | docs/44 written, clean tree, own gate `ok:true` |
| `wt-infra` | `cb91dd79` | clean tree, 4 legs green |

Every lane was merged **by pinned SHA, never by branch name** — `wt-dash2` had a
live `next dev` on port 3300 when this began, and a branch name can move between
the read and the merge.

### EXCLUDED

| lane | why |
|---|---|
| **`wt-live3`** | **DOES NOT EXIST.** No branch in the repository matches `*live*`. It was named in the brief and there is nothing behind the name. Nothing was substituted for it on a guess. |
| `wt-page-dash` | **NO-OP.** `git merge-base --is-ancestor wt-page-dash wt-dash2` → true. Already contained. |
| `wt-page-flow` | **NO-OP.** Contained in `wt-boot`. |

`wt-integrate3` is an ancestor of all seven other candidates, so it merged as a
**fast-forward**, not a merge commit. Of the eight names given, **five** were real
merge tips.

### Two lanes' own gates were NOT green, and were included anyway

- `wt-dash2`'s recorded verdict is `ok:false`, failing at `turbo-smoke`, with legs
  4 and 5 never reached. Its own docs/41 §8 says so in the first line, in bold.
- `wt-infra` never ran `turbo-smoke` at all (`notSelected`), and it carries the
  **Next 15.5.20 → 15.5.23** bump, which is precisely what a smoke leg is for.

Neither lane's verdict was taken as evidence. The gate on `wt-release` is the
arbiter, and it runs the smoke leg both of them skipped.

---

## 3 · The six known collisions, and two the brief did not know about

### (a) design-lint baselines — RESOLVED, and tighter than any input

Four registers collided across the merges. The file is a **per-file debt register**,
not a single number, so "take the tightest" is an **elementwise minimum**, not
picking a side. A file absent from one register means zero debt there, which is the
tightest reading, so it is dropped.

| stage | `typesize_total` |
|---|---|
| wt-dash2 | 755 |
| wt-boot | 828 |
| wt-page-rest | 823 |
| **resolved** | **733** |

wt-dash2 genuinely *fixed* the home and analytics components (828 → 755); wt-boot
and wt-page-rest were tighter on `planner`, `media-pane` and `connect-first-note`.
The minimum keeps both gains. **MEASURED** against the merged tree after every
merge: `hand-written font size — 733 known, none new`, and spacing came in at 134
actual against a 139 baseline, i.e. two more files improved.

### (b) the JS budget — NO REGENERATION NEEDED

Regenerating was to be done once, at the end, after `wt-infra`'s Next bump. It was
not needed: the build reports **`js-budget ok: 80 routes within budget`**. There is
no unbudgeted route, so the check was left at its existing, tighter numbers rather
than rewritten. `perf:budget:write` was **not** run, and the budget was **not**
removed.

### (c) docs/37 claimed twice — ALREADY RESOLVED ON ARRIVAL

`wt-integrate3` already carries `37_Design_System_v5.md` and
`39_Tenant_Isolation.md` as separate files. No collision exists in this cut and
nothing was renumbered. Verified by listing `docs/` on the merged tree.

### (d) `wt-dpdp`'s `block_mutations` — CANNOT ARISE, and here is the proof

`wt-dpdp` **is** contained in all five tips, so it is in this cut. But its migration
`20260823000000_dpdp_erasure.sql` is **unapplied in production** — every object it
creates is ABSENT (`ledger_actor_redactions`, `redact_ledger_actor`,
`erasure_retained_tables`, `workspace_erasure_preview`, `erase_workspace`,
`workspaces.deleted_at`). The only thing it declares that IS live is
`app.block_mutations()`, which comes from an earlier migration.

So the `create or replace` collision is a **deploy-time** hazard, not a merge-time
one, and `erasure.pglite.test.ts` is present and unmodified in this cut.

**But this cut ships the erasure UI against a schema that does not have it.**
`your-data-panel.tsx` offers "Take a copy of everything in this workspace, or delete
all of it", and `app/actions/erasure-preview.ts` and `app/actions/erase-workspace.ts`
call `workspace_erasure_preview` and `erase_workspace` — RPCs that are **absent from
production**. The gate cannot see this: its database has the migration.

**Checked, and it does not 500.** Both actions test for PostgREST's `PGRST202`
(function not found) and answer honestly: *"Deleting a workspace is not switched on
for this database yet. Nothing was deleted. Write to support@sahodalabs.com and we
will do it by hand."* `ledger_actor_redactions` is likewise declared
`no-read-policy` in `lib/privacy/export-manifest.ts`, so the DPDP export names it
under `notIncluded` rather than trying to read it.

So: **Delete-my-workspace is visible and refuses politely until §5's step 3 runs.**
That is a product decision to be aware of, not a defect.

### (e) PageTitle renders h1 at 20px where docs/37 says 24 — LEFT, DELIBERATELY

Not fixed. Three lanes saw it and left it because it is shared across ~38 routes,
and this session had neither the budget to change 38 routes nor a reason to be the
fourth to half-do it. **Recorded as a known deviation**, not silently accepted.

### (f) four owner rulings in docs/41 §6 — CARRIED FORWARD, NOT DECIDED

See §8. They are still yours.

### (g) NEW — docs/40 was claimed by THREE lanes

Not in the brief. Because they are three *distinct filenames*, **git reported no
conflict at all** and canon order broke silently:

- `40_Home_Analytics_Lane.md` (wt-page-dash, wt-dash2)
- `40_Flow_Lane_Report.md` (wt-page-flow, wt-boot)
- `40_Copy_Voice_Sweep.md` (wt-voice)

All 17 code references to `docs/40` are home/analytics components, so
Home_Analytics keeps the number. Flow → **43**, Copy Voice → **44**, and
`CLAUDE.md:69`'s `(docs/40)` retargeted to `(docs/44)`. Canon order is now
40, 41, 42, 43, 44 with no duplicates.

### (h) NEW — the copy sweep's coverage gap

`wt-voice` swept 649 dashes out of user-facing prose on 2026-08-23, under a standing
founder ruling. `wt-dash2`, `wt-boot` and `wt-page-rest` then wrote **new** copy that
the sweep never visited. **There is no guard for this rule — only the one-off sweep** —
so 14 in-sentence dashes arrived in shipped prose with nothing to catch them.

Rewritten per the ruling (full stop / comma / colon by what the dash was doing),
never a glyph swap. The absence-mark exception is untouched: every dash that is the
*whole* string value stands. Files: `analytics/page`, `planner/page`, `report/page`,
`performance-strip`, `connect-first-note`, `spend-card`, `schedule-field`,
`your-data-panel` (×4), `readiness` (×2).

`packages/*/src` was scanned separately, because wt-voice's sweep covered it too.
**No user-facing regression there.** The three files its report names as fixed —
`shared/src/inbox/send-window.ts`, `shared/src/gate/packs.ts`,
`publishing/src/format-rules.ts` — are all still clean. The 30 remaining dash lines
under `packages/` are LLM prompts (`mesh/src/tasks/*`), telemetry `source:` strings
and internal `throw` messages, none of which is reader-facing prose — the same call
wt-voice made when it left `apps/jobs`' 57 dash lines alone.

**This will recur on the next lane.** The rule needs a lint, not another sweep.

---

## 4 · What only the merge could see

Four real defects. Two were found by the build and the gate; **none** would have
gone red on any single branch.

### 4.1 A whole guard nearly deleted with no test going red

`apps/web/e2e/accent-budget.spec.ts` was an **add/add conflict** — two lanes
independently wrote *different* guards under one filename:

- wt-dash2's (309 lines) counts solid brand **fills by interactive element** — one
  primary action per view.
- wt-page-rest's (161 lines) measures accent **area per route** against ratcheted
  ceilings.

Taking either side — which is what a side-take resolution does — would have silently
deleted a whole guard. **Both kept.** wt-dash2 keeps the filename because
`helpers/accent-spend.ts:35,275` and `docs/41` cite `accent-budget.spec.ts` for
exactly the fills-by-element behaviour; wt-page-rest's is preserved as
`accent-area-budget.spec.ts`. The rail-contrast guard therefore **survived the
merge** — both halves of it.

### 4.2 A prop deleted from under its own call sites (my defect)

`git checkout --ours/--theirs -- <file>` takes the **whole file**, not the conflicted
hunk, so it discards the other side's *auto-merged* regions too. Using it cost
wt-dash2's `align?: 'center' | 'start'` prop on `CardEmpty`. Its four `align="start"`
call sites live in `analytics/account-panel.tsx`, which never conflicted, so they
survived pointing at a prop that no longer existed.

Caught by the build (`Property 'align' does not exist`) and by **nothing else** — no
unit test covered it. All eight side-takes were redone with `git merge-file --diff3`
against `merge-base(ours, theirs)`. Conflict counts came back identical
(1/3/1/1/1/1/2/1), confirming only the marked hunks differed and everything else now
carries both sides.

### 4.3 A sequential read added to 45 routes

`wt-boot` put `decideLanding()` in `(app)/layout.tsx`; `wt-integrate3` recorded the
read-waterfall baseline before that existed. On the merged tree, 45 routes gained one
sequential server read. Neither branch could see it: one added the read, the other
owned the baseline.

**The obvious fix was wrong, and the guard said so.** `decideLanding()` and
`activeWorkspaceRead()` share no input, so collapsing them into one `Promise.all`
removes the read — and the guard's *second* test immediately went red:
`/(app)/ads carries none of the shell's reads`. The static walk cannot follow a read
into `Promise.all`, so the one-line "fix" would have **blinded the guard on every
route** rather than speeding anything up.

Reverted. Baseline re-recorded with `PERF_WATERFALL_WRITE=1`: 45 routes changed, 0
added, 0 removed. The cost is now *recorded* rather than hidden.

**A blanket re-record can baseline in someone else's change**, so every delta was
then diffed against the pre-record baseline (`a08bd18e`) and asserted individually:

- **44 of 45** differ by exactly one inserted `decideLanding`. Nothing rode along.
- **1 does not.** `/(onboarding)/onboarding` went `['getActiveWorkspace',
  'activeBrandMemory']` → `['getActiveWorkspace']`. It **LOST** a read rather than
  gaining one — the onboarding rebuild no longer reads brand memory on that route.
  The ratchet direction is tighter, so it is not a perf regression, but it is a
  behavioural change that arrived unannounced and is recorded here rather than
  absorbed.

**Owner decision owed** — see §8.

### 4.4 A test that was vacuous before anyone touched it

`wt-boot`'s four landing tests used `/available credits/i` as the marker for "the
dashboard rendered". `wt-dash2` **deleted that card** (docs/41 §2.2 — the balance was
on one screen three times) and retargeted its own six assertions to
`Needs your attention`.

Retargeting wt-boot's the same way **failed, and the failure is the finding**: that
describe block mocks only `balanceRead`, and the identical setup at line 229 proves
the page renders **GetStarted, not the dashboard**. So the original assertion passed
in *both* branches and never distinguished them — it was vacuous before wt-dash2
touched anything.

Retargeted to `home-get-started`, which that setup genuinely produces. The negative
case now asserts **both** markers absent instead of one. 16/16.

### 4.5 Deleted and moved files — clean

13 code files deleted across the cut, **zero dangling importers** (checked by name
against every `.ts`/`.tsx` in `apps/web/src`, `packages`, `apps/jobs`).

The one that mattered: `lib/onboarding/address-guard.ts` was deleted *with its test*
under the commit "delete two guards that protected nothing, and say what does". Its
`isPublicAddress` did not vanish — it lives in `packages/research/src/ip.ts` with its
own test, and the **polarity inverted** to `isPrivateAddress`. Verified reachable
from both entry points: `apps/web/src/lib/radar/locator.ts` and
`apps/jobs/src/radar/run.ts` (`guardedFetch`). The SSRF guard survived the move.

### 4.8 Two halves of one rename, on opposite sides of a merge

Gate run 2, leg 3. Two causes behind one red spec.

**Mine.** `wt-voice` branched before `wt-dash2` renamed the rail's Tailwind variant
from `max-wide:` (the forced collapse below 1180px) to `rail-min:` (icons-only for
*either* reason — `globals.css` defines it and says "every rule that used to say
`max-wide:` inside the rail says this"). Taking wt-voice's whole `nav-item.tsx`
reverted all seven renames, while `rail.tsx` — resolved the other way — kept
`rail-min:`. **One rename, split across two files by two opposite side-takes.** At
1440px in the *user*-collapsed state the label kept `max-wide:sr-only`, so it never
hid and rendered inside a 62px rail: `not.toBeInViewport() failed … viewport ratio
0.45`.

Siblings were enumerated rather than assumed: `rail-toggle.tsx` and
`workspace-switcher.tsx` match wt-dash2 byte-for-byte, so only `nav-item.tsx` was
affected. It is now identical to wt-dash2's.

wt-voice's roadmap `title` variant was deliberately **not** grafted back. wt-dash2
removed the `soon` concept from that component and says why in its header — the rail
no longer renders roadmap items, and the treatment still lives in `more-sheet.tsx`
and `command-palette.tsx`. Re-adding it was a type error, which is the honest outcome
for re-introducing a deleted concept.

**A real collision.** `rail-collapse`'s `bootstrap()` ends by *waiting for*
`/onboarding`, so it leaves a workspace with no Brand Brain — `not-started`.
wt-boot's `decideLanding` then redirects `/home` away, the shell never renders, and
`railWidth` waited the full 300s for an `<aside>` that was never going to arrive.
Fixed by setting the defer cookie, which is the product's own "Save & exit" path,
rather than faking a brain the spec has no use for.

> **A note on `next start`.** After `nav-item.tsx` was fixed the spec still failed —
> because `next start` serves the existing `.next`, and the fix was not in it. The
> rebuild is what proved the fix. **A stale bundle looks exactly like a bad fix.**

Both tests now pass in 37.4s, and the contrast guard prints its worst **resolved**
pair at **5.69:1** — comfortably above 4.5:1, and the direct answer to the 2.49:1
the brief warns about.

### 4.6 The combination checks — what ran and what did not

| check | result |
|---|---|
| Ledger invariants | **10/10 PROVEN** — see §4.7 |
| Zero unsettled holds | **PROVEN**, 0 of 88 HOLDs unsettled |
| Rail-contrast guard survived the merge | **PROVEN, and MEASURED** — both guards preserved (§4.1), and the resolved-pair guard reports its worst pair at **5.69:1** (§4.8) |
| Deleted/moved files → import graph | **PROVEN**, 0 dangling |
| Radar SSRF guard reachable | **PROVEN** reachable + unit-tested; per-encoding-and-redirect refusals **NOT EXERCISED** live |
| Crons 401-not-307 | **STRUCTURALLY PROVEN, NOT LIVE.** All four routes exempt in *both* the public set and the matcher regex, exact-path `$` anchored, asserted by `middleware.test.ts` and `middleware.coverage.test.ts`. Cannot be confirmed live without a deploy. |
| E2E guard refuses an unacknowledged run | **HALF PROVEN.** It ran and printed `parsed ref rloztdhzfliyvpvxsgjl / guarded refs rloztdhzfliyvpvxsgjl / decision allowed-acknowledged`, so the allow path is live and genuinely target-checked. The **refusal** path was not exercised. |
| `no-impossible-remedy` | **PROVEN** — green in leg 3 across /home, /posts, /planner and /create, and its own "the detector itself still detects" self-check passed |
| `roadmap-honesty` | **PROVEN** — `roadmap-figures-scan.spec.ts` green in leg 3 |
| Two channels / two bodies / two limits / two formats round-trip | **NOT RUN.** `variant-save.spec.ts` proves the round-trip for **one** channel (instagram: write → save → reload → still there) and passed in leg 3. The *two*-channel divergence is not covered. |
| Onboarding money guard — resolve twice → exactly one POST, via `route.abort()` | **NOT RUN** |
| The Loop — one cycle, cost-preview refusal, kill switch with a surviving control | **NOT RUN** |

The five NOT RUN items need a driven browser against a seeded workspace. They are the
honest gap in this cut, and they are listed rather than approximated.

### 4.7 Ledger invariants — 10/10, and the first attempt was wrong

The first pass reported 7/9 and **the two "failures" were mine, not production's**.
`apply_ledger_entry` sets `balance_after = v_total - v_held`, i.e. *available*
credit — not a running sum of `amount`. A HOLD moves available without moving total,
so "balance_after is continuous" and "final = sum(amount)" are not this system's
invariants at all.

Rewritten as a **replay**: all 224 production entries re-executed through the
function's own arithmetic.

```
1' replay of 224 entries across 26 workspaces ....... PASS  mismatches=0
2' available never negative during replay ........... PASS
3' ledger tip == credit_balances available .......... PASS   (delta exact)
4' (workspace_id, seq) unique ....................... PASS
5' no NULL workspace_id ............................. PASS
6' stored balance_after never negative .............. PASS
7' idempotency_key unique ........................... PASS
8' settles_entry_id resolves, and only to a HOLD .... PASS
9' ZERO unsettled holds ............................. PASS
10' no hold settled twice ........................... PASS
```

---

## 5 · Migrations, and the order that matters

73 migration files on `wt-release`; **69** recorded in production. **Zero** recorded
without a file.

### The four unrecorded, each probed against live objects

| migration | live? | evidence |
|---|---|---|
| `20260805000000_clerk_id_remap` | **NOT APPLIED** | `clerk_id_map`, `remap_clerk_user_ids`, `verify_clerk_remap` all ABSENT |
| `20260823000000_dpdp_erasure` | **NOT APPLIED** | all six objects ABSENT |
| `20260823020000_ops_owner_count…` | **NOT APPLIED** | body comparison, see below |
| `20260823020100_clerk_webhook…` | **NOT APPLIED** | body comparison, see below |

> **The two `wt-sec` migrations nearly read as applied, and that was a trap — twice.**
>
> `ops_active_owner_count`, `ops_admin_set_role`, `ops_admin_revoke` and
> `ops_application_link_user` all EXIST in production. A function name existing is
> not evidence its migration ran, so the first probe searched the live bodies for a
> distinctive phrase — and **that probe was worthless**, because the phrases were
> guessed from the filenames and were not in the migration files either. An absent
> needle that is absent from both sides proves nothing.
>
> Redone properly: the `create or replace function` bodies were parsed out of each
> migration file, whitespace- and comment-normalised, and compared against live
> `pg_proc.prosrc`. Every one **DIFFERS**, and the shape of the difference is
> consistent — the file body is longer than the live one and the live one is very
> nearly a prefix of it:
>
> | function | live | in file | common prefix |
> |---|---|---|---|
> | `ops_active_owner_count` | 80 | 104 | 79 |
> | `ops_admin_set_role` | 819 | 848 | 438 |
> | `ops_admin_revoke` | 661 | 690 | 285 |
> | `ops_application_link_user` | 775 | 844 | 427 |
>
> That is the signature of a migration that ADDS to what is live. **NOT APPLIED**,
> now on evidence rather than on a guessed needle.

### Nothing was recorded, and nothing was applied

There were **no unrecorded-but-applied** migrations to record. All four unrecorded
migrations are genuinely unapplied, so no `INSERT` was warranted and none was made.
`clerk_id_remap` in particular stays unrecorded, exactly as instructed — recording it
would permanently skip real machinery.

### ⚠ THE PLAN MIGRATION DOES NOT EXIST

The brief holds back "the plan migration" because applying it before deploy would
break signup. **It is not on `wt-release`, and it is not on any branch in this
repository.** Searched every `wt-*` branch's migration tree by filename, and searched
every migration file's body for `insert/update/delete/alter … plans`: the only two
hits are `20260718000006_billing_ledger.sql` and `20260718000010_seed.sql`, both long
applied. Production's `plans` already holds `free`, and live `bootstrap_workspace`
reads it.

Either it lives in a lane that was excluded, or it was never written. **Do not go
looking for it to apply — there is nothing to apply.** Worth confirming with whoever
wrote the brief.

### Post-deploy order

**Deploy the code FIRST. Then, in this order, and only if you want these features:**

1. `20260823020000_ops_owner_count_requires_a_linked_user.sql`
2. `20260823020100_clerk_webhook_stops_flooding_the_audit_log.sql`
   — the two `wt-sec` hardening migrations. Order matters between them; both are
   `create or replace` of existing functions, so applying them before the deploy
   would leave old code calling new function signatures.
3. `20260823000000_dpdp_erasure.sql` — **LAST**, and only when you want erasure live.
   It does `create or replace app.block_mutations()`. Anything that re-applies
   `helpers.sql` *after* it will clobber that, and the thing that would notice is
   `erasure.pglite.test.ts`: four of its tests go red naming the tables that became
   unerasable. If you ever apply a helpers migration afterwards, re-run that spec.

**Never** apply `20260805000000_clerk_id_remap.sql` as part of this. It is real
machinery that has not run.

**If reversed** — i.e. schema applied before the code deploy — old code runs against
new function bodies. The `ops_*` pair is the sharp end: admin role changes would run
against a definition the deployed code does not expect.

---

## 6 · The gate

Run with `--concurrency=1` (built into `scripts/gate.mjs`), against `next start`,
never piped, with `SAHODA_E2E_ACK_TARGET=rloztdhzfliyvpvxsgjl` and `E2E_PORT=3290`.

### 6.1 · FINAL VERDICT — **GATE PASSED**

`.gate/verdict.json`: `ok: true`, `allPassed: true`, `failedStage: null`,
`skipped: []`, `notSelected: []`. Nothing was skipped and nothing sat out.

| leg | result | time |
|---|---|---|
| 1 · turbo-typecheck-lint-test | **ok**, 27/27 tasks | 44s |
| 2 · vitest-root | **ok** | 1s |
| 3 · turbo-smoke | **ok — 115 passed, 0 failed, 0 skipped** | 937s |
| 4 · prettier-check | **ok** | 14s |
| 5 · turbo-build | **ok**, `js-budget ok: 80 routes within budget` | 46s |

**The @smoke count, measured rather than quoted.** `playwright test --list` reports
**274 tests in 70 files**; `--grep @smoke` reports **115 tests in 35 files**, and the
gate ran all 115.

The brief says CLAUDE.md documents 102. In this cut CLAUDE.md already said 110/32
(measured on `wt-page-rest`), and it is **now stale by 5**, because four lanes plus
this session's own `accent-area-budget.spec.ts` each added specs. CLAUDE.md's own
rule is that a stale number there is the same defect as a stale number on a screen,
so it was re-measured **in this cut** rather than left for the next reader.

It took **three** gate runs. The first two were red, and both failures were real.

The **first** run failed at leg 1 with 25 of 27 turbo tasks green and exactly one
task red, `@sahoda/web#test`, in two groups — both merge-shaped, both written up in
§4.3 and §4.4.

The **second** run reached leg 3 and failed there: **113 passed, 2 failed**, both in
`rail-collapse.spec.ts` — §4.8. Failures are grouped by error message, never counted.

---

## 7 · How to finish this, if you want to

```bash
cd /home/divas/Documents/GitHub/sahodalabs
git checkout wt-web && git branch --show-current      # ASSERT it says wt-web
git merge --ff-only wt-release                        # fast-forward ONLY
git push origin wt-web                                # never --force
```

`--ff-only` is the whole safety property: if it cannot fast-forward it refuses, and
`wt-web`'s history is never rewritten.

Then watch the Vercel production build, and once it is live verify **against the real
URL**, because a green gate is not a working site:

- `/api/cron/metrics` and `/api/cron/loop` return **401, not 307** — and check a
  never-existed path such as `/api/cron/nope` too, so the answer means something
- the app loads, sign-in works, `/home` renders
- no route 500s

If the build fails, **do not fix it under time pressure.** Roll back to the
deployment id from §1.

---

## 8 · What is now live that was not, and what is still yours to decide

### New in this cut

The dashboard rebuild (`wt-dash2`, docs/41), the boot video and onboarding routing
(`wt-boot`, docs/43), the copy voice sweep across 287 files (`wt-voice`, docs/44),
the remaining page lanes (`wt-page-rest`), infrastructure and workflows
(`wt-infra`, including Next 15.5.23), and everything `wt-integrate3` already carried.

`.github/workflows` reaches the default branch with this push, so **schedules become
able to fire.** The cron modes below decide whether they do anything.

### Environment variables production lacks

**Read from the code, NOT from Vercel** — there are no Vercel credentials in this
environment, so this is what the app *requires*, not a diff against what is set. You
must check the six against your Vercel project yourself.

All six are already in `turbo.json`'s allowlist, so they will reach the build once set.

| variable | what it does | if absent |
|---|---|---|
| `ZERNIO_WEBHOOK_SECRET` | HMAC secret for inbound Zernio events | the receiver fails closed; a missing signature is a 401. Inbound events stop. **Set it.** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | the sign-up captcha widget | sign-up flow degrades. **Set it.** |
| `RADAR_FIXTURES` | serves Radar from fixtures instead of live fetches | absent = live fetches. Fine for production. |
| `SAHODA_LOOP_CRON_MODE` | arms the Sunday Loop | **SAFE TO LEAVE UNSET — arming it spends money.** |
| `SAHODA_METRIC_CAPTURE_MODE` | arms the nightly metric pass | **SAFE TO LEAVE UNSET.** |
| `SAHODA_PLAYBOOKS_CRON_MODE` | arms the daily Playbook check | **SAFE TO LEAVE UNSET** — it halts at cost preview and spends nothing, but leave it off until you want it. |

Two more the code reads that are **not** in the turbo allowlist and would be stripped
under strict env mode:

- `VERCEL_GIT_COMMIT_SHA` — used as the Sentry **release** tag in
  `sentry.server.config.ts` and `sentry.edge.config.ts`. Vercel provides it, but
  turbo strips what it is not told to keep, so Sentry releases may be untagged.
- `SUPABASE_DB_CA_CERT` — `apps/jobs/src/runtime.ts` says outright
  "SET SUPABASE_DB_CA_CERT IN PRODUCTION for full chain verification". Absent, the
  DB connection does not do full chain verification.

Neither was in the brief's six. Both are worth a look.

### The Clerk production key migration — STILL NOT DONE

Unchanged by this release, and getting more expensive every day. Every signup from
now is another row to remap by hand. `lib/clerk-key-guard.ts` still warns that a
`pk_test` key runs against Clerk's development instance. The
`20260805000000_clerk_id_remap` migration exists for exactly this and is **not
applied** — deliberately, because it is real machinery that must run *after* the key
migration, not before.

### Decisions owed — carried forward, not made

1. **docs/41 §6, all four rulings**, the largest being: at 390px both dashboard
   routes render **two solid brand fills** — the page's primary and the shell's
   permanent FAB. Unlike docs/40 §5.3's case these are *different* actions to
   *different* URLs, so deleting the page's would remove the only door the screen
   offers. Standing the FAB down on a route whose first step is something else is a
   shell change across forty screens. `accent-budget.spec.ts` asserts one fill per
   **layer** and prints both, so the pair is visible rather than absorbed.
2. **The landing read's cost** (§4.3): `decideLanding()` adds one sequential server
   read to 45 routes. It can be removed in one line, but only by hiding it from the
   guard that measures it. Either accept the cost as recorded, or teach
   `read-waterfall.ts` to follow reads into `Promise.all` — which would also close a
   blind spot any lane could exploit today.
3. **PageTitle at 20px vs docs/37's 24px** (§3e): fix across ~38 routes, or amend
   docs/37. Currently neither.
4. **The plan migration** (§5): confirm whether it was ever written.

### Lanes excluded, and what they still hold

- **`wt-live3`** — nothing. The name has no branch behind it. If the Loop, Radar and
  Playbooks were meant to be "made reachable" by a lane of that name, **that work is
  not in this release** and its branch needs finding under whatever it is really
  called.
- `wt-page-dash`, `wt-page-flow` — nothing outstanding; both fully contained in
  `wt-dash2` and `wt-boot` respectively.
- Roughly seventy other `wt-*` branches exist in this repository and were outside the
  brief's candidate list. None was assessed.
