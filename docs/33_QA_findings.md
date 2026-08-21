# QA findings — raw log (wt-qa, off wt-integrate 196c0fd)

Production build, `next start -p 3238`. Real Chromium via Playwright. Fresh Clerk user per journey.

## Scope caveat (goes in the report header)

This tree is BEHIND four lanes. Measured `git diff --stat wt-integrate..<lane>`:

| lane | commits ahead | files | what it changes |
|---|---|---|---|
| wt-onboard2 | 8 | 37 files, +6804 | **rebuilds /onboarding entirely** (+3870 on the route, +2242-line onboarding.css) |
| wt-media | 10 | 37 files, +4540 | per-channel crops, asset_derivatives |
| wt-webhooks | 10 | 33 files, +4467 | Zernio webhook receiver, store-backed inbox |
| wt-remix | 7 | 55 files, +6451 | /remix and /leads built for real |

So journey 1 below walks the OLD onboarding, and Remix/Leads/Loop show as "Soon"
here because on THIS tree they are.

---

## J1 — THE NEW USER (1440)

### J1-A · `img alt="'s logo"` — user-menu avatar  [DOWNGRADED after measuring]
MEASURED: `document.querySelector('img[alt*="logo"]').alt === "'s logo"` on every
signed-in screen, with and without a workspace.
BUT it is NOT ours and NOT exposed. The img carries
`class="cl-avatarImage cl-userButtonAvatarImage"` — it is inside Clerk's `<UserButton />`
(topbar.tsx:135) — and the wrapping button has `aria-label="Open user menu"`, which MASKS
the img's alt in the accessible-name computation. A screen reader hears "Open user menu",
never "apostrophe s logo".
Severity LOW, third-party, cosmetic. NOT fixed here — it needs Clerk config, not our markup.
Originally logged MEDIUM; corrected once the owner and the name-masking were measured.

### J1-B · Sighted user told "nothing failed"; screen-reader user told "could not be read"
MEASURED: two `.sr-only` spans, 1x1px, reading
"Your credit balance could not be read" / "Your role in this workspace could not be read".
Visible text is a neutral `···`. Same screen's main pane reads
"Nothing has failed and nothing was charged; there is simply nothing to show until one exists."
The user has no workspace — nothing failed. Severity MEDIUM. Frame: j1-02.

### J1-C · Connections / Wallet / Settings below the sidebar fold at 900px
MEASURED: nav scrollHeight 938 vs clientHeight 718 → 220px hidden.
`a[href="/connections"]` rect.top = 880 in a 900px viewport.
A new user's next job is connecting a channel. Severity MEDIUM (IA). Frame: j1-02.

### J1-D · Onboarding step 1 fabricates a guess from an empty box
Empty textarea. Card asserts in bold: "You're a service business in everyday consumer
goods and services, in India." Immediately below, grey: "We could not read any of this
from your words — pick below." Three chip groups pre-checked, each badged "guessed"
(service / general consumer / India).
The engine is FINE — typing the bakery sentence moved it to local_presence/food/IN and
both the false line and the "guessed" badges disappeared.
Defect is ONLY the empty state. Severity HIGH (honesty). Frames: j1-03 (empty), j1-04 (typed).

### J1-E · Raw unstyled `<input type=file>` in the middle of a designed form
"Choose file | No file chosen" browser chrome on onboarding step 2.
Severity MEDIUM (presentational). Frame: j1-05.

### J1-F · Placeholders written as finished sentences
Step 2 "Or just tell us": placeholder = "We bake sourdough and celebration cakes on
Prabhat Road, and nothing is bought in."
Step 3 "refusal": MEASURED `value === ""`, `placeholder === "We will not say homemade
when we did not make the base."` — 12 words, ends in a full stop — directly above a
DISABLED primary button.
An empty required field looks answered while the button that needs it looks broken.
Severity MEDIUM. Frames: j1-05, j1-08.

### J1-G · "Continue without it" — the only remedy, styled as caption text
MEASURED: BUTTON, bg rgba(0,0,0,0), color rgb(87,87,86), border 0px, no underline,
height 28px, cursor default. Severity MEDIUM. Frame: j1-06.

