import { formatBytes } from '@/lib/format-bytes'
import type { AssetCard } from '@/lib/assets/view'

/**
 * The summed size of a selection, honest about what it could not measure.
 *
 * `assets.bytes` is nullable, so a selection can include a file this library
 * never got a size for. Adding `0` for it and reporting the sum as exact would
 * under-report with no sign anything was missing — the `100 of —` failure in
 * a running total. This never returns a number that could be wrong: either it
 * is the real sum of everything that had a size, said plainly, or it says how
 * many files it could not weigh.
 */
export function selectedSizeSummary(cards: readonly AssetCard[]): string | null {
  if (cards.length === 0) return null

  let known = 0
  let unmeasured = 0
  for (const card of cards) {
    if (typeof card.bytes === 'number' && Number.isFinite(card.bytes) && card.bytes >= 0) {
      known += card.bytes
    } else {
      unmeasured += 1
    }
  }

  if (unmeasured === 0) return formatBytes(known)
  if (known === 0) {
    return unmeasured === 1 ? 'Size unknown for 1 file' : `Size unknown for ${unmeasured} files`
  }
  const measured = formatBytes(known) ?? '0 B'
  return `At least ${measured} (${unmeasured} file${unmeasured === 1 ? '' : 's'} not counted)`
}

/** The bottom status bar: how many files, and — only while something is selected — how many and how big. */
export function LibraryStatus({
  visibleCount,
  totalCount,
  selectedCards,
  capped,
}: {
  visibleCount: number
  totalCount: number
  selectedCards: readonly AssetCard[]
  capped: boolean
}) {
  const sizeText = selectedSizeSummary(selectedCards)

  return (
    // B3: this used to carry `surface-ring-firm` and `rounded-pill` — the same
    // ring and radius the search field uses — which read as an editable box
    // rather than a status line. It is quiet now: no ring, no fill shape, just
    // muted text above a single top hairline. `bg-surface` stays only so the
    // sticky footer has something opaque behind it while the grid scrolls under
    // it, never to draw a card.
    <div
      role="status"
      data-guide="assets.status"
      className="sticky bottom-0 z-[5] flex flex-wrap items-center justify-between gap-2 border-t border-line-soft bg-surface px-1 py-2 type-meta text-muted"
    >
      <span>
        <span className="num">{visibleCount}</span>
        {visibleCount === 1 ? ' file' : ' files'}
        {visibleCount !== totalCount ? (
          <>
            {' of '}
            <span className="num">{totalCount}</span>
          </>
        ) : null}
        {capped ? '. Showing the most recent 200.' : ''}
      </span>
      {selectedCards.length > 0 ? (
        <span className="font-semibold text-ink">
          <span className="num">{selectedCards.length}</span> selected
          {sizeText !== null ? (
            <>
              {' · '}
              <span className="num">{sizeText}</span>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
