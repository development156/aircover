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
 * One export per screen whose heading is a sentence. Renaming the heading is now
 * a one-line change here, and a rename that forgets this file fails in the same
 * run rather than in production.
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
