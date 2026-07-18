import { NavItem, type NavIconName } from '@/components/shell/nav-item'

// Alpha nav subset only — every href has a real page (typedRoutes enforces it).
// Full nav (Loop, Sites, Inbox, Measure, …) lands with its modules per docs/06 §3.
const NAV: ReadonlyArray<{
  href: '/home' | '/posts' | '/planner' | '/connections' | '/settings'
  label: string
  icon: NavIconName
  guide: string
  section?: string
}> = [
  { href: '/home', label: 'Home', icon: 'house', guide: 'nav.home' },
  { href: '/posts', label: 'Posts', icon: 'square-pen', guide: 'nav.posts', section: 'Create' },
  { href: '/planner', label: 'Planner', icon: 'calendar-days', guide: 'nav.planner' },
  { href: '/connections', label: 'Connections', icon: 'link-2', guide: 'nav.connections' },
  { href: '/settings', label: 'Settings', icon: 'sliders-horizontal', guide: 'nav.settings' },
]

export function Rail() {
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
              <div className="mt-3 mb-1 px-3 font-mono text-[11px] font-semibold tracking-[0.14em] text-accent uppercase max-wide:hidden">
                {item.section}
              </div>
            ) : null}
            <NavItem href={item.href} label={item.label} icon={item.icon} guide={item.guide} />
          </div>
        ))}
      </nav>
    </aside>
  )
}
