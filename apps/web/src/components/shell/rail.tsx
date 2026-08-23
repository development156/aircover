import { Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'

import { NavItem } from '@/components/shell/nav-item'
import { RailRevealActive } from '@/components/shell/rail-reveal-active'
import { RailFoot, RailFootSkeleton } from '@/components/shell/rail-foot'
import { approvalCount } from '@/lib/approvals/read'
import { RailToggle } from '@/components/shell/rail-toggle'
import { NAV_FOOT, RAIL_GROUPS } from '@/lib/nav/sections'
import { getOpsAdmin } from '@/lib/ops/guard'

/**
 * The rail — every section of the product, grouped by the job it does.
 *
 * ── WHAT CHANGED, AND WHY IT HAD TO ──────────────────────────────────────────
 * This held nine hand-written items and a comment reading "Full nav (Loop,
 * Measure, …) lands with its modules". Twelve more sections had been built or
 * designed since, and the only way to reach any of them was to type the URL.
 * Approvals, Campaigns and Assets were finished features nobody could find.
 *
 * The list now lives in `lib/nav/sections.ts` — one map, three surfaces (this,
 * the phone's More sheet, the command palette). The grouping and its reasoning
 * are documented there rather than here, because they are a product decision,
 * not a rendering one.
 *
 * ── SITES IS BACK, AND THE OLD REASON IS RECORDED ────────────────────────────
 * It was hidden because the deploy half is unowned: `sites.status` never leaves
 * 'draft', so a customer could only ever be shown a preview of an address they
 * cannot have. That is still true, and it is no longer a reason to hide the
 * section — the screen says "preview" in every string, renders the contact
 * section formless because no lead route is mounted, and never claims a URL.
 * A working generator reachable only by typing a path is a worse answer than a
 * visible one that is honest about where it stops.
 *
 * The second, sharper objection is also gone: `site_generate` could author
 * testimonials and attribute them to customers who do not exist (docs/22 F3).
 * The refusal now sits on the write path in `packages/sites/src/normalize/
 * attested.ts`, proved against output that DOES carry fabricated quotes.
 *
 * ── EVERY GROUP HEADING IS A LABEL, NOT A CONTROL ────────────────────────────
 * They do not collapse. A collapsible group hides destinations behind a state
 * the user has to remember setting, and the whole point of this pass is that
 * nothing in the product is unreachable.
 *
 * ── AND AS OF 2026-08-23 NO HEADING IS DRAWN AT ALL ──────────────────────────
 * The founder's verdict was "dull, and the text is too faded". MEASURED, the
 * text is not faded: `--ink-mute` on the inverse surface is #979797 on #171717,
 * **6.14:1**, comfortably past AA at every size in this rail. Raising it would
 * have made a crowded list LOUDER and still crowded.
 *
 * What was actually wrong is how many things were on screen. MEASURED on
 * `page-dash-before__populated__home__full__1440__light`: twenty-one links,
 * FIVE uppercase group eyebrows and six "SOON" labels — thirty-two pieces of
 * text — against the reference's twelve flat items and no headings at all. At
 * 900px the list did not fit: `Connections`, `Wallet` and `Settings` were below
 * the rail's own fold, so the three destinations you reach for when something
 * is wrong needed a scroll to find.
 *
 * Three changes, and none of them is a colour:
 *
 *   · the roadmap left the rail (`RAIL_GROUPS`, and see sections.ts for how
 *     that squares with the earlier ruling that it must stay visible) — and
 *     three of those six SOON labels were on screens that had been BUILT;
 *   · the group headings became `sr-only` at every width instead of only when
 *     collapsed. Six named regions survive for a screen reader; the eye gets
 *     the gap between them, which is what the reference uses and is enough;
 *   · the rail collapses, and OPENS COLLAPSED.
 *
 * Fifteen links, no eyebrows, no SOON. It fits at 900px with room to spare.
 *
 * ── THE COLLAPSE IS CSS, SO THE RAIL STAYS A SERVER COMPONENT ────────────────
 * `data-rail` on <html>, written before first paint by `RailScript`, read by
 * the `rail-min` variant. The only client component is the 26px button. Putting
 * the state in React would have shipped the nav map, the approval count and the
 * ops-admin check to the browser to move a width.
 *
 * EVERY LABEL GOES `sr-only`, NEVER `display:none`. That is not a preference:
 * it is the defect this shell already shipped once. `display:none` removes the
 * node from the accessibility tree and takes the link's NAME with it, and nine
 * nav items announced as unnamed links across every width from 768 to 1179.
 * `shell-widths.spec.ts` reads `link.textContent()` at six widths and is what
 * holds it; `rail-collapse.spec.ts` now holds the same property against the
 * TOGGLED state, which no media query can reach.
 */

/**
 * Is this viewer an ops admin? Never a reason to break the shell.
 *
 * The rail renders on every page in the app, so a failed ops_admins read must
 * cost one nav item and nothing else. Same lesson as Topbar's softRead: a
 * layout's throw does not reach the segment error boundary, it reaches
 * global-error and replaces the document. Falling back to `false` hides the
 * Admin item, which is the safe direction — the link is a convenience, and
 * `/admin` is gated by middleware and by the layout regardless of whether
 * anything links to it.
 */
async function showsAdminItem(): Promise<boolean> {
  try {
    return (await getOpsAdmin()) !== null
  } catch (error) {
    Sentry.captureException(error, { tags: { shell_read: 'ops_admin' } })
    return false
  }
}

export async function Rail() {
  /**
   * ── ONE WAIT, NOT TWO ────────────────────────────────────────────────────
   * "Is this viewer an ops admin" and "how many approvals are waiting" have
   * nothing to do with each other, and awaiting them one after the other made
   * the rail — which renders on EVERY page — cost two round trips to
   * ap-south-1 before any of it could render.
   *
   * MEASURED 2026-08-23 across 80 route loads against a production build:
   * `ops_admins` p50 71ms. That is 71ms taken off the critical path of every
   * navigation in the product, for a change that alters no output at all.
   *
   * `Promise.all` is safe here because neither side throws: `showsAdminItem`
   * catches into `false`, and `approvalCount` returns `undefined` on a failed
   * read rather than rejecting. A rail that goes down because a badge could not
   * be counted would take the whole document with it — a layout's throw reaches
   * global-error, not the segment boundary.
   */
  const [isOpsAdmin, waiting] = await Promise.all([showsAdminItem(), approvalCount()])

  return (
    /* ── THE RAIL FLOATS, AND IT IS DARK IN BOTH THEMES (v5) ──────────────────
       Two changes, one idea. MEASURED off the reference: a rounded panel inset
       10px from every viewport edge, radius 28px, fill #171717, against a
       #fafafa page. That inset is what makes the rail read as an OBJECT on the
       page rather than a wall beside it, and it is most of the reference's feel.

       The outer div owns the inset and the stickiness; the panel is `h-full`
       inside it. Written that way rather than as `h-[calc(100dvh - 20px)]`
       deliberately — a calc with a mis-spaced operator is invalid CSS that the
       browser drops SILENTLY while the class sits in the markup and in the
       compiled stylesheet, so it looks applied and is not.

       `data-surface="inverse"` is the load-bearing attribute. The panel's fill
       does NOT follow the theme, so its text tokens cannot either: without the
       scope, `text-ink` is #000000 here and the whole rail is black on
       near-black in light mode. See THE INVERSE SURFACE in tokens.css. */
    <div className="sticky top-0 h-dvh flex-none p-rail-inset relative">
      <aside
        data-guide="nav.rail"
        data-surface="inverse"
        /* Three widths, two reasons. `w-rail` (240) is the labelled rail;
           `rail-min` collapses it, and the collapsed width differs by WHICH
           reason collapsed it — 56px when the 700-1179 band forces it, where
           the content column has no spare pixels, and the reference's own 62px
           when the reader chose it at >=1180, where nobody is short. The two
           are separate tokens with that argument written on them in
           tokens.css. */
        className="flex h-full flex-col overflow-hidden rounded-xl bg-surface max-wide:w-rail-collapsed rail-icon:w-rail-min rail-wide:w-rail"
      >
        {/* Brand block is exactly topbar-height so the rail's baseline and the
          header's baseline are the same line across the fold. */}
        <div className="flex h-topbar flex-none items-center px-4 rail-min:justify-center rail-min:px-0">
          <Link href="/home" aria-label="Sahoda, go to Home" className="rounded-sm">
            {/* The supplied lockup is mark + wordmark in ONE file. Collapsing the
              rail CROPS the container to the mark rather than scaling the whole
              lockup down into illegibility — which is why this is an
              overflow-hidden box with a fixed height, not a resized image.

              ONE image now, not two. The rail is dark in both themes, so the
              light-mode lockup has nowhere left to render — and a `dark:hidden`
              pair here would swap to the BLACK wordmark on a black panel the
              moment someone flipped the theme. The inverse surface removed a
              whole class of bug rather than restyling one. */}
            <span className="block h-[34px] w-[120px] overflow-hidden rail-min:w-[34px]">
              <Image
                src="/brand/logo-white.png"
                alt="Sahoda"
                width={120}
                height={34}
                priority
                className="block h-[34px] w-[120px] max-w-none"
              />
            </span>
          </Link>
        </div>

        {/* ── THE RAIL SCROLLS, AND IT HAS TO SAY SO ────────────────────────────
          MEASURED at 1440x900 on 2026-08-20: twenty-one items at 34px, five
          group headings, the brand block and the foot come to roughly 1050px
          against a 900px viewport, so `Automate` and all three foot links sat
          below the fold with NO visual cue that anything was down there. An
          overflow container that looks like a finished list is worse than a
          short list.

          Two answers together, and neither is "show fewer sections". The
          headings lost 6px of padding each, and `.scroll-fade` masks the last
          20px of the region so the edge FADES rather than stopping — the cue
          that does not depend on the engine.

          `.scroll-visible` is there too and it is not what fixed this:
          `scrollbar-width: thin`, that property scoped away, and a forced
          `::-webkit-scrollbar` width were each measured at ZERO layout width in
          headless Chromium. It styles the bar for the engines that honour it,
          and the mask covers the ones that do not. */}
        <nav
          aria-label="Main"
          /* `pb-6` and not `py-2`. The fade mask covers the last 20px of this
           box, and with 8px of bottom padding the clip landed THROUGH the
           middle of whatever row was there — MEASURED at 1440x900, the word
           AUTOMATE sliced horizontally in half on /home, /create, /loop and
           /playbooks. A half-height word reads as broken layout, not as "more
           below". With 24px the fade falls on space, so a partially scrolled
           list ends in a soft edge instead of a bisected glyph. */
          id="rail-nav"
          className="scroll-visible scroll-fade flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-2 pb-6 rail-min:px-2"
        >
          {/* Open on the row you are standing on. Without this the rail can
            highlight the current route entirely below the fold, which is the
            same as not highlighting it. */}
          <RailRevealActive />
          {RAIL_GROUPS.map((group, index) => (
            // A real <section> per group, named, so fifteen links arrive as six
            // named regions rather than one long list. The NAME survives; only
            // its rendering changed.
            <section
              key={group.title ?? 'top'}
              aria-labelledby={group.title ? `nav-group-${index}` : undefined}
              aria-label={group.title ? undefined : 'Main sections'}
              /* The gap that replaces the eyebrow. `mt-3` on every group after
                 the first, so the eye reads five clusters where it used to read
                 five headings — which is what the reference does and is the
                 whole of what the heading was buying at a glance. */
              className={`flex flex-col gap-nav${index > 0 ? ' mt-3' : ''}`}
            >
              {group.title ? (
                /* `sr-only` AT EVERY WIDTH now, not only when collapsed.
                   Five uppercase eyebrows were a third of the text in this rail
                   and the reference has none. The heading is still what makes
                   the six regions navigable by a screen reader, so it is hidden
                   the way a name must be hidden — clipped, never `display:none`,
                   which is the mistake that once left nine nav links unnamed. */
                <h2 id={`nav-group-${index}`} className="sr-only">
                  {group.title}
                </h2>
              ) : null}
              {group.items.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  guide={item.guide}
                  count={item.href === '/approvals' ? waiting : undefined}
                />
              ))}
            </section>
          ))}

          {/* The plumbing. Separated by a rule rather than by an eyebrow: it is a
            different KIND of destination, not a sixth job. */}
          <section
            aria-label="Account and setup"
            className="mt-4 flex flex-col gap-nav border-t border-line-soft pt-4"
          >
            {NAV_FOOT.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                guide={item.guide}
              />
            ))}
            {/* doc 13 §14: visible only to ops admins. Absence is the point — a
              greyed-out Admin item would tell every tenant the console exists. */}
            {isOpsAdmin ? (
              <NavItem href="/admin/dev" label="Admin" icon="shield" guide="nav.admin" />
            ) : null}
          </section>
        </nav>

        {/*
          The reference's third sidebar block. The rail shipped with two.

          ── WHY IT STREAMS, AND WHY THAT IS THE BIGGEST NUMBER IN THIS FILE ────
          `RailFoot` calls Clerk's `currentUser()`, which is a network round trip to
          api.clerk.com — not a local read of the session JWT the way `auth()` is.
          MEASURED 2026-08-23 across 80 route loads against a production build:
          p50 354ms, mean 417ms, max 791ms, and 61% of ALL outbound wall time in
          the sweep. It is spent to render one display name.

          Because the rail is in the layout, that call was on the critical path of
          every authenticated page: nothing at all reached the browser until Clerk
          answered. It is why FCP landed a flat ~40ms after TTFB on all 40 routes —
          the page was never waiting on JavaScript, it was waiting on this.
          `loading.tsx` could not help either: it gives the PAGE a boundary, and
          the shell that would paint the skeleton was itself blocked here.

          A Suspense boundary lets the document flush without it. Nothing about the
          data changes — `currentUser()` is still the source of truth for the name,
          so no stale value is introduced, which is what reading `users_profile`
          instead would have risked (that table is written once by
          `bootstrap_workspace` and never refreshed).

          The surrounding <div> is wt-design3's v5 shell. Both survive: the shell
          owns the structure, this boundary owns when it flushes.
        */}
        <Suspense fallback={<RailFootSkeleton />}>
          <RailFoot />
        </Suspense>
      </aside>
      {/* On the WRAPPER, not in the panel: the panel is `overflow-hidden` so it
          can clip the lockup and the scroll fade, and a control straddling its
          edge would be sliced in half. See rail-toggle.tsx. */}
      <RailToggle />
    </div>
  )
}
