# Handoff — girija — wt-girija — 2026-09-01

**Branch** `wt-girija` at `6ecbcc57`. Lane `wt-girija`. Pushed: **yes**, tracking
`origin/wt-girija`, working tree clean. Carried by **draft PR #39**
(`development156/aircover#39`), base `wt-core`, `mergeable_state: unstable`
(Vercel pending, no conflict).

Ten commits ahead of `wt-core`, two of them merges FROM it. `wt-core` was taken
twice today, most recently at `15edc87b`.

---

## What shipped

| What | Proof | Covered by |
| --- | --- | --- |
| Studio's make screen is one composer, not six fieldsets | `6ecbcc57`, `components/studio/studio-workbench.tsx` | `studio-workbench.test.tsx` — 57 tests, 6 of them new |
| The composer is a dark panel via `data-surface="inverse"` | `studio-workbench.tsx:~300` | `'the composer paints itself with the inverse scope'` |
| Brand signals shown BEFORE the spend, with certainty | `app/(app)/studio/page.tsx`, `studio-workbench.tsx` | `'names each signal, and marks which ones were guessed'` |
| Three states for the signals, never two | same | `'an empty Brand Brain and an unreadable one are different sentences'` |
| `[data-surface='inverse']` gets `--pstrong` + `--pstrong-fg` | `33b026bf`, `11b9d213`, `packages/shared/tokens.css` | `lib/design/own-medicine.test.ts` |
| `[data-theme='dark']` gets the same pair | `11b9d213` | same, `describe.each` over both scopes |
| Nine call sites stop hardcoding `hover:text-white` | `11b9d213` | `lib/design/primary-hover-label.test.ts` (new) |
| Onboarding sets `workspaces.logo_asset_id` | `0c52fefc` | `use-build.logo.test.tsx` |
| Studio stamps the workspace logo onto generated pictures | `0b47bca6` | `studio.stamp.test.ts`, `stamp-generated.test.ts` |
| Merge-created rollback: stamped copy removed too | `6532a825`, `app/actions/studio.ts` | `'removes the stamped copy too, not just the original'` |

**MEASURED** unless stated.

---

## What was NOT done, and why

- **Playwright `@smoke` is UNRUN, not passed.** Chromium in this sandbox cannot
  complete any outbound HTTPS request and every `@smoke` spec signs in through
  Clerk. The `smoke` CI job cannot substitute: MEASURED 2026-08-29, it exits at
  its own guard step in 17s because **no repository secrets are configured at
  all**. Reported, never worked around.
- **`packages/db` UNRUN this session.** No `packages/db` file was touched
  (`git diff origin/wt-core...HEAD -- packages/db` is empty except the three
  migrations added in `0b47bca6`). It shares one live database and I did not
  want to strand fixtures for another lane.
- **Three migrations remain UNAPPLIED.** `supabase db push` needs a person.
  Every read and write works with the columns absent by answering Postgres
  `42703`; on production today the stamping runs, the picture is stored, and
  only the link is dropped.
- **I have never seen any of this rendered in a browser.** The Vercel build for
  `6ecbcc57` was still `pending` when this was written. Every visual claim here
  rests on jsdom tests and on offline renders of the design artboards, not on
  the running app.
- **No results screen.** A picture with a stamped copy has no UI to choose
  between the two versions. That is a copy problem first: a null
  `stamped_asset_id` means three different things and this project's rules
  forbid collapsing them into one sentence.
- **The four "Proposed" controls in the design are not built** and are not on
  the screen. Nothing in `lib/studio` implements them.

---

## Shared surfaces touched

**Not "none" — read this before pulling.**

