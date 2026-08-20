# 29 · The screens no audit had ever seen — report

**Date:** 2026-08-20 · **Branch:** `wt-screens`, cut from `wt-redesign` @ `af4c734`
**Scope:** the routes docs/27 listed as "not sampled" and docs/28 did not reach.

**Every claim below is MEASURED unless it is marked INFERRED.**

---

## 0. What the scope actually was, and what it excludes

docs/27 §0 names its own gap: "Not sampled (23 of 39 routes)". docs/28 closed eleven of
them. The remainder is this lane.

**`/admin/*` (6 routes) is excluded and this report does not cover it.** docs/26 is the
customer-facing system and `wt-admin` owns that console. Saying so because a silent sample
reads as full coverage, which is docs/27 §0's own discipline.

**`/sign-in`, `/sign-up` and `/onboarding` were not photographed, on purpose.** The audit
fixture is signed in and its seed bootstraps a workspace, so Clerk redirects both auth pages
away and `/onboarding` renders its completed state. The camera would file `/home` as evidence
of the sign-in design. That is the reason docs/27 gave for leaving the two `/inbox` detail
routes alone, and it applies unchanged. Auditing them from code is honest; auditing them from
a redirect is not. They are still owed a fixture whose user is in the state the screen exists
to serve.

---

## 1. The camera could not point at the most important screen

`ROUTES` in `e2e/design-audit.spec.ts` was a list of literal paths, so the harness could only
ever shoot a STATIC route. That silently excluded **`/posts/[id]`** — the per-channel variant
editor, ~7,500 lines of components, and the screen carrying the one thing this product does
that its competitors do not: one body per channel, published independently, `publish_status`
per variant.

docs/27 filed it under "not sampled". docs/28 did not reach it. **Nothing had ever
photographed it.**

`DYNAMIC` resolves a path after the seed, because the id does not exist until Postgres mints
it. The resolver picks the post with the MOST channels — a single-channel post photographs the
one arrangement in which per-channel editing looks like ordinary editing. A resolver returning
`null` skips and says so; it must never fall back to a literal, because `/posts/undefined`
renders the 404 and a 404 filed in the audit directory is evidence of a design that does not
exist.

Eight static routes were added for the plainer reason that nobody had added the row:
`/create`, the four `/brain` sub-routes, `/settings/profile`, `/settings/integrations`,
`/design-system`.

**The run now counts frames and fails when none reached the disk.** docs/28 §0 records this
exact harness reporting `1 passed` having written ZERO PNGs — 28 navigations timed out at load
41.6, every failure was swallowed by the `catch`, and the green line was read as evidence that
frames existed. The assertion is about the camera, not about a design, so the spec still
asserts nothing a screen could fail.

**Frames taken:** 12 before (`/posts/[id]`, `/create`, `/create/post` × 2 widths × 2 themes),
0 failed; 4 after for `/posts/[id]`, 0 failed. Counted on disk, not read off the pass line.

---

## 2. What the first frame of `/posts/[id]` showed

### 2.1 The most common refusal in the product was the vaguest message

MEASURED on `design-audit-before/light-1440/posts-detail.png`: a real Instagram variant with no
photo rendered

> This does not meet the channel rules. Review it before publishing.

The engine had said `instagram needs at least one photo — there is no text-only post.` — a
sentence naming the channel, the problem and the reason. The copy layer threw it away.

`KNOWN_CODES` in `lib/posts/violation-copy.ts` listed six codes. The engine emits eight. An
unlisted code does not fail loudly: `describeViolation` returns `UNKNOWN` and the generic
sentence. **Instagram cannot post text on its own**, so the single most-seen error in the
product was the one naming nothing the writer can act on. `MEDIA_ASPECT` was missing the same
way.

