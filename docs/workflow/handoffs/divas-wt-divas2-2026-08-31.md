# Handoff — divas — wt-divas2 — 2026-08-31

**Branch** `wt-divas2` at `4943e33f`. Lane `wt-divas2`. Pushed: yes (level with
`origin/wt-divas2`, 0 ahead / 0 behind, tree clean).

The old slot-based design Studio was deleted on founder's instruction and
replaced with a generative image Studio. **Its schema is now applied to
production.** Twelve commits, `95511ed4..4943e33f` plus the three before it.

## What shipped

| What | Proof | Test that covers it |
| --- | --- | --- |
| Four modes, one module both screen and action ask | `apps/web/src/lib/studio/modes.ts` | `modes.test.ts` — 17 tests |
| `series` refused, not faked (routed model reports max n=1) | `modes.ts:77` `ready: false` | `modes.test.ts` "a matching set is not offered" |
| Canvas draws the picture, sized to the chosen format | `studio-workbench.tsx` canvas section | `studio-workbench.test.tsx` "is sized to the chosen format, not to a fixed shape" |
| Strip of every showable picture, newest first | `lib/studio/canvas.ts` `canvasPictures` | `canvas.test.ts` — 16 tests |
| Up to four options, **one credit hold per picture** | `app/actions/studio.ts` generation loop | `refusal-copy.test.ts` "a partial result" |
| Upload from the device, selected at once | `components/studio/reference-upload.tsx` | `upload.test.ts` — 10 tests |
| Draw on a picture (7 tools, undo/redo, selection, shortcuts) | `lib/studio/draw-objects.ts`, `draw-render.ts` | `draw-objects.test.ts` 24, `draw-render.test.ts` 20 |
| Marked picture flattened and sent as a reference | `draw-render.ts` `composite` | `draw-render.test.ts` "the photograph goes down FIRST" |
| Zoom to 400% and drag, in the viewer | `lib/studio/viewport.ts` | `viewport.test.ts` 15, `picture-viewer.test.tsx` 8 |
| "Use it in a post" — draft + attach + open | `actions/studio.ts` `startPostFromPicture` | `studio-workbench.test.tsx` "turning a picture into a post" |
| Reuse a request without spending | `studio-workbench.tsx` `reuse()` | "asking for the same thing again" — 3 tests |
| Remove a request without removing the picture | `actions/studio.ts` `discardGeneration`, `discard-generation.tsx` | see NOT DONE — component untested |
| Copy a picture to the clipboard (PNG transcode) | `lib/studio/clipboard-image.ts` | `refusal-copy.test.ts` "a picture that would not copy" |
| **Migration applied to production** | ref `rloztdhzfliyvpvxsgjl`, history row `20260829210000` | `packages/db/tests/studio-generations-rls.pglite.test.ts` — 17 tests |

### Defects found in this lane's own work, all fixed

1. A reference pick past the limit was **silently dropped** — no selection, no
   sentence. MEASURED by a test that could not otherwise be written.
2. `[id, id, id]` was **charged and stored as three references** for one picture.
   Fixed in `lib/studio/reference-ids.ts`, de-duplicated before the bound.
3. Cards printed `format_id` raw, so a shop owner read **"link-card"**.
4. A row left at `running` said **"being drawn now" forever**.
5. The reference picker showed an **order-free tick**, hiding that the first
   picture weighs most (`signReferences` sends them in pick order).
6. The pointer tool could move a mark with **no way to see which was picked**.
7. An Explore branch was **dead when written**, because the picker it needed was
   hidden in that mode. A test found it; the picker now shows in every mode.

## What was NOT done, and why

- **Playwright `@smoke` is UNRUN.** Not passed. Two dispatches, both refused at
  the workflow's own secrets gate. See Gate below for the measurement.
