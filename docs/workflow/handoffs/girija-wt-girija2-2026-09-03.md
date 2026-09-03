# Handoff — girija — wt-girija2 — 2026-09-03

**Branch** `wt-girija2` at `ed15a04b`. Lane `wt-girija2`. Pushed: yes.

**Read this first: `wt-web` points at `ed15a04b`, and `ed15a04b` HAS NEVER
BUILT.** Production is serving an older build. The details are in "Anything
retracted" and they are the most important thing in this file.

This continues `girija-wt-girija2-2026-08-31.md`, which covers the same lane's
earlier work. The date rolled while the session ran, which is why this is a new
file rather than an appended session.

## What shipped

Two commits, both pushed, both on the Brand Skin control in the topbar.

| What | Proof | Test that covers it |
| --- | --- | --- |
| Escape closes the brand panel, focus returns to the chevron | `brand-mark.tsx` `useEffect` on `open` | `brand-mark.test.tsx` "closes on Escape", "returns focus to the control that opened it" |
| A press outside closes it; a press inside does not | same effect | "closes when the press lands outside it", "stays open when the press lands inside it" |
| It does NOT claim `aria-modal` | absence, asserted | "does not claim to be modal" |
| Chevron `w-5` → `w-6` (20px → 24px, WCAG 2.5.8) | `brand-mark.tsx` chevron className | "gives the chevron a target at least 24px across" |
| Every swatch has its own accessible name | `color-name.ts` (new), `brand-panel.tsx` | `color-name.test.ts` ×10; panel "gives every swatch a name of its own" |
| The swatch in use is marked, matched BY HUE | `brand-theme.ts` `currentSwatchIndex` | `swatch-row.test.ts` "marking the colour in use" ×5 |
| Near-identical swatches collapse to one | `brand-theme.ts` `distinctBrandColors`, `MIN_SWATCH_DISTANCE = 0.09` | `swatch-row.test.ts` ×6; panel "offers one blue rather than four shades of it" |
| The logo appears in the panel that replaces it | `brand-panel.tsx` header row | "shows the logo it is offering to replace", "shows no logo when there is none" |
| Copy cut from five body lines to two | `a6f035e8` | two assertions retargeted, not deleted |
| Three trunk scanners declare their blind spot | `ed15a04b` | `scripts/lib/scanner-registry.test.mjs` ×2 |

All MEASURED: every row above has a named test that passes in the gate below.

### The copy cut, because it reversed a decision from the same session

Founder's verdict on the first version: **"it is too wordy"**. What went:

- "the colour it saw most of in your logo" — our arithmetic, not the reader's
  situation.
- "while the brand is switched on" — the state row below states it outright, so
  the claim moved rather than disappeared.
- "The sun and moon in the top bar still switch light and dark" — added earlier
  the SAME day to stop this switch being mistaken for the theme one, then
  removed. **This is a real loss.** Nothing on the screen now tells a first-time
  reader the theme lives elsewhere. If it confuses anybody, the fix is a tooltip
  on the moon, not a sentence back in this panel.
- The bordered card around the switch became a hairline: it was the panel's
  heaviest object and its rarest control.

## What was NOT done, and why

**The Playwright @smoke suite is UNRUN. Not passed — UNRUN.** Two independent
blockers, both re-measured this session:

1. **The six keys are not GitHub Actions secrets.** The founder added them; they
   are SET in this Claude Code sandbox (MEASURED by `printenv`, presence only,
   values never read) and `apps/web/.env.local` exists. Dispatch run **1130**
   (`33357792550`, `ack_target=rloztdhzfliyvpvxsgjl`) hit the guard and exited 1
   in **7 seconds** with all six slots empty — `secrets.*` AND `vars.*`. Other
   lanes reached the same finding independently the same day.
2. **Chromium here cannot reach HTTPS.** RE-MEASURED with the keys present:
   `page.goto('https://example.com/')` → `net::ERR_CONNECTION_RESET`, and
   `https://clerk.com/` identically. A certificate-boring third-party host fails
   the same way, so this is not a certificate problem.

**`turbo run build` cannot run in this sandbox either.** MEASURED: `next/font`
fails with "Failed to fetch `Plus Jakarta Sans` from Google Fonts" — the same
network wall. This matters more than it looks, and it is why the retraction
below happened.

**Nothing was opened in a browser by me.** Every claim about how the panel LOOKS
comes from the founder's screenshots and from reading markup.

**I did not fix the `/loop` budget failure and did not move `wt-web` back.** The
founder was given three options and has not ruled.

## Shared surfaces touched

