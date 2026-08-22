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
      // Remix moved ABOVE Studio on 2026-08-21, and the move is the ordering rule
      // working rather than a preference: it became `live`, and `reachable.test.ts`
      // requires everything built to come before everything unbuilt inside a
      // group. Leaving it in place would have failed that test.
      {
        href: '/remix',
        label: 'Remix',
        icon: 'shuffle',
        guide: 'nav.remix',
        hint: 'Turn one post into a week of them',
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
        href: '/sites',
        label: 'Sites',
        icon: 'globe',
        guide: 'nav.sites',
        hint: 'Generate a website from your Brand Brain',
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
        state: 'soon',
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
        state: 'soon',
      },
      {
        href: '/playbooks',
        label: 'Playbooks',
        icon: 'book-open',
        guide: 'nav.playbooks',
        hint: 'When this happens, write that',
        state: 'soon',
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
