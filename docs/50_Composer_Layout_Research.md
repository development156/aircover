# 50 · The composer: layout, navigation, and what each requested feature actually costs

**Lane** `wt-divas2` (owner divas), 2026-08-26, advisor. Every figure here is
MEASURED from this repository unless marked INFERRED.

The brief asked for a better layout and navigation on `/posts/new`, a list of new
controls, and three generation features. This is the research. It says what the
best arrangement is, what can be built, what cannot be built honestly, and why.

---

## 1 · The answer on layout, in one paragraph

**One page. The stack of per-channel cards stays. What changes is that the page
gets a spine and the actions get grouped.** The alternative was already tried and
deleted: `composer.tsx:47` records that `/create/post` was a five-step wizard
removed because it **could not generate variants**, and `version-options.tsx:50`
records that it collected **one** format answer and wrote it to **every** channel,
so a carousel chosen for Instagram forced a carousel on X. `e2e/campaigns.spec.ts:104`
asserts the composer has no tabs. A wizard is a tab strip spread over time; both
hide three of four versions, which is the one thing this product does that its
competitors do not.

---

## 2 · The bug that makes the screen look broken, and its mechanism

**MEASURED from the CSS.** `composer.tsx:219` opens
`grid items-start gap-grid wide:grid-cols-[minmax(0,360px)_minmax(0,1fr)]` and
places three children:

| child | placement |
| --- | --- |
| `WritingPane` | `wide:col-start-1 wide:row-start-1` |
| `VersionsPane` | `wide:col-start-2 wide:row-start-1` **`wide:row-span-2`** |
| `ExtrasPane` | `wide:col-start-1 wide:row-start-2` |

Both rows are implicit and auto-sized. When the spanning versions column is
taller than the writing pane plus the extras pane, the excess is distributed
across the two spanned rows. Row 1 therefore grows past the writing pane's own
height, and because the container is `items-start` the writing pane stays pinned
at the top of a row that is now far taller than it.

**The result is a large empty gap between the writing box and the template card,
and it grows with every channel added.** In the three-channel screenshot the gap
is roughly 370px. It is not a spacing value anybody chose; it is arithmetic.

The fix is a row-sizing change so the excess lands in row 2 rather than being
split. **It is not applied in this pass**, because a CSS layout change cannot be
verified in this sandbox: Playwright's Chromium cannot complete an outbound HTTPS
request here (REQUESTS §25), so nobody can look at it. It needs one person with
the preview open, which is thirty seconds of work and cannot be faked.

---

## 3 · The hard constraint that decides most of the feature list

**MEASURED.** `apps/web/scripts/perf/js-budget.json:29` —
`/(app)/posts/[id]` is **959,704 bytes** of client JavaScript, the **heaviest
route in the product**. The next three are `/(app)/layout` 876,609,
`/layout` 849,842 and `/(app)/planner` 847,409.

`scripts/perf/js-budget.mjs:98` sets `const SLACK = 8 * 1024`, and `:111` fails
the build above it. This runs inside `pnpm build`, which **Vercel runs on every
pull request** — so unlike the gate workflow, which has not run at all since
11:08Z today, this check is live.

**There are 8 kB of headroom on this screen.** For scale, `LEARNINGS.md:214`
records Clerk's `<SignOutButton>` taking `/onboarding` from 779.8 kB to 925.1 kB,
a single component costing **+145.3 kB**.

Consequences, and they are not negotiable by preference:

| feature | cost | verdict |
| --- | --- | --- |
| An emoji-picker library | 150 kB to 1.5 MB (INFERRED, no such library is in the repo) | **impossible** |
| A curated emoji set, inline strings | single-digit kB | fine |
| Undo/redo logic | 1 to 2 kB | fine on size, see §5 |
| Extra buttons, modes, a link | well under 1 kB | fine |

A `next/dynamic` picker is not the way round this, and the budget file says so
itself at `js-budget.mjs:17-25`: bytes fetched after load are outside the
measurement, so a lazily-loaded picker **passes the check while still shipping the
bytes**. That is green and worse, and the file pre-empts it "so nobody reads
silence as coverage".

---

## 4 · The arrangement, by function

The screen has four jobs and they are currently interleaved. Grouped by what a
writer is doing, not by which component owns the control:

**Per channel card, one action row directly under the editor.** Everything that
acts on *this channel's words*, left to right by frequency:

```
[Improve ▾ · 1 credit]  [emoji]  [undo]  [redo]  [clear] ········· [ Save this version ]
```

The Save button moves from `size="sm"` (28px, the smallest control on the screen,
on the action a writer repeats most) to `size="default"` (38px) and sits at the
row's end where the eye finishes. `ui/button.tsx:72-76` carries the three sizes.