| Surface | Change | Breaks a caller? |
| --- | --- | --- |
| `lib/brand/brand-theme.ts` | NEW exports `distinctBrandColors`, `currentSwatchIndex`, `MIN_SWATCH_DISTANCE`, `MAX_BRAND_HUE_DRIFT` | No — additive; nothing existing changed |
| `lib/brand/color-name.ts` | NEW module (`colorName`, `colorNames`) | No — nothing else imports it |
| `components/shell/brand-panel.tsx` | **`current: string \| null` is a NEW REQUIRED prop** | **Yes, for a CONSTRUCTOR.** `BrandMark` is the only caller and passes it; any lane rendering `BrandPanel` directly fails typecheck until it passes `current` |
| `components/brain/brain-claim.test.ts`, `lib/time/setting-reach.test.ts`, `lib/onboarding/intake-source-of-truth.test.ts` | Comment-only: each gained a "WHAT IT CANNOT SEE" declaration | No behaviour, no assertion changed. **These are other lanes' files** (from `60e20aac` and `1c8422f2`) — those authors should check I described their blind spots correctly |

Merge conflict resolved in `brand-mark.tsx`: two independent edits to one
className, **both kept** — this lane's `w-6` and the trunk's `bg-s3` →
`bg-surface-3` rename. MEASURED: `bg-s3` appears nowhere in `apps/web/src` after
the merge, so taking the trunk's token was necessary, not cosmetic.

`packages/shared`, `packages/db`, `pricing.config.json`, every migration:
untouched.

## Contract, migration or money

**None.** No shared contract, no migration, no price, no ledger call.

