# Handoff — karunesh — wt-karunesh — 2026-08-28

**Branch** `wt-karunesh` at `f096f68c`. Lane `wt-karunesh`. Pushed: yes, local and
`origin/wt-karunesh` match. PR [#22](https://github.com/development156/sahodalabs/pull/22), draft.

**This file is a BLOCKER REGISTER, not a shipping report.** Three product changes landed and are
green here; every one of them is stuck behind infrastructure this lane cannot reach. What the
advisor needs is the list below, in order of who can act.

## The one that blocks everything: the gate never starts

**MEASURED.** `typecheck · lint · test · format` has failed three times on `f096f68c`, and not one
attempt executed a step.

| run | attempt | started | completed | elapsed |
| --- | --- | --- | --- | --- |
| 33168169294 | 1 | 11:42:32Z | 11:42:36Z | **4s** |
| 33168171652 | 1 | 11:42:32Z | 11:42:36Z | **4s** |
| 33168171652 | 2 | 11:53:45Z | 11:53:48Z | **3s** |

The same job took **10m32s** on `66eee96a` at 11:03Z, forty minutes earlier, and its own header
records 11m31s cold. `get_job_logs` returns **HTTP 404** for all three; the check run's
`output.title`, `output.summary` and `output.text` are all empty strings. There is no log because
nothing ran.

Ruled out here, on `f096f68c`, with `CI=1` and `SUPABASE_DB_URL` unset so the environment matches
the runner's rather than this sandbox's — all forced, so none is a cache replay:

| leg | result |
| --- | --- |
| `vitest run` (apps/web, after the composer sequence) | **PASS** — 5805 passed, 13 skipped |
| `next build` + `js-budget.mjs` (after the composer sequence) | **PASS** — 81 routes within budget |
| `CI=1 turbo run typecheck lint test --concurrency=1 --force` | **27/27 tasks**; `@sahoda/web` 5746 passed, 13 skipped |
| `pnpm exec vitest run` (root — the leg the gate runs separately) | **223 passed**, 15 files |
| `prettier --check .` | clean |
| `pnpm install --frozen-lockfile` | clean, no lockfile drift |

**One re-run spent, per the rules, and it died identically.** Standing-down comment posted once
(`issuecomment-5452199532`). No second comment, no further re-runs from this lane.

**This is the second outage in two days** — `girija-wt-girija3` and two others recorded ~15 hours
with zero runners on 27 August and called it overdue then. **Needs account access: Actions billing
or usage limit.** Nobody in a lane can do this.

## The `@sahoda/db` live guard, still red here, still not fixed

`packages/db/tests/live-guard.test.ts:31` is named *"does not read the repo-root .env while the flag
is absent"* and asserts `ENV.dbUrl === ''`. Those are different claims: `helpers/env.ts:37` also
reads the ambient `SUPABASE_DB_URL`, which `scripts/cloud-setup.sh` now provisions. Its failure
**prints the live Postgres password**, because it diffs the URL against `''`.

Unchanged since yesterday's handoff, and one thing in that handoff is now **RETRACTED**: I wrote
that turbo's strict mode strips the variable so it only fails when `packages/db` is run by hand.
**It failed under turbo today.** It passes on CI, which has no ambient URL — the `checks` job
declares no env block. So the real rule is "fails wherever `SUPABASE_DB_URL` is ambient", which is
this sandbox and not the runner. The safety property is intact throughout: `SAHODA_ALLOW_LIVE_TESTS`
is unset, `loadEnv` never runs, `hasLedgerEnv` and `hasRlsEnv` are false.

Still the next session's first job, and still wants its own reviewer.

## The browser leg, on this box

`sandbox-probe` read `NO_BROWSER` at kickoff. `127b29c4` (this lane, earlier) installs one, and it
works for direct measurement — I drove Chromium 1194 at `/opt/pw-browsers/chromium-1194` for the
tile and dialog geometry below. **The @smoke suite still cannot run**: every spec signs in through
Clerk and this sandbox's Chromium cannot complete an outbound HTTPS request (REQUESTS §25).

So `Playwright @smoke` is **UNRUN, not passed**, in both places — here, and on the PR, where the
`checks` job reports it `skipped` by design. Nothing in this lane has been smoke-tested. The
`smoke` job on `gate.yml`, dispatched by hand, is where that happens.

Note for whoever runs it: `playwright.chromium.executablePath()` resolves to
`chromium_headless_shell-1228`, which is not what is installed. Pass
`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`.

## Two smaller traps, both costing time repeatedly

**`ops/state/qa.pending.json` is rewritten by every vitest run** and the pre-commit hook then
refuses the commit for having it staged. `wt-divas2` reverted it **twelve times in one session**;
I reverted it five more today. REQUESTS §18 has the history. It is noise, not damage, and it has
now cost two lanes real time — worth someone deciding whether the QA writer should be off under
`vitest`, or the file gitignored.

**A commit message written inline with backticks gets eaten by the shell.** `ae95b696` lost four
phrases that way (`compact`, `overflow-hidden`, `hidden`, `next build`). The code is unaffected and
I did not force-push a pushed commit to fix prose. Use `git commit -F <file>`.

## What shipped, so the advisor knows what is waiting

| Change | SHA | Covered by |
| --- | --- | --- |
| `/connections` stops offering telegram, tiktok, slack — filtered at the offer, `CONNECTABLE` untouched so an existing connection still renders | `f3efa816` | `catalogue.test.ts` ×3 |
| `/posts` list becomes a grid of square tiles, 8 before a fold, "Show N more" | `ae95b696` | `post-grid.test.tsx` ×7 |
| Delete moves from an inline row that overflowed the tile to the shared `Modal` | `f096f68c` | `delete-post-button.test.tsx` ×11 |
| Draft tiles show the photos attached to them, with a signed preview and an honest marker when signing fails | `9a4d0b0f` | `media-peek.test.tsx` |
| Saved-time: relative under 24h, `DD/MM/YYYY, h:mm AM/PM IST` over it | `36ef29a4` | `saved-at.test.ts` |
| Connection icons are each platform's own; the composer stops offering a channel nobody can connect, without withholding one a workspace already holds | `4e0b5b8e` | `channel-picker.test.tsx` |
| "Improve this copy" becomes "Rewrite this" | `3f424f82` | `improve-copy.test.tsx` |
| **The composer is a three-step sequence: write, choose where it goes, send it. A step nobody has earned is visible, dimmed, `inert`, and says why** | `681fd7c1` | `composer-steps.test.ts` ×11, `step-section.test.tsx` ×6, `steps-wiring.test.tsx` ×10 |
| The adversarial pass on that: one missed spec, three waits that waited for nothing, an unguarded accessible name, a pre-existing flake | `43f27986` | same three files plus `finish-panel.test.tsx` |

### The composer sequence, in more detail

- **Rules live in `lib/posts/composer-steps.ts` and nowhere else**, so they are testable without a
  screen. `step-section.tsx` refuses a step with `inert` **and** `aria-hidden` **and** dimming.
  Pointer-events alone would let a keyboard user tab into a control that looks unavailable and is
  not. **jsdom implements no `inert` behaviour at all** — MEASURED, a button inside an `inert`
  subtree still focuses and still fires — so in this runtime `aria-hidden` is what makes the button
  unreachable by role. Both attributes are asserted on the same element; whether a real browser
  honours `inert` on this markup is an end-to-end question and is **not** answered by the suite.
- **A step already reached does not shut under the cursor.** Emptying the body and then unticking
  the last channel would otherwise trap someone mid-edit. That is a latch in `composer.tsx`, a ref
  written during render — safe only because it is monotone: a discarded render can open a step
  marginally early, never shut one. It survives a re-render with a different post, and so do
  `postId`, `postIdRef` and `existingVariantChannels`: **the composer has always required a remount
  on a post change.**
- **The whole e2e composer surface had to be reordered.** Every journey ticked a channel and then
  typed, into a step that is now inert, which fails as a bare 5s click timeout naming nothing.
  Thirteen `@smoke` files, `golden-path` among them. The fixture and seven specs now write first.
  The pick is a SECOND save rather than part of the row's creation, so it is waited on with
  `expectPostSaved` — a lone "Post saved" is already true by then, because the composer only
  rewrites the address once the first save is confirmed.
- **`date-field-theme.spec.ts` was missed by the first pass** and pressed a step-three button on a
  blank post. It carries no `@smoke` tag, so nothing in the gate would ever have reported it. Its
  own header already records being unrunnable for a similar reason once before. **Same file, same
  omission, twice.**
- **`finish-panel.test.tsx` was flaky before this lane touched it**: its two lazily imported halves
  blew testing-library's one-second default. MEASURED 2 failures in 8 runs, 0 in 10 after the
  timeout was raised. While it fails, the two at-rest assertions it calibrates prove nothing.

## Shared surfaces touched

- **`apps/web/src/components/ui/modal.tsx`** — hard-coded `id="modal-title"` replaced with
  `useId()`. The dialog renders whether or not it is open, so N mounted Modals put N identical ids
  in one document and `aria-labelledby` resolved to the first: on /posts every tile's delete dialog
  announced the FIRST card's title. Nothing else in the repo referenced that id; all 15 call sites
  pass. **Readers only, no constructor breaks.**
- **`apps/web/src/components/posts/post-card.tsx`** — new optional `compact` and `liveElsewhere`
  props. Both default, so no call site breaks.
- **`apps/web/vitest.config.ts`** (from `ae95b696`'s lane, earlier today) — the non-CI worker cap is
  now a share of the machine. Changes how the web suite runs for **every** lane on a dev box. CI is
  untouched.

## Contract, migration or money

**None.** No `packages/shared` change, no migration, no price, no ledger call. `deletePost` was read
and confirmed to touch no ledger, which is what licenses the dialog's credit sentence.

## Guards written, and the mutation that proved each

Fifteen mutations applied and watched go red across the three changes. The ones worth the
advisor's attention are the two that proved my own guards **worthless** before they were fixed:

- `className.toContain('bg-primary')` passed with the button on `variant="destructive"`, because
  destructive carries `hover:bg-primary`. Substring match on a token list. Now splits on whitespace.
- The failed-delete test used `toBeVisible()`, which passes in jsdom with the dialog still open over
  the message. MEASURED in real Chromium: `elementFromPoint` over the error returns the `<dialog>`
  and `focus()` leaves `activeElement` as the dialog. Now asserts the dialog is **gone**.

Both were found by an adversarial pass, not by me. jsdom's missing top layer is the general trap:
any `<dialog>` assertion that means "the user can see and reach this" is not testable in jsdom.

## Anything retracted

The turbo strict-mode claim above. State what was measured, not what was inferred — I inferred that
one from three runs that happened not to have the variable set.

## What the next session in THIS lane should pick up

1. **Nothing, until the runners are back.** Three changes are queued behind a gate that cannot start.
2. Then `live-guard.test.ts:31` — repair the assertion to test its own name (spy on the loader or
   snapshot `process.env` across the import), stop the credential printing, and prove it by deleting
   the `if (LIVE)` wrapper around `loadEnv` and watching the repaired test go red.
3. Then the @smoke leg via the dispatched `smoke` job, because none of this lane has been through it.

## Gate

| leg | result |
| --- | --- |
| `turbo run typecheck lint test --force` (CI=1, no ambient DB URL) | **PASS** — 27/27 |
| `vitest run` (root) | **PASS** — 223 |
| `prettier --check .` | **PASS** |
| `pnpm install --frozen-lockfile` | **PASS** |
| `turbo run test --force` (this sandbox, ambient DB URL present) | **FAIL** — `@sahoda/db` live-guard only, diagnosed above |
| `test:smoke` (Playwright) | **UNRUN** |
| CI `typecheck · lint · test · format` | **FAIL** — 3 attempts, 3-4s each, no log, no step run |

## In plain terms

Three pieces of work are finished and pass every check I can run. None of them can move, because the
machine that is supposed to sign them off has stopped starting up — it dies three seconds in, twice
yesterday and three times today, without ever opening a file. That is not something anyone working
on the code can fix; it needs whoever holds the account to look at the checking service. Two smaller
annoyances are wasting everybody's time daily and are written up above with what to do about them.
