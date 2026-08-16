import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'

import { NavItem, type NavIconName } from '@/components/shell/nav-item'
import { getOpsAdmin } from '@/lib/ops/guard'

// Alpha nav subset only — every href has a real page (typedRoutes enforces it).
// Full nav (Loop, Measure, …) lands with its modules per docs/06 §3.
//
// SITES IS PRESENT AGAIN, by operator instruction during the UI port
// (.claude/UI_PORT_CHECKPOINT.md). It was previously omitted on purpose, and
// that reasoning has NOT been retired — only overruled: the deploy half is
// still unowned (no Cloudflare client, `sites.status` never leaves 'draft'), so
// the module shows a customer a preview of an address they cannot yet have.
// Restoring the entry is one line; removing it again is the same line. If the
// deploy half is still unowned when this ships, that is the thing to fix — not
// this list.
const NAV: ReadonlyArray<{
  href: Route
  label: string
  icon: NavIconName
  guide: string
  section?: string
}> = [
  { href: '/home', label: 'Home', icon: 'house', guide: 'nav.home' },
  // Above the Create section on purpose: the Brand Brain is what every screen
  // below it writes FROM, and until now the core of the product had no entry in
  // the nav at all — reachable only by finishing onboarding.
  { href: '/brain', label: 'Brand Brain', icon: 'brain-circuit', guide: 'nav.brain' },
  { href: '/posts', label: 'Posts', icon: 'square-pen', guide: 'nav.posts', section: 'Create' },
  { href: '/planner', label: 'Planner', icon: 'calendar-days', guide: 'nav.planner' },
  { href: '/inbox', label: 'Inbox', icon: 'messages-square', guide: 'nav.inbox' },
  { href: '/sites', label: 'Sites', icon: 'globe', guide: 'nav.sites' },
  { href: '/analytics', label: 'Analytics', icon: 'chart-column', guide: 'nav.analytics' },
  { href: '/connections', label: 'Connections', icon: 'link-2', guide: 'nav.connections' },
  { href: '/wallet', label: 'Wallet', icon: 'wallet', guide: 'nav.wallet' },
  { href: '/settings', label: 'Settings', icon: 'sliders-horizontal', guide: 'nav.settings' },
]

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

  return (
    <aside
      data-guide="nav.rail"
      className="sticky top-0 flex h-dvh w-rail flex-col border-r border-line-soft bg-surface max-wide:w-rail-collapsed"
    >
      {/* Brand block is exactly topbar-height so the rail's baseline and the
          header's baseline are the same line across the fold. */}
      <div className="flex h-topbar flex-none items-center px-4 max-wide:justify-center max-wide:px-0">
        <Link href="/home" aria-label="Sahoda — go to Home" className="rounded-sm">
          {/* The supplied lockup is mark + wordmark in ONE file. Collapsing the
              rail CROPS the container to the mark rather than scaling the whole
              lockup down into illegibility — which is why this is an
              overflow-hidden box with a fixed height, not a resized image. */}
          <span className="block h-[34px] w-[120px] overflow-hidden max-wide:w-[34px]">
            <Image
              src="/brand/logo-dark.png"
              alt="Sahoda"
              width={120}
              height={34}
              priority
              className="block h-[34px] w-[120px] max-w-none dark:hidden"
            />
            <Image
              src="/brand/logo-white.png"
              alt=""
              aria-hidden
              width={120}
              height={34}
              className="hidden h-[34px] w-[120px] max-w-none dark:block"
            />
          </span>
        </Link>
      </div>
      <nav
        aria-label="Main"
        className="flex min-h-0 flex-1 flex-col gap-[2px] overflow-y-auto px-3 py-2 max-wide:px-2"
      >
        {NAV.map((item) => (
          <div key={item.href}>
            {/* A group label, so it must not compete with the active item —
                hence muted rather than accent. The kit puts this at --text-3
                (black-45); this app uses --ink-mute instead, because
                ink-faint.test.ts bans --ink-faint as content text and an 11px
                uppercase eyebrow at 3.5:1 is the exact string that ban exists
                for. Accessibility floor wins over an exact colour match. */}
            {item.section ? (
              <div className="type-eyebrow px-[9px] pt-4 pb-[5px] text-muted max-wide:hidden">
                {item.section}
              </div>
            ) : null}
            <NavItem href={item.href} label={item.label} icon={item.icon} guide={item.guide} />
          </div>
        ))}
        {/* doc 13 §14: visible only to ops admins. Absence is the point — a
            greyed-out Admin item would tell every tenant the console exists. */}
        {isOpsAdmin ? (
          <div className="mt-3 border-t border-line-soft pt-3">
            <NavItem href="/admin/dev" label="Admin" icon="shield" guide="nav.admin" />
          </div>
        ) : null}
      </nav>
    </aside>
  )
}
