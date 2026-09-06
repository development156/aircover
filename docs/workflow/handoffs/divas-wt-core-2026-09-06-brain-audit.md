# Handoff — divas / wt-core (2026-09-06, /brain deep audit)

**Four defects fixed in `57e443c7`, pushed to `wt-core`.** The full report is an
artifact (link in the session's closing message and in `.remember/`).

Audited in a real Chromium (DevTools bridge) against
`https://sahodalabs-git-wt-core-development-4417s-projects.vercel.app/brain`,
signed in as the QA account through a Clerk sign-in ticket minted from the dev
instance, on build `41ec9462`. The preview reads and writes **production**
(`rloztdhz`); every write below landed in the QA workspace `83bcafc4`.

## What was measured

| Area                 | Result                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Blank answers        | Three spaces saved as `hook.core_promise` (v11) and a single space as the third core value (v8), both `confirmed: true, source: owner`  |
| Confirm all          | 4 POSTs, versions 4 to 7 in 1.1 s, for one press. The console's bulk confirm wrote 2 fields as one version in the same session          |
| Offline              | One "Confirm · free" with the network off replaced the whole console with the route error boundary ("Something broke on our side")     |
| After onboarding     | "Review Brand Brain" opened /brain at version 1 while the topbar still said "No brain yet" until a hard reload                          |
| Focus                | Clicking Edit left `document.activeElement` on `body`; Escape does nothing                                                              |
| Widths               | 390: no page overflow, tab row 472 px in 362 px with hidden scrollbar (Knowledge offscreen), 18 px checkboxes. 1024: one column, aside 739 px down |
| Contrast             | Dark: 32 samples all ≥ 4.5:1. Light: active tab 2.81, "How it sounds" label 2.45, accent eyebrow on tint                               |
| Load                 | TTFB 53 ms, FCP 620 ms, load 989 ms, 19.3 KB document, 9 RSC prefetches per arrival                                                     |
| Setup answers        | The typed red line comes back paraphrased, chipped Guess, `source: model:brand_guidelines`, under "Only you know these"                  |
| Backend (agents)     | Auth in the RPC, no client workspace id, atomic per call; `p_expected_version` exists and no caller sends it; knowledge reads unfiltered by workspace |

## Commit `57e443c7`

- `lib/brand/blank.ts` — one rule for blank text and blank fixed-list entries; `confirmBrainField` refuses it, `FieldRow` and `ResolutionRow` disable Save on it and show the reason.
- `ConfirmAll` → `confirmBrainFields(paths)`: one version per gesture.
- Every row action catches a transport rejection and says so inline; typing and ticks survive.
- `saveBrandMemory` revalidates `/` (layout) and `/brain`.
- `BrainSections` no-workspace branch offers Create a workspace instead of "resolve first".
- `FieldEditor` takes `autoFocus`; both editors pass it. Console heading fraction is one span.
- Tests: 11 new (`blank.test.ts`, `brand-resolve.revalidate.test.ts`, `brain-sections.test.tsx`, additions to `brand-field.test.ts`, `field-row.test.tsx`, `confirm-all.test.tsx` rewritten), each watched red first. 881 pass across the brain suites; `tsc` and `pnpm lint` clean.

## Not done

- The paid re-resolve was not spent. Two-session concurrency (BR-04) is INFERRED from code, not driven.
- 768 px screenshots: the DevTools screenshot call timed out after viewport emulation; DOM measurements only.
- Smoke leg not run locally.
- Four files modified by another session in this worktree (`templates.spec.ts`, `command-palette.tsx`, `nav-item.tsx`, `create-workspace-button.tsx`) were left uncommitted and untouched.
- The QA workspace keeps its 12-version "Sahoda QA Bakery" brain in production; it is test data for the next pass.

## Decisions owed

- **BR-04** send `brain.version` as `p_expected_version` on the field paths (not onboarding) and map VERSION_CONFLICT to "reload".
- **BR-05** filter `searchLibrary`, `readCurrentPassages`, `readDeleteImpact` by the active workspace (knowledge lane).
- **BR-09** a third provenance state for intake-derived fields ("from your answer") so setup answers stop rendering as guesses.
- **BR-15** either pass confirmation into the mesh prompt or narrow "writes from your answers, not its guesses".
- **BR-16** whether "one charge per brain version, unlimited re-runs" still stands with an Upstash-only guard.
