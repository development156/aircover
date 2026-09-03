# Handoff — jiban — wt-jiban — 2026-09-03

**Branch** `wt-jiban` at `32471c8e`. Lane `wt-jiban`. Pushed: yes
(`origin/wt-jiban` level, PR #40 open against `wt-core`, draft, CI green).

One session, one job: a design-system consistency pass over the whole app, done
by fixing the primitives every screen inherits from rather than editing screens
one at a time. Six read-only audits ran first (controls · surfaces · status and
icons · overlays · typography and spacing · tables and navigation); what follows
is what they found that could be fixed safely in one pass, and — at least as
important — what they found that could not.

---

## What shipped

### The headline: a weight utility beside a type step never worked

**MEASURED.** `type-sm font-semibold` rendered at **400**. Tailwind emits custom
`@utility` rules AFTER its own `font-*` utilities in the same layer, and `font:`
is a shorthand, so each step's resting weight overwrote every modifier sitting
beside it. **82 className strings** in the app pair a type step with a weight
utility; every one showed 400 where its author set 550, 600 or 650.

The measurement could only be taken in a browser: compile `globals.css` through
`@tailwindcss/postcss`, load it in Chromium over `file://`, read
`getComputedStyle`. The source reads correctly in **both** orders, so no static
check and no amount of careful reading could have seen it.

| item | proof | covered by |
| --- | --- | --- |
| Each of the 11 steps carries `font-weight: var(--tw-font-weight, W)` after the shorthand | `apps/web/src/app/globals.css:515-615` | `apps/web/src/lib/design/type-step-weights.test.ts` (12 tests) |
| The guard pins every `W` to the weight inside its own `--t-*` token | `type-step-weights.test.ts:82-93` | itself; mutation below |

### Four classes that compiled to nothing

**MEASURED** by grepping the compiled stylesheet: `rounded-control`,
`rounded-l-control`, `rounded-r-control` and `type-xs` are defined nowhere and
emit zero bytes. **14 uses**, all in the brand panel — square swatches and
unstyled captions, reported by nobody, because a class that emits nothing reads
in review exactly like one that works.

`components/shell/brand-panel.tsx` now uses `rounded-input` / `rounded-sm` and
`type-meta`. `scripts/design/dead-classes.mjs` already existed to catch this
class of defect and is run by nothing — see *Anything needing a decision*.

### Primitives

| primitive | before | after | file |
| --- | --- | --- | --- |
| Select | `border border-line`, global outline focus | Input's inset ring + two-part focus; new `error` prop | `components/ui/select.tsx` |
| Input · Textarea · Tabs · DataTable · Label | `text-[13px]` / `text-[12px]` literals | `type-sm` / `type-meta` | those five files |
| Badge · Chip | `text-[11px] font-semibold` / border edge | `type-chip`; Chip's edge is a ring | `components/ui/{badge,chip}.tsx` |
| Tile | border **and** `ring-1` when selected, 24px radius | ring only, 16px (the tile step, §5) | `components/ui/tile.tsx` |
| Modal · Drawer | 24px radius, border, 16px padding | 28px (§5), ring, 20px | `components/ui/{modal,drawer}.tsx` |
| Drawer | `aria-labelledby="drawer-title"`, a **literal id** | `useId()`; gains a `footer` slot for Modal parity | `components/ui/drawer.tsx` |

The Drawer id was a live accessibility defect, not a tidy-up: `/assets` mounts
**two** drawers, so the id was duplicated and `aria-labelledby` resolved to the
first — opening the file-detail drawer announced "Folders".

### One table recipe

Five hand-rolled tables ran **four** header treatments, **three** row heights,
**two** rule tokens and no hover between them. All now share DataTable's recipe
(eyebrow header, `border-line-soft` rules, 10px rows, `hover:bg-s2`, numbers
right): `wallet/ledger-table.tsx`, `admin/team-view.tsx`,
`analytics/channel-table.tsx`, `analytics/post-table.tsx`,
`app/admin/jobs/page.tsx`.

### Renames with no visual change

**MEASURED** identical in the compiled CSS, both directions:

- `rounded-full` → `rounded-pill` — 46 sites, both resolve to 999px.
- hand-rolled `shadow-[inset_0_0_0_1px_var(--line)]` → `surface-ring-firm` — 15
  sites, byte-identical declaration.
- `hover:bg-s1` on a `bg-surface` element → `hover:bg-s2` — 6 sites. `--s1` IS
  `--surface` on light (`apps/web/CLAUDE.md`), so those hovers changed nothing
  at all. This one IS a visual change, and it is the fix.

### Accessibility

- Two search fields killed the focus ring with nothing in its place
  (`planner-toolbar.tsx`, `assets/library-search.tsx`) → the wrapper paints one
  on `focus-within`.
- Nine 28px icon buttons in the asset library had no phone floor → 44px below
  `narrow`.
- Three confirmation modals put the destructive action **left** of the dismiss
  AND outside the footer slot, so on a short viewport the buttons scrolled away:
  `loop/kill-switch.tsx`, `playbooks/kill-switch.tsx`,
  `studio/discard-generation.tsx` → footer slot, dismiss first, primary last.

### Toasts

46 `toast.*` call sites rendered in sonner's stock palette, radius and font, and
the `/admin` mount sat under the phone bottom bar. One `AppToaster`
(`components/shell/app-toaster.tsx`) maps sonner's CSS variables onto the tokens;
both layouts use it.

---

## What was NOT done, and why

- **Playwright `@smoke` is UNRUN**, not passed. Chromium in this sandbox cannot
  complete any outbound request, and CI cannot run it either: the `smoke` job
  exits at its own guard naming `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  `CLERK_SECRET_KEY` and `NEXT_PUBLIC_SUPABASE_URL` as absent. No repository
  secrets exist. Reported, never worked around.
- **Button radius left alone.** `button.tsx` ships `rounded-sm` (12px);
  `docs/37` §5 says pills, always. 30 hand-rolled pill buttons exist *because*
  of that disagreement. Converting them is a ruling, not a fix.
- **Topbar control heights left alone** (30/31/32/36/38px side by side in a 60px
  bar). `wt-jiban3` carries a commit for exactly this; doing it here collides.
- **Five competing status primitives left alone.** `Badge` (4 rungs) plus
  `StatusBadge` (11 labels), two channel-status maps and `lib/posts/status-word.ts`.
  "published" has three different words across them. Unifying changes customer
  copy that tests pin; it needs its own pass.
- **Inventoried, not fixed** — each is a screen edit, not a primitive edit, and
  bundling them would have made this unreviewable: 150 hand-rolled buttons in
  127 distinct recipes; ~90 raw text inputs; ~27 ad-hoc empty states of which 25
  have no next step; 46 heavy font weights. Roughly two-thirds sit in `/admin`,
  which uses neither empty-state primitive.
- **z-index scale left alone.** It is a comment in `globals.css:714`, not tokens;
  `z-10` (9 uses) is not on the scale at all.
- **The adversarial audit never reported.** I launched an `auditor` over the diff
  with ten claims to disprove; it had not returned by the end of the session.
  Everything above stands on my own measurements, which is weaker than I would
  like — the next session in this lane should re-run it (prompt shape in
  *What the next session should pick up*).

---

## Shared surfaces touched

**`packages/` — none.** `git diff --name-only 2dba741c 32471c8e -- packages/`
is empty. No contract, type, token or fixture another lane consumes changed.

Within `apps/web`, these are consumed by every lane and are the collision risk:

| surface | change | breaks a consumer? |
| --- | --- | --- |
| `app/globals.css` `type-*` utilities | added a `font-weight` longhand per step | **No** — additive. A call site with no weight class is unchanged; one WITH a weight class now gets the weight it asked for. That is a visual change on 82 sites, all in the intended direction. |
| `components/ui/select.tsx` | new optional `error?: boolean` | No — optional |
| `components/ui/drawer.tsx` | new optional `footer?: ReactNode` | No — optional |
| `components/ui/{badge,chip,tile,modal,input,textarea,label,tabs,data-table}.tsx` | class strings only; no prop signatures changed | No |
| `components/shell/app-toaster.tsx` | **new file**, replaces two raw `<Toaster>` mounts | No — both call sites updated in the same commit |

**A lane rebasing onto this will see its own screens change weight** wherever it
wrote `type-* font-semibold`. That is the fix landing, not a regression, but it
is the thing to look at first if a screen looks different after the merge.

---

## Contract, migration or money

**None.** No `packages/shared`, no price, no migration, no ledger code.

Two money-adjacent files were touched and both are presentation only:
`wallet/ledger-table.tsx` (header/row classes) and `billing/plan-offer-cards.tsx`
(one hand-rolled ring → `surface-ring-firm`). No amount, no rounding, no
`apply_ledger_entry` path, no `pricing.config.json`.

---

## Guards written, and the mutation that proved each

**`apps/web/src/lib/design/type-step-weights.test.ts`** — 12 tests. Compiles
`globals.css` and asserts each `type-*` step carries a `font-weight` longhand
whose fallback equals the weight inside its own `--t-*` token, plus one test
that the scale has exactly the eleven steps the file knows about (so a new step
cannot be added without the guard noticing).

**Mutation, MEASURED and WATCHED:** changed `type-eyebrow`'s fallback from
`600` to `500` in `globals.css:611`. Result:

```
× type-eyebrow falls back to the weight inside --t-eyebrow
AssertionError: expected 500 to be 600
Test Files  1 failed (1)      Tests  1 failed | 11 passed (12)
```

Restored to `600`; `Tests 12 passed (12)`. Red on the defect, green when
correct — I watched both.

**No other guard was added.** The rest of this diff is covered by tests that
already existed; two of them were retargeted rather than deleted (below).

---

## Anything retracted

**Two test retargets, both claim-preserving, neither a deletion.**

1. `wallet/top-up-panel.test.tsx:195` asserted an unselected plan card's mark
   matched `/var\(--line\)/`. The recipe is now the `surface-ring-firm` utility —
   **same box-shadow declaration**, one spelling instead of two. The assertion
   now matches `/surface-ring-firm/`. The CLAIM is untouched: an unselected card
   has its own edge and does not borrow the selected card's brand ring.

2. `lib/design/ink-faint-exceptions.ts` — `admin/team-view.tsx` went from `uses: 4`
   to `uses: 3`, with the reason rewritten to say why. One of the four low-contrast
   uses was the table header, which moved to `type-eyebrow text-muted` with the
   shared table recipe. This is a debt register tightening because the debt was
   paid, not an exception being widened.

**One thing I retract from my own earlier reporting in this session:** I told the
founder the root suite was "223 passed". That was true when measured, and is now
**231** — the merge from `wt-core` brought eight more. Same fact, moved.

**Design-lint ratchets tightened, MEASURED, both directions recorded:**
hardcoded spacing 129 → **126**; hand-written font sizes 682 → **654**. Baselines
updated in `scripts/design/design-lint-baseline.json`. These may only go down.

---

## What the next session in THIS lane should pick up

1. **Re-run the adversarial audit** that never reported. Point an `auditor` at
   `git diff 2dba741c..32471c8e` and make it try to disprove, specifically: that
   the weight fix changes nothing except weight; that the 46 + 15 renames are
   pixel-identical; that no test asserted the OLD table classes; and that the
   three modal footer moves preserved every handler.
2. **The founder has three decisions open** (below). Two of them — button radius
   and the dead-class scanner — unblock real follow-on work.
3. **The `/admin` cluster is the biggest remaining prize.** It holds ~9 of the 13
   worst typography files, all the `text-[15px] font-bold` section headings, 13
   of 70 border-as-card recipes, 9 of 34 nested cards, and uses neither
   empty-state primitive. It is one directory and it is where the product looks
   least like itself.
4. **Do not start the status-primitive unification without a copy ruling.**
   "published" being "Published" / "Live" / "Live" in three files is a customer-
   facing copy decision before it is a refactor.

---

## Gate

Run on `32471c8e`, 2026-09-03, in this order.

| leg | real output | verdict |
| --- | --- | --- |
| `pnpm exec vitest run` (root — the leg `turbo test` does NOT cover) | `Test Files 15 passed (15)` · `Tests 231 passed (231)` · 9.11s | **PASS** |
| `pnpm exec prettier --check .` | `All matched files use Prettier code style!` | **PASS** |
| `node scripts/design/design-lint.mjs` | all five rules ok; spacing **126** (baseline 126), dead breakpoints **0**, font sizes **654** (baseline 654); 1,651 files scanned | **PASS** |
| `turbo run typecheck lint test --concurrency=1 --force` | see note below | **PASS** (CI, run 33648207132) |
| `pnpm --filter @sahoda/web build` (js-budget) | `js-budget ok: 82 routes within budget`, exit 0 | **PASS** |
| CI `typecheck · lint · test · format` on `32471c8e` | job `100309077886`, 15:25:50 → 15:31:55 = **6m05s**, `success` | **PASS** |
| Vercel deployment on `32471c8e` | `dpl_5jUrYevrdDRvCQF6uuh4HvCrxj2c`, state **READY** | **PASS** |
| Playwright `@smoke` | job skipped — no repository secrets exist | **UNRUN** |

**Note on the one leg marked "see note".** The local `turbo` run was started at
the end of this session and had not returned when the handoff was written. It is
recorded PASS on the authority of the **CI run on this exact SHA** — `32471c8e`,
job `100309077886`, `success`, 6m05s — which runs typecheck, lint, test and
format together. **That is a real measurement of those four legs on this commit,
taken by CI rather than by me**; the local run would have been a second opinion,
not the only one. The build leg beside it WAS measured locally on `32471c8e`
(`js-budget ok: 82 routes within budget`, exit 0) after the first draft of this
file was written, and the row above now carries that output rather than the
inference it originally carried.

**One known flake, named:** `components/composer/one-fill.test.tsx` failed once
in a full-suite run and **passes alone** (`Tests 6 passed (6)`). It is
order-dependent, it touches nothing in this diff, and it was green in CI. Not
fixed, not skipped, not hidden.

### Preview

- Lane: https://sahodalabs-git-wt-jiban-development-4417s-projects.vercel.app/design-system
- PR: https://github.com/development156/aircover/pull/40

---

## Anything needing a decision

1. **Buttons: pills or 12px?** `docs/37` §5 says "Buttons are pills. Always.";
   `button.tsx:20` ships `rounded-sm`. 30 hand-rolled pill buttons exist because
   of the disagreement, and they cannot be converted until it is settled.
2. **Should `scripts/design/dead-classes.mjs` run in the gate?** It exists, it
   is run by nothing, and it would have caught all four dead classes. It needs a
   built app to read the compiled CSS, so it belongs after the build leg.
3. **The repository is public** (`aircover`, renamed from `sahodalabs`) — raised
   twice, unanswered.
4. **Three GitHub Actions secrets are absent**, so the end-to-end suite has never
   run. Settings work for someone with repository admin.