**Post-wide, once, below the stack.** Media, templates, and the link out to
Studio. These act on the post, not on a channel, and mixing them into a card is
what makes a card look like it owns a photo it does not own.

**Finish, once, at the end.** Two named actions rather than one vague one:

```
[ Schedule… 📅 ]        [ Post now ]
```

`docs/37` §2.3 rations the solid brand fill to **one element per view**, so `Post
now` carries it and `Schedule` is secondary. Note that `publish-now.tsx:210`
renders **one Publish button per connected channel** today, deliberately; a single
`Post now` has to fan out over those channels, which is a behaviour change and not
a styling one.

---

## 5 · Undo and redo: the honest cost

Buildable, but it is **not a button, it is a design decision with six integration
points**, every one of them MEASURED:

1. **Mirroring.** `composer.tsx:221-229` calls `mirrorSource` on every keystroke
   in the writing pane, rewriting the body of every channel still following. A
   naive stack records hundreds of entries in cards nobody typed into.
2. **Autosave.** `use-autosave.ts:12` debounces at 2000ms and writes
   `sessionStorage` synchronously on every keystroke; the recovery effect
   rehydrates on mount and would **resurrect text the writer had undone**.
3. **The compare-and-set save.** `use-variants.ts:182` decides whether to clear
   `dirty` by comparing the box against a snapshot. An undo landing mid-flight is
   exactly that race.
4. **`dirty` means the ROW, not the edit** (`use-variants.ts:313-315`), and there
   is no per-variant `lastSaved` string, so undoing to the last saved text cannot
   clear it without new state.
5. **It contradicts a documented ruling.** `use-variants.ts:107-112` argues that
   typing must DESTROY the existing relink undo, because "an Undo that threw those
   keystrokes away would be a second silent discard". A general stack either
   subsumes that or coexists with two undos on one card.
6. **Non-body state.** "Trim to fit" slices hashtags and the format fix nulls the
   format. A body-only undo reads as broken the first time someone undoes a trim
   and their hashtags do not come back.

**Recommendation: ship `clear` now** (one action, reversible by undo-typing, no
integration), and treat undo/redo as its own pass with its own tests.

---

## 6 · The three generation asks, ruled on

### 6.1 Trending hashtags — NOT BUILDABLE HONESTLY

**There is no source of trend data in this product, and none is reachable.**

- Every outbound API client in the repo is enumerated: eleven base URLs, and not
  one returns trend, search-volume or place data. Zernio's complete read surface
  is six paths (`packages/publishing/src/zernio/reads.ts`) and none is `/trending`.
- `apps/jobs/src/radar/providers/apify.ts:8-14` states the structural reason:
  *"No platform offers an API for reading an account you do not own."*
- Radar watches **1 to 5 rivals the customer typed in by hand**, at most daily,
  and `packages/shared/src/radar/snapshot.ts:29-42` has **no hashtag field** —
  the caption is stored whole and `:36-38` forbids the use outright: *"A caption
  is UNTRUSTED TEXT… stored as evidence, never as instruction."*
- `ContentVariantsOutputSchema` does emit `extras.hashtags`. That is the model's
  prior from its training data. `content-variants.ts:26-32` shows the only tag
  input it receives is a **count cap**. Labelling that output "trending" is not a
  stretched claim, it is a false one.

`docs/37` §17: *"Never render a number the product cannot prove."* A hashtag
presented as trending is a claim of measured rank; it is a figure wearing letters.

**What IS honest and buildable:** `post_variants.extras.hashtags` joins to
`post_metric_snapshots` on `post_id` + `channel`. Over the customer's **own**
posts, from their **own measured** impressions, you can say: *"Your posts carrying
#chai averaged 340 impressions across 6 posts; without it, 210 across 11.
Measured 12–26 Aug."* That is arithmetic over rows we own. It needs one migration
widening `marketing_observations.kind`. **It is a fact about their past, and it
must never be labelled a trend.**

### 6.2 SEO keywords — NOT BUILDABLE HONESTLY as measurement

`keyword` appears 8 times repo-wide and **not once in a search sense**. There is
no keyword table, no search-volume column, no SERP client, no Search Console
connection. `pricing.config.json` carries an `seo_article` price for a task that
does not exist, and `lib/remix/catalogue.ts:186-189` says so in user-facing copy:
*"priced in pricing.config.json, not written"*.

**A model can be asked to weave the customer's own words into a caption.** That is
a prompt change and it is honest, as long as nothing on screen calls the result
"SEO optimised", which would claim an optimisation against a ranking nobody
measured.

