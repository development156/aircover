# Handoff — jiban — wt-jiban3 — 2026-09-03

**Branch** `wt-jiban3` at `88425ae9`. Lane `wt-jiban3`. Pushed: yes.

**This lane is already on the trunk.** PR #32 was merged into `wt-core` at
`b7cd861d` on 2026-08-31 12:40 UTC, and `88425ae9` is `wt-core`'s own head, so
`git log origin/wt-core..HEAD` is empty. MEASURED. There is nothing of this
lane's waiting to be integrated. A new task here starts from the trunk, not
from these commits.

## What shipped

Three commits, all merged.

| What | Proof | Test that covers it |
| --- | --- | --- |
| The favicon is the brand mark, square, at 16/32/48/180/192/512 | `f4f51753` · `scripts/gen-favicons.mjs:67` names the one source file | `apps/web/src/app/favicon-assets.test.ts` — 10 tests |
| `metadata.icons` deleted; the icons are Next file conventions, so there is one declaration and it cannot drift from the bytes | `apps/web/src/app/layout.test.tsx:51` | `layout.test.tsx` — 2 tests |
| A web manifest, static rather than a route, so Android home screens get a real tile | `apps/web/src/app/layout.tsx:80` · `apps/web/public/site.webmanifest` | `favicon-assets.test.ts`, the `site.webmanifest` block |
| The mark corrected to ONE orange on a transparent ground | `dac5ff57` | `favicon-assets.test.ts` — "is one colour, with no second leaf left white" |
| `/home` bundle cut 3,011 bytes by moving the plan-offer wrapper off `next/dynamic` | `b7cd861d` · `apps/web/src/components/billing/plan-offer-mount.tsx:68` | `plan-offer-mount.test.tsx` — 2 tests |

MEASURED, the three files together: **18 tests, all passing.**

**The artwork's provenance matters and is not what it looks like.** The founder
attached the favicon twice and **its bytes never reached this machine** either
time — `~/.claude/attach/` empty, no image on disk newer than the session.
MEASURED. So `apps/web/public/brand/icon-source.png` was reconstructed rather
than received: `favicon-dark.png` is the same artwork already committed here as
one solid shape, so its alpha channel is the exact outline of both leaves, and
that outline was filled with `--acc` (`#ff6600`), the token and the value the
founder named himself. **No outline was drawn and no curve was traced.** If his
orange differs, overwrite `icon-source.png` and run
`node scripts/gen-favicons.mjs`; nothing else in the repository names a colour
or a shape.

## What was NOT done, and why

- **The icon was never seen in a browser.** Playwright's Chromium here has no
  outbound HTTPS and every `@smoke` spec signs in through Clerk. UNRUN, not
  passed. What WAS done instead: a `next dev` server was driven over loopback
  with Node's `http`, five pages checked (`/`, `/sign-in`, `/sign-up`,
  `/onboarding`, a 404), all five carrying the identical four link tags, and
  every icon's served bytes hashed equal to the file on disk. MEASURED.
- **No preview URL exists for this work.** Every Vercel build on `wt-core`,
  `wt-web` and this lane has failed since before the merge, so nothing carrying
  the new icon has ever been published. Checked the four most recent READY
  deployments (`bb117725`, `cc32c48b`, `49276f76`, `3a70f361`): none contains
  `icon-source.png`. MEASURED. **Do not hand anyone a preview link for the
  favicon until a build goes green.**
- **`/loop` and `/assets` were left over budget.** Both are other lanes'
  screens; see below.
- **`public/brand/favicon-dark.png` and `favicon-white.png` were left on disk.**
  They stopped being icons but `bottom-nav.tsx:148,156` still renders them as
  in-app images. Deleting them would have broken the bottom bar.

## Shared surfaces touched

- **`apps/web/src/app/layout.tsx`** — the root layout's `metadata`. `icons` is
  GONE and `manifest` is new. Any lane that adds `icons:` back gets a second
  `<link rel="icon">` alongside the file-convention one; `layout.test.tsx:51`
  refuses it.
- **`apps/web/src/app/favicon.ico`, `icon.png`, `apple-icon.png`** — new
  file-convention routes. `/icon.png` now appears in the route table and in
  `js-budget`'s manifest at 0 B.
