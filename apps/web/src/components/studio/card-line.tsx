import type { CardLine as Line } from '@/lib/studio/card-copy'

/**
 * The line under a design in the gallery, assembled from `describeDesignCard`.
 *
 * A component rather than a string so the count can carry `num`: this codebase
 * sets every figure in tabular numerals, and a gallery is a column of cards
 * whose numbers should line up down the page rather than jitter.
 *
 * Both halves can be absent. A retired size leaves nothing to name, and a
 * single-slide design has nothing to count, so a card can legitimately show
 * neither and renders nothing at all rather than an empty grey line.
 */
export function CardLine({ line }: { line: Line }) {
  if (line.size === null && line.slides === null) return null

  return (
    <span className="type-sm text-muted">
      {line.size}
      {line.size !== null && line.slides !== null ? ' · ' : null}
      {line.slides === null ? null : (
        <>
          <span className="num">{line.slides}</span> slides
        </>
      )}
    </span>
  )
}
