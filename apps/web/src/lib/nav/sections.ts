import type { Route } from 'next'

import type { NavIconName } from '@/components/shell/nav-item'

/**
 * THE INFORMATION ARCHITECTURE, IN ONE PLACE.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * Three surfaces navigate this app — the rail, the phone's bottom bar and its
 * More sheet, and the command palette — and until now each held its own hand-
 * written list. With nine destinations that is survivable. With twenty-one it is
 * not: the palette already carried a comment explaining that it deliberately
 * omitted `/sites` "for the same reason the rail does", which is a comment that
 * exists only because the two lists could disagree.
 *
 * One list. Every surface projects it. A section added here appears in all three
 * or in none, and `typedRoutes` refuses an href with no page behind it.
 *
 * ── THE GROUPING, AND WHY IT IS THIS ─────────────────────────────────────────
 * Twenty-one items in a flat rail is a wall of labels a shop owner has to read
 * end to end. The grouping has to answer the question they arrived with, so the
 * groups are named for the JOB rather than for the module:
 *
 *   Create     — make the thing
 *   Publish    — get it out into the world
 *   Customers  — the people who answered
 *   Results    — whether it worked
 *   Automate   — have Sahoda do it without you
 *
 * Three verbs and two nouns, which is not grammatically tidy, and each is the
 * plainest word for its own group — "Engage" and "Measure" are what a marketing
 * tool calls these, not what somebody running a bakery calls them. Clarity wins
 * over symmetry in a menu that has to be read at a glance.
 *
 * HOME AND BRAND BRAIN SIT ABOVE THE GROUPS, ungrouped. Home is where you land,
 * and the Brand Brain is what every screen below it writes FROM — it belongs to
 * all five groups, so it belongs to none of them.
 *
 * ── WITHIN A GROUP, WHAT WORKS COMES FIRST ───────────────────────────────────
 * Every group lists its built sections before its unbuilt ones. The eye lands on
 * something that works, and the roadmap trails it rather than interrupting it.
 * `Automate` is entirely unbuilt, which is why it sits last of the five: a
 * reader who never scrolls that far has missed nothing they could use today.
 *
 * ── AND WHY THE UNBUILT ONES ARE HERE AT ALL ─────────────────────────────────
 * Founder's ruling: the roadmap should be VISIBLE. A hidden feature teaches
 * nobody what the product is for, and Sahoda's whole pitch — one weekly loop
 * that learns — is invisible if the Loop is not in the menu. The condition is
 * that "visible" must never read as "available", which is what `state: 'soon'`
 * carries into every surface that renders this list.
 *
 * ── VISIBLE SOMEWHERE IS NOT VISIBLE IN THE RAIL (2026-08-23) ────────────────
 * A second founder ruling arrived and it reads against the first at first
 * glance: "five SOON items are roadmap, not navigation — a person cannot use
 * them today." Both are the same founder and neither is withdrawn, so they are
 * read together: the roadmap stays VISIBLE, in ONE place rather than five, and
 * that place is not the working list you navigate with every day.
 *
 * `RAIL_GROUPS` is the projection that carries it — `live` only. The roadmap
 * still renders, with its "Soon" state intact, in the two surfaces whose job is
 * to show the whole product: the command palette (`ALL_SECTIONS`) and the
 * phone's More sheet (`NAV_GROUPS`). Nothing is unreachable and nothing is
 * silently deleted; one list got shorter.
 *
 * ── AND FOUR OF THE SIX `soon` FLAGS WERE STALE, WHICH IS MOST OF THE NOISE ──
 * MEASURED 2026-08-23 against `e2e/roadmap-honesty.spec.ts`, whose ALLOWED list
 * is down to `/radar` and `/studio` and whose header records `/loop`,
 * `/playbooks` and `/report` LEAVING it because they were built. Confirmed at
 * the source: `/loop`, `/report` and `/playbooks` each open a live read
 * (`readLoop`, `readRanking`, `readPlaybooksSnapshot`) and render rows out of
 * the database; `/studio` and `/ads` open no read at all and are drawings.
 * `/radar` reads live but its own page says the weekly scan is not built, so it
 * stays `soon` — a person still cannot use it today.
 *
 * So three of the six SOON labels the rail was showing were on working screens.
 * Correcting them is not a loosening: it removes the word from three sections
 * that had stopped deserving it, and `roadmap-honesty.spec.ts` is what would
 * catch it if any of them started lying again.
 *
 * ── THREE BUILT SECTIONS LEFT THE MENU ENTIRELY (2026-08-25) ─────────────────
 * Founder's ruling: `/playbooks`, `/remix` and `/sites` are hidden. Not marked
 * `soon`, not moved down a group — REMOVED from this list, and so from all three
 * surfaces at once.
 *
 * `soon` would have been the wrong tool and the wrong claim. It means "drawn,
 * not built", and all three of these are built and working. Labelling a working
 * screen "Soon" to get it out of the rail is the kind of small lie the two
 * rulings above exist to prevent.
 *
 * So they are simply absent, and each is declared in `NOT_A_NAV_SECTION` in
 * `reachable.test.ts` with how it is now reached. `/sites` still has a real door
 * — the Leads page links to it. `/playbooks` and `/remix` have none and are
 * URL-only, which is stated there rather than left to be discovered.
 *
 * The routes are untouched. Hiding a section is one deletion from this array;
 * restoring it is one addition. Nothing else needs to change.
 */

/** Built and connected, or drawn and honest about it. There is no third state. */
export type NavState = 'live' | 'soon'

export interface NavSection {
  href: Route
  label: string
  icon: NavIconName
  /** Tour anchor. `data-guide` on the rendered item. */
  guide: string
  /** One line, for the command palette. Says what the section is FOR. */
  hint: string
  state: NavState
}

