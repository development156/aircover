# Handoff — divas — wt-divas2 — 2026-09-04

**Branch** `wt-divas2` at `8cb94266`. Lane `wt-divas2`. Pushed: yes, **and `wt-core`
is at the same commit** — the ten fixes from 2026-09-03 are on the trunk.

This session wrote no product code. It was an INTEGRATION session, and the whole
of it is the story of getting yesterday's ten fixes onto a trunk that was rebuilt
underneath them twice while the gate was running.

In plain terms: the work was already finished and tested. Landing it took four
attempts because the shared branch kept being rebuilt while the tests ran, and
twice the safe thing was to stop rather than push.

## What shipped

No new fixes. What landed is yesterday's ten, now on `wt-core`.

| What | Proof |
| --- | --- |
| All ten fixes present on `origin/wt-core` | `git log origin/wt-core --grep` returns exactly 1 for each of the ten subjects |
| Present in the TREE, not just the log, after a 892-commit merge | `more: trash.capped`, `unreadable: true`, `dayColumn`, `series ? false`, `href="/loop"`, `metricInWords`, `not printed on invoices yet`, `site-delete.ts`, `readiness-line.tsx`, `readStoredThreadMessages` all grep positive |
| The merge itself | `8cb94266`, **zero conflicts** across 892 commits |
| Trunk did not move during the final gate | `git rev-list --count HEAD..origin/wt-core` = 0, fast-forward safe at push time |

**MEASURED.** Trunk had rewritten `apps/web/src/app/actions/assets.ts` to add
per-workspace storage limits, the same file the trash fix lives in. The two
changes sit in different functions, so git took both; the tree was checked rather
than the merge trusted.

## What was NOT done, and why

- **Playwright `@smoke` is UNRUN, not passed.** Fourth session running. The
  three Clerk and Supabase names still read empty in CI as repository secrets AND
  as variables, so the job exits at its guard step. Reported, never worked around.
- **`bebe89f8 revert(posts): drop wt-karunesh's posts and composer work` was
  deliberately NOT replayed.** The patch-ID sweep surfaced it among the commits
  missing from the rebuilt trunk. The new trunk CONTAINS `merge wt-karunesh into
  wt-core`, so replaying that revert would have silently deleted a teammate's
  posts and composer work. Left out on purpose.
- **Two further commits dropped by the trunk rewrite were not re-landed**:
  `ebe5828e feat(autopilot): the audit trail` and `aa2ec867 docs(38): the
  tenant-table count`, both 2026-08-28. They are not mine to restore on my own
  judgement. Whoever ran the rewrite should decide whether they were meant to
  survive.
- **I did not amend `b974040` and `d15e3ad` as the signing hook asked.** They are
  a teammate's commits, authored SAHODALABS, that arrived through my merge.
  Amending would have reassigned their authorship to Claude and rewritten
  published history. Both are moot now: the rewrite replaced them.
- **I did not force-push my own re-cut of this lane.** Another session had
  already re-cut it identically; details under Anything retracted.
- **No new guard was written this session**, because no product code changed.

## Shared surfaces touched

**None by this session.** No type, schema, token, fixture or config was changed
here.

The surfaces yesterday's ten fixes moved are unchanged and are recorded in
`divas-wt-divas2-2026-09-03.md`: `describeEmptyTrash` gained a required third
argument, `readLedger` gained a required `unreadable`, `SitePreview` gained a
required `siteId`, plus four additive exports. **All of them are now on `wt-core`,
so every other lane inherits them on its next pull.** The three required fields
break constructors, not readers.

## Contract, migration or money

Nothing new. No migration written, none applied. No price touched. No ledger
change.

What reached the trunk today is yesterday's money-adjacent pair, and neither
moves a credit: the wallet and Home now tell a customer the difference between a
failed read and an empty history, and Studio's "a set that matches" is closed
because it was charging four presses for four unrelated pictures.

**One thing every lane should know:** `/sites` now carries a customer-DESTRUCTIVE
control on trunk. It asks first and refuses rather than reporting a deletion that
did not happen, but it has still only ever run against a faked database.

## Guards written, and the mutation that proved each

**None this session.** No product code changed, so there was nothing to guard,
and inventing a guard to fill this section would be worse than leaving it empty.