**Why twenty green tests did not catch it.** `REAL_VIOLATIONS` is a record keyed by the codes
somebody remembered, each entry driven from genuine engine output. That proves every LISTED
code renders well and can never notice a code nobody listed — a per-code allowlist testing a
per-code allowlist. The module's docstring promised "engine drift fails that test loudly":
true for a REWORDING, which the anchored shape patterns catch, and false for an ADDITION. The
docstring is corrected in place, because it is the sentence a reader would trust.

The completeness guard reads the engine's SOURCE and extracts every `code:` literal, then
asserts none degrades to generic text. Text rather than types, for the reason
`design-lint.mjs` gives for the same choice — the thing being checked IS a string literal, and
`ConstraintViolation.code` is deliberately a plain `string` so untrusted upstream input has
somewhere to land. It also asserts the extraction found at least eight codes, because a guard
that reads zero would pass by finding nothing.

**PROVED BY MUTATION:** removing `MEDIA_REQUIRED` from `KNOWN_CODES` turns it red with
`these engine codes have no copy and fall back to generic text: expected [ 'MEDIA_REQUIRED' ]
to deeply equal []`. Restored, 22/22 green.

Two sibling assertions read `toBe(6)` — a fixture count wearing a distinctness test's name. A
nine-code engine with two duplicate sentences would have read 9 and passed. Now compared
against the list length, which is what they are called.

### 2.2 A channel that was never written to said "Saved"

The save control's label was chosen by `!dirty`, and a channel with no variant row seeds as
`{ body: '', dirty: false }` (`use-variants.ts` EMPTY). So an untouched channel rendered the
word **"Saved"** — directly beneath this panel's own sentence "Nothing drafted for this channel
yet." One screen, two contradictory claims, and the wrong one was about the database.

It was also a `<button disabled>` standing in for state. docs/26 §10.2: a disabled button is
still announced as a button, so a reader is offered "Saved, button", takes it, and nothing
happens. That is the defect docs/28 removed from `/planner`, walking through in a second file.

Now: an action when there IS something to save, a plain status when there is not, and nothing
at all when nothing was ever written — the sentence above already covers that case, and saying
it twice is what `/home` was demoted for. The companion "Not saved yet" goes for the same
reason: an ENABLED "Save variant" already is the unsaved signal.

`variant-panel.test.tsx` is new and was written RED: 4 failed / 4 passed before the fix, 8
passed after. It asserts the CLAIM ("Saved" is absent on an untouched channel), never a class.

### 2.3 A button label that was six flex items

`Button` is `inline-flex … gap-[6px]`, and a flex container wraps every run of bare text in its
own anonymous item. Written as loose children, the generate label was six items — icon,
"Generate variants for", the count, "channels ·", the cost, "credits" — with 6px at every seam
and each item free to wrap inside itself.

