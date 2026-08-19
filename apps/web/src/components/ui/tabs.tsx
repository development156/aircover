import Link from 'next/link'
import type { Route } from 'next'

import { cn } from '@/lib/utils'

/**
 * Section tabs, as LINKS.
 *
 * ── WHY LINKS AND NOT BUTTONS ────────────────────────────────────────────────
 * Every tab in this app changes the URL — `/brain`, `/brain/identity`, and so
 * on. A control that navigates is a link: it opens in a new tab on
 * cmd-click, it is in the page's link list for a screen reader, and it survives
 * a reload. Buttons that call `router.push` do none of that.
 *
 * `aria-current="page"` carries the state, so the underline is confirmation
 * rather than the only signal. The label also goes to full weight when current
 * — two structural cues, because the underline alone is a 2px line that a
 * greyscale or low-vision reader can easily miss.
 */
export interface TabItem {
  href: string
  label: string
  current?: boolean
}

export function Tabs({ label, items }: { label: string; items: readonly TabItem[] }) {
  return (
    <nav aria-label={label} className="border-b border-line-soft">
      <ul className="-mb-px flex flex-wrap gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href as Route}
              aria-current={item.current ? 'page' : undefined}
              className={cn(
                'inline-flex h-control items-center border-b-2 px-3 text-[13px] transition-micro',
                'max-narrow:min-h-[44px]',
                item.current
                  ? 'border-brand font-semibold text-ink'
                  : 'border-transparent font-medium text-muted hover:border-line hover:text-ink',
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
