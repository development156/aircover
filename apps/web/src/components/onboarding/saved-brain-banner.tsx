'use client'

import { Info } from 'lucide-react'

import { Button } from '@/components/ui/button'

export interface SavedBrainBannerProps {
  version: number
  /** 'resolved' | 'manual' | 'system'. A 'system' row is a demo fallback. */
  source: string
  updatedAt: string
  onStartOver: () => void
}

/** Date only — a time would imply a precision the version number already carries. */
function formatDay(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'an earlier session'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Shown when `/onboarding` opens onto a brain that already exists.
 *
 * It says version and date because "your Brand Brain" with no provenance is
 * indistinguishable from a fresh resolve, and the difference matters: one cost
 * credits and one did not.
 *
 * A `system` source is called out. That row is a demo fallback the model could
 * not produce a real answer for, and it was saved flagged precisely so it would
 * never be mistaken later for a genuine resolve.
 */
export function SavedBrainBanner({
  version,
  source,
  updatedAt,
  onStartOver,
}: SavedBrainBannerProps) {
  const isSample = source === 'system'

  return (
    <div
      role="status"
      className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-line bg-s1 px-4 py-3"
    >
      <div className="flex items-start gap-2">
        <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div>
          <p className="text-[13px] font-semibold text-ink">
            Loaded your saved Brand Brain — version <span className="tabular-nums">{version}</span>,{' '}
            {formatDay(updatedAt)}.
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {isSample
              ? 'This one is a sample the model fell back to, not a resolve of your brand. Starting over will replace it.'
              : 'Nothing was resolved just now, and nothing was charged.'}
          </p>
        </div>
      </div>

      <Button type="button" variant="ghost" onClick={onStartOver}>
        Start over
      </Button>
    </div>
  )
}