Still outstanding and NOT addressed here: `workspaces` had no `logo_asset_id`,
so `readBrandLogo` finds the logo by title. INFERRED from the trunk log that
`wt-girija` has since landed the pointer read (`cc32c48b`, "the logo is read
from the pointer, not from a title"), so this may already be resolved on the
trunk — verify rather than assume.

## Guards written, and the mutation that proved each

**Sixteen mutations. Sixteen red.** Each applied to source, suite run, failure
read, source restored.

| Mutation | Test that went red |
| --- | --- |
| Escape handler keyed to a key nobody presses | closes on Escape |
| `chevronRef.current?.focus()` → `void 0` | returns focus to the control that opened it |
| Outside-press handler ignores the event | closes when the press lands outside it |
| `w-6` back to `w-5` | gives the chevron a target at least 24px across |
| Swatches share one `aria-label` | gives every swatch a name of its own |
| `inUse` pinned to `-1` | says which colour is the one in use |
| `skinOn ?` dropped from `inUse` | marks nothing while the brand is switched off |
| `distinctBrandColors` removed from the filter | offers one blue rather than four shades of it |
| Logo preview `{logoUrl ?` → `{false ?` | shows the logo it is offering to replace |
| Repeat-name numbering short-circuited | numbers repeats so no two swatches are announced the same |
| Hue band `until: 35` back to `20` (the HSL-wheel value) | calls a red one that |
| Grey short-circuit disabled | calls a near-grey grey rather than guessing a hue |
| Dedupe accepts every colour | collapses four shades of one blue |
| Hue match replaced by string equality | finds the swatch a stored theme was derived from |
| "WHAT IT CANNOT SEE" heading removed from one of three | scanner-registry names that exact file |
| (re-run of the focus mutation after the fix below) | returns focus to the control that opened it |

**One came back GREEN and that is the finding worth keeping.** The focus test
originally pressed Escape immediately after clicking the chevron, so focus was
already there and deleting `chevronRef.current?.focus()` changed nothing — a
guard that could not fail. It now blurs first and asserts the blur took. Second
hollow guard this lane has caught by mutation in two days. **An all-green
mutation round is a result to distrust.**

## Anything retracted

**Yes, and this one matters more than anything else in this file.**

**I told the founder the change was live in production. It was not, and it still
is not.** MEASURED: Vercel deployment `dpl_7b1sg73M8ouWGAWK4ESRs1LLsZoV`, target
production, branch `wt-web`, commit `ed15a04b`, state **ERROR**:

```
js-budget FAILED — 1 route(s):
  /(app)/loop  739.8 kB > 728.0 kB budget +8 kB slack  (+11.8 kB)
```

Customers were never affected — a failed deploy does not replace the running
one — but the promotion did not arrive and I said it had.

**The cause of my error, stated plainly.** I read the green **"Vercel Preview
Comments"** check as the build passing. It is a bot that posts a comment, not a
build. `.github/workflows/gate.yml` deliberately SKIPS `turbo run build` on the
grounds that "Vercel already builds every PR" — so **no check I looked at ever
compiled the code**, and `turbo build` cannot run in this sandbox either. The
build was outside every signal I had, and I did not notice that it was.

**The failure predates my merge.** MEASURED from the deployment list:

| Deployment | Branch | Commit | Result |
| --- | --- | --- | --- |
| `dpl_BiuKkRTNQ…` | `wt-girija2` | `90c78fb2` (before the merge) | **READY** |
| `dpl_E69QiDkCS…` | **`wt-core`** | **`fda34a21`** | **ERROR** |
| `dpl_cXGy4jxPs…` | `wt-girija2` | `6f992210` (the merge) | ERROR |
| `dpl_7b1sg73M8…` | **`wt-web`** | `ed15a04b` | **ERROR** |

`wt-core` was un-deployable roughly two hours before this lane touched it, and
`/loop` is a route this diff never opens. **But I promoted it**, and that is
mine: I should have checked the trunk's build state before pushing a lane into
it, and certainly before pushing it to production.

**A near-miss worth recording.** The first promotion push printed *"Everything
up-to-date"* and did nothing: a stale LOCAL branch `wt-core` sat at `3718bd31`,
identical to production, so `wt-core:wt-web` resolved to "push production to
production". Harmless in that direction; the same staleness the other way would
have been a silent revert. Push the verified SHA, not a branch name you have not
just fetched.

**Also retracted, from the earlier handoff:** I wrote that the six secrets "must
go on `development156/aircover` under Repository secrets", implying that was
where they went astray. MEASURED since: they are in the Claude Code cloud
environment, a fourth place the workflow's own error message does not list
because the guard cannot see it.

## What the next session in THIS lane should pick up

1. **`wt-web` names a commit that has never built.** Decide and act: point it
   back at `3718bd31` (the last commit that built) so the branch is honest, or
   move it forward to a trunk commit that builds. INFERRED from the trunk log
   that `afb4a3ef` ("accept the two routes that outgrew their JS budget") has
   since addressed the `/loop` overage on `wt-core` — verify with a real
   deployment state before trusting it.
2. **The lane is behind.** `wt-core` is at `2dba741c`, roughly twenty commits
   ahead of `ed15a04b`. Merge before doing anything.
3. **Never treat "Vercel Preview Comments" as the build.** Read the deployment's
   own `state`, or the job named for the build. This cost a false "it is live".
4. **The removed sun/moon line** — a tooltip on the moon if anybody is confused,
   not a sentence back in the panel.
5. **Do not re-dispatch the smoke job** until somebody with repository admin has
   confirmed the six secrets are on the Actions **Secrets** tab of
   `development156/aircover`. Four dispatches have now died at the same step.
6. **The Loop's Sunday fix is still unproven in production.** MEASURED 31 Aug:
   the cron fired at 21:00:46 UTC and created no cycle, all correctly — two of
   six Loop workspaces paused, three of the remaining four have no connected
   account, and the fourth already had a plan for that ISO week. And it cannot be
   told from outside whether `SAHODA_LOOP_CRON_MODE` is `on`: a switch that is off
   and a switch that is on with everyone declined leave identical traces.

## Gate

Forced (`--force`, cache bypassed) on `ed15a04b`, this exact tree, 2026-09-03.

| Leg | Result | Real output |
| --- | --- | --- |
| `turbo typecheck` | **PASS** | 27 tasks successful, 27 total |
| `turbo lint` (incl. design lint) | **PASS** | same run |
| `turbo test` | **PASS** | web **7183 passed, 13 skipped**; jobs 409; sites 1566; db 817 + 207 skipped; publishing 473; shared 465; billing 401 + 13 skipped; mesh 213; research 195 |
| root `vitest run` | **PASS** | 223 passed, 15 files |
| `prettier --check .` | **PASS** | "All matched files use Prettier code style!" |
| `turbo test:smoke` (Playwright) | **UNRUN** | Both blockers above. NOT a pass. |
| `turbo build` | **FAIL on Vercel, UNRUNNABLE here** | `/loop` +11.8 kB over budget; locally `next/font` cannot reach Google Fonts |

**The web typecheck now passes locally.** In the earlier session it was blocked
by stale `.next/types` naming a `studio/[id]` route on neither branch; the failed
build regenerated them.

**Links.** Lane preview:
`https://sahodalabs-git-wt-girija2-development-4417s-projects.vercel.app`.
Production `https://app.sahodalabs.com` does **NOT** carry this work — its branch
points at `ed15a04b` but that commit never built, so the older build is what
customers see.