MEASURED on `design-audit-before/light-390/posts-detail.png`: it rendered
`Generate variants / for | 3 | channels / · | 3 | credits`. **Every box was the right size and
the sentence was unreadable** — the failure mode docs/26 §12 names ("read rendered text, not
box sizes").

`onboarding/brand-card.tsx` already carries this fix and its reasoning in a comment. This is
the sibling that walked through.

### 2.4 The variant tabs were 16px under the touch floor

`h-7` is 28px against docs/26 §9's 44px, and these tabs are how a phone user reaches any
channel but the first — the most important controls on the screen to have missed it.

The file's docstring claimed "there is no tabs primitive in the repo", citing docs/08, which
docs/26 supersedes. `components/ui/tabs.tsx` exists. It **cannot** be used here, and that is
worth writing down rather than leaving as a stale claim: `TabItem` requires an `href` and
renders `<Link>`s, because §10.2 rules that a tab changing the URL must be a link. These tabs
change no URL — they switch a pane holding UNSAVED text, so reload survival, the property
§10.2 wants links for, is precisely the event that would destroy the writing.

### 2.5 Three primitives that had been re-answered locally

Hand-rolled `<select>` → `Select` (the local copy set `text-[14px]`, not a step on the scale,
and carried no touch floor). Hand-rolled hashtag pills → `Chip`, which §10.1 defines as data
the USER put there. Hand-built empty paragraph → `CardEmpty`. Every claim kept verbatim.

### 2.6 Verified in a real browser, both themes

MEASURED on `design-audit-after/{light,dark}-390/posts-detail.png` and `…-1440/…`: the button
renders "Generate variants for 3 channels · 3 credits" on one line; the refusal reads
"Instagram needs at least one photo — there is no text-only post."; the disabled pill is gone
and "Saved" is plain text (true on that channel — it has a stored body); the tabs are visibly
taller.

---

## 2b. `/create` and `/create/post` — photographed, audited, NOT changed

Both have frames at two widths in both themes. Neither was restructured, and saying so plainly
because §0 promises coverage and a reader would otherwise assume silence meant nothing was
found.

`/create/post` was **sampled by docs/27** and named "the best screen in the app" — the
solid-versus-dashed channel treatment reads at a glance and survives greyscale. MEASURED on
`light-390/create-post.png`: the stepper, the four real channels and the five coming-soon tiles
all hold at 390 with no overflow. Audited, not touched, which is what docs/27's assessment
earns it.

**`/create` has two findings, recorded and not acted on:**

1. **The one real option does not lead.** `Post` is the only tile that can be pressed and it
   sits as 1 of 9 equal cells in a 3-column grid, separated from the eight coming-soon tiles
   only by a brand-wash icon and the absence of a chip. docs/26 §1.5 gives each view one
   primary action; here the primary action is the same size and weight as eight things that do
   nothing. The page's own comment claims "The one real option leads", which is true of reading
   order and not of visual weight.
2. **Card titles run at body size.** All nine use `text-[13px] font-semibold` where §5 makes
   `type-h3` (650 · 15/20) the card and row title. This is the drift `type-h3` was added to
   collect, and on this screen it is nine call sites at once.

Both are in the rule 5 baseline. They are left because fixing (1) honestly means deciding what
"leads" should look like on a chooser whose other eight cells are deliberately inert — a design
decision worth making once, with a frame to check it against, rather than at the end of a lane
that has already spent its verification budget on `/posts/[id]`.

---

## 3. Nine assertions required the defect to exist

Removing the disabled "Saved" button broke three smoke tests, and not incidentally.
`concurrent-edit.spec.ts` used `getByRole('button', { name: /^saved$/i })` in **eight** places
and `variant-save.spec.ts` in one. Each is the line that proves a write landed, so the §10.2
defect was **load-bearing in the suite that guards variant saving** — a session removing it
correctly sees nine reds and is invited to revert.

`getByText` is strictly stronger: the old form passed only if the confirmation was something
the reader could try to press, which is the thing that should never have been true.
`variant-save.spec.ts` additionally asserts that NO button named "Saved" exists, so the defect
cannot return unnoticed.

**My own grep missed all eight.** I searched `"saved\$"`, which the shell turns into the regex
`saved$` — an end-of-line anchor — so it never matched `/^saved$/i` inside the file, and I
reported "no other spec references those controls". A grep proves a class is present; it never
proves absence unless the pattern is right, and a shell-quoted regex is one of the easiest
places to get that wrong.

---

## 4. The Brand Brain's empty fields were unannounced

`section-card-empty.tsx` rendered a bare `&mdash;` in every field's value slot. docs/26 §11
forbids exactly that ("Do not render an em dash for a missing value") and §4 replaces it with a
mark carrying an accessible name.

The CLAIM was never wrong — the field is real and has no value yet, which the file's own
comment argues correctly. It was **unnameable**: a dash has no accessible name, so a screen
reader went from one field label straight to the next and the absence never reached the reader.

**Which routes, exactly.** An earlier draft of this report and the commit message both said
"the four `/brain` sub-routes". MEASURED, that is wrong: `BrainSections` — the only caller of
`SectionCardEmpty` — is imported by **two** pages, `/brain/identity` and `/brain/voice`.
`/brain/audience`, `/brain/competitors` and `/brain/knowledge` are `ComingSoon` pages and never
reach this component. The claim is corrected here rather than left standing.

**A second instance, found by checking that claim.** `/brain/page.tsx:93` rendered the same
bare `&mdash;` once per row in its own Sections list, in the same `no-brain` state. That is
where docs/27 §3.1's count of five on `/brain` actually lives. Fixed alongside, with the same
mark. So the fix covers three routes: `/brain`, `/brain/identity`, `/brain/voice`.

**The guard covers every section, and that was not free.** It was first written against
`BRAIN_SECTIONS[0]` only — one fifth of what its name claimed, which is the sibling-shape hole
this lane found twice in product code, reproduced in the check written to catch it. Looping it
over all five keys immediately failed on `taboo`: that section is TITLED "Red lines" and also
holds a FIELD called "Red lines", so an exact-match single query throws on a legitimate
arrangement. Not a component defect — a naive assertion, now `getAllByText`.

**PROVED BY MUTATION:** putting the em dash back turns **10 of the 20** tests red, two per
section. The single-section version killed the same mutant with 2, which is the coverage
difference stated as a number. Restored, 35/35 green across `components/brain`.

---

## 5. The type scale was law nobody checked

docs/26 §5 ships the whole scale as `@utility type-*` "so components never hand-write a font
shorthand", §11 forbids it outright, and **nothing checked it**. docs/28 added four lint rules;
none could see type, which is the single most common thing wrong on every screen this lane
audited.

MEASURED across `apps/web/src`: **847 hand-written sizes in 192 files, in eighteen distinct
pixel values against a scale of eight steps, and 49 distinct (size, weight) pairs.** Eleven of
those sizes — 10, 11.5, 12.5, 13.5, 14, 16, 17, 18, 19, 25, 28 — are on no step at all, so they
are not shorthand for a rung, they are invented rungs.

Rule 5 is **ratcheted**, on docs/28 §7's mechanism, and the case is stronger here than for
spacing: 191 of these files belong to lanes running right now, and moving an off-scale call
site onto a step CHANGES ITS RENDERED SIZE — a visual change to a screen the changing lane has
not seen.

**SIZE ONLY.** §5 forbids a *shorthand* — size, weight and leading welded together — and each
step carries a default weight, so `type-body font-semibold` is correct and is not flagged.
Folding weight in would flag correct code, and a rule with false positives is switched off in
its first week, which is how rule 4 nearly died on `button.tsx`'s CVA keys.

`lib/design/` is exempt: its debt registers quote the offending class inside a `reason:` string
so an entry reads without opening the file it describes. Those are data, not comments, so the
stripper cannot reach them — and a rule that fires on the register documenting the same defect
is answered by deleting the documentation. Same trap docs/28 hit when the first hex pass
flagged `brand-theme.ts`'s own annotations.

**PROVED IN BOTH DIRECTIONS:** a probe file carrying `text-[99px]` takes the script to exit 1,
reporting `components/posts/__ratchet-probe.tsx  1 (baseline allows 0)`; removing it returns
exit 0.

docs/26 gains **§5.1** rather than the rule carrying the argument alone.

### What is NOT fixed, and the number matters

**836 hand-written sizes remain, across 190 files.** The ratchet records them; it does not fix
them. A ratchet reads as a fix unless somebody names what is still owed, so: this lane removed
11 and wrote down the rest.

There is also still **no weighted 13px step**, and 56 `text-[13px] font-semibold` plus 10
`text-[13px] font-[550]` call sites are what that gap looks like. A ninth step is a
`tokens.css` change five lanes share, so it should be argued once the invented sizes are gone —
not from the count of a scale nobody was enforcing.

---

## 6. What was looked at and deliberately NOT changed

Naming these because an audit that reports only its edits reads as if it found nothing else.

- **`.is-proposed` on coming-soon tiles is a CONVENTION, not the `/analytics` defect.** It
  appears deliberately in `coming-soon.tsx`, `coming-soon-chip.tsx`, `coming-soon-tile.tsx`,
  `roadmap/inert.tsx`, `/approvals`, `/campaigns`, `/assets` and `create-flow.tsx`, each with
  reasoning in a comment. docs/28's finding was a rung applied to an ABSENCE ("nothing has been
  measured"), which dresses an absence as a proposal. An unbuilt feature genuinely is proposed.
  Left alone.
- **The dark `/create` icon tile is not a contrast failure.** `--brand-wash` is
  `rgba(255,102,0,0.06)` and is not redefined in dark, so over `--surface` (#131315) it
  composites to ~`rgb(33,24,20)`; `--acc` (#ff6600) against that is **≈5.9:1**. It reads dim
  because both are dark. *(INFERRED — hand-computed sRGB, not measured on composited pixels.)*
- **`/create/post`'s disabled "Continue" is legitimate.** §10.2 allows a disabled control for a
  real option temporarily unavailable, and the step's own instruction — "Pick one or more
  channels" — sits directly above the tiles, so the reason is on screen.
- **`GENERIC_MESSAGE`'s vagueness is correct** where it still fires. Its comment is right that
  the module has no verified limit to quote and inventing one would be worse. The defect was
  never the sentence; it was reaching it for codes that had a better one.
- **`setting-row.tsx` carries an off-scale 14px section title** and serves `/settings`,
  `/settings/profile`, `/settings/integrations` and `/settings/plan`. Left as recorded debt:
  `/settings/plan` may be live under the billing lane today, and a type change there is a
  visual change to another lane's screen.
- **No blanket "no lone em dash" lint rule**, though the temptation was real. Two files still
  render one as an element's entire content — `/assets` and `/campaigns` — and
  `e2e/coming-soon-unchanged.spec.ts` exists specifically to assert that "every figure on
  campaigns, approvals and assets is still an em dash". Those dashes are coming-soon markers,
  not missing values, and a rule that could not tell the two apart would break a spec written
  to defend the distinction. Both files also belong to lanes hot today.
- **`/embed/beta`'s `<h1>` is an invented step and is left alone.**
  `text-[20px] leading-7 font-[650] tracking-[-0.02em]` is a hand-written shorthand close to,
  but not equal to, `type-h2` (600 · 20/26 · −0.011em). It is recorded in the rule 5 baseline
  rather than changed: the route renders inside a partner's landing page with no app chrome, so
  a weight and leading change there is a visual change to somebody else's page, and this lane
  never got a frame of it to check against.
- **`/settings/profile` and `/settings/integrations` are sound.** Both already inherit
  `--measure-form` from `settings/layout.tsx` (docs/28's §6.1 fix), and integrations is a
  deliberate summary that hands over to `/connections` rather than duplicating its controls.

---

## 7. Said loudly, for the other lanes

**`scripts/design/design-lint-baseline.json` now carries a `typesize` register for 190 files
across every running lane, and `apps/web`'s `lint` script IS `design-lint.mjs`.** Any lane
merging this branch and adding a `text-[Npx]` gets a red lint leg from a rule they never read.
That is the intended mechanism. The escape is `node scripts/design/design-lint.mjs
--update-baseline` **after removing violations** — it refuses to loosen, and reports a file
that gained one rather than absorbing it.

Files touched that other lanes read: `scripts/design/design-lint.mjs`,
`scripts/design/design-lint-baseline.json`, `docs/26_Design_System_v4.md`,
`apps/web/e2e/design-audit.spec.ts`, `apps/web/e2e/concurrent-edit.spec.ts`,
`apps/web/e2e/variant-save.spec.ts`. No `tokens.css` change, so no
`gen-tokens-inline.mjs` regeneration is owed.

---

## 8. The gate

Run **unpiped**, each leg echoing its own `$?`, `setsid`-detached with a polled log — because
`pnpm gate | tail` returns *tail's* exit code.

| leg | command | result |
|---|---|---|
| 1/5 | `turbo run typecheck lint test --concurrency=1` | **EXIT=0** — 27/27 tasks. web 3216 tests, jobs 264. |
| 2/5 | `vitest run` (root) | **EXIT=0** — 9 files, 162 tests |
| 3/5 | `turbo run test:smoke --concurrency=1` (port 3219) | **EXIT=1** — 41 passed, 20 failed |
| 4/5 | `prettier --check .` | **EXIT=0** |
| 5/5 | `turbo run build --concurrency=1` | **EXIT=0** — compiled in 26.7s, 33/33 static pages |

**Leg 3 is red and this report does not call it anything else.** But the shape says what it is:
the highest passing test is **#41**, the first failure is **#42**, and 33 of the errors are
`net::ERR_CONNECTION_REFUSED at http://127.0.0.1:3219`. One dev-server death, then cascade —
`unauthenticated`, `shell-widths`, `topbar`, `no-truncated-labels`, none of which this lane
touches.

`journalctl -k` shows **zero** kernel OOM kills in the window, so this is the harness-reap
variant rather than the killer. Load average was 9–11 with four lanes live and ~3 GB available.

**What the run does establish about this lane's changes.** All four `concurrent-edit` tests —
3, 4, 5 and 6 — **passed**, before the collapse and against the real database. Those are the
tests the rewritten save control breaks if the rewrite is wrong, and they are the three that
went red in the void run plus one more.

`variant-save.spec.ts` is test **#80**, downstream of the collapse, so its failure was
`ERR_CONNECTION_REFUSED` and NOT a verdict. It was re-run on its own with `concurrent-edit`,
on a port verified with `readlink /proc/591747/cwd` to be this worktree:
**5 passed, exit 0, 2.2m.** That is the honest verification of the one thing leg 3 could not
tell us.

Every other leg-3 failure is downstream of the same death and was **not** re-run. This report
does not claim the smoke suite is green. It claims legs 1, 2, 4 and 5 are green, and that the
specs covering this lane's changes pass on a server proved to be ours.

### The first gate run was void, and it was my doing

I launched `gate.sh` detached, then ran `grep gate.log` from a different working directory,
saw "No such file or directory", and relaunched. **Both instances ran.** They shared one log
file (each opening it with `>`), one dev server on port 3219, and one `.next` — two smoke
suites seeding workspaces and editing the same posts, and a `turbo build` running while the
other instance's dev server was live, which is the specific thing that deletes `.next`
underneath it.

The tell was in the log: one `LEG 1/5` header but **two** `LEG 5/5` headers, and `LEG5_EXIT`
recorded as both `0` and `1`.

I had already written that the three `concurrent-edit` failures were "cleanly mine". **That was
not supportable** — two suites racing on one server is an equally good explanation for exactly
those three tests, and I said it before I had a run that could tell the two apart. The failures
did turn out to be mine (§3), but the reasoning that got there was wrong, and a right answer
reached from a void run is luck.

The lesson is narrower than "check for duplicates": **a background launch whose log you cannot
find has not necessarily failed.** Verify with `ps`, not with the absence of a file — and
`pgrep -f gate.sh` counts its own command line, so it will tell you 3 when the answer is 1.

---

## 9. What the next session should know

- **`DESIGN_AUDIT_ROUTES` now reaches dynamic routes.** `/posts/[id]` costs 4 frames. Use it,
  and do not edit while the camera runs.
- **The auth pages and `/onboarding` still have no honest frames.** They need a fixture whose
  user has no workspace and no session. That is the one piece of this lane's scope that is
  owed rather than done.
- **836 hand-written font sizes remain.** Every removal tightens the baseline permanently;
  re-run `--update-baseline` after removing, never before.
- **A test can pin a defect in place.** Nine assertions here required a disabled button to
  exist. When a correct fix turns a suite red, read what the suite was actually asserting
  before assuming the fix is wrong — docs/28 hit this on `/planner` and it recurred verbatim.
