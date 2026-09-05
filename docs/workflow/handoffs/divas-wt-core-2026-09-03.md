# Handoff — divas / wt-core (2026-09-03)

**Trunk is `c2458e5b`, pushed, and all twelve lanes now point at it.** Every lane
was merged into `wt-core` first, then reset to the merged trunk by
fast-forward. No branch was force-pushed and no lane's work was discarded.

## What the twelve lanes actually held

| Lane | Brought | Merge |
| --- | --- | --- |
| `wt-girija` | the Studio composer, two logo variants, per-press stamp controls, 2 migrations | 6 conflicts |
| `wt-jiban` | one weight system, one control edge, one table recipe, 4 dead classes | 1 conflict |
| `wt-karunesh` | the drained changelog and QA queues | 1 conflict |
| `wt-girija2` `wt-girija3` `wt-jiban2` `wt-jiban3` `wt-karunesh2` `wt-karunesh3` | their handoffs | clean |
| `wt-divas` `wt-divas2` `wt-divas3` | nothing — already contained | reset only |

Two code lanes, one ops lane, nine documents. `wt-girija` landed first
deliberately: `wt-jiban` ratchets the design-lint baseline "to the merged tree",
and a baseline written before 4324 lines of Studio code would have been wrong.

## The six conflicts, and why none was settled by picking a side

All six were Studio, where this lane's own QA sweep had just fixed the same
lines girija was rewriting.

- **`studio-workbench.tsx`** — girija's rewrite is 20x the size of wt-core's
  delta, so girija's file was taken whole and wt-core's three changes re-applied
  onto it. The `library` prop is a `LibraryRead` again, so a failed read keeps
  its own sentence instead of claiming the library is empty. The price beside
  the button is derived from the chosen model rather than handed in by the page
  — handing it in is what let "The best one" read the everyday price while the
  action held the premium one.
- **`page.tsx`** — girija's prop set minus `cost`, for the same reason.
- **`studio.ts`** — `StampOptionsSchema` stays, `MESH_TASK_ACTION` goes. The
  action key now comes from `imageActionFor(modelId)`, and the only mention left
  in the file is the prose explaining the change.
- **`stamp-generated.ts`** — both sides, not either. The ceiling is the channel
  cap (wt-core) and the exit reports why it failed (girija).
- **two test files** — the union type and the four new parameters, together.
- **`qa.pending.json`** — the drained side. The runs had already been published
  to the dashboard, so restoring them would have double-sent them, and the file's
  last defect was a production password printed into it. Both ops queues are now
  the 4-line empty form.

## The money path, checked because nothing could have checked it

wt-core made the price derive from the model. girija added multi-image presses
and renders `cost * count`. **Neither lane could have tested the intersection** —
wt-core's fixtures had no `count`, girija's had a flat `cost` prop.

MEASURED: `queueGeneration` loops `for idx < count` and calls `withCredits` once
per image with `objectRefFor(idx)`. The hold is per image, so the total charged
is `count x creditCost(action)` and the label matches what leaves the wallet. No
defect, but this is the assertion the merge created the need for and it is worth
a test the next time this screen is opened.

## The budget, and a hypothesis that was wrong

`/(app)/studio` failed its JS budget at 761.5 kB against the 752.5 kB girija had
set for its own branch. The obvious suspect was `creditCost`, which lives in
`ledger/pricing.ts` and imports `pricing.config.json` and zod, parsed at module
load, into a `'use client'` component.

**That was measured rather than assumed, and it was wrong.** With the import and
the call removed the route builds at 761.5 kB, byte for byte the same number.
`@sahoda/shared` is already on this screen for `DEFAULT_STAMP_OPTIONS`, so the
pricing module costs nothing extra. The 9.0 kB is the sum of two lanes that
could not see each other, and the budget was raised to the measured value only.

## Gate: four legs of five, MEASURED ON `c2458e5b`

| Leg | Result |
| --- | --- |
| turbo typecheck+lint+test | green, 27/27 tasks |
| vitest root | green, 240 tests |
| **playwright @smoke** | **REFUSED — see below** |
| prettier --check . | green |
| turbo build `--force` | green, "82 routes within budget" |

Re-measured on the final head rather than carried over. The first run was at
`ed025b14`, and four commits landed after it. All four were markdown, verified by
`git diff ed025b14 HEAD` naming only LEARNINGS.md and four handoffs — but the
build was re-run with `--force` anyway, because a cache hit is not a measurement
and this file would otherwise carry a number from a different tree.

The design-lint baseline was TIGHTENED 654 -> 652 rather than left as found: it
reported a file improved, and a baseline looser than the code is a ratchet that
has stopped ratcheting.

Guards were seen to fail before being trusted. The typecheck went red with
TS2367 when the byte check was handed a string, and green on restore. The JS
budget went red on `/(app)/studio` before the raise and reported "82 routes
within budget" after.

## The smoke leg cannot run here, and that needs a person

`SAHODA_E2E_ACK_TARGET` was NOT set and the suite refused:

```
decision  refused-unacknowledged
parsed ref  rloztdhzfliyvpvxsgjl
```

This account has ONE Supabase project and it is production. The 118 @smoke specs
do not read, they CREATE: each mints a Clerk user, signs it in, and lets the app
create a workspace, a credit ledger and whatever rows the spec exercises. There
is no second database to point at, so this is a decision and not a URL to
change. It was not made here.

The durable fix named by the guard itself is a Supabase BRANCH of this project,
which gets its own ref and needs no acknowledgement at all.

## Not done, and why

- **The smoke leg** — running it writes to the live customer database. Left for
  a person.
- **The production password from `9cde8481`** still needs rotating. Untouched.
- **Four migrations remain unapplied.** MEASURED against prod: the last applied
  version is `20260829210000`, and `20260831*` and `20260902*` are not there.
  `studio_generation_images` has neither `stamped_asset_id` nor `stamp_outcome`.
  This is why girija editing `20260831150000` in place was allowed rather than
  prohibited — that migration has never run.
- **All three `wt-divas` worktrees are now checked out at the same commit as
  this one.** That is correct for git and a trap for the next session: four
  worktrees on one tree all default to port 3100, so `pnpm dev` or `next start`
  in a divas lane will silently land on whichever is already listening. Set
  `E2E_PORT` before running anything that serves.
- **The repository has moved.** Every push prints
  `This repository moved. Please use the new location: development156/aircover`.
  The remote still works by redirect. Nobody has updated the remote URL.