### 6.3 `[keyword]` bracket format instead of hashtags — BUILDABLE, and it needs a ruling first

This one is a product decision with a mechanical consequence. Hashtags are not
decoration in this codebase: `charCountFor` (`constraints.ts:257-263`) counts the
**normalised hashtag tail against the channel limit**, `formatForPlatform:373`
strips them for Google Business, and Instagram caps them at 30. A `[marketing]`
token is not a hashtag on any of the four platforms — it will publish as literal
square brackets in the caption.

So the question to settle is whether `[marketing]` is **(a)** an internal
keyword annotation Sahoda strips before publishing, or **(b)** literal text the
customer wants published. Those are different features. (a) needs a new field and
a strip step in the publish path; (b) is a prompt change and will look like a
typo to the reader.

---

## 7 · What was built in this pass

| # | Change | Proof |
| --- | --- | --- |
| 1 | The dash rule now reaches the model | `packages/mesh/src/prose-rules.ts`, 9 tests, 4 mutations |
| 2 | Sahoda's third-person voice is enforced for the first time | `apps/web/src/lib/copy/sahoda-voice.ts`, 12 tests, 4 mutations |
| 3 | One first-person stray fixed | `inline-rewrite.tsx:145` |

### 7.1 The dash rule, and why it is not "never generate `-`"

The brief said never generate `-` anywhere. **Taken literally that breaks
English**, and `CLAUDE.md` already rules on it: *"The HYPHEN STAYS.
`per-channel`, `read-only`, `sign-in`, `coming-soon`. Removing hyphens breaks
English and makes copy ambiguous."* A caption is exactly where that bites: a
bakery needs `same-day delivery` and `family-run`.

What was banned is the **dash used as punctuation**: `—`, `–`, and the `--` a
model reaches for when the glyph is refused. That is the same line
`.agents/skills/humanizer` §14 already draws for human copy, and the gap was that
**no prompt in `packages/mesh/src/tasks` had ever mentioned a dash** — so every
caption this product has generated was free to open with one. `PROSE_RULES` now
rides in the system prompt of `content_variants` and all three `caption_rewrite`
instructions, and a test asserts it reaches each one.

Every test proving a dash is caught has a partner proving a hyphen is not.
Mutating the detector to flag ordinary hyphens turns **two** tests red.

### 7.2 The voice guard found more than it was written for

`CLAUDE.md` records that two first-person strays were found and fixed by hand on
2026-08-16 and that nothing was added to stop a third. A third had shipped:
`inline-rewrite.tsx:145` read *"Your post changed while I was rewriting, so I
didn't replace anything"* — the defect twice in one sentence, on a paid action,
while explaining that the customer had been charged.

The guard that would have caught it did not exist. It does now, and on its first
run it found **6 more** in the onboarding flow (`onboarding/stage/`), which is a
coherent first-person mascot voice across two files rather than a typo. Those are
**quarantined with the reason written next to them**, not excused, and a second
test asserts the quarantine still holds real strays so it can never become a
silent pass.

---

## 8 · Build order, if the answers come back

1. **Clear button + bigger Save + the action row.** No new dependency, no
   contract, testable in jsdom.
2. **The layout row-sizing fix**, verified by one person with the preview open.
3. **Improve-this modes.** Widening `CaptionRewriteInputSchema` is a `[contract]`
   PR touching 3 files and breaking 4 more that assert the freeze. Reuses
   `caption_rewrite` at **1 credit**, so no pricing change and no new ledger
   action. `maxTokens` is 512 and must rise for a whole-body call.
   **The founder has already ruled once on this capability** (REQUESTS §19):
   suggest-and-accept, never silent rewriting.
4. **Emoji insert**, curated, using `spliceSelection` which already handles
   surrogate pairs correctly.
5. **Go to Studio.** `/studio` exists (`state: 'soon'`) so the link is honest
   navigation, not a dead end. But Studio generates nothing today, so the link
   must carry that, and removing the working generator from the composer before
   Studio works would take a capability away.
6. **Undo/redo**, its own pass, per §5.

---

## 9 · The two things nobody can act on until they are settled

**The icon.** The brief asks for a pencil. In this codebase `Pencil` already means
*edit by hand* (Brand Brain fields, the `site_edit` action face) and **`Sparkles`
is the established AI glyph** across five components. A pencil on an AI action
inverts both conventions.

**The word.** `docs/44_Copy_Voice_Sweep.md:2150` lists **"enhance"** among the AI
tells swept out of this codebase, and records *"Zero hits in user-facing interface
copy."* A button labelled "AI enhance" reintroduces the first one. "Improve this"
or "Clean this up" is the same control without the tell.