| Surface | Change | Who breaks |
| --- | --- | --- |
| `packages/shared/tokens.css` | **+2 token names**: `--pstrong-fg` (`:root`, dark, inverse) and `--pstrong` (dark, inverse). `--brand-deep` re-declared in the inverse scope only. | Nobody. Names are added, none removed or repointed in light. |
| `apps/web/src/app/globals.css` | `--color-primary-strong-foreground: var(--pstrong-fg)` added to `@theme inline`. | Nobody. |
| `apps/web/src/lib/sites/tokens-css-inline.ts` | **GENERATED.** Regenerate with `node scripts/gen-tokens-inline.mjs` after any `tokens.css` edit; do not hand-edit. | A lane editing `tokens.css` without regenerating. |
| `StudioWorkbench` props | **`signals: BrandSignal[] \| null` is REQUIRED, not optional.** | **Constructors, not readers.** Three test files already updated (`ai-zero-balance.test.tsx`, `spend-at-zero.test.tsx`, `studio-workbench.test.tsx`). Any lane rendering this component will fail typecheck until it passes `signals`. Required on purpose: an optional prop defaulting to `[]` would silently claim the Brand Brain is empty. |
| `stampGeneratedPicture` return | **`objectPath: string` added** to `StampedPicture`. | Nobody reads it but `app/actions/studio.ts`. Additive. |
| Nine `.tsx` files | `hover:text-white` → `hover:text-primary-strong-foreground` beside `hover:bg-primary-strong`. | A lane adding a tenth call site: `primary-hover-label.test.ts` will refuse it. |

---

## Contract, migration or money

- **`packages/shared/src/db/identity.ts`** — `WorkspaceSchema` gained
  `logo_asset_id: z.uuid().nullable()`. Additive.
- **Three migrations, all UNAPPLIED**: `20260831090000_workspaces_logo_asset_id`,
  `20260831120000_asset_logo_facts`, `20260831150000_studio_stamped_asset`.
- **Money: no change.** Stamping is local compute and charges nothing. The
  merge with `wt-core` made a failed `studio_generation_images` insert roll the
  generation back, so a lost provenance row now costs a released hold instead of
  a charge with nothing recording what it bought. Asserted absolutely
  (`toEqual({calls:1, cost:1})`), not pairwise — a pairwise comparison passed
  while BOTH arms charged twice.

---

## Guards written, and the mutation that proved each

Every one **watched go red**, then restored.

**`lib/design/own-medicine.test.ts`** (token pair, both dark scopes)
1. delete `--pstrong` from the inverse scope → red
2. set it to `:root`'s `#000000` → red
3. a *darker* orange that still clears 3:1 but points at the ground → red
4. delete the `--brand-deep` re-declaration → red
5. dark declares `--pstrong` but not `--pstrong-fg` → red
6. dark labels its hover fill white → red

**`lib/design/primary-hover-label.test.ts`** (call sites)
7. one component back to `hover:text-white` → red
8. one component with no hover label at all → red
9. the `@theme inline` alias deleted → red

**`app/actions/studio.stamp.test.ts`**
10. roll back only the generation's own asset → red
11. delete the stamped row but leave its bytes → red
12. drop the `42703` retry's error check → **SURVIVED at first.** Nothing
    covered a retry that also fails. A test was added; it is red under that
    mutation now.

**`components/studio/studio-workbench.test.tsx`**
13. composer uses a hand-written dark fill instead of the scope → red
14. the settings tray drops its own scope → red
15. the chip row pinned to a literal instead of `ruleFor()` → red
16. the prompt hidden along with the settings → red
17. an unreadable Brand Brain reported as an empty one → red
18. certainty carried by the coloured dot alone → red

**Two assertions were DELETED for failing to be guards.** On the inverse
surface, "ink still clears AA on the hovered fill" cannot fail while the lift
assertion passes — lift > 6.11 forces L_fill > 0.308, so ink is 7.2:1 at worst.
The arithmetic is recorded where the assertion was. The mark's height cap is the
other: it cannot bind at today's constants (0.14 against 0.25).

---

## Anything retracted

