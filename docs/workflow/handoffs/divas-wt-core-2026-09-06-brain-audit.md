# Handoff — divas / wt-core (2026-09-06, /brain deep audit)

**Four defects fixed in `57e443c7` and `8504eed5`, pushed to `wt-core`, verified live
on the rebuilt preview.** Report artifact:
https://claude.ai/code/artifact/3940ac3a-f8ec-45b1-9a19-9b8eaac34b92

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

## `8504eed5` and the live check

The first build of `57e443c7` failed `scripts/perf/js-budget.mjs`: importing
`CreateWorkspaceButton` into `BrainSections` put `sonner` on `/brain/identity`
and `/brain/voice` (+35.8 kB each). `8504eed5` renders a plain `<form action>`
bound to `createWorkspace` instead. On the rebuilt preview: focus lands in the
editor; a blank draft disables Save and shows the reason; the core promise was
restored as v12; "Confirm all 2" made one POST and one version (v13); an
offline confirm shows "Could not reach Sahoda…" inline and the tab stays.

## The Brain that lights up (`1a3c6eb8`, `cca5e7a0`)

The founder asked for the Brand Brain to be visually striking with feedback on each answer. Shipped and verified on the preview:

- `lib/brand/brain-map.ts` + `components/brain/brain-map.tsx`: a neural map of the fifteen fields in five section clusters around a core carrying the ring's count. Confirmed = solid brand node (is-real), guess = dashed empty ring (is-proposed), setup answer = dashed ring over the brand wash. Edges into the core light with their nodes. Compact map on the title row of every brain screen (`brain-map-frame.tsx`, "Brain level n of 15"), full map above the confidence bar.
- Feedback per answer: the node that just became confirmed pulses with a halo and the core pops; the chip pops as the dash turns solid; the value box carries one soft ring; the tally lifts (`pop-number.tsx`, `use-just-changed.ts`). All transform/opacity, none past `--dur-slow`, collapsed by the global reduced-motion block. Nothing pulses on arrival; no number is rolled.
- MEASURED live: after Confirm on Archetype, node lit + halo + core pop + chip pop + value ring all present within 1.8 s (the round trip), settled by 2.7 s, level 0 → 1. Light, dark and 390 px checked; no horizontal overflow.
- The first build failed the js-budget (+8.2 kB on the layout): the client map imported the field registry and, through provenance, `@sahoda/shared`. `cca5e7a0` moves geometry, counts and the spoken label to the server; the client draws plain data.

## Plain English (`92ba4d81`)

Founder's ask: every sentence on /brain readable by anyone. Renamed the sections (Your brand · Your customer · Your promise · How you sound · Never do this), the fifteen labels and questions (Brand type, If your brand were a person, What you stand for, Their problem, What they worry about, How they want to be seen, Your main promise, The feeling you give, Example first lines, Phrases that sound like you, How formal), the console (tab "Check guesses", "Still to check", "Sahoda wrote these for you", "Only you can answer these"), the header ("Answer this next", **"Rebuild Brand Brain"** replaces "Re-run resolve", "costs credits" replaces "paid"), the derived card ("How sure Sahoda is" · Very sure / Fairly sure / Not sure yet · "Based on" · "Worked out from the fields above. Not counted."), the origin notes, editor hints, chip tooltips and blank refusals. The model's note is now prompted for the owner in plain words with the jargon banned (`brand-guidelines.ts`, pinned by a test). No claim got vaguer; tests retargeted to the claims; `resolution-console.spec.ts` retargeted for four headings.

Verified on the preview against a seeded fixture (the free-build limit refused a fourth build today: "3 times today, which is the daily limit", which is correct). Fixture deleted afterwards.

## Not done

- The paid re-resolve was not spent. Two-session concurrency (BR-04) is INFERRED from code, not driven.
- 768 px screenshots: the DevTools screenshot call timed out after viewport emulation; DOM measurements only.
- Smoke leg not run locally.
- Four files modified by another session in this worktree (`templates.spec.ts`, `command-palette.tsx`, `nav-item.tsx`, `create-workspace-button.tsx`) were left uncommitted and untouched.
- The QA workspace keeps its 13-version "Sahoda QA Bakery" brain in production; it is test data for the next pass.

## The five decisions, taken (`c95dcf5d`, `a0d7f6f9`)

The founder delegated all five. Shipped and verified on the rebuilt preview:

- **BR-04** hand edits send `expectedVersion`; VERSION_CONFLICT → "Reload and try again". Two-tab test: both confirmations survived. The inline confirm also sends `asSeen`, and the action refuses when the stored text moved since the screen rendered.
- **BR-05** `searchLibrary`, `readCurrentPassages`, `readDeleteImpactFor` filter by the active workspace.
- **BR-09** `SOURCE_INTAKE`: the onboarding save stamps the three answer-seeded fields; `FieldState` gains `intake`; chip "From your answer"; console group "Check Sahoda kept your meaning" first; confidence card, ring and legend count them apart. Live after a fresh free resolve: "0 confirmed · 3 from your answers · 12 still Sahoda's guess". `nextFieldMeta` keeps everything known about unchanged text (also stops a hand edit resetting `document:` citations).
- **BR-15** `buildBrandMessage(payload, field_meta)` tells the model which lines are owner-confirmed, which are the owner's words reworded, and that the rest is a draft.
- **BR-16** a paid re-resolve refuses when the Upstash store is absent: nothing charged, reported; the free path is unaffected.
- Also: console heading counts guesses only; the "only started recording" note shows only for brains without `field_meta`.

Cleanup: every `brand_memory` row the audit created in the QA workspace was deleted from production (13 rows, then the re-resolve's rows after the second verification).

## Decisions owed (all taken)

- **BR-04** send `brain.version` as `p_expected_version` on the field paths (not onboarding) and map VERSION_CONFLICT to "reload".
- **BR-05** filter `searchLibrary`, `readCurrentPassages`, `readDeleteImpact` by the active workspace (knowledge lane).
- **BR-09** a third provenance state for intake-derived fields ("from your answer") so setup answers stop rendering as guesses.
- **BR-15** either pass confirmation into the mesh prompt or narrow "writes from your answers, not its guesses".
- **BR-16** whether "one charge per brain version, unlimited re-runs" still stands with an Upstash-only guard.
