/**
 * The `h1` a screen actually renders, where that is not the section's own name.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `/radar`'s heading was changed from the noun "Radar" to a sentence, and four
 * assertions in three specs pinned the noun. None of them could go red here: the
 * smoke leg has no working environment in this repository (root CLAUDE.md), so
 * the change would have reached `wt-web` and failed there. The literal lived in
 * four places, which is why moving it broke three files and the person moving it
 * saw none of them.
 *
 * One export per screen whose heading is a sentence, so the three specs share
 * one pattern instead of four literals.
 *
 * ── IT IS TWO PLACES, NOT ONE, AND SOMETHING HAS TO HOLD THEM EQUAL ──────────
 * This file used to claim renaming the heading was "a one-line change here". It
 * is not: the sentence also lives in the page, so a rename needs two edits and
 * forgetting the second is the exact failure this file exists to prevent.
 * MEASURED 2026-09-01 — `grep` finds it in `radar/page.tsx:106` and on line 30
 * below.
 *
 * They are not merged into one constant on purpose. The page importing from
 * `e2e/` would ship test code into the bundle, and this file importing from
 * `@/…` depends on module resolution inside Playwright's runner, which cannot be
 * verified in this repository because the suite does not run here. An
 * unverifiable change to a guard is what caused the original defect.
 *
 * So `radar/heading.guard.test.ts` asserts the two are equal, in the leg that
 * DOES run. A rename that forgets this file now fails in `pnpm gate` seconds
 * later, rather than in production where the smoke leg would have caught it if
 * anyone could run it.
 *
 * The patterns are ANCHORED on purpose. Playwright's `name` option matches a
 * substring by default, so an unanchored pattern would keep passing against a
 * heading that merely CONTAINS the words — which is the guard quietly going
 * soft rather than going red.
 */

/**
 * `/radar` — `app/(app)/radar/page.tsx`.
 *
 * The section name still appears on the screen, as the `type-eyebrow` paragraph
 * above the heading. It is deliberately NOT the `h1`: a screen that has to
 * explain itself to a first-time reader leads with a sentence. `/home` is the
 * precedent and `greeting-banner.tsx` is its heading.
 */
export const RADAR_H1 = /^Stay ahead of what matters\.$/
