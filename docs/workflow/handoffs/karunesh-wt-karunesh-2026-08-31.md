# Handoff — karunesh — wt-karunesh — 2026-08-31

**Branch** `wt-karunesh` at `2a9f3a98`. Lane `wt-karunesh`. Pushed: yes, local and
`origin/wt-karunesh` match. PR [#22](https://github.com/development156/sahodalabs/pull/22), draft.

**THE HEADLINE, AND IT IS A SETTINGS FINDING RATHER THAN A CODE ONE.** The
founder added six variables and asked for the browser leg. **It refused again,
identically, 20 seconds in.** MEASURED, run 33357841716 on `2a9f3a98`, dispatched
with `ack_target=rloztdhzfliyvpvxsgjl`:

```
env:
  CLERK_PUBLISHABLE:
  CLERK_SECRET:
  SUPABASE_URL:
##[error]Repository secrets are not configured: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
                                                CLERK_SECRET_KEY
                                                NEXT_PUBLIC_SUPABASE_URL
```

The runner prints all three **empty**, so this is not a masking artefact and not
a name mismatch that would show as a wrong value. **The variables exist — this
sandbox has all six and every other leg depends on them** — so they were added
somewhere that is not GitHub Actions repository secrets. The three candidates,
and only one of them feeds a workflow: the Claude cloud environment (which is
where `scripts/cloud-setup.sh` reads them and where they demonstrably are),
Vercel's project environment, or GitHub. They must be at
**Settings → Secrets and variables → Actions → Repository secrets** on
`development156/aircover`, under those exact six names.

**So the browser leg is UNRUN on this lane, for the third session running**, and
every visual claim in this file is reasoned or unit-tested, never observed.
That is the single largest gap this lane hands over.

## What shipped

Seven changes, all `apps/web`, every one from a founder screenshot.

| Change | SHA | Covered by |
| --- | --- | --- |
| `/posts` becomes a grid of square tiles, eight before a fold, one control that reveals the rest and collapses | `391969f4` | `post-grid.test.tsx` ×7 |
| The audit's five: the square moved to `wide:`, `h-full` for the row stretch, `min-w-0` on the heading, the loading skeleton reshaped, the fold keyed per filter | `eee357d5` | `post-grid.test.tsx`, `post-card-compact.test.tsx` ×6 (new) |
| Delete moves from an inline row that fell off the tile to the shared `Modal`, with ordinary buttons and three scoped sentences | `992bd869` | `delete-post-button.test.tsx` ×11 |
| The repair of a mutation my own commit shipped, plus that audit's four | `460b64f0` | same file, +3 |
| Draft tiles show attached photos, with a marked slot when signing fails and a page-level line when the read fails | `9be18993` | `media-peek.test.tsx` ×11, `media-read-state.test.ts` ×4 (new) |
| Two or more photos open in a grid with numbered captions, not a stack | `519bc78a` | `media-peek.test.tsx` ×14 |
| The composer stops offering Telegram, and every chip carries its platform's own mark | `505f5bfd` | `channel-picker.test.tsx` ×8 |
| "Improve this copy" becomes "Rewrite this", in all four places | `2a9f3a98` | `improve-copy.test.tsx` ×15 |

**Five of the eight are RESTORES of work `bebe89f8` reverted** at the founder's
request on 29 August: `ae95b696` (the grid), `f096f68c` (the delete dialog),
`42c1bde7` (the photo peek) and `3f424f82` (the rename) were cherry-picked back,
each clean. The founder asked for each again, one at a time, without knowing they
had existed. **Only the parts asked for came back** — nothing of the composer
rebuilds, which stay reverted.

### The defect I shipped, and how it was caught

`992bd869` was committed with `git add -A` **while an auditor was mid-mutation in
the same worktree**, and captured one: `router.refresh()` had become `void 0`.
MEASURED — that commit's own file failed its own suite, 1 failed / 10 passed. A
delete would have gone through and the tile would have stayed on screen. Fixed in
`460b64f0` by another session.

**The lesson is not "be careful".** `add -A` is a wildcard over a directory
another process is writing, and a green run before the commit proves nothing
about the bytes at commit time. **Stage the paths, or do not run an agent in the
same tree.** I did the latter for every commit after it.

### What the two audits found, all of it green beforehand

| Finding | Why it stayed green |
| --- | --- |
| **A guard that could not see a stack.** `toContain('grid')` is a substring test and `grid` is inside `gap-grid`, `grid-cols-1` and `space-y-grid`. Replacing the whole class list with `flex flex-col gap-grid narrow:grid-cols-2 wide:grid-cols-4` — the exact regression its own 20-line comment names — left **7 of 7 green** | The original mutation only went red because it deleted the breakpoint classes too |
| **The square began at two columns.** MEASURED at 1024px: two 478px columns, so eight tiles run **1996px** — more than two screens, for a change whose claim is that eight fit on one | No test can measure layout in jsdom, and nothing pinned the breakpoint |
| **`compact` dropped nothing, and nothing watched.** Deleting the metric strip and the send time from tiles only left **929 passing** — byte-identical to the figure the change shipped on | No test in the repo rendered `PostCard` with `compact` at all |
| **The photo read's failure line was unguarded.** Replacing `mediaByPost === null` with a flat `false` — which makes a FAILED read render as a page whose posts have no photos — left **972 passing** | `/posts` is an async server component and no test renders it |
| **Ragged rows.** The card claimed grid rows stretch their siblings; they stretch the `<li>`, and `StaggerItem` sits between. MEASURED at 1180: 365px items holding 268px cards, **97px** of dead space under six of eight | Nothing asserted the wrapper passed the stretch down |
| **A title with no spaces painted over its neighbour.** MEASURED: **63px** of overspill at 1440, **128px** at 1180 | Titles derive from the body's first line, so a pasted link is an ordinary title; the sweep that covers this runs at 390px against an empty workspace |
| **The failure message overflowed the tile**, exactly as the old prompt had — only the confirm step had moved to the top layer | The fix for the defect reintroduced the defect |
| **Escape cancelled nothing mid-flight.** "Keep it" was disabled while pending; the two exits `Modal` owns were not | Nothing drove Escape during a request |

## What was NOT done, and why

- **Playwright, again.** UNRUN, not passed. The runner refuses at its own guard
  (above) and Chromium in this sandbox cannot complete an outbound HTTPS request.
  Seven visual changes have been reasoned and unit-tested; **not one has been
  observed in a browser by anyone but the founder.**
- **The `radar` origin.** `posts.origin` admits four values in the database
  (`20260822090000_posts_origin_radar.sql`); `PostOriginSchema` admits three.
  MEASURED by an auditor: `radar.ts:251` parses through `PostInsertSchema` and
  **throws before the insert**, so the Radar "draft a reply" button creates no
  post and charges nothing — the feature simply cannot work. Left alone because
  the fix is a `packages/shared` contract change and needs the founder's word.
  **It must be done together with `SAHODA_ORIGINS` in `agency-blade.tsx`**, or
  Radar drafts arrive labelled as hand-written. MEASURED: widening the schema
  and running everything — **6251 passed in `apps/web`, 509 in
  `packages/shared`, zero failures** — changed nothing. No test covers that seam.
- **TikTok and Slack elsewhere.** `HIDDEN_FROM_OFFER` now governs `/connections`
  and the composer. I did not sweep the rest of the product for other places
  those two are still offered.
- **The stagger past the fold.** Every revealed tile carries the same 0.32s cap
  delay and they arrive together. Named, not fixed.
- **`data-guide="posts.list"`** reaches the `<ul>` but is not a seeded tour
  anchor and never was. `anchor-integrity.test.ts` checks seeded→rendered only.

## Shared surfaces touched

- **`apps/web/src/components/posts/channel-mark.tsx` — REWRITTEN as a thin
  adapter over `ChannelLogo`.** Same export, same props, no constructor change.
  Five call sites (`version-card`, `week-timeline`, `send-outcomes`,
  `channel-picker`, `channel-readout`) are readers and all pass. **The bundle is
  the risk here**, because `offer.ts` exists precisely because pulling
  `catalogue.ts` into the composer once spent 8,126 of 8,192 bytes of slack on
  `/planner`. `channel-logo.tsx` reaches `drawn-marks.tsx`, whose map references
  all seven marks, so all seven now ship to any route with a picker. MEASURED:
  `next build` passes, **js-budget ok, 82 routes within budget.**
- **`apps/web/src/components/posts/post-card.tsx`** — new optional `compact` and
  `liveElsewhere`. Both default; no call site breaks.
- **`apps/web/src/components/posts/delete-post-button.tsx`** — new optional
  `liveElsewhere`. Readers unaffected.
- **`apps/web/src/components/ui/modal.tsx`** — gained an optional `busy` (in
  `460b64f0`), defaulting false, so all fifteen existing call sites are
  unchanged. It refuses Escape through the `cancel` event, ignores the backdrop
  and disables the X while a request is in flight.
- **`apps/web/src/lib/posts/read.ts`** — new `listPostMedia`, returning
  `Map | null`. **The null is load-bearing**: an empty map on failure is
  byte-identical to a page whose posts have no photos.
- **`apps/web/src/lib/posts/media-read-state.ts` — NEW**, and the one module
  another lane might reasonably want: it is where "did the photo read fail?"
  lives, testably.
- **`apps/web/src/app/(app)/posts/loading.tsx`** — now an eight-tile grid with
  the same classes as the page. Any future change to the grid must move both.

## Contract, migration or money

**None.** No `packages/shared` change, no migration, no price, no ledger call,
nothing under `packages/db`. `deletePost` was read and confirmed to touch no
ledger, which is what licenses the delete dialog's credit sentence — it states
the RULE ("those credits were spent when the work was done") and never asserts a
charge, because the component cannot know whether one happened.

The one thing that WOULD be a contract change is the `radar` origin above.

## Guards written, and the mutation that proved each

**Twenty mutations applied and watched go red across the session, each restored.**

| Mutation | Guard that caught it |
| --- | --- |
| fold 8 → 6 | `post-grid` ×4 |
| the grid class → `space-y-grid` | `post-grid` ×1 |
| the `hidden` attribute dropped | `post-grid` ×3 |
| **the audit's stack, breakpoints kept** | `post-grid` — the assertion that used to be inert |
| the tile drops the metric strip and the send time | `post-card-compact` ×2 |
| the square back to `narrow:`, stretch dropped | `post-card-compact` ×1 |
| the heading loses `min-w-0` | `post-card-compact` ×1 |
| the bin deletes with no dialog | `delete-post-button` ×11 |
| the dialog mounted while closed | ×3, incl. `post-card-heading` |
| the credit line ASSERTS a charge | `delete-post-button` ×1 |
| the confirm takes a bespoke variant | `delete-post-button` ×1 |
| an unfetchable photo renders as no photo | `media-peek` ×1 |
| the photo's description goes empty (decorative) | `media-peek` ×2 |
| the `+N` badge loses its dark-mode escape | `media-peek` ×1 |
| the tile shows the LAST photo | `media-peek` ×1 |
| **a failed photo read reported as "no photos"** | `media-read-state` ×2 — **0 before the module existed** |
| an empty answer reported as a failure | `media-read-state` ×3 |
| the stacked photo layout comes back | `media-peek` ×1 |
| the photo numbering goes away | `media-peek` ×1 |
| a single photo gridded and numbered "1 of 1" | `media-peek` ×1 |
| the Telegram filter removed | `channel-picker` ×2 |
| the filter also hides a chip the post carries | `channel-picker` ×1 |
| the mark back to its own three-entry table | `channel-picker` ×1 |
| the rename reverted, each of four places separately | `improve-copy` ×4, ×8, ×1, ×1 |

**Three are worth reading.** The `space-y-grid` one is a guard that had never
been able to fail. The `media-read-state` one is a guard that did not exist and
whose absence was proven by mutation. The rename's last two each needed a test
that did not exist, found the same way — the resting panel reaches neither the
waiting line nor the too-long refusal.

## Anything retracted

- **"A Radar-drafted post would be silently dropped from `/posts`."** Told to the
  founder and WRONG. The chain breaks at the write: `radar.ts:251` parses through
  `PostInsertSchema` and throws, so no such row can exist. The real consequence
  is a button that fails outright and charges nothing. Retracted to his face in
  the same session, with the correction.
- **"The blade is orange."** `tokens.css:834` is `background: var(--brand)`, and
  `skin-css.ts` overrides `--p` per workspace, so on a workspace with Brand Skin
  on it is that customer's colour.
- **"No blade means a person wrote it."** A `radar` post would carry none either
  — MEASURED, `<AgencyBlade origin={'radar'} />` renders zero blades. True in
  practice only because no such post can be created.
- **"The delete work is live and correct."** It was live and carried the
  swallowed mutation for about an hour. Corrected above.

## What the next session in THIS lane should pick up

1. **Get the six secrets into GitHub Actions and run the browser leg.** Everything
   else here is a reasoned claim about a screen. Dispatch `gate.yml` with
   `ack_target=rloztdhzfliyvpvxsgjl`. **If one thing from this lane gets
   verified, make it this** — it is the third session saying so.
2. **The `radar` origin decision**, if the founder says yes: `PostOriginSchema`
   and `SAHODA_ORIGINS` in the same commit, plus a guard on the seam that
   currently has none.
3. Sweep the rest of the product for TikTok and Slack still being offered.
4. Teach the route sweeps to walk the posts grid's fold — the hidden tiles are
   outside `no-impossible-remedy` and the contrast detectors.

## Gate

| leg | result |
| --- | --- |
| `tsc --noEmit` (apps/web) | **PASS** |
| `vitest run src/components src/app src/lib` | **PASS** — 6115 passed, 13 skipped |
| `prettier --check` on every file touched | **PASS** |
| `next build` + `js-budget.mjs` | **PASS** — 82 routes within budget |
| CI `typecheck · lint · test · format`, run 33271858714 on `ba5a72ed` | **PASS** — 13m49s, main stage 12m43s. The runner outage that blocked this lane for two days is **over** |
| CI `Playwright @smoke`, run 33357841716 on `2a9f3a98` | **FAIL at its own guard, 20s** — three repository secrets read empty. **UNRUN, not passed** |

**MEASURED** unless stated. The three figures under "what the audits found" that
carry pixel values were measured in Chromium against the production stylesheet by
an auditor, not by me, and are marked as such in the code comments that record
them.

## In plain terms

Seven things the founder asked for are finished and saved, and every one of them
passes 6,115 automatic checks. The machine that signs work off is healthy again
after two days down.

What is still missing is the one check that walks the real screens like a
customer. The founder added the six settings it needs, but they went somewhere
other than where that machine reads from, so it refused in twenty seconds
without writing anything. Until somebody puts them in the right place, everything
above is careful reasoning about screens nobody has watched.

One honest failure of my own: I saved a change while a checking helper was
deliberately breaking a file, and shipped the break. Deleting a post would have
worked and the card would have stayed on screen. Another session caught it within
the hour and it is fixed.