- **`discard-generation.tsx` has no component test.** The action's reasoning is
  documented and the DB enforces the split, but the confirmation copy ("the
  record goes, the picture stays") is unguarded. INFERRED risk: a future edit
  could make that sentence claim the picture is deleted. **This is the first
  thing to write in this lane.**
- **`draw-canvas.tsx` and `draw-modal.tsx` have no component tests.** The pure
  layers beneath them (`draw-objects`, `draw-render`) are covered by 44 tests
  and were mutation-proved; the React shells around them are not.
- **Generation is still synchronous inside the request.** The row shape supports
  async (`queued`/`running`/`ready`) and `describeStranded` reports a row that
  never settled, but nothing pops a queue. Closing the tab still loses the wait.
- **`image_tier`, `seed` and `model_id` are written null.** Columns exist.
- **`OPENROUTER_API_KEY_IMAGE` is unverified in the deployed environment.**
  Reading `.env` is correctly blocked from this sandbox. INFERRED: if absent,
  generation returns the honest refusal and charges nothing, but no picture
  will ever appear. This is a one-line check for a human.
- I did not add repository secrets and did not weaken the gate that wants them.

## Shared surfaces touched

| Surface | Change | Breaks whom |
| --- | --- | --- |
| `packages/shared/src/studio/generation.ts` | `GENERATION_MODES` gained `'edit'` (now 5) | **Readers are safe**; anything switching exhaustively over the union gets a compile error until it handles `edit`. |
| `packages/shared/src/studio/generation.ts` | Comment on `GENERATION_STATUSES` rewritten: `ready` now means AT LEAST ONE image arrived | No type change. A lane relying on "ready ⇒ all requested images present" must re-read it. |
| `packages/shared/src/mesh/tasks.ts` | `ImageGenerateInputSchema` gained optional `dims` and `references` (max 14); output gained optional `providerCostUsd` | Both OPTIONAL — no constructor breaks. |
| `packages/shared/tokens.css` | Two new tokens `--photo-ink`, `--photo-ink-edge`; inline copy regenerated via `scripts/gen-tokens-inline.mjs` | Additive. `apps/web/src/lib/sites/tokens-css-inline.ts` regenerated with it. |
| `packages/mesh/src/mesh.ts` | Passes `dims` and `references` through to the provider | Behaviour only. |
| `apps/web/src/app/actions/assets.ts` | `uploadAsset` now also `revalidatePath('/studio')` | Additive. |
| `apps/web/src/components/ui/textarea.tsx` | Optional `autoGrow` / `maxRows`; became a client component | **OPT-IN.** Existing callers unchanged. The `'use client'` directive is new — a server component that imported it was already impossible (it takes handlers). |
| `apps/web/scripts/perf/js-budget.json` | ONE key moved: `/(app)/studio` 643392 → 749730 | The other 80 keys untouched; their build drift was left to slack rather than baked in. |
| Deleted | 39 old-studio files, incl. `shared/src/studio/{document,template,templates}.ts` and `shared/src/db/studio.ts` | **Any lane importing those breaks.** `PaletteRole`/`Palette` were moved into `shared/src/studio/paint.ts`, not lost. |

## Contract, migration or money

**Migration `20260829210000_studio_generations.sql` is APPLIED to production**
(`rloztdhzfliyvpvxsgjl`), via `apply_migration`, on explicit founder instruction.
Purely additive: two `create table`, six indexes, policies, two triggers. No
DROP, TRUNCATE, DELETE or unqualified UPDATE.

Verified against the live database, not assumed:

- RLS enabled on both tables; **zero policies for `anon`** — an unauthenticated
  client reads nothing BY CONSTRUCTION, which is stronger than an empty-table
  `count(*)`.
- `studio_generations`: four member policies. `studio_generation_images`:
  **SELECT and INSERT only** plus `block_mutations`, so it is append-only and
  rows leave only by cascade.
- The repo-wide deletion-reach guard independently lists
  `studio_generation_images` among the 31 tables with no member DELETE policy.

**One qualified UPDATE was run on `supabase_migrations.schema_migrations`.**
`apply_migration` recorded the DDL under its own timestamp (`20260830172106`),
not the local filename's (`20260829210000`), so a later `db push` would have
found the file unapplied, re-run it, and failed on tables that already exist.
The version was reconciled to the filename. **Whoever merges must know this
row was edited.**

**Money:** no price changed. `pricing.config.json` untouched. But the CHARGING
SHAPE is new: four options are four separate `withCredits` holds, not one. If
the third fails, the first two are charged, the third releases, the fourth is
never attempted. The screen names the TOTAL before the press.

## Guards written, and the mutation that proved each

Every guard below was mutated and WATCHED go red. Grouped by slice.

| Mutation applied | Result |
| --- | --- |
| `series` → `ready: true` | RED |
| `MAX_REFERENCES` cap removed from `toggleReference` | RED |
| Explore stops clearing references | RED |
| `minReferences` / `maxReferences` checks removed | RED (each) |
| Canvas pinned to `1 / 1` | RED *(after the guard was rewritten — see Retracted)* |
| Not-ready pictures reach the canvas | RED |
| Unlinked pictures reach the canvas | RED |
| `downloadName` drops its unique half | RED |
| Strip renders only the newest | RED |
| Strip click does nothing | RED |
| CostLabel shows the unit price, not the total | RED |
| "will not match each other" warning removed | RED |
| `describePartial` always silent / always speaking / money claim stripped | RED (each) |
| `edit` accepts three references like `match` | RED |
| Prompt hint fixed again / same for every mode | RED (each) |
| `describeFormat` prints the row key / a retired preset's key | RED (each) |
| `describeStranded` never / always / settled rows / unreadable date | RED (each) |
| Reference de-duplication removed / bound before de-dup / reorders | RED (each) |
| Starters always shown / a starter fires a generation | RED (each) |
| Explore swallows the pick / legend says nothing | RED (each) |
| Reuse fires a generation / drops the mode / references / words | RED (each) |
| Both copy failures read the same / "copied" reports a failure | RED (each) |
| Redo survives a new branch | RED |
| Pointer scale ignored / zero rect divides anyway | RED (each) |
| Hit test picks the bottom shape / replace appends | RED (each) |
| `composite` draws the photo LAST | RED |
| `redraw` stops clearing / live stroke not drawn | RED (each) |
| Zoom-out keeps the offset / pan unbounded / pan at the fit | RED (each) |
| Reset button becomes a readout / zoom kept across pictures | RED (each) |
| Selection box absent / drawn first / one colour | RED (each) |
| Post action removed / refusal swallowed / wrong picture | RED (each) |

**Four mutations first appeared to PASS and none was accepted as a proof.**
This is the finding of the lane, not a footnote:

1. One had **broken compilation** — a suite that never ran is not a green suite.
2. One **never landed**: the `sed` pattern used 14 spaces where the file had 12,
   and my "verification" grep matched a line that was already correct.
3. One was covered **only by the type checker** (`assetId` non-null). A real
   test now stands behind it.
4. One **passed its own argument** — the selection-box padding test supplied
   `pad: 8`, so it never exercised the default every caller gets.

**MEASURED lesson: a mutation must be shown to have LANDED before its result
means anything.** `grep`-ing for the mutated text is the cheap way to show it.

## Anything retracted

- **"The canvas sizing is guarded."** RETRACTED. The original assertion checked
  the SHAPE of the aspect ratio (`/^\d+ \/ \d+$/`), which `1 / 1` satisfies.
  MEASURED: pinning the canvas to `1 / 1` passed that test. Rewritten to assert
  the chosen format's own numbers and that changing the size changes the canvas;
  the same mutation now turns 2 tests red.
- **"The picker is hidden for a mode that ignores references."** RETRACTED as a
  requirement, not deleted as a test. The reasoning ("offering a picker invites a
  choice the mode then ignores") stopped being true once picking a picture MOVED
  a person to the mode that uses it. The test was retargeted to the claim that
  survives: a mode never silently pretends to use a reference.
- **"Only 3.1 kB of the studio's growth is the drawing editor."** MEASURED by
  building once with the editor stubbed out: 729.1 kB vs 732.2 kB. The remaining
  100.7 kB is this lane's canvas, filmstrip, viewer, upload and count controls.
  `next/dynamic` is working; `js-budget` counts lazily-loaded chunks anyway.

## What the next session in THIS lane should pick up

1. **Write `discard-generation.test.tsx` first.** It is the only new
   user-facing surface with no guard, and its copy makes a claim about somebody's
   files ("the picture stays in your library"). Mutate the sentence to claim the
   picture is deleted and watch it go red.
2. **Get the smoke suite to actually run.** It is UNRUN, twice, for the reason
   in Gate below. Until it runs, no golden path on this branch has been
   exercised by a browser.
3. **Confirm `OPENROUTER_API_KEY_IMAGE` in the deployed environment.** Without
   it the whole Studio is inert in production, however green everything else is.
4. Then: async generation (a queue plus a sweeper for stranded rows), and
   `image_tier` / `seed` / `model_id` written rather than null.
5. Series mode unblocks when a model reporting `n > 1` is routed. Seedream 4.5
   is on OpenRouter at $0.04 flat, max n 10 (docs/43 §3).

## Gate

| Leg | Result | Evidence |
| --- | --- | --- |
| `turbo typecheck lint test` (`@sahoda/web`) | **PASS** | CI run [1107](https://github.com/development156/aircover/actions/runs/33325713835), step "Typecheck, lint and test" success in 7m 4s. Locally: 6455 passed / 13 skipped across 504 files. |
| `@sahoda/db` test | **PASS** | 751 passed / 207 skipped, incl. `studio-generations-rls.pglite.test.ts` 17 tests |
| Root vitest | **PASS** | CI run 1107, success. Locally 223 passed. |
| `prettier --check .` | **PASS** | CI run 1107 "Formatting" success |
| `design-lint` | **PASS** | 0 raw hex, 0 new violations, 1473 files scanned |
| `next build` | **PASS** | green |
| `js-budget` | **PASS** | 81 routes within budget |
| **Playwright `@smoke`** | **UNRUN** | See below. NOT passed. |

### Why the smoke leg is UNRUN — MEASURED twice

Dispatched with `ack_target: rloztdhzfliyvpvxsgjl` on `4943e33f`:

- Run [1126](https://github.com/development156/aircover/actions/runs/33337330776),
  2026-08-30 21:46 — failed at step 6 in **18 seconds**.
- Run [1129](https://github.com/development156/aircover/actions/runs/33357784614),
  2026-08-31 04:38 — failed at step 6 in **19 seconds**, AFTER the founder
  reported adding the six secrets.

Both produced the identical error:

```
##[error]Repository secrets are not configured:
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY CLERK_SECRET_KEY NEXT_PUBLIC_SUPABASE_URL
```

Chromium was never installed and the suite never started, so **nothing was
written to the production database.**

MEASURED about the workflow: `gate.yml` declares **no `environment:` key on any
job**, so it reads only repository-level (or organisation-level) Actions
secrets. INFERRED causes, ranked, each with its own check:

1. **Added to Vercel, not GitHub.** The same six names live in both places.
   Check: GitHub → Settings → Secrets and variables → **Actions** → *Secrets*
   tab lists all six.
2. **Added under an Environment.** Environment secrets need `environment: <name>`
   on the job, which this workflow does not have. Check: Settings →
   Environments. If they are there, either move them to repository secrets or
   add the `environment:` key (a shared-surface change — coordinate).
3. **Added on the "Variables" tab rather than "Secrets".** Same page, adjacent
   tab; `secrets.X` cannot see a variable.
4. **Added as Dependabot secrets.** Same page, different left-nav entry.
5. Name typo or trailing whitespace in a name.

The repository's canonical name is `aircover` (the runner checks out into
`work/aircover/aircover`); `sahodalabs` is a redirect to it, so adding secrets
under either name reaches the same repository. That is ruled OUT as a cause.

**The gate behaved correctly.** It refused rather than running zero tests and
reporting green, which is the failure mode that let twenty-six billing tests go
unexecuted for months.

## Files in the tree that are not mine

At the end of this session the working tree held two modified files, both
EMPTIED rather than edited:

- `ops/state/changelog.pending.json` — lost its one queued entry, "Autopilot,
  ready and switched off", which is another lane's work and arrived with the
  `wt-core` merge.
- `ops/state/qa.pending.json` — lost 163 queued QA runs (2,122 lines).

MEASURED cause: the SessionStart ops hook reported `ops: synced ... changelog 0 ·
qa 0`, so it drained both outbound queues to the board. That is its designed
behaviour, not a defect, and neither file is this lane's work.

**Both were restored to HEAD and NOT committed.** Committing an emptied queue
would commit the drain of somebody else's changelog entry under a handoff
message. If the board already took them, the `client_id` on each row is what
prevents a double publish. `qa.pending.json` is refused by the pre-commit hook
in any case (REQUESTS §18).

## Links

- Lane preview: https://sahodalabs-git-wt-divas2-development-4417s-projects.vercel.app/studio
  (deployment `READY` on `4943e33f`, MEASURED)
- PR: https://github.com/development156/aircover/pull/29 (out of draft)