The fifteen mutations that proved yesterday's guards are recorded in
`divas-wt-divas2-2026-09-03.md` and every one of those guards is now on `wt-core`.

## Anything retracted

- **My re-cut of this lane was redundant, and I nearly overwrote someone.**
  MEASURED: another session had already re-cut `wt-divas2` from the rebuilt trunk
  and replayed all thirteen of my commits under new SHAs. Every one of the 44
  files I authored was **byte-identical** between their branch and mine (`git
  diff` across all 44 returned nothing). My `--force-with-lease` push was rejected
  on a stale lease, which is exactly the protection CLAUDE.md describes; with a
  fresh lease I would have replaced their branch with an identical copy and
  claimed it as new work.
- **The `asset-library.test.tsx > bulk filing` failure was contention, and trunk
  reached the same conclusion independently.** I reported it yesterday as
  reproducing under the gate. MEASURED across five runs: FAIL, FAIL, PASS on my
  branch, PASS on bare trunk, and PASS on the final merged head. MEASURED: the
  four bulk-filing files are byte-identical to trunk's and none of my commits
  touch them. Trunk's own `187117b4 fix(jobs): 60s, because 30 was exceeded by
  contention and not by a defect` documents the same class on a 4-core box, in a
  package that merge did not touch. So my earlier "it reproduces, therefore it is
  mine" reading was wrong: reproducing twice under load is not attribution, and
  the byte-identity check was the measurement that settled it.
- **"`wt-core` was rewritten" was right the first time and wrong the second.**
  MEASURED on the first: 902 behind / 896 ahead with duplicate commit messages
  under different SHAs. MEASURED on the second alarm: the merge-base was still
  `fe335104`, the exact commit I had re-cut from, so trunk had merely advanced by
  892. A branch being far behind is not a branch being rewritten, and I reported
  the second as a rewrite before checking the merge-base.

## What the next session in THIS lane should pick up

The lane and the trunk are the same commit, so this lane starts clean with no
inherited queue.

1. **Open `/sites` on a real workspace and delete a website.** It is the one
   destructive control this lane added and it has never run against the real
   database, only a faked client. Highest-value ten minutes available.
2. **`/analytics` and `/inbox` on the preview.** Both changes are about what a
   screen says when a read FAILS, which a unit test simulates rather than
   reproduces.
3. **The smoke suite**, if the three secrets ever land.
4. **Do not assume this lane is behind trunk.** It was rewritten once already
   today; run `git fetch --all --prune` and check the merge-base before
   concluding anything about divergence.

## Gate

MEASURED 2026-09-04 on `wt-divas2` at `8cb94266`, which is the exact commit
pushed to `wt-core`. `--force` on every leg, not piped.

| Leg | Result |
| --- | --- |
| `turbo run typecheck lint test --force` | **PASS — 27 of 27 tasks** |
| `@sahoda/web` | PASS — 8251 passed / 13 skipped |
| `@sahoda/db` | PASS — 976 passed / 198 skipped |
| `@sahoda/sites` | PASS — 1566 passed |
| `@sahoda/publishing` | PASS — 521 passed |
| `@sahoda/shared` | PASS — 506 passed |
| `@sahoda/jobs` | PASS — 472 passed |
| `@sahoda/billing` | PASS — 417 passed / 13 skipped |
| `@sahoda/mesh` | PASS — 236 passed |
| `@sahoda/research` | PASS — 195 passed |
| `prettier --check .` | PASS |
| Playwright `@smoke` | **UNRUN** |

Five full gate runs went into this session. Recorded because the pattern is the
finding: **FAIL, FAIL, PASS on the re-cut; PASS on bare trunk; PASS on the merged
head.** One test, load-sensitive, in files this lane does not touch. Trunk's
`187117b4` raised a neighbouring timeout for the same reason on the same day.

**Look at it:** `https://sahodalabs-git-wt-core-development-4417s-projects.vercel.app`
at `/sites`, `/analytics`, `/inbox`, `/wallet`, `/planner?view=day&week=1`,
`/studio`, `/brain/knowledge`, `/report` and `/settings`. That is the TRUNK
preview, not the lane's, because the two are now the same commit. It is still
**not** `https://app.sahodalabs.com`, which needs a `wt-core` to `wt-web`
promotion that has not happened.
