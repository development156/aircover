# Handoff — divas / wt-core (2026-09-05, session 2: the twelve-lane merge)

**Six lanes merged into `wt-core`, pushed as `ae64d58b`.** The other six had
nothing ahead of core. Unit gate 27/27 forced, prettier clean, root vitest
262/262. Smoke UNRUN.

## What was ahead (MEASURED, `git rev-list --count HEAD..origin/<lane>` at a31bc5cb)

| Lane         | Ahead | Unique commits | Merge   | Conflicts                                 |
| ------------ | ----- | -------------- | ------- | ----------------------------------------- |
| wt-girija    | 34    | 20             | by hand | 6 files (studio: workbench, models, read) |
| wt-divas     | 10    | 10             | by hand | 3 files (report cluster, jobs vitest)     |
| wt-jiban     | 4     | 1              | clean   |                                           |
| wt-jiban2    | 1     | 1              | clean   |                                           |
| wt-jiban3    | 2     | 2              | clean   |                                           |
| wt-divas3    | 2     | 0 (in core)    | clean   |                                           |
| the other 6  | 0     |                | nothing |                                           |

Merge order: divas3 → jiban → jiban3 → jiban2 → divas → girija.
Commits: `6773b411` `6b729996` `4edbf88f` `83faba0e` `301c7a67` `605ace32`
then `0d51aaba` (test retarget) and `ae64d58b` (baseline + LEARNINGS).

## Resolutions that were decisions, not mechanics

1. **`lib/report/` deleted by wt-divas, imported by core.** wt-divas removed the
   rival CMO Report as a closed cluster; core's `bbe1f0ef` had put `metricInWords`
   into that cluster and the live report page imported it. Kept the deletion,
   moved the one live function and its ban list to
   `apps/web/src/lib/report/metric-words.ts` with its guards in
   `metric-words.test.ts`. Mutation: raw `{ranking.top.metric}` back on the page → 1 red.
2. **Studio workbench: wt-jiban's composer redesign vs wt-girija's 24-file
   decomposition.** Took wt-girija's structure. Ported wt-jiban's one testable
   claim into it: the starter chip shows a short label, its tooltip is the
   sentence, the box gets the sentence (`composer-starters.tsx`, guard in
   `composer.test.tsx`). Mutations: tooltip=label → red; box gets label → red.
   wt-jiban's other three points (brand and refine out of the tray, brain link,
   icons per chip) are either already in wt-girija's composer or NOT carried.
3. **Model catalogue.** wt-girija's `1302752f` (only `gemini-2.5-flash-image`
   has ever completed a generation; three others `routed: false`) is the newer,
   measured claim and was kept. Core's `4ec68060` withdrew "in one go, all
   matching" from every card; re-applied on top. Mutation: sell a set → red.
4. **`apps/jobs/vitest.config.ts`.** Kept core's 60s testTimeout.
5. **A series test pair** that core retargeted in `studio-workbench.test.tsx`
   had been moved by wt-girija into `composer.test.tsx`; retargeted there (`0d51aaba`).
6. **Three Studio components are rendered by nothing** after wt-girija's rewrite,
   found by wt-divas's new guard: `DrawModal`, `PictureViewer`,
   `RecentGenerations`. Absorbed into `ops/lint-baselines/unmounted-components.json`
   BY NAME (8 → 11), not deleted. "Draw on it" is unreachable:
   `viewer-screen.tsx:130` renders `PictureActions` without `onDraw`.

## Verification

| Leg                                   | Result                              | MEASURED / INFERRED |
| ------------------------------------- | ----------------------------------- | ------------------- |
| `turbo run typecheck lint test --force --concurrency=2` | 27/27, 3m51s, exit 0 | MEASURED          |
| apps/web vitest                       | 8414 passed, 13 skipped             | MEASURED            |
| root `vitest run`                     | 262/262 (incl. unmounted guard 9/9) | MEASURED            |
| `prettier --check .`                  | clean                               | MEASURED            |
| 4 mutations on carried guards         | 4/4 red, restored                   | MEASURED            |
| Playwright @smoke                     | UNRUN, needs a person to type the ack target | —          |
| the screens themselves                | not looked at                       | —                   |

## Not done
- Smoke leg UNRUN. Preview: https://sahodalabs-git-wt-core-development-4417s-projects.vercel.app/studio
- wt-jiban's brand card outside the tray and its Brand Brain link: not ported.
- Two studio migrations (`20260904140000`, `20260904160000`) plus yesterday's FK-index one are in the tree, NOT applied.
- The `idivasm` remote 404s (repository not found); only `origin` was used.

## Decisions owed
- Draw on it: re-mount in the new viewer, or delete `DrawModal` (girija).
- Delete `PictureViewer` and `RecentGenerations` now that the wall replaced them (girija).
- Port wt-jiban's brand card / brain link into wt-girija's composer, or drop it (jiban + girija).
- Apply the three unapplied migrations.
