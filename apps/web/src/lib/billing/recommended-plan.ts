import type { PlanId } from '@sahoda/shared'

/**
 * The plan Sahoda points at. Founder's call, 25 August 2026.
 *
 * ── WHY THIS IS ALLOWED WHERE "POPULAR" WAS NOT ──────────────────────────────
 * A "Popular" chip was declined twice on the wallet panel, and the reason was
 * never that badges are tacky. It is that "popular" is a claim about OTHER
 * CUSTOMERS, how many workspaces chose this plan, and nothing in this codebase
 * counts that, so the chip would be a number we cannot produce dressed as a
 * fact.
 *
 * "Recommended" is a claim about US. It says Sahoda suggests this one, which is
 * true by construction the moment someone decides it, and it is checkable by
 * asking that person. Same shape of chip, completely different epistemics.
 *
 * ── AND IT IS NOT THE DEFAULT SELECTION ──────────────────────────────────────
 * `top-up-panel.tsx` keeps `DEFAULT_PLAN` at `starter`. Recommending a plan and
 * pre-selecting it are different acts: the second decides what the checkout will
 * charge if somebody presses the button without reading. Flip that on purpose.
 *
 * ── WHY A MODULE OF ITS OWN, WHICH LOOKS LIKE OVERKILL FOR ONE STRING ────────
 * Two screens point at this plan now: the wallet panel and the dashboard's plan
 * offer. It was briefly a `const` in each, with a comment claiming a test kept
 * them in step; no such test existed, so two screens could have recommended
 * different plans and nothing would have said so. Importing it from the wallet
 * panel instead was worse: that pulls the whole panel into /home's bundle, which
 * `js-budget` measured at **+236.5 kB** and failed the build for. A leaf module
 * costs nothing and cannot disagree with itself.
 *
 * ── AND NOT IN `PLAN_CATALOG` ────────────────────────────────────────────────
 * A `recommended` field in `packages/shared` would be the tidier home, but which
 * plan a screen points at is a presentation choice. The catalog stays the
 * contract.
 */
export const RECOMMENDED_PLAN: PlanId = 'growth'
