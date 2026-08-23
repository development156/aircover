'use client'

import { useState } from 'react'

import type { PreviewPage } from '@/lib/sites/preview'
import { cn } from '@/lib/utils'

export interface SitePreviewProps {
  siteName: string
  pages: PreviewPage[]
}

/**
 * Sandboxed srcdoc preview of the generated bundle. `sandbox=""` grants
 * NOTHING — no scripts, no same-origin, no top navigation — so model-written
 * copy renders as an inert document (its interpolations are already escaped by
 * `renderBundle`, this is defense in depth). In-page links do not navigate
 * inside a srcdoc frame; the tab strip is the navigation.
 */
export function SitePreview({ siteName, pages }: SitePreviewProps) {
  const [activePath, setActivePath] = useState(pages[0]?.path ?? '')
  const active = pages.find((page) => page.path === activePath) ?? pages[0]

  if (!active) return null

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">{siteName}</h2>
        <p className="text-[12.5px] text-muted">Draft preview · not published anywhere yet</p>
      </div>

      {pages.length > 1 ? (
        <nav aria-label="Site pages" className="flex flex-wrap gap-1">
          {pages.map((page) => (
            <button
              key={page.path}
              type="button"
              onClick={() => setActivePath(page.path)}
              aria-current={page.path === active.path ? 'page' : undefined}
              className={cn(
                'rounded-pill px-3 py-1 text-[13px] font-semibold transition-micro',
                page.path === active.path ? 'bg-s2 text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {page.path}
            </button>
          ))}
        </nav>
      ) : null}

      <iframe
        title={`Preview of ${siteName}: ${active.path}`}
        sandbox=""
        srcDoc={active.html}
        className="h-[560px] w-full rounded-card border border-line bg-white shadow-card"
      />
    </section>
  )
}
