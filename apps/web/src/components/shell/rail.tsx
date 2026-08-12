import type { Route } from 'next'
import * as Sentry from '@sentry/nextjs'

import { NavItem, type NavIconName } from '@/components/shell/nav-item'
import { getOpsAdmin } from '@/lib/ops/guard'

// Alpha nav subset only — every href has a real page (typedRoutes enforces it).
// Full nav (Loop, Sites, Inbox, Measure, …) lands with its modules per docs/06 §3.
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
  { href: '/analytics', label: 'Analytics', icon: 'chart-column', guide: 'nav.analytics' },
  { href: '/sites', label: 'Sites', icon: 'globe', guide: 'nav.sites' },
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
      className="sticky top-0 flex h-dvh w-rail flex-col gap-1 border-r border-line bg-bg px-3 py-[18px] max-wide:w-rail-collapsed max-wide:px-2"
    >
      <div className="mb-4 flex items-center gap-[10px] px-3 max-wide:justify-center max-wide:px-0">
        {/* Blade glyph placeholder — real SVG mask (auto-tints with Brand Skin) later */}
        <span aria-hidden className="size-[18px] shrink-0 rounded-[5px] bg-primary" />
        <span className="text-[17px] font-extrabold tracking-[-0.01em] max-wide:hidden">
          Sahoda
        </span>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV.map((item) => (
          <div key={item.href}>
            {item.section ? (
              <div className="type-eyebrow mt-3 mb-1 px-3 text-accent max-wide:hidden">
                {item.section}
              </div>
            ) : null}
            <NavItem href={item.href} label={item.label} icon={item.icon} guide={item.guide} />
          </div>
        ))}
        {/* doc 13 §14: visible only to ops admins. Absence is the point — a
            greyed-out Admin item would tell every tenant the console exists. */}
        {isOpsAdmin ? (
          <div className="mt-3 border-t border-line pt-3">
            <NavItem href="/admin/dev" label="Admin" icon="shield" guide="nav.admin" />
          </div>
        ) : null}
      </nav>
    </aside>
  )
}