### J1-H · PRODUCT-WIDE: every `<button>` shows an arrow cursor, never a hand
MEASURED on /onboarding: 4 interactive elements, 1 `pointer` (an `<a>`), 3 `default`
(all `<button>`). Mechanism: Tailwind v4 (`^4.3.3`) Preflight dropped the
`cursor:pointer` that v3 added to buttons; nothing in globals.css restores it.
Shipped stylesheet (67KB) contains exactly ONE `cursor:pointer` declaration.
Severity MEDIUM, one-rule fix, product-wide reach. To be quantified across routes.

### J1-I · Resolve: a multi-second AI call with ZERO pending state
Clicked "Resolve my brand". Screen pixel-identical: no spinner, no disabled button,
no text change, no navigation. So I clicked again.
NETWORK: `POST /onboarding` 200 OK **twice** (requests 88 and 90) — the action ran twice.
Severity HIGH. Frames: j1-09, j1-10 (identical).

### J1-J · "FIELDS FILLED 100%" above "Weak signal — inputs conflict"
The full-width orange bar is the largest, brightest element on the reveal screen and
reports 100%. Directly beneath it the same card says: "Customer persona, brand archetype,
voice details, and hook levers were all blank, so this Brand Brain relies on strong
inference from category norms ... rather than explicit founder signal."
100% measures whether boxes contain text, not whether any of it came from the user.
Also "inputs conflict" is wrong for this case — inputs were SPARSE, not conflicting.
Severity HIGH (honesty). Frame: j1-11.

### J1-K · 5 fields truncated at 1440px on the reveal screen
MEASURED scrollWidth vs clientWidth:
- Pain point: 154px over, 75% shown
- Fear: 145px over, 76% shown
- Wants to become: 84px over, 84% shown
- Sample hooks 1: 84px over, 84% shown
- Sample hooks 2: 12px over, 97% shown
Single-line `<input>` used for sentence-length content, while sibling fields of similar
length use `<textarea>` and wrap correctly. Severity MEDIUM. Frame: j1-11.

### J1-L · The read-back mirrors the user's own sentence verbatim
Step 2 "Here is what we read from what you told us" / "Check it is yours" shows the
typed sentence unchanged, ~200px below the box it was typed into. Vacuous for the typed
path (meaningful for link/PDF). Severity LOW. Frame: j1-07.

---

## WINS (for the "three best" section)

- **W1 · The empty-input error on step 2.** Names what's needed, says "Nothing was charged
  — reading is always free" unprompted, spells out the consequence of skipping, and gives
  a working escape. Frame: j1-06.
- **W2 · "One question" is tailored and human.** For a bakery it generated a Saturday
  regular asking for "homemade" on a bought-in base. Then turned the answer into a held
  rule on the spot: "Never call a cake handmade if the sponge came from a mix." Frames: j1-08, j1-09.
- **W3 · The reveal's content is genuinely good and clearly derived.** "Never say:
  handmade (when not literally true)" traces straight to the user's one refusal.
  Honest about colour: "We found no colour to take, so the app keeps Sahoda's default." Frame: j1-11.
- **W4 · Cost labelling is everywhere and honest.** "Read this · free", "Regenerate · free",
  "This one was free", "We charge for what Sahoda writes, never for working out who you are."

---

## NOT REPORTED — checked and cleared, with the measurement

- **Primary button "turns black".** It is the HOVER state. MEASURED with the pointer moved
  to `h1`: resting `backgroundColor === "rgb(255, 102, 0)"`. Designed, not a defect.
- **Sign-in page "has no form".** The first a11y snapshot showed only a logo, a tagline and
  an empty `alert`. That was Clerk pre-hydration, not a defect — the re-snapshot 90s later
  shows a fully labelled form. A snapshot timing artifact, not a finding.
