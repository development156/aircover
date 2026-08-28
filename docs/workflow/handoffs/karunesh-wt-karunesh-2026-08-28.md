# Handoff — karunesh — wt-karunesh — 2026-08-28

**Branch** `wt-karunesh` at `34993fd7`, which merges `origin/wt-core` at `f528a85b`. Lane `wt-karunesh`. Pushed: yes, local and
`origin/wt-karunesh` match. PR [#22](https://github.com/development156/sahodalabs/pull/22), draft.

**This file is a BLOCKER REGISTER as much as a shipping report.** Ten product changes landed and are
green here; every one of them is stuck behind infrastructure this lane cannot reach. What the
advisor needs is the list below, in order of who can act.

**The headline for whoever merges:** the composer was rebuilt twice in one day, on two founder's
rulings — first into a gated three-step sequence, then into a Meta-ads-manager layout with the
three parts of a post listed down the side. **Seventeen e2e specs moved with it and NONE of them
has been executed**, because Playwright cannot reach the network from this sandbox. That is the
single largest unverified surface this lane has ever handed over.

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
| `next build` + `js-budget.mjs`, at `8ad40f19` | **PASS** — 81 routes within budget, `/posts/[id]` 32.5 kB / 286 kB first load |
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

### The composer became a map, and then a list of things that were not watched

**The Meta-ads-manager layout, founder's ruling with a screenshot.** The three
parts of a post are listed down the left (`composer-rail.tsx`) and the one being
worked on fills the right. Not a wizard: no Next, no Back, nothing confirmed,
and coming back to the words from the send panel is one press. **Not a tab strip
over the versions either** — part two still holds every chosen platform's card
at once, which is the one thing this product does that its competitors do not.
The chosen platforms nest under part two the way ad sets nest under a campaign.

`step-section.tsx` retired into it; every claim it held moved rather than being
deleted, except one — "an OPEN part must not look dimmed" — which an adversarial
pass caught missing and which is now guarded.

**Seventeen browser specs moved with it**, because what was one long page is now
three views: a locator for a version card or the send panel is not slow on the
wrong part, it is EMPTY. `openPart` in the fixture is the one place that knows
how to get there, and it asserts the row is unlocked first, because
`aria-disabled` is **not** an actionability barrier in Playwright — a click on a
refused row succeeds, does nothing, and fails thirty seconds later naming the
wrong thing.

**What the adversarial pass found, all of it green beforehand:**

| Finding | Why it stayed green |
| --- | --- |
| The bar's Save moved nothing on the **second** press | The whole mechanism was `window.location.hash = 'finish'` plus a `hashchange` listener, and assigning a hash that is already set **fires no event**. Three mutations of that path left the suite green. The bar now asks the composer directly; the listener is gone rather than kept beside it. |
| Two journeys pressed the **rail row** instead of the button | The row reads "Send it — Schedule it, or send it now", so `/schedule/i` matches the row first. Both journeys photographed a schedule that never opened. |
| A part could render another part's contents | Nothing asserted a part does NOT contain the other two. |
| The rows could render in the order 2, 3, 1 | Every assertion found rows by the `data-rail-step` attribute, never by position. |
| An open row could be dimmed as if refused | Only the locked case was asserted. |
| The line under each title could be swapped | Titles were pinned; blurbs were not. |
| The empty versions pane told a reader in step 2 to go to step 2 | The sentence names a PLACE, and it has now been wrong twice in opposite directions. The guard is no longer the wording: it asserts the thing pointed at is on the same screen and really is above it. |
| "Nothing goes out until a channel is connected" to somebody who had connected three and picked none | One branch for two different nothings. |
| Pressing a rail row announced nothing to a screen reader | The panel was an unnamed `div`; `aria-current` was the only signal, back in the rail. |
| The design audit and the flow-frames camera went blind | Both photographed part one. The frame counter that exists to catch "nothing ran" never moved, because one frame was still being written. 18 → 19 in the same commit. |

**A known coverage gap, deliberately left:** `no-impossible-remedy.spec.ts` and
the UX route sweeps walk `/posts/new` and now read only what part one renders.
On a blank post that is nearly everything — the two locked rows carry their
remedies on that screen — but the picker and the send panel are outside those
detectors until the sweep learns to walk parts. Named here rather than papered
over.

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

## What was NOT done, and why

- **Playwright, at all.** Chromium in this sandbox cannot complete an outbound HTTPS request
  (measured six ways, REQUESTS §25) and every `@smoke` spec signs in through Clerk. The 17 specs
  reordered for the composer rebuild are **UNRUN, not passed.** They were changed by reading the
  DOM and the unit tests. Two adversarial passes swept all 75 e2e files for locators pointing at a
  part the page no longer shows and found two misses, both fixed; neither pass could execute them
  either.
- **Per-platform PHOTO selection.** Asked for as "image segregation" in the platform card. Not
  built: `post_media.post_id` attaches a file to the POST, and the publish path reads it from
  there, so a per-platform chooser in the screen would promise a segregation the publisher ignores
  — the "no mock success" rule. Everything else under that heading (each platform's own copy,
  hashtags, keywords, kind of post, and its own reading of the same files) already exists and is
  now grouped in part two. **This needs a decision, not more code:** it is a `packages/publishing`
  change as well as a screen change.
- **`live-guard.test.ts:31` in `@sahoda/db`.** Diagnosed above, deliberately not repaired: it
  guards a production-write incident and a wrong fix is worse than a known-red test.
- **The route sweeps were not taught to walk composer parts.** `no-impossible-remedy.spec.ts` and
  the UX sweeps read `/posts/new` and now see only part one. On a blank post that is nearly
  everything — the two locked rows carry their remedies there — but the picker and the send panel
  are outside those detectors until the sweep learns the rail.

## Shared surfaces touched

- **`apps/web/src/components/composer/step-section.tsx` — DELETED**, with its test. It had one
  caller (`composer.tsx`) and the rail replaced it. Every claim it held moved to
  `composer-rail.test.tsx`; the one that did NOT survive the move ("an open part must not look
  dimmed") was found missing by an adversarial pass and is now guarded. **Nothing outside this
  lane imported it** (`grep` over `src` and `e2e`: zero hits).
- **`apps/web/src/components/composer/finish-panel.tsx`** — gained an optional `labelledBy` and
  then lost it again within the day. It ships WITHOUT the prop: the panel names itself, as it did
  before. No constructor change either way.
- **`apps/web/src/components/composer/commit-bar.tsx`** — new **optional** `onFinish`. Readers are
  unaffected; the bar still sets `#finish` as before. Passing it is what makes the Save button's
  second half work at all, so a caller that omits it gets the old defect back — `steps-wiring`
  guards the call site, not just the bar.
- **`apps/web/src/components/posts/send-controls.tsx`** — the "nothing goes out" line now branches
  on `channels.length` before `live.length`. Copy only, no signature change, but it is a SHARED
  sentence: `send-controls.test.tsx` pins both branches.
- **`apps/web/e2e/fixtures/compose.ts`** — new exported `openPart(page, 1|2|3)`, and `startPost`
  now leaves the page on **part two** rather than on one long page. Every spec that uses
  `startPost` inherits that position. **This is the constructor-shaped change in this lane:** a
  spec written against the old behaviour will not fail loudly, it will look at an empty part.
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

**None, all day.** No `packages/shared` change, no migration, no price, no ledger call, and nothing
under `packages/db`. `deletePost` was read and confirmed to touch no ledger, which is what licenses
the delete dialog's credit sentence. The composer rebuild is `apps/web` only: it stores nothing new
and changes no write path — the same `savePost`, `saveVariant` and publish calls, reached through a
different arrangement of the same screen.

The one thing that WOULD have been a contract change is named under "What was NOT done": per
platform photo selection needs either a new column or a `post_variants.extras` key **and** the
publish path in `packages/publishing` to honour it. Left alone deliberately.

## Guards written, and the mutation that proved each

**Forty-one mutations applied and watched go red across the day's ten changes.** MEASURED, each one
run and each one restored. The composer rebuild's own set, most recent first:

| Mutation | Guard that caught it |
| --- | --- |
| the composer stops passing `onFinish` to the bar | `steps-wiring` — the Save button's second half |
| the lock gate on the address removed | `steps-wiring` — an address is not a way past a lock |
| the arrival read of `#finish` removed | same file, the deep-link case |
| a part rendering another part's contents (two ways) | `steps-wiring` — each part holds its own |
| the panel's `role`/`aria-labelledby` removed | `steps-wiring` — the panel is a named region |
| the rail rows rendered 2, 3, 1 | `composer-rail` — order, read off the DOM not the attribute |
| every row dimmed, so open rows look refused | `composer-rail` — an open part does NOT look unavailable |
| the blurbs swapped, part one offering to schedule | `composer-rail` — each row says the right thing |
| the `<nav>`'s name removed; `<ol>` → `<div>` | `composer-rail` — a named list of three |
| `aria-controls` removed from the rows | `composer-rail` |
| locked rows navigating anyway | `composer-rail` + `steps-wiring` |
| `aria-disabled` removed | `composer-rail` |
| the send note stops telling the two nothings apart | `send-controls` |
| the finish heading pointing at a missing id; the heading removed | `finish-panel` + `steps-wiring` |
| the latch made a no-op, and made to shrink | `composer-steps` + `steps-wiring` |

**Three of those survived their first attempt and are the ones worth reading**: `onFinish`, the
lock gate and the arrival read all stayed green under a test that looked correct, because
`savePost` was mocked as a bare `vi.fn()` — it resolves to `undefined`, `use-autosave` reads `.ok`
off it, the save path throws, and every assertion about what happens AFTER a save was passing for
an unrelated reason. Fixed by giving the mock a real shape; only then did the three go red.

The two from earlier in the day that proved my own guards **worthless** before they were fixed:

- `className.toContain('bg-primary')` passed with the button on `variant="destructive"`, because
  destructive carries `hover:bg-primary`. Substring match on a token list. Now splits on whitespace.
- The failed-delete test used `toBeVisible()`, which passes in jsdom with the dialog still open over
  the message. MEASURED in real Chromium: `elementFromPoint` over the error returns the `<dialog>`
  and `focus()` leaves `activeElement` as the dialog. Now asserts the dialog is **gone**.

Both were found by an adversarial pass, not by me. jsdom's missing top layer is the general trap:
any `<dialog>` assertion that means "the user can see and reach this" is not testable in jsdom.

## Anything retracted

- **The turbo strict-mode claim above.** State what was measured, not what was inferred — I
  inferred that one from three runs that happened not to have the variable set.
- **"Locked steps are refused by `inert`."** Written into `step-section.test.tsx`'s own comment and
  wrong in this runtime: **jsdom implements no `inert` behaviour at all** — MEASURED, a button
  inside an `inert` subtree still takes focus and still fires its handler. `aria-hidden` was doing
  the work the comment credited to `inert`. The claim was corrected in the same commit, and the
  rail replaced the mechanism entirely a few hours later.
- **"The e2e reordering is complete."** Claimed after the first sequence commit; an adversarial
  pass found `date-field-theme.spec.ts` pressing a step-three button on a blank post, and three
  waits for "Post saved" that were already true when they were reached. Both fixed in `43f27986`.
  The lesson is in the file's own header: it carries **no `@smoke` tag**, so nothing in the gate
  would ever have reported it — the second time that same file has been broken invisibly.

## What the next session in THIS lane should pick up

1. **The `@smoke` leg, before anything else, on a machine with a normal network.** Dispatch the
   `smoke` job on `.github/workflows/gate.yml` by hand. Seventeen specs were rewritten for a screen
   that is now three views; they are reasoned, not observed. **If one thing from this lane gets
   verified, make it this.**
2. **Then nothing else, until the runners are back.** Ten changes are queued behind a gate that
   cannot start.
3. Then `live-guard.test.ts:31` — repair the assertion to test its own name (spy on the loader or
   snapshot `process.env` across the import), stop the credential printing, and prove it by deleting
   the `if (LIVE)` wrapper around `loadEnv` and watching the repaired test go red.
4. Then teach the route sweeps to walk the composer's three parts, so the picker and the send panel
   are inside the impossible-remedy and contrast detectors again.
5. Waiting on a decision, not on work: **per-platform photo selection** (see "What was NOT done").

## Gate

| leg | result |
| --- | --- |
| `turbo run typecheck lint test --force` (CI=1, no ambient DB URL), at `8ad40f19` | **PASS** — 27 successful / 27 total, 0 cached, 4m21s; `@sahoda/web` 5831 passed / 13 skipped |
| `vitest run` (root), at `8ad40f19` | **PASS** — 223 passed, 15 files |
| `prettier --check .` | **PASS** — all matched files |
| `pnpm install --frozen-lockfile` | **PASS** |
| `turbo run test --force` (this sandbox, ambient DB URL present) | **FAIL** — `@sahoda/db` live-guard only, diagnosed above |
| `test:smoke` (Playwright) | **UNRUN** — and this is the one that matters. `playwright test --list --grep @smoke` is unchanged in count, but **17 spec files were rewritten** for the composer rebuild and not one has executed. |
| CI `typecheck · lint · test · format` | **FAIL** — every attempt, 2-4s each, no log, no step run, no runner ever assigned (`runner_id: 0`, `runner_name: ""`). Four more on this lane's later commits, same shape. The count is deliberately not written as a figure: every push adds two, so a number here is stale before it is read. **The shape is the finding, not the tally.** It is also **not this lane's**: the advisor's own push to `wt-core` at 19:04 UTC (run 33202187815, head `f528a85b`) failed the same way, 3 seconds, and so did the same commit on `claude/advisor-qvz5wn` (run 33202255454). Different branch, different author, different diff, identical shape. |

## One more thing the next session needs to know

**`wt-core` is IN, as of `34993fd7`.** This paragraph previously said the merge had been left for
the next session. That stopped being the right call twenty minutes later, when the PR went
`dirty`: the trunk had moved to `f528a85b` and the branch no longer merged cleanly, and a
conflicted PR is work now, not later.

Two conflicts, both resolved by **keeping both sides**:

- `apps/web/e2e/connections-honesty.spec.ts` — this lane added the "and the withheld ones are NOT
  offered" half; `wt-core` rewrote the X-meter comment beneath it. Different claims, both kept.
- `ops/state/qa.pending.json` — generated by every vitest run. Took the trunk's.

**One trap worth recording.** Straight after the merge, `tsc --noEmit` reported two errors in
`studio` files this lane never touched — `Type '/studio/${string}' is not assignable to
RouteImpl<...>`. Not a real error: Next's typed routes come from `.next/types/**`, `/studio/[id]`
is a NEW route from the trunk, and the local `.next` predated it. **A build regenerated them and
the typecheck is clean.** A session that trusted that output would have "fixed" someone else's
working code.

Green on the merged tree, measured: turbo 27/27 forced with no ambient DB URL, `@sahoda/web` 6109
passed / 13 skipped, root 223 passed, prettier clean, `js-budget` **82 routes** within budget.

## In plain terms

Ten pieces of work are finished and pass every check I can run. None of them can move, because the
machine that is supposed to sign them off has stopped starting up — it dies three seconds in, twice
yesterday and three times today, without ever opening a file. That is not something anyone working
on the code can fix; it needs whoever holds the account to look at the checking service. Two smaller
annoyances are wasting everybody's time daily and are written up above with what to do about them.

The one thing I would not let through on my say-so alone: the page for writing a post was rebuilt
twice today, and the seventeen automated browser journeys that walk it were rewritten to match by
reading the code rather than by running them, because the browser on this machine cannot reach the
internet. Everything else here has been watched working. **Those have not**, and they are the
checks that would catch the rebuild being wrong for a real person.