- **`scripts/gen-favicons.mjs`** — new, root-level, alongside
  `gen-tokens-inline.mjs`. Reads one source, writes five outputs, touches
  nothing else.
- **`apps/web/src/components/shell/brand-mark.tsx`** — resolved a merge
  conflict by keeping BOTH sides: this lane's `h-control` / `max-narrow:h-11`
  control heights, and `wt-core`'s `hover:bg-surface-3` from `399db704`.
  `bg-s3` is not a utility in this repo and painted nothing. A lane holding an
  older copy of this file will re-raise the same conflict.
- **`apps/web/src/components/billing/plan-offer-mount.tsx`** — no longer
  imports `next/dynamic`. Nothing outside `home/page.tsx` consumes it.

No shared type, fixture or token changed. No required field was added anywhere.

## Contract, migration or money

**None from this lane.** No `packages/shared` change, no migration, no price, no
ledger call. The plan offer reads `PLAN_CATALOG` through
`lib/billing/plan-offer-rows.ts` and starts checkout through the wallet's
existing `startCheckout`; this lane changed only where that wrapper is loaded
from, not what it does.

Migrations DID arrive in the working tree via the `wt-core` merge
(`20260831090000_workspaces_logo_asset_id.sql`,
`20260831120000_asset_logo_facts.sql`). They are `wt-girija`'s, untouched here,
and named only so the next merger is not surprised by them.

## Guards written, and the mutation that proved each

Eighteen mutations across three rounds. Each applied, watched go red, restored.

**Round 1 — the icons (10):** `metadata.icons` reinstated · `icon.png` squashed
back to 594x508 · `apple-icon.png` given a transparent ground · the `.ico`
losing its 48px member · an `.ico` directory entry pointing past the end of the
file · `apple-icon.png` deleted · the mark repainted to the interface accent ·
the manifest naming a size the file is not · the manifest naming a file that
404s · the manifest declaring `maskable` without `any`.

**Round 2 — the corrected artwork (8):** a solid box put back behind the tab
icon · the two-tone artwork returning · the mark repainted to `#ff4b00` · a
transparent ground on the Apple icon · a transparent ground on a maskable tile ·
the tab icon squashed to 594x508 · the `.ico` losing 48px · an `.ico` entry past
the end.

**Round 3 — the loading boundary (2 of 3):** dropping the session key on the way
through · the wrapper rendering nothing at all.

**The third mutation of round 3 DID NOT BITE, and the test was deleted rather
than kept.** "renders nothing on the first pass" stayed GREEN with the `mounted`
gate removed, because `fallback={null}` makes the gated and ungated trees
produce identical DOM — and identical `renderToString` output, and an identical
`hydrateRoot` pass. The gate changes only WHEN the chunk is requested, which no
assertion in jsdom can observe. Both files record it
(`plan-offer-mount.test.tsx` header, `plan-offer-mount.tsx:39-54`).

## Anything retracted

Three retractions, each with the measurement.

1. **The first favicon shipped the wrong artwork.** `f4f51753` cut it from
   `public/LOGOS/element.png`, whose left leaf is `#ff4b00` and whose **right
   leaf is `#ffffff`** — the on-dark lockup. MEASURED by pixel histogram:
   2,323,190 orange and 2,322,570 white. On a light tab strip that is half a
   mark. It was covered up with a dark ground rather than noticed, and the
   ground argument was sound about the wrong artwork. `dac5ff57` fixes it.
   **The guard that would have caught it counts white pixels and did not exist
   until the second round** — the original suite checked squareness, opacity,
   sizes and an orange histogram, and every one passed on an icon missing a leaf.

2. **"The build is green locally" was measured on a WARM build and was wrong.**
   `.next` was reused, and Vercel reported different bytes. Re-measured cold,
   `/connections` was 707,993 against a 700,313 budget: passing here by 512
   bytes and failing on Vercel by 103, because Vercel measures ~615 higher. The
   route was sitting on the slack line and both results were honest. Move
   `apps/web/.next` aside before trusting any `js-budget` number.

3. **A comment in `plan-offer-mount.tsx` claimed the `mounted` gate prevents a
   hydration mismatch. It does not** — see the mutation above. Corrected in
   `b7cd861d`.

