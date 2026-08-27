# Handoff — divas — wt-divas3 — 2026-08-27

**Owner** divas · **Lane** wt-divas3 · **Role** advisor

**Branch** `claude/divas-kickoff-xdoxoa` at `1bb19d7`, 10 commits beyond `3137bc3`.
PR [#18](https://github.com/development156/sahodalabs/pull/18) → `wt-core`, draft,
body rewritten at `1bb19d7` because the old one was stale on three counts.
Pushed: yes.

**This replaces the Stop hook's skeleton.** Sessions 1 and 2 in this lane did no
product work. This one did, and the founder was present throughout.

---

## What the task was, and how it changed four times

It began as "in /assets make folder systems and smart organize features, better
than Google Drive". It became "this folder system is very complicated and not
simple" with a screenshot, then a design blueprint PDF, then a 567-line file
manager spec, then four screenshots with a red circle round a broken menu.

**Each redirection was a correction of the last delivery**, and the sequence is
the story: I built a capable thing, the founder found it unusable, and the second
build deleted more than it added.

---

## Shipped

| # | Commit | What |
| --- | --- | --- |
| 1 | `d89e061` | Contract, three tables, registration in docs/38 and the DPDP export |
| 2 | `7ea9eab` | The folder system on screen: read layer, 9 actions, 11 components |
| 3 | `ed7775f` | Brought `/assets` back inside its JavaScript budget |
| 4 | `5c77db0` | Migration APPLIED to production, verified, docs/38 corrected |
| 5 | `95ed0f6` | **Filing never worked. Fixed.** |
| 6 | `d1964d9` | Token search, so the rule builder could go |
| 7 | `ce07816` | The library, made simple: 6 components deleted, 1432 lines |
| 8 | `4868c96` | `packages/shared` side-effect-free: **565 kB back across 11 routes** |
| 9 | `9a214a6` | `café` and `café` are one folder name, not two |
| 10 | `1bb19d7` | Six visual bugs, and five features the library was missing |

`asset_folders`, `asset_folder_items` and `asset_smart_folders` are **live in
production** (`rloztdhzfliyvpvxsgjl`). Founder approved applying only mine; the
other six unapplied migrations are other lanes' and **one of them reprices
plans**.

---

## The defect that matters most: filing never worked, not once

The founder hit "Could not save that. Try again." on the live preview.
`fileAssets` named an ON CONFLICT target of `(workspace_id, folder_id, asset_id)`.
The table is keyed `primary key (folder_id, asset_id)`. **Postgres matches that
target against a real unique index by its exact column set**, so every call ever
made raised `42P10`. The extra column looked like tenant-scoping and scoped
nothing; the row is already scoped by two composite foreign keys and by RLS.

**Twenty-seven action tests passed straight over it.** They mock Supabase, and a
mock has no ON CONFLICT semantics to get wrong. No quantity of additional mocked
tests would have caught this.

**So the guard lives in `packages/db/tests/asset-folders-rls.test.ts`, which runs
real SQL**, and it asserts BOTH directions in one transaction: the app's shape
inserts and is idempotent on overlap, and the broken shape still raises 42P10.
A test proving only the good path goes green again the moment somebody re-adds a
column. Mutation-proven.

**The rule this earns:** any behaviour that depends on database semantics cannot
be guarded by a mock. Put it in the suite with a real Postgres or do not claim it
is guarded.

---

## Guards written, and the mutation that proved each

| Guard | Mutation | Result |
| --- | --- | --- |
| Subtree depth in the SQL trigger | remove the downward walk | refused move returns `{"rows":[]}`, 2 red |
| `matchesQuery` three-valued answer | collapse `unknown` into `no` | 3 red |
| `canMoveFolder` subtree check | measure the dragged folder alone | exactly the 1 discriminating test red |
| Filing upsert shape | point good path at the 3-column target | red, `expected { Object (denied) } to not have property "denied"` |
| Undo toast outlives its own success | keep it inside `BulkBar` | red, message unmounts with the selection |
| Root-name uniqueness | drop the root partial index | `Diwali`/`diwali` at the root allowed |
| Cycle prevention | drop the tree trigger | the `A→B→A` move succeeds |
| NFC folder names | compare `lower(name)` without normalising | the NFD duplicate inserts |
| Menu is portalled to `<body>` | render it in place | red, `expected [HTMLDivElement] to be document.body` |
| Unweighed file sorts last in BOTH size directions | make the null comparison direction-sensitive | red on the ascending half only |

---

## Four bugs the specs and the screenshots found in MY code

**1. A depth trigger that checks only the written row is half a guard.** Moving a
folder re-depths everything beneath it, and none of those rows has its own
`parent_id` touched, so the trigger never fires for them. MEASURED: a move
leaving the dragged folder at a legal depth 5 was ALLOWED and left its grandchild
at 7. Fixed with a second walk downward. REQUESTS §30 carries it, because the
rule generalises: any constraint on a position in a hierarchy is a constraint on
a subtree.

**2. Unicode normalisation.** MEASURED:

```
'café' (NFC, 4 code points) === 'café' (NFD, 5)   → false
same, after .toLowerCase()                          → false
same, after .normalize('NFC')                       → true
```

Two folders that look identical could coexist, at the root and under any parent.
Fixed in BOTH halves at `9a214a6`: NFC in `normalizeFolderName`, and
`lower(normalize(name, nfc))` in the two partial unique indexes.
**That migration, `20260827060000_folder_names_normalize_nfc.sql`, is WRITTEN AND
NOT APPLIED** and does not rewrite rows: a stored pair differing only by
normalisation would make the index fail to build, and it stops rather than
silently renaming somebody's folder. MEASURED on production: `asset_folders` holds
0 rows, so no such pair can exist today.

**3. `packages/shared` had no `sideEffects` declaration**, so webpack could not
tree-shake it and eleven routes each carried about 8 kB of the whole barrel.
MEASURED after the fix: **565 kB back across 11 routes**. Set to `["*.css"]`, not
blanket `false`, because the package exports `tokens.css` and a CSS export is a
genuine side effect.

**4. A CSS transform is a stacking context and no z-index escapes one.** The menu
the founder circled had no visible frame and its text collided with the rows
below. `library-sidebar-row.tsx:66` wrapped the trigger in `-translate-y-1/2`,
trapping the panel's `z-20`: paint order for a whole stacking context is decided
one level up. **RAISING THE Z-INDEX CANNOT FIX THIS.** It is the same
containing-block trap `apps/web/CLAUDE.md` records for `backdrop-filter` and
`position:fixed`, wearing a different CSS property. Fixed with a portal to
`document.body`, generalised into `FloatingPanel` so all six dropdowns on this
screen share one implementation.

**The other five visual bugs were one habit**: a ring, a border or a card drawn
round something that is not a card, so a person cannot tell what is pressable.
The uneven tiles, the status line that read as typeable, the wide grey slab
behind "Added 1 photo.", the dashed border making "New folder" look like an
input, and the big bordered card holding one empty-state sentence.

---

## Retracted, and each was a confident inference I had not measured

1. **"The format leg is red on the base, fifth time."** WRONG. A global prettier
   3.8.1 was ahead of the repo's pinned 3.9.5 on PATH. With the repo's own binary
   the whole tree is clean and always was.
2. **"The Stop hook is fixed by `echo "$INPUT"`."** WRONG, and it was this lane's
   own handoff asserting it twice. Raw ANSI escapes in the payload break `jq`
   either way. The quoting is not the defect.
3. **"zod is dragging 30 kB into the route chunk."** WRONG. Deferring the smart
   folder builder recovered 4.5 kB, not 30; zod was already in the shared vendor
   chunk. The deferral was later reverted entirely.
4. **"`next/dynamic` is the lever for this route."** WRONG twice, and the second
   time was an independent re-measurement: 798.0 kB to 799.3 kB, WORSE by 1.3 kB,
   because an extra chunk boundary costs more than the code it defers on a route
   this shape. Removed both times.
5. **"CI is failing on formatting."** WRONG. CI never ran at all.
6. **docs/38 said "47 of those 52" and named five unapplied tables.** Wrong in
   both halves, and I wrote one of those halves an hour earlier by copying a
   2026-08-23 figure instead of counting. Production holds **51 of 52**; exactly
   one, `ledger_actor_redactions`, is unapplied. Corrected in the file itself,
   because it goes to a lawyer.
7. **"The +8 kB on eleven routes is a warm build cache."** WRONG, and I retracted
   it inside the same session: the cold build reproduced the same figures, and
   local and Vercel agreed within 0.5 kB. That confirmed my ORIGINAL shared-barrel
   diagnosis, which I had abandoned for the cache theory.

**The pattern, stated plainly for the next session: seven wrong claims, every one
an inference I could have measured in under a minute.** The measurements are
cheap here. Take them.

---

## Reversed on purpose, twice, on the same line

**I said I would not raise the js-budget again, then raised it twice.** `ed7775f`
set `/(app)/assets` to 832366 and argued the case; `4868c96` tightened it to
797344; `1bb19d7` set it to **815129**, the exact measured figure with no padding.

The founder's instruction was "implement all the features", so cutting one to fit
the ratchet would contradict a decision already taken. The route ends this lane
about 12 kB heavier than it started; every OTHER route is about 49 kB lighter from
the `sideEffects` fix. **One line to revert if the screen should shrink instead.**

**A route within a kilobyte of its budget is not really budgeted** — another lane
measured local and Vercel differing by about half a kilobyte on identical source,
purely from build ids and chunk hashing. This line sits at the exact measured
figure with the harness's 8 kB slack untouched, which is the safe end of that.

---

## Shared surfaces touched

| File | Shape | Breaks constructors? |
| --- | --- | --- |
| `packages/shared/src/assets/organize.ts` | NEW | no, additive |
| `packages/shared/src/assets/folder-tree.ts` | NEW | no, additive |
| `packages/shared/src/assets/search-tokens.ts` | NEW | no, additive |
| `packages/shared/src/index.ts` | 3 exports added | no |
| `packages/shared/package.json` | `sideEffects: ["*.css"]` | no, and it gave back 565 kB |
| `apps/web/src/lib/assets/view.ts` | `AssetCard.folderIds` REQUIRED | **YES.** Every constructor needs it. `string[] \| null`; `null` means the read did not ask |
| The migrations | 3 new tables (applied), 1 index change (NOT applied) | no, additive |
| `apps/web/scripts/perf/js-budget.json` | `/(app)/assets` raised | not a type, but a ratchet other lanes share |
| `scripts/design/design-lint-baseline.json` | spacing 134 → **129** | tightened, not loosened |
| `docs/38_Data_Handling.md` | 3 tables + count | goes to a lawyer |
| `apps/web/src/lib/privacy/export-manifest.ts` | 3 entries | absent = missing from every customer export |

**The skeleton's shared-surface detector still cannot see the last four.**
Session 1 documented that blind spot; it is unchanged. `js-budget.json`,
`design-lint-baseline.json`, `docs/38` and the export manifest are all things
another lane depends on and none is in its filter.

---

## Gate

Run cold on the tree at `1bb19d7`, from the repo root, no leg piped.

| Leg | Result | Output |
| --- | --- | --- |
| `turbo run typecheck lint test --force` | **PASS** | 27 successful / 27 · **`0 cached, 27 total`** · exit 0 |
| ↳ `@sahoda/web:test` | PASS | **5067 passed \| 13 skipped** |
| ↳ `@sahoda/shared:test` | PASS | 332 passed |
| ↳ `@sahoda/db:test` | PASS | 634 passed \| **207 skipped** |
| ↳ `sites` `billing` `publishing` `jobs` `mesh` `research` | PASS | 3188 passed \| 13 skipped |
| ↳ lint, all nine packages | PASS | `lint ok` ×9 |
| `pnpm build` + js-budget | **PASS** | exit 0 · `js-budget ok: 81 routes within budget` |
| `prettier --check .` | **PASS** | whole tree, with the REPO's binary |
| Playwright `test:smoke` | **UNRUN, not passed** | REQUESTS §25 |
| Production probes | **PASS** | 6 guards broken in prod and watched to refuse, all rows rolled back |

**Read the skip counts, not the exit code: 233 tests did not run.**

---

## CI has no runner, and it is not this PR's

All gate runs on this branch complete in **2 to 5 seconds** with `runner_id: 0`
and an empty runner name. **Run 246 at 11:05 UTC predates this session's work
entirely.** Six other branches fail identically in the same window. Nothing
executed, so there is no failure in any diff to fix.

One standing-down comment is posted on PR #18. **No re-run was spent**, and
deliberately: a re-run only asks again whether a runner can be allocated, which
six branches already answer. **This needs someone with billing access to check
Actions minutes or the spending limit.** Nothing in the repository can merge
until then.

---

## What was NOT done, and why

- **Trash and restore** (spec §3.9). **Deleting a photo is still permanent.** This
  is the biggest real gap against the spec and the next thing worth building.
- **The NFC migration is written and NOT applied.** The TypeScript half is live;
  the index half needs the same approval the first migration got.
- **Everything in the file manager spec's Phases 3 to 5**: sharing and public
  links, versioning and dedupe, OCR, virus scanning, WebSockets, comments,
  GraphQL, third-party imports. Some would be wrong in a marketing tool, some
  cannot be built honestly here, and the spec's own build order says to resist
  them until Phase 2 polish is done.
- **Presigned direct-to-storage uploads.** A real rearchitecture, not a feature.
- **Virtualization.** The library caps at 200 rows, so it does not bite yet.
- **`function_search_path_mutable` on `app.asset_folders_guard_tree`.** One of
  **16** functions carrying it, including `app.set_updated_at` and
  `app.apply_tenant_policies`. Mine is not SECURITY DEFINER. Fixing one of
  sixteen does not close the class.
- **The two `.claude/settings.json` defects.** Still open from session 1. The
  Stop hook's `jq` still cannot read its own re-entry guard, and its gate still
  filters on `origin/main`, which is 800+ commits behind.

---

## For whoever picks this lane up

1. **Build trash and restore.** Permanent delete is the sharpest edge left.
2. **Apply the NFC migration** (or decide not to, deliberately).
3. **Do not trust a mocked test with a database claim.** That is what let filing
   ship broken through 27 green tests.
4. **A CSS transform or a `backdrop-filter` on any ancestor traps a dropdown.**
   `FloatingPanel` is the pattern; `apps/web/CLAUDE.md` records the other half.
   Reach for a portal before reaching for a z-index.
5. **`ops/state/qa.pending.json` was rewritten by the QA hook again** and reverted
   rather than committed, for the fourth session running. `core.hooksPath` is
   still UNSET so `.githooks/pre-commit` is disarmed. **Do not `git add -A`.**
