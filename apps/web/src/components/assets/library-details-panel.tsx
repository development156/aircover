'use client'

import { Info } from 'lucide-react'

import { AssetDetail } from '@/components/assets/asset-detail'
import type { AssetCard } from '@/lib/assets/view'

/**
 * F4 — a right-hand panel for the selected file, as an alternative to the
 * Quick Look drawer rather than a second copy of it. `AssetDetail` is reused
 * wholesale: it already prints the absence mark for an unmeasured
 * dimension, already lists every post that uses the file, and its Name and
 * description fields are already editable — building a second component
 * that repeated all of that would be the exact duplication docs/26 warns
 * against, two places one fact could drift apart.
 */
export function LibraryDetailsPanel({
  card,
  onDeleted,
}: {
  /** `null` while nothing is open — the panel still renders, quietly. */
  card: AssetCard | null
  onDeleted: () => void
}) {
  return (
    <aside
      aria-label="File details"
      data-guide="assets.details"
      className="hidden w-[280px] shrink-0 wide:block"
    >
      {card === null ? (
        <div className="surface-ring flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-card bg-surface px-4 py-6 text-center">
          <Info size={18} strokeWidth={1.7} className="text-muted" aria-hidden />
          <p className="type-sm text-muted">Select a file to see its details.</p>
        </div>
      ) : (
        <div className="surface-ring rounded-card bg-surface p-4">
          <AssetDetail card={card} onDeleted={onDeleted} />
        </div>
      )}
    </aside>
  )
}