Also corrected mid-flight: `/home`'s budget failure was blamed on the trunk for
one round and was this lane's. MEASURED by diffing `/home`'s page chunk against
the same cold build with the lane removed — 11,324 bytes against 7,871 — and
every identifier in the difference belongs to Next's loadable runtime
(`BailoutToCSR`, `LoadableComponent`, `PreloadChunks`,
`createAsyncLocalStorage`). 3,453 bytes were the price of the mechanism chosen
to save 14,100.

## What the next session in THIS lane should pick up

**Start from the trunk.** `wt-jiban3` carries nothing unmerged; `git fetch` then
`git checkout -B wt-jiban3 origin/wt-core`.

**The trunk cannot deploy, and that is the thing worth picking up.** MEASURED on
`88425ae9`, cold:

| Route | Measured | Budget | Over | Whose |
| --- | --- | --- | --- | --- |
| `/(app)/loop` | 757,364 | 745,422 | +11,942 | another lane's Loop redesign |
| `/(app)/assets` | Vercel: 811.2 kB | 802.8 kB | +8.4 kB | another lane |

`/loop` was measured at +11,625 on `wt-core` with **no** lane work present, in a
separate worktree at `fda34a21`. `/assets` fails on Vercel and passes here by a
few hundred bytes — the same knife-edge as `/connections`, so trust Vercel over
this machine. `89b3d7c6` already trimmed 19.5 kB of channel logos from `/loop`
and it is still over, so the gap belongs to the redesign rather than a stray
import.

`scripts/lib/scanner-registry.test.mjs` is also red on
`apps/web/src/lib/brand/logo-facts.test.ts`. **Do not fix it here** —
`wt-girija` already has a fix in flight (`9aec56a9`), and its finding is worth
reading: the file's own header NAMED the reader functions in order to explain
why it is not a scanner, and the registry scans source text, so the explanation
of why the file is not a scanner is what made it one.

**Do not re-baseline any budget entry to clear these.** Three lanes have now
independently refused that, correctly.

The two questions the founder has not answered:

- Whether this session should fix `/loop` and `/assets`, or leave them to the
  lanes that own those screens. Asked twice, unanswered; the stakes rose from
  "my preview" to "the trunk and production cannot publish".
- Whether to build annual pricing so the plan offer can carry a Monthly/Annual
  toggle. `PLAN_CATALOG` holds one `priceInr` per plan; a toggle needs a second
  price and a "Save XX%" figure and both would have to be invented.

## Gate

Run on `88425ae9`, 2026-09-03. `turbo` forced with `--force`, so no cache
replay; the cold build had `apps/web/.next` moved aside first.

| Leg | Result |
| --- | --- |
| `turbo run typecheck lint test --force` | **PASS** — 27 of 27 tasks |
| ↳ `@sahoda/web:test` | **PASS** — 576 files, **7,592 tests**, 13 skipped |
| ↳ `@sahoda/db:test` | **PASS** — 44 files, 12 skipped |
| ↳ all other packages | **PASS** — research 13, shared 30, publishing 27, mesh 28, sites 53, billing 30, jobs 36 |
| `prettier --check .` | **PASS** |
| root `vitest run` | **FAIL** — 2 of 231. `scanner-registry` on `logo-facts.test.ts`, another lane's, fix in flight |
| cold `next build` | **PASS** — exit 0 |
| `js-budget` | **FAIL** — `/(app)/loop` 739.6 kB > 728.0 kB +8 kB slack (+11.7 kB). Vercel additionally fails `/(app)/assets` at +8.4 kB |
| Playwright `@smoke` | **UNRUN** — Chromium here cannot complete an outbound HTTPS request and every spec signs in through Clerk. Not passed |
| Vercel preview | **FAIL** — `dpl_FfQpkVXm2iXELJEeqAGx9K7zyc3Q`, the two budget routes above. Production's own last build (`dpl_7b1sg73M8ouWGAWK4ESRs1LLsZoV`, `wt-web` at `ed15a04b`) also ERROR |

Neither failing leg is this lane's, and both were proven so by building
`origin/wt-core` alone in a separate worktree with no lane work present.