- **Nine unnamed nav links** (a peer's earlier finding). NOT present on this tree: every
  main-nav link has an accessible name, and the "Soon" items correctly append
  ", not built yet". This is fixed.

### J1-M · RETRACTED — the autosave bar does NOT cover the "Send it" heading
FIRST READING: at scrollY=0, `document.elementFromPoint(headingLeft+20, headingTop+3)`
returned `P :: "No changes yet"`, with 15px of vertical overlap across 1000px.
RETRACTED. The bar is `sticky bottom-0`, and covering not-yet-scrolled content is what a
sticky footer DOES. The question that decides it is whether anything stays covered at the
END of the page. MEASURED, scrolled to the floor (scrollY 283 == maxScroll 283):
  · "Send it" heading at viewport top 602
  · `elementFromPoint` at its own top-left returns `H2 :: Send it` — the heading itself
  · the last interactive control: `covered: false`
Nothing is permanently covered and everything is reachable. My hit-test was live rather
than a screenshot, but taken at the wrong scroll position.
`commit-bar.tsx` even warns about this class in its own header (docs/27 §0: the mobile
bottom bar "was written up as a bug that did not exist"). Not a defect.

### J1-N · Native controls ship unstyled inside a designed product
Two instances: `<input type=file>` ("Choose file | No file chosen") on onboarding step 2,
and `<input type=datetime-local>` ("dd/mm/yyyy, --:--" + browser calendar glyph) in the
composer's Schedule field. Severity MEDIUM. Frames: j1-05, j1-13.

### J1-O · Every draft is "Untitled post", with no date on the card
MEASURED: 5 drafts in the list, ALL titled "Untitled post". No timestamp, no ordering cue.
TWO have byte-identical bodies ("Sourdough out of the oven at 7am sharp. Prabhat Road,
every morning.") — one carrying Instagram, one "No channels picked yet". Nothing on screen
distinguishes them or says which is newer.
The composer HAS a "Name this post / Only you see this" field; nothing ever prompts it.
Severity HIGH (the drafts list becomes unusable within one sitting). Frame: j1-15.

### J1-P · Picking a channel then leaving strands an empty draft forever
MEASURED: a row reading "Untitled post / No content written yet. / Instagram" persists in
Drafts. The composer's own comment says "opening a screen is not intent" — but choosing a
channel IS treated as intent and writes a row, so abandoning the composer litters the list.
Severity MEDIUM. Frame: j1-15.

---

## RETRACTED — with the measurement that justifies it

- **"The composer never adopts /posts/<id>, so work is lost on reload."** I first observed
  the URL stuck at `/posts/new` after "Post saved", and reloading gave a blank composer.
  RETRACTED. On two clean retries the URL adopts the id at **2.5s** after the first edit
  (`/posts/d421d335-…`, `/posts/dc8b30db-…`), by `history.replaceState` in
  `composer.tsx:130`, guarded on `autosave.status === 'saved'` — the mechanism works.
  A reload BEFORE adoption is honest too: MEASURED at 1.2s the status reads
  "Post not saved yet", which is true — nothing had been written.
  My original reading navigated away in the same instant the status text appeared, which is
  before the effect runs. The DUPLICATE DRAFTS are still real (see J1-O) — but the cause is
  that `/posts/new` always starts a new post and nothing is ever named, NOT a lost URL.

- **"The hero mascot is clipped by the card."** RETRACTED. MEASURED:
  `background-size: contain` (which cannot clip), box 475x190, source `/mascot/0.png`
  2048x983. The pedestal runs off the bottom of the SOURCE ARTWORK by design.

- **"The primary button turns black."** RETRACTED — it is the hover state.
  MEASURED with the pointer moved to `h1`: resting `rgb(255, 102, 0)`.

- **"The sign-in page renders no form."** RETRACTED — Clerk pre-hydration snapshot artifact.

---

## THE AUTOMATED SWEEP — 234 captures

39 routes x {1440, 1024, 390} x {light, dark}, production build, real Chromium.
Raw: `.qa/sweep.json`. Frames: `.qa/frames/` (gitignored, 25MB; regenerate with `.qa/sweep.mjs`).

| measure | result |
|---|---|
| captures | 234, **0 errors** |
| theme correctly applied | 234/234 |
| text regions measured for contrast | **10,982** |
| invisible text (luminance sd < 1.0) | **0 real** (12 candidates, all one closed `<details>`) |
| low-contrast text (sd < 4.0) | 0 |
| interactive elements with NO accessible name | **0** |
| console errors | **0** |
| horizontal overflow | **1 route**: `/design-system` at 390, 16px |
| navigation to networkidle | 1.7s – 2.4s (slowest `/brain/competitors` 2390ms) |
| enabled buttons with `cursor:default` (before fix) | **209** vs 38 pointer |

### The instrument was validated before any zero was believed
`.qa/validate-instrument.mjs`, against synthesised controls:
  white-on-white   sd 0      -> caught
  black-on-white   sd 45.05  -> far above
  #f2f2f2 on white sd 2.61   -> low band
Dark frames are genuinely dark: meanLuma 17–21 / 255.

### Two sweep results that were MY BUG, not the product's
1. **"8 invisible regions on /loop"** — `variance()` CLAMPED out-of-range boxes instead of
   rejecting them. Frame 1440x1017; boxes at y=1019–1103. Clamping sampled a 2px sliver of
   flat background => sd 0 => the exact signature it hunts. Fixed to reject; `outOfFrameBoxes`
   counted separately (164 across the run).
2. **"Truncation on all 234 captures"** — at 1024 it flagged 68–90 per route. Those are the
   COLLAPSED RAIL's nav labels ("Home", "Posts", "CREATE"), hidden by `max-wide:hidden`, whose
   clientWidth is ~0. Re-filtered to boxes wider than 20px, the real count at 1440 on
   `/connections` is 2: "Google Business Profile" 47% shown, "Facebook Pages" 75%.

### The 12 invisible-text candidates, resolved
All 12 (both themes, all three widths) sit inside ONE closed `<details>` on `/loop`, summary
"What each level means". MEASURED `insideDetails: true, detailsOpen: false` for every one.
A closed accordion is supposed not to paint. Not a defect.

### Touch targets at 390 — every candidate dissolved
28 flagged across 39 routes, 22 distinct:
  · most are INLINE links inside sentences ("the composer", "the overview") — 44px does not apply
  · `/wallet` plan radios: box 13x13, but the LABEL wrapping the card is **320x82** (`meets44: true`)
  · `/posts` "Untitled post" 91x20, but `elementFromPoint` at the CARD centre returns `A (inside a link)`
  · the only genuine sub-44 buttons ("Remove Instagram" 18x18) are on `/design-system`, an internal gallery
  · `INPUT "Add photos" 1x1` is a visually-hidden file input with a real label
Verdict: effectively clean. Measure the EFFECTIVE target, never the box.

---

## FIXES APPLIED — all verified in a real browser, fresh context (`.qa/verify-fixes.mjs`, 4/4)

1. `globals.css` — `cursor: pointer` restored for enabled buttons in `@layer base`.
   Verified 5/5 enabled pointer, 0/0 disabled pointer.
2. `absence-row.tsx` + `rail-foot.tsx` — new `NotYet` mark; the workspaces read now reports its
   OWN failure, so "no workspace yet" can never be claimed on a swallowed error.
   Verified: "Your credit balance starts once you create a workspace".
3. `intake-step.tsx` — no assertion over an empty input; the three "guessed" badges STAY.
   Verified asserts=false, guessedBadges=3, and typing still yields
   "You're a local presence in food, in India." + 2 regression tests, mutation-checked.
4. `customer-persona-card.tsx` — Pain point / Fear / Wants to become now `multiline`.

### A test pinned the old behaviour, and the test was RIGHT
My first cut also hid the "guessed" badges on an empty box. `intake-step.test.tsx` failed:
"Nothing typed: all three are defaults and must say so." Correct — the badge is how a default
admits to being one, and hiding it would make a pre-selected chip look confirmed. Only the BOLD
ASSERTION was the defect. Reverted the badge change and recorded why in the file.

### A ratchet caught the fix
`design-lint`: `intake-step.tsx` is baselined at 5 hand-written font sizes and my paragraph made
6. Fixed with the `type-body` step rather than by raising the baseline.

---

## A GATE FAILURE THAT WAS AN ARTIFACT, NOT A REGRESSION

First full gate run: **leg 3 (turbo-smoke) FAILED**, 149+ `✘` including
`no-truncated-labels.spec.ts` on /connections and /inbox, `shell-probe.spec.ts`, and —
the tell — `shell-probe`'s own **detector self-test**. A detector that cannot detect its own
synthetic fixture is not reporting a product defect.

ROOT CAUSE, from the WebServer log:
    ⨯ Error: Could not find the module "[project]/apps/web/src/app/(app)/error.tsx#default"
      in the React Client Manifest.
I had run `next build` (to serve a production build for the QA walk) into `apps/web/.next`.
The gate's smoke leg then runs `pnpm dev` — Turbopack — against that same directory, and dev
choked on a production manifest. Every page 200'd while rendering an error boundary, so every
DOM assertion failed at once.

PROOF: removed `.next`, re-ran the identical gate on the identical tree. **Zero `✘`.**

Two things worth carrying:
1. The repo already documents the reverse direction (a `next dev` run poisoning a later
   `next start`, in `playwright.config.ts`). BOTH directions are live. Anything that builds for
   production before running the gate must clear `.next` first.
2. I renamed `.next` to `.next.prod-aside` as a "safe" reversible move, and `scripts/lint.mjs`
   promptly linted the compiled bundles inside it — 10 new `console.log` violations from
   Next's and Clerk's own minified chunks. The ignore pattern covers `.next`, not `.next.*`.
   Moving a build artifact to a name outside the ignore glob puts it back in scope.

## THE GATE — 4 of 5 legs green; smoke cannot complete on this machine

| leg | result |
|---|---|
| 1 · turbo typecheck+lint+test | **ok** (83.5s) |
| 2 · vitest root | **ok** (2.7s) |
| 3 · turbo smoke | **FAILED** — see below |
| 4 · prettier --check . | **ok** (17.9s) |
| 5 · turbo build | **ok** (109.3s) |

Leg 3 failed on THREE full runs, each time because the dev server DIED mid-suite. The
failures are `page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:3238` in the
`signedIn` fixture — not assertions.

Proven causes:
- **Run 1** (156 ✘): `⨯ Could not find the module ".../(app)/error.tsx#default" in the React
  Client Manifest`. I had built for production into `apps/web/.next` to serve the QA walk; the
  smoke leg then ran `pnpm dev` (Turbopack) against that same directory. Clearing `.next` and
  re-running the identical gate on the identical tree gave **zero** ✘ until the next failure.
- **Run 2** (156 ✘): kernel OOM. `journalctl -k`:
  `Out of memory: Killed process 925281 (next-server) total-vm:42302680kB`.
  FOUR PEER WORKTREES were running their own dev servers at the time — wt-radar-ui,
  wt-knowledge, wt-radar, wt-playbooks (confirmed via /proc/<pid>/cwd). Not mine to kill.
- **Run 3**: same ERR_CONNECTION_REFUSED signature, no kernel OOM in the window — cause not
  isolated.

### CONTROLLED A/B — my changes are NOT implicated
Same two specs, same machine, back to back, dev server restarted between:

    BASELINE (all 8 of my files reverted with `git checkout --`)   6 passed   RC 0
    MINE     (all 8 files restored)                                6 passed   RC 0

`motion.spec.ts` and `every-section-loads.spec.ts` were among the failing set in the full run
and pass in isolation on BOTH trees. The full-run failures track the server dying, not the code.

### A REAL ORDERING HAZARD IN THE GATE ITSELF
Stage 5 (`turbo build`) leaves a PRODUCTION `.next`. Stage 3 (`turbo smoke`) runs `next dev`
against that same directory. So a second consecutive `pnpm gate` meets the run-1 condition.
MEASURED both directions in this session. `playwright.config.ts` already documents the reverse
(a dev run poisoning a later `next start`); this is the same hazard the other way round, and it
is inside the gate's own stage order.
