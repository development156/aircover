import Link from 'next/link'
import { ArrowLeft, X } from 'lucide-react'

import type { ViewerVersions } from '@/lib/studio/viewer-read'

/**
 * THE WAY BACK, AND WHICH VERSION THIS IS.
 *
 * ── A LABELLED CONTROL, NEVER A LONE X ──────────────────────────────────────
 * A lone close mark on a full-bleed screen states no destination, and a person
 * unsure what it closes does not press it. "Back to your work" says exactly
 * where the press goes; the small `X` beside it is a second, equivalent way
 * out for anyone reaching for the corner out of habit, not the only one.
 */
export function ViewerHeader({
  prompt,
  madeAgo,
  versions,
}: {
  prompt: string
  madeAgo: string | null
  versions: ViewerVersions
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-7 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/studio"
          className="surface-ring flex h-control items-center gap-2 rounded-pill bg-s2 px-3.5 type-sm font-[550] text-ink transition-micro hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          data-guide="studio-viewer-back"
        >
          <ArrowLeft className="size-[15px]" aria-hidden />
          Back to your work
        </Link>
        <h1 className="truncate type-h3">{prompt}</h1>
        <span className="num type-sm shrink-0 text-muted">
          {versions === null ? null : (
            <>
              Version {versions.index} of {versions.total}
              {madeAgo === null ? null : ' · '}
            </>
          )}
          {madeAgo}
        </span>
      </div>
      <Link
        href="/studio"
        aria-label="Close"
        className="surface-ring flex size-[34px] shrink-0 items-center justify-center rounded-full bg-s2 transition-micro hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <X className="size-[16px]" aria-hidden />
      </Link>
    </div>
  )
}
