# Handoff — divas — wt-divas3 — 2026-08-27

**Branch** `claude/divas-kickoff-xdoxoa` at `afca6f98`. Lane `wt-divas3`. Pushed: **yes**, 0 unpushed.
PR [#18](https://github.com/development156/sahodalabs/pull/18) → `wt-core`, draft.

> **This file is rewritten in place, not appended to with a `## Session 2`.** The
> `/handoff` rule about appending exists so two DIFFERENT sessions cannot
> overwrite each other's record. This file was created by this same session
> earlier today and updated three times as work landed; adding a session marker
> to my own single session would invent a boundary that does not exist. Sessions
> 1 and 2 in this lane did no product work and left no file.

**The lane is CI-VERIFIED GREEN**, for the first time in its history. Nineteen
commits, a full day, previously green only on this machine.

| Evidence, job 98584261042 on `afca6f98` | Value |
| --- | --- |
| `runner_id` | **1000000551** (not `0`) |
| `runner_name` | `GitHub Actions 1000000551` |
| Duration | 16:03:34 → 16:14:53, **11m 19s** |
| Steps | **13**, every one `success` |
| Conclusion | **success** |

---

## What shipped

Nineteen commits beyond `3137bc3`. `/assets` went from a picture of a library to
a working file manager.

| SHA | What | Proof |
| --- | --- | --- |
| `d89e061` | Contract, three tables, registration in docs/38 + DPDP export | `packages/db/tests/asset-folders-rls.test.ts`, 12 tests |
| `7ea9eab` | The folder system on screen: read layer, 9 actions, 11 components | `asset-library.test.tsx` |
| `ed7775f` | Brought `/assets` back inside its JavaScript budget | `js-budget ok: 81 routes` |
| `5c77db0` | Migration APPLIED to production, verified, docs/38 corrected | production probes, rolled back |
| `95ed0f6` | **Filing never worked. Fixed.** | `asset-folders-rls.test.ts`, both directions in one transaction |
| `d1964d9` | Token search, so the rule builder could go | `packages/shared/src/assets/search-tokens.test.ts` |
| `ce07816` | The library, made simple: 6 components deleted, 1432 lines | — |
| `4868c96` | `packages/shared` side-effect-free: **565 kB back across 11 routes** | `packages/shared/package.json` `sideEffects` |
| `9a214a6` | `café` and `café` are one folder name | NFC guard in `asset-folders-rls.test.ts` |
| `1bb19d7` | Six visual bugs and five features | `context-menu-portal.test.tsx`, `sort-cards.test.ts` |
| `a64c1f8` | **Trash and restore. Deleting a photo is no longer permanent.** | `packages/db/tests/assets-trash.test.ts` |
| `7201fdc` | Drag a photo onto a folder | `apps/web/src/lib/assets/drag-payload.test.ts`, 17 tests |
| `95afafa` | Shift-click a range, select all, drag a folder into a folder | `apps/web/src/lib/assets/select-range.test.ts`, 15 tests |
| `76bc0c6` | Details panel dropped; two migrations applied | production read-back |
| `3a58912` | docs/38: what the trash means for a copy and for erasure | — |
| `0238fe5` | Delete a selection, and empty the trash | `describeEmptyTrash` tests + real-SQL idempotency guard |
| `6fb2796` | Arrow keys across the grid, one tab stop instead of 200 | `apps/web/src/lib/assets/grid-nav.test.ts`, 15 tests |
| `08793aa` | Ctrl/Cmd+A, Shift+Arrow, shortcut sheet stops under-claiming | `asset-library.test.tsx` |
| `37b0d73` | Duplicate detection on upload | `apps/web/src/lib/assets/duplicate-copy.test.ts` + 3 real-SQL guards |
| `afca6f98` | The content-hash migration applied and verified | production read-back |

### The defect that mattered most: filing never worked, not once

The founder hit "Could not save that. Try again." on the live preview.
`fileAssets` named an ON CONFLICT target of `(workspace_id, folder_id, asset_id)`.
The table is keyed `primary key (folder_id, asset_id)`. **Postgres matches that
target against a real unique index by its exact column set**, so every call ever
made raised `42P10`.

**Twenty-seven action tests passed straight over it.** They mock Supabase, and a
mock has no ON CONFLICT semantics to get wrong. **The rule this earns: any
behaviour that depends on database semantics cannot be guarded by a mock.**

---

## What was NOT done, and why

- **Playwright is UNRUN on this whole lane, not passed.** In this sandbox
  Chromium completes no outbound HTTPS request and every `@smoke` spec signs in
  through Clerk. MEASURED: `https://example.com/` resets the same as Clerk's host.
  Not a certificate problem, so `--ignore-certificate-errors` is both forbidden
  and useless. REQUESTS §25.
- **Consequently: no real pointer has driven any drag, no real key has pressed
  Down a row, and no file has been uploaded twice.** jsdom lays nothing out — every
  tile's rect top is 0 — so the row arithmetic is covered only by
  `grid-nav.test.ts` against real numbers. Treat all three as browser-unverified.
- **`wt-core` is 8 commits ahead and NOT merged in.** MEASURED: none of the eight
  touches a shared surface; all are e2e/sandbox infrastructure. Two of them
  (`4fe5474b`, `d4a8b029`) route Playwright's browser through Node so it RUNS in
  a cloud sandbox — directly relevant to the caveat above and worth taking next.
- **Everything in the file manager spec's Phases 3 to 5**: sharing and public
  links, versioning, OCR, virus scanning, WebSockets, comments, third-party
  imports. The spec's own build order says resist until Phase 2 polish is done.
- **A "Recent" view, dropped on judgement rather than forgotten.** All files is
  already newest-first by default and `added:7d` is already a search token. A row
  restating the default view teaches a person the product has more places than it
  has.
- **Presigned direct-to-storage uploads.** A rearchitecture, not a feature.
- **Virtualization.** The library caps at 200 rows, so it does not bite yet.
- **`function_search_path_mutable`.** Mine is 1 of **16** functions carrying it,
  including `app.set_updated_at` and `app.apply_tenant_policies`. Mine is not
  SECURITY DEFINER. Fixing one of sixteen does not close the class.
- **The two `.claude/settings.json` defects**, open since session 1. The Stop
  hook's `jq` cannot read its own re-entry guard, and its gate filters on
  `origin/main`, 800+ commits behind.

---

## Shared surfaces touched

| File | Shape | Breaks constructors? |
| --- | --- | --- |
| `packages/shared/src/assets/organize.ts` | NEW | no, additive |
| `packages/shared/src/assets/folder-tree.ts` | NEW | no, additive |
| `packages/shared/src/assets/search-tokens.ts` | NEW | no, additive |
| `packages/shared/src/assets/trash.ts` | NEW | no, additive |
| `packages/shared/src/index.ts` | 4 exports added | no |
| `packages/shared/package.json` | `sideEffects: ["*.css"]` | no. Deliberately NOT blanket `false`: the package exports `tokens.css` and a CSS export is a genuine side effect |
| `packages/shared/src/db/assets.ts` | `deleted_at` and `content_sha256` added to `AssetSchema` | **READERS ONLY.** Both carry `.default(null)`, so a row missing them still parses. That is deliberate: this file parses PER ROW so a bad row costs one tile, and a required field missing between deploy and migration would cost the entire library |
| `apps/web/src/lib/assets/view.ts` | `AssetCard.folderIds` and `AssetCard.deletedAt` REQUIRED | **YES. Every constructor needs both.** `folderIds: string[] \| null` — `null` means the read did not ask. `deletedAt: string \| null` — mirrors the column, both values are real answers |
| `apps/web/scripts/perf/js-budget.json` | `/(app)/assets` raised | not a type, but a ratchet other lanes share |
| `scripts/design/design-lint-baseline.json` | spacing 134 → **129** | tightened, not loosened |
| `docs/38_Data_Handling.md` | 3 tables, a count correction, a trash section | goes to a lawyer |
| `apps/web/src/lib/privacy/export-manifest.ts` | 3 entries | absent = missing from every customer export |

**The skeleton's shared-surface detector still cannot see the last four.**
`js-budget.json`, `design-lint-baseline.json`, `docs/38` and the export manifest
are all consumed by other lanes and none is in its filter. Unchanged since
session 1 documented it.

---

## Contract, migration or money

**No price, no ledger, no credit path was touched.** `pricing.config.json`
untouched; `apply_ledger_entry` untouched.

**THREE MIGRATIONS, ALL APPLIED to `rloztdhzfliyvpvxsgjl`**, each on the founder's
explicit word and each verified by reading production back rather than by
trusting the apply.

| Migration | What | Verified |
| --- | --- | --- |
| `20260826120000_asset_folder_system.sql` | 3 tables, RLS, cycle/depth trigger | 6 guards broken in production, all refused |
| `20260827060000_folder_names_normalize_nfc.sql` | both unique indexes compare `lower(normalize(name, nfc))` | `nfc_refused=t` on two root folders differing only by normalisation |
| `20260827090000_assets_trash.sql` | `assets.deleted_at` + two partial indexes | trashed row left the live filter, entered the trash filter, kept its **653851 bytes** and its storage path |
| `20260827140000_assets_content_hash.sql` | `assets.content_sha256` + partial index | `shared_hash_allowed=t`, `null_matches=0`, `live=1 trashed=1` |

Every probe ran inside a `do` block that rolls its writes back. **Post-check,
MEASURED: 11 assets, 10 live, 1 in the trash, 0 hashed rows, 0 probe rows left,
2 folders.**

**The trash and the folders are being USED on the preview** — one asset trashed
and two folders, where this morning there were zero and one.

---

## Guards written, and the mutation that proved each

**Thirty-one mutations were applied and watched go red.** Every one after the
09:00 lesson below was grep-confirmed present before its result was read. The
load-bearing ones:

| Guard | Mutation | Result |
| --- | --- | --- |
| Subtree depth in the SQL trigger | remove the downward walk | refused move returns `{"rows":[]}`, 2 red |
| `matchesQuery` three-valued answer | collapse `unknown` into `no` | 3 red |
| Filing upsert shape | point the good path at the 3-column target | red, `expected { Object (denied) } to not have property "denied"` |
| NFC folder names | compare `lower(name)` without normalising | the NFD duplicate inserts |
| Menu is portalled to `<body>` | render it in place | red, `expected [HTMLDivElement] to be document.body` |
| Both trash indexes carry their WHERE | strip `where deleted_at is null` | red, `expected 'CREATE INDEX assets_live_idx ON publi…' to match /WHERE \(deleted_at IS NULL\)/` |
| Empty library keeps the trash reachable | drop the `&& trashed.length === 0` half | 2 red, `Unable to find role=button and name /^Trash/` |
| No retention period is promised | write "deleted for good after 30 days" | red |
| Clock skew reads as today | `days <= 0` → `days === 0` | red, `expected 'Deleted -1 days ago' to be 'Deleted today'` |
| `idsForDrag` selection rule | `selected.has(id)` → `selected.size > 0` | red, `expected [ 'a', 'b', 'c' ] to deeply equal [ 'z' ]` |
| A folder does not highlight for a drag it cannot accept | strip `isAssetDrag` from `onDragEnter` | red, `expected <span aria-hidden="true" …></span> to be null` |
| `canMoveFolder` during the drag | make every folder accept every folder | red, same span assertion |
| The anchor does not move on shift-click | move it | red, `expected 'd' to be 'b'` |
| The range follows the VISIBLE order | range over the library instead | red, `expected [ 'a', 'b', 'c', 'd' ] to deeply equal [ 'd' ]` |
| Kept files are reported when emptying the trash | drop the `kept` clause | 3 red |
| The bulk sentence counts FILES, not posts | sum post counts | red, `expected '5 of them are still on posts…' to match /2 of them/` |
| The count comes from the server | report `ids.length` | red, `Unable to find /Moved 1 file to the trash/` |
| Bulk trash is idempotent (**real Postgres**) | drop `.is('deleted_at', null)` | red, `expected [ …(2) ] to have a length of 1 but got 2` |
| The empty-trash confirmation exists | fire immediately | 2 red |
| The nav key handler merge | spread `navProps` after `onKeyDown` | red, `Unable to find role=textbox and name /name/i` |
| Shift+Arrow only inside Select | claim it unconditionally | 2 red |
| Ctrl+A is not stolen from the search box | drop `isTypingTarget` | red, `expected document not to contain element` |
| The duplicate message says "file", not "photo" | say "this same photo" | red |
| The trashed duplicate is a distinct case | collapse it into the live one | 2 red |
| The hash index is NOT unique | make it unique | 2 red, incl. `duplicate key value violates unique constraint` on delete-then-re-upload |

---

## Anything retracted

**Eleven, and every one is recorded because the pattern matters more than any
single item.**

1. **"The format leg is red on the base."** WRONG. A global prettier 3.8.1 was
   ahead of the repo's pinned 3.9.5 on PATH. With the repo's own binary the tree
   is clean and always was.
2. **"The Stop hook is fixed by `echo "$INPUT"`."** WRONG, and this lane's own
   handoff asserted it twice. Raw ANSI escapes break `jq` either way.
3. **"zod is dragging 30 kB into the route chunk."** WRONG. 4.5 kB, and zod was
   already in the shared vendor chunk.
4. **"`next/dynamic` is the lever for this route."** WRONG twice. MEASURED the
   second time: 798.0 kB → 799.3 kB, **worse**, because an extra chunk boundary
   costs more than the code it defers on a route this shape.
5. **"CI is failing on formatting."** WRONG. CI never ran at all.
6. **docs/38 said "47 of those 52"** and named five unapplied tables. Wrong in
   both halves, and I wrote one of them an hour earlier by copying a 2026-08-23
   figure instead of counting. Production holds **51 of 52**.
7. **"The +8 kB on eleven routes is a warm build cache."** WRONG, retracted
   inside the same session: the cold build reproduced it and local agreed with
   Vercel within 0.5 kB. That confirmed my ORIGINAL shared-barrel diagnosis,
   which I had abandoned for the cache theory.
8. **"That mutation did not go red, so the guard is vacuous."** WRONG. **The
   mutation had never been applied**: prettier had joined the two lines of the
   target arrow function, so a multi-line string replace matched nothing and
   changed the file not at all. The test was green because the CODE WAS CORRECT.
   **Verify the mutation LANDED before reading its result.**
9. **"Dropping the details panel will meaningfully shrink `/assets`."** It saved
   **1589 bytes**, because `AssetDetail` stays in the route for Quick Look. A
   claim made without measuring, offered to the founder as a lever, and recorded
   as such.
10. **Three tests passed for a reason other than the one written above them.**
    (a) "A foreign drag never reaches fileAssets" stayed green with the type check
    removed, because `getData` returns `''` and the length check stops it anyway.
    (b) Three negative assertions fired before the `startTransition` they were
    meant to catch. (c) "The keys this file already owned still work" used Space,
    and `user.keyboard(' ')` on a `<button>` fires a CLICK — the panel opened
    through `onClick`. All three rewritten.
    **The rule: assert the thing ONLY the code under test can produce.**
11. **A comment claiming protection the code does not give.** It said
    destructuring `navProps` prevents it clobbering the key handler. MEASURED: a
    whole spread THERE is harmless, because JSX is last-wins. The protection is
    prop ORDER, which is invisible. Corrected in place.

---

## What the next session in THIS lane should pick up

1. **Take `wt-core` in.** 8 commits, none touching a shared surface, and two of
   them route Playwright's browser through Node so it can RUN in a cloud sandbox.
   That directly attacks this lane's biggest standing gap.
2. **Then actually run the drags, the arrow keys and a double upload in a real
   browser.** Everything in this lane is jsdom-verified only, and drag-and-drop is
   exactly what jsdom models loosely.
3. **Build trash-and-restore's remaining edge if you want it: an auto-purge.**
   There is deliberately none, and `assets-trash.test.ts` asserts NO function
   reads `deleted_at` — so the day a sweeper is added that guard goes red and the
   copy must change in the same commit. That is the design, not an oversight.
4. **Do not trust a mocked test with a database claim.** That is what let filing
   ship broken through 27 green tests.
5. **A CSS `transform` or `backdrop-filter` on any ancestor traps a dropdown.**
   Reach for a portal before reaching for a z-index. `FloatingPanel` is the
   pattern.
6. **`ops/state/qa.pending.json` is rewritten by the QA hook every session** and
   was reverted rather than committed, for the fifth session running.
   `core.hooksPath` is UNSET so `.githooks/pre-commit` is disarmed. **Never
   `git add -A`.**

---

## Gate

**The authoritative run is CI's, on this exact SHA.** MEASURED, job
98584261042 on `afca6f98`, runner 1000000551, 11m 19s, 13 steps, all success.

| Leg | Result | Output |
| --- | --- | --- |
| CI `typecheck · lint · test · format` on `afca6f98` | **PASS** | **success**, real runner, 11m 19s, 13 steps |
| ↳ CI step "Typecheck, lint and test" | PASS | 10m 18s |
| ↳ CI step "Root vitest" | PASS | the leg that fails locally because this sandbox runs as uid 0 and `chmod 0o500` does not block root. **MEASURED not to reproduce in CI**, as predicted |
| ↳ CI step "Formatting" | PASS | 31s |
| Local `turbo typecheck lint test --force` on the `37b0d73` tree | **PASS** | 27/27, **0 cached**, exit 0 |
| ↳ `@sahoda/web` | PASS | 5151 passed \| 13 skipped |
| ↳ `@sahoda/db` | PASS | 643 passed \| **207 skipped** |
| ↳ `@sahoda/shared` | PASS | 351 passed |
| ↳ `sites` `publishing` `billing` `jobs` `mesh` `research` | PASS | 1566 · 464 · 401\|13 · 396 · 166 · 195 |
| Local `turbo build` + js-budget | **PASS** | exit 0, `js-budget ok: 81 routes within budget` |
| Local `prettier --check .` | **PASS** | whole tree, repo's own pinned binary |
| `design-lint` | **PASS** | 5 checks ok, none new |
| Playwright `test:smoke` | **UNRUN, not passed** | REQUESTS §25. Not a failure — it did not run |
| Production probes, all three migrations | **PASS** | guards broken and watched to refuse, every write rolled back |

**Read the skip counts, not the exit code: 220 tests did not run** in the local
leg. `/(app)/assets` measured **827620** against its **822072** budget, inside
the harness's 8 kB slack with about 2.6 kB left.

---

# Session 2 — divas — wt-divas3 — 2026-08-27

**Branch** `claude/divas-kickoff-xdoxoa` at `41e32276`. Lane `wt-divas3`. Pushed: **yes**, 0 unpushed at the time of writing.
PR [#18](https://github.com/development156/sahodalabs/pull/18) → `wt-core`, draft.

> The header of Session 1 says this file is rewritten in place and never gains a
> `## Session 2`. That was true of Session 1 writing about itself. This IS a
> second session, with a cleared context and no memory of the first, so the
> append rule applies and the header's claim is superseded from here down.

## What shipped

**Nothing. No product code was written in this session.** MEASURED: the only
commit newer than Session 1's own handoff commit `adbcb9dd` is the merge
`41e32276`, "merge wt-core before handing `claude/divas-kickoff-xdoxoa` over",
authored 2026-08-27 16:22:09 +0000, whose second parent is `1bb51630` on
`wt-core`. Its diff against `adbcb9dd` is 12 files, +730 / -481, and every line
of it came from `wt-core`, not from here.

| What the merge brought in from `wt-core` | Lines |
| --- | --- |
| `apps/web/e2e/helpers/node-transport.ts` (new) | +274 |
| `scripts/browser-run.mjs` (new) | +199 |
| `scripts/sandbox-probe.mjs` (new) | +185 |
| `scripts/auto-handoff.mjs` + its test (**deleted** — the Stop hook) | -472 |
| `.claude/commands/{handoff,kickoff}.md`, `.claude/settings.json`, `.gitignore`, `e2e/fixtures/seeded-user.ts`, `e2e/onboarding-boot-video.spec.ts`, `docs/workflow/handoffs/README.md` | the rest |

The value this session added is the section below: **`41e32276` had never been
tested.** Session 1's gate, local and CI both, ran on `afca6f98` — one commit
before the merge. A merge commit that no leg has ever seen is an unverified
commit, whatever colour its parents were.

## What was NOT done, and why

- **No product work, and none was asked for.** The session opened with `/clear`
  and the only instruction given was `/handoff`.
- **Playwright `test:smoke` — UNRUN, not passed.** Two independent reasons,
  both MEASURED. `apps/web/.env.local` is absent, so `e2e/global-setup.ts`
  throws on the missing Clerk names before any spec loads; and REQUESTS §25's
  finding still stands for this sandbox. UNRUN is not a failure and it is not a
  pass.
- **`packages/db`'s live-database legs did not all reach a database.** See the
  Gate section: DNS for the Supabase host does not resolve from this sandbox on
  the second run.
- **No push to `wt-core`.** `41e32276` is not green on a full local run in this
  sandbox for environment reasons I could not clear, so I did not put it into
  the one gated branch in the system.

## Shared surfaces touched

**None by this session.** MEASURED: no file was edited except
`docs/workflow/handoffs/divas-wt-divas3-2026-08-27.md` (this text) and
`ops/state/qa.pending.json` (written by the repo's own QA hook when my gate run
failed, not by hand).

The merge `41e32276` did carry shared surfaces in from `wt-core`, and a lane
pulling `wt-core` gets them regardless of this lane:

- **`scripts/auto-handoff.mjs` and `scripts/lib/auto-handoff.test.mjs` are
  deleted.** Anything that invoked the Stop-hook skeleton writer is now calling
  a file that does not exist. This is the removal the `/handoff` command
  documents.
- **`apps/web/e2e/helpers/node-transport.ts` is new** and `e2e/fixtures/seeded-user.ts`
  changed. Any lane with in-flight e2e work merges against these.

## Contract, migration or money

**None in this session.** MEASURED: `packages/shared` untouched,
`packages/db/supabase/migrations` untouched, `pricing.config.json` untouched,
no ledger path touched. The merge added no migration either — the 12 changed
paths are listed above and none is under `migrations/`.

## Guards written, and the mutation that proved each

**None written, so none proved.** Writing a guard was not part of this session,
and I will not claim a mutation I did not watch go red.

One guard was, however, **observed failing without my provoking it**, which is
the same evidence: `src/components/assets/asset-library.test.tsx:233` went red
in the full-suite run and green in isolation. That is a real assertion doing
real work, and the next section says what it means.

## Anything retracted

**Session 1's "PASS" does not extend to `41e32276`.** Session 1 measured its
gate honestly and on the right SHA, `afca6f98`; nothing it wrote is wrong. But
the branch has moved one commit since, and the head this lane is handing over is
**not** the head anyone tested. That is a scope correction, not a defect found.

**MEASURED, not inferred:** I ran the legs myself; the outputs are below.

## What the next session in THIS lane should pick up

1. **Get `41e32276` a real green, in CI, not here.** Dispatch the `gate.yml`
   workflow against `claude/divas-kickoff-xdoxoa` at this SHA. Session 1 proved
   that route works: job 98584261042 on `afca6f98`, 11m 19s, all 13 steps green.
   Both failures I saw locally are things CI does not have, so I expect it green
   — that expectation is INFERRED and the CI run is what settles it.
2. **Then decide about `wt-core`.** Do not push `41e32276` onward until step 1
   is green on that exact SHA.
3. **`asset-library.test.tsx:233` is timing-sensitive and worth one look.** It
   is a `waitFor` on `unfileAssets` after an Undo click. It failed once in a
   4m38s whole-repo run and passed on its own in 8.55s, so the assertion is
   sound and the wait is what is thin. Do not delete it and do not widen the
   timeout blindly: make the test await the state it actually depends on.

## Gate

Every leg below was run **in this session, on `41e32276`**, with a clean tree.
Both `turbo` invocations report **0 cached, 27 total** — no leg is a replay.

| Leg | Result | Real output |
| --- | --- | --- |
| `turbo run typecheck lint test --force` (whole repo) | **FAIL** | exit 1. `Tasks: 26 successful, 27 total`, `Cached: 0 cached, 27 total`, 4m38.411s. `Failed: @sahoda/web#test` |
| ↳ every leg except `@sahoda/web#test` | **PASS** | 26 of 27, typecheck and lint included, across all packages |
| ↳ `@sahoda/web` test, run 1 | **FAIL, 1 test** | `1 failed \| 5150 passed \| 13 skipped (5164)`, 224.85s. The one: `asset-library.test.tsx:233`, `waitFor` on `unfileAssets` after Undo |
| ↳ that file alone, immediately after | **PASS** | `1 passed (1)`, `34 passed (34)`, 8.55s. Green in isolation, red under full-suite load |
| ↳ `@sahoda/web` test, run 2 (whole leg, forced) | **FAIL, 2 tests, DIFFERENT ones** | `2 failed \| 5151 passed \| 11 skipped (5164)`, 138.62s. `asset-library` passed this time |
| ↳ the run-2 failures | **environment** | both in `src/lib/privacy/export-drift.test.ts`, one message: `Error: getaddrinfo ENOTFOUND db.rloztdhzfliyvpvxsgjl.supabase.co`. No DNS for the Supabase host from this sandbox |
| `prettier --check .` (repo root, repo's pinned binary) | **PASS** | exit 0, `All matched files use Prettier code style!` |
| Playwright `test:smoke` | **UNRUN, not passed** | `apps/web/.env.local` absent; `e2e/global-setup.ts` throws on the missing Clerk names |

**Read the two runs together, not either alone.** Grouped by error message
there are exactly two groups, and neither is a defect in the merge: one
`waitFor` that is load-sensitive and passes alone, and one DNS name that does
not resolve in this sandbox. Run 1 and run 2 failed on **disjoint** tests, which
is the signature of environment and timing, not of code. The skip counts moved
with it — 13 skipped in run 1, 11 in run 2 — because `export-drift` skips when
it cannot see a database and fails when it half-can.

**The honest one-line summary: `41e32276` is UNVERIFIED, not red.** No leg has
shown a defect in it, and no leg in this sandbox can show it clean either.