- **I twice reported work as done when it was not.** I said the token change was
  "done" while PR #39 was `dirty` against `wt-core` — I had not checked
  mergeability. And I reported the design work without saying plainly that
  **none of it was in the app**; I wrote "no screen renders a stamped picture",
  which is true and far narrower than the truth. MEASURED: before `6ecbcc57`,
  `git diff origin/wt-core...HEAD -- apps/web/src/app/\(app\)/studio` was empty.
- **My eyeballed hover value was wrong.** I proposed `#ff8124` from the
  prototype. The solver returns `#ff893e`. Shipped value is the solver's.
- **My first sizing rule for the logo mark was wrong** and an agent proved it:
  sizing the LONGEST side off the shorter canvas edge makes the width cap
  mathematically unreachable for any mark wider than tall. The rule is now
  stated on the mark's height.
- **A scanner I wrote reported a defect that was a SENTENCE, three times.** It
  matched its own header, its sibling's, and the generated tokens mirror. Fixed
  as a class, not a case: it scans `:(glob)apps/web/src/**/*.tsx` only.

---

## What the next session in THIS lane should pick up

1. **Look at the Studio in a browser.** `.../studio` on the lane preview, in
   BOTH themes. Nobody has. The composer is the first dark surface in the
   product outside the rail and I have only jsdom's word that it renders.
2. **`[data-theme='dark']` now changes shipping pixels** — every primary button
   brightens on hover instead of going black. That is the fix, and it is the
   first visible change in this PR. Confirm it before `wt-core` takes the lane.
3. **The results screen.** Choosing between the stamped and unstamped picture.
   Start from the copy: `Main.dc.html` in the design canvas has the four cases
   drawn and three of them must never collapse into one sentence.
4. **Apply the three migrations** (needs a person), then re-check that
   `stamped_asset_id` is actually written rather than dropped on `42703`.
5. **`@sahoda/jobs` `x-ration.test.ts` is red and is NOT this lane's.**
   `git diff origin/wt-core...HEAD -- apps/jobs` is EMPTY. It expects
   `X_MONTHLY_RATION_UNREADABLE` and receives `PER_DAY_CAP_UNREADABLE`: two
   guards on one publish path where the per-day cap fires first. The right fix
   depends on which limit should bind, which is a product question for whoever
   owns publishing.
6. **`packages/db/tests/live-guard.test.ts` prints a production database URL and
   password into the test log** when it fails, which it does wherever a repo-root
   `.env` exists. Needs somebody with the production project. Reported since
   2026-08-31 and still open.
7. **Design canvas**, three artboards, live and clickable:
   https://claude.ai/code/artifact/2f63ef75-665c-461a-85ae-fda3c6062976

---

## Gate

Run from `apps/web` and the repo root on `6ecbcc57`, working tree clean.

| Leg | Command | Result |
| --- | --- | --- |
| web unit | `npx vitest run` (from `apps/web`) | **PASS** — 583 files, 7,669 passed, 13 skipped, 0 failed, 252s |
| shared unit | `npx vitest run --root packages/shared` | **PASS** — 30 files, 465 passed (run at `11b9d213`; no `packages/shared` change since) |
| lint + typecheck | `pnpm -w exec turbo run lint typecheck` | **PASS** — 18 tasks, 18 successful |
| design-lint | inside `@sahoda/web:lint` | **PASS** — raw hex ok, 1,649 files scanned |
| format | `npx prettier --check .` | **PASS** |
| `packages/db` | not run | **UNRUN** — shared live database, nothing in it changed |
| Playwright `@smoke` | not run | **UNRUN** — see "What was NOT done" |
| Vercel | PR #39 status on `6ecbcc57` | **PENDING** at the time of writing |

Two failures were found and fixed rather than reported as noise, both mine and
both real guards: `ink-faint.test.ts` caught four uses of `--ink-faint` on text
a person reads, and `read-waterfall.test.ts` refused `brandSignalsFor` as a new
sequential read. The read was made parallel rather than the baseline rewritten.
