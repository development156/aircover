import Image from 'next/image'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'

import { NavItem } from '@/components/shell/nav-item'
import { RailRevealActive } from '@/components/shell/rail-reveal-active'
import { RailFoot } from '@/components/shell/rail-foot'
import { approvalCount } from '@/lib/approvals/read'
import { NAV_FOOT, NAV_GROUPS } from '@/lib/nav/sections'
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
  const isOpsAdmin = await showsAdminItem()
  // THE ONLY BADGE IN THE RAIL, and it is derived rather than sent.
  // `readApprovalQueue` is `cache()`-wrapped, so this share the SAME select the
  // /approvals page runs in the same request — the badge and the header it
  // labels cannot disagree. `undefined` on a failed read, never 0: a zero here
  // would claim nothing is waiting when nothing was counted.
  const waiting = await approvalCount()

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
    <div className="sticky top-0 h-dvh flex-none p-rail-inset">
      <aside
        data-guide="nav.rail"
        data-surface="inverse"
        className="flex h-full w-rail flex-col overflow-hidden rounded-xl bg-surface max-wide:w-rail-collapsed"
      >
        {/* Brand block is exactly topbar-height so the rail's baseline and the
          header's baseline are the same line across the fold. */}
        <div className="flex h-topbar flex-none items-center px-4 max-wide:justify-center max-wide:px-0">
          <Link href="/home" aria-label="Sahoda — go to Home" className="rounded-sm">
            {/* The supplied lockup is mark + wordmark in ONE file. Collapsing the
              rail CROPS the container to the mark rather than scaling the whole
              lockup down into illegibility — which is why this is an
              overflow-hidden box with a fixed height, not a resized image.

              ONE image now, not two. The rail is dark in both themes, so the
              light-mode lockup has nowhere left to render — and a `dark:hidden`
              pair here would swap to the BLACK wordmark on a black panel the
              moment someone flipped the theme. The inverse surface removed a
              whole class of bug rather than restyling one. */}
            <span className="block h-[34px] w-[120px] overflow-hidden max-wide:w-[34px]">
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
          className="scroll-visible scroll-fade flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-2 pb-6 max-wide:px-2"
        >
          {/* Open on the row you are standing on. Without this the rail can
            highlight the current route entirely below the fold, which is the
            same as not highlighting it. */}
          <RailRevealActive />
          {NAV_GROUPS.map((group, index) => (
            // A real <section> per group, labelled by its own heading, so the
            // twenty-one links arrive as six named regions rather than one long
            // list — the same structure a sighted reader gets from the eyebrows.
            <section
              key={group.title ?? 'top'}
              aria-labelledby={group.title ? `nav-group-${index}` : undefined}
              aria-label={group.title ? undefined : 'Main sections'}
              className="flex flex-col gap-nav"
            >
              {group.title ? (
                // A group label, so it must not compete with the active item —
                // hence muted rather than accent. The kit puts this at --text-3
                // (black-45); this app uses --ink-mute instead, because
                // ink-faint.test.ts bans --ink-faint as content text and an 11px
                // uppercase eyebrow at 3.5:1 is the exact string that ban exists
                // for. Accessibility floor wins over an exact colour match.
                //
                // `sr-only` rather than hidden when the rail collapses: the
                // heading is what makes the six regions navigable, and
                // display:none would take it out of the accessibility tree — the
                // same mistake that once left nine nav links unnamed.
                <h2
                  id={`nav-group-${index}`}
                  className="type-eyebrow px-[9px] pt-3 pb-[3px] text-muted max-wide:sr-only"
                >
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
                  soon={item.state === 'soon'}
                  count={item.href === '/approvals' ? waiting : undefined}
                />
              ))}
            </section>
          ))}

          {/* The plumbing. Separated by a rule rather than by an eyebrow: it is a
            different KIND of destination, not a sixth job. */}
          <section
            aria-label="Account and setup"
            className="mt-3 flex flex-col gap-nav border-t border-line-soft pt-3"
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

        {/* The reference's third sidebar block. The rail shipped with two. */}
        <RailFoot />
      </aside>
    </div>
  )
}