export interface NavGroup {
  /** `null` for the ungrouped items at the top of the rail. */
  title: string | null
  items: readonly NavSection[]
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: null,
    items: [
      {
        href: '/home',
        label: 'Home',
        icon: 'house',
        guide: 'nav.home',
        hint: 'Today, and what needs you',
        state: 'live',
      },
      {
        href: '/brain',
        label: 'Brand Brain',
        icon: 'brain-circuit',
        guide: 'nav.brain',
        hint: 'What Sahoda knows about your business',
        state: 'live',
      },
    ],
  },
  {
    title: 'Create',
    items: [
      {
        href: '/posts',
        label: 'Posts',
        icon: 'square-pen',
        guide: 'nav.posts',
        hint: 'Write, approve and publish',
        state: 'live',
      },
      {
        href: '/campaigns',
        label: 'Campaigns',
        icon: 'megaphone',
        guide: 'nav.campaigns',
        hint: 'Group posts under one push',
        state: 'live',
      },
      {
        href: '/assets',
        label: 'Assets',
        icon: 'images',
        guide: 'nav.assets',
        hint: 'Photos you can reuse on any post',
        state: 'live',
      },
      {
        href: '/studio',
        label: 'Studio',
        icon: 'palette',
        guide: 'nav.studio',
        hint: 'Carousels and quote cards, locked to your brand',
        state: 'soon',
      },
    ],
  },
  {
    title: 'Publish',
    items: [
      {
        href: '/planner',
        label: 'Planner',
        icon: 'calendar-days',
        guide: 'nav.planner',
        hint: 'The schedule, week by week',
        state: 'live',
      },
      {
        href: '/approvals',
        label: 'Approvals',
        icon: 'check-check',
        guide: 'nav.approvals',
        hint: 'Everything waiting on your decision',
        state: 'live',
      },
      {
        href: '/ads',
        label: 'Ads',
        icon: 'target',
        guide: 'nav.ads',
        hint: 'Paid spend, beside the posts it supports',
        state: 'soon',
      },
    ],
  },
  {
    title: 'Customers',
    items: [
      {
        href: '/inbox',
        label: 'Inbox',
        icon: 'messages-square',
        guide: 'nav.inbox',
        hint: 'Comments, messages and reviews',
        state: 'live',
      },
      {
        href: '/leads',
        label: 'Leads',
        icon: 'user-round-plus',
        guide: 'nav.leads',
        hint: 'Enquiries, from first message to sale',
        state: 'live',
      },
    ],
  },
  {
    title: 'Results',
    items: [
      {
        href: '/analytics',
        label: 'Analytics',
        icon: 'chart-column',
        guide: 'nav.analytics',
        hint: 'What went out, and how it did',
        state: 'live',
      },
      {
        href: '/report',
        label: 'CMO Report',
        icon: 'file-text',
        guide: 'nav.report',
        hint: 'The Monday read on your week',
        state: 'live',
      },
      {
        href: '/radar',
        label: 'Radar',
        icon: 'radar',
        guide: 'nav.radar',
        hint: 'What the businesses beside you are doing',
        state: 'soon',
      },
    ],
  },
  {
    title: 'Automate',
    items: [
      {
        href: '/loop',
        label: 'The Loop',
        icon: 'refresh-cw',
        guide: 'nav.loop',
        hint: 'The weekly cycle, and how much it may do alone',
        state: 'live',
      },
    ],
  },
]

/**
 * The plumbing, pinned to the bottom of the rail.
 *
 * These three are not a sixth group. They are the things you go to when
 * something is wrong or something has to be paid for — a different kind of
 * errand from the five above, and grouping them with the work would put
 * "Settings" in the same visual class as "Posts".
 */
export const NAV_FOOT: readonly NavSection[] = [
  {
    href: '/connections',
    label: 'Connections',
    icon: 'link-2',
    guide: 'nav.connections',
    hint: 'Channels and accounts',
    state: 'live',
  },
  {
    href: '/wallet',
    label: 'Wallet',
    icon: 'wallet',
    guide: 'nav.wallet',
    hint: 'Credits, and what each one bought',
    state: 'live',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: 'sliders-horizontal',
    guide: 'nav.settings',
    hint: 'Workspace preferences',
    state: 'live',
  },
]

/** Every section, flat, in rail order. For the palette and the phone's sheet. */
export const ALL_SECTIONS: readonly NavSection[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  ...NAV_FOOT,
]

/**
 * WHAT THE RAIL SHOWS: the sections you can use today.
 *
 * A projection of `NAV_GROUPS`, not a second list — a section added above
 * appears here the moment its `state` becomes `live`, and there is no third
 * place for the two to drift apart. Groups that empty out drop away rather than
 * rendering a heading over nothing.
 *
 * The GROUPS SURVIVE HERE even though the rail no longer draws their titles.
 * They are what puts a gap between Posts and Planner, and they are what the
 * rail's `<section aria-label>` regions are built from — six named regions to a
 * screen reader, five silent gaps to the eye. Flattening the data instead would
 * have taken the accessibility structure with the visual one, and would have
 * made `reachable.test.ts`'s ordering rule vacuous rather than failing.
 */
export const RAIL_GROUPS: readonly NavGroup[] = NAV_GROUPS.map((group) => ({
  title: group.title,
  items: group.items.filter((item) => item.state === 'live'),
})).filter((group) => group.items.length > 0)

/** The roadmap, for any surface that wants to state what is NOT in the rail. */
export const ROADMAP_SECTIONS: readonly NavSection[] = NAV_GROUPS.flatMap((group) =>
  group.items.filter((item) => item.state === 'soon'),
)
