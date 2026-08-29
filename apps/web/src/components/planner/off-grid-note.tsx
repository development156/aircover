import Link from 'next/link'

/**
 * "3 posts are not on this view, with no date yet or a date outside it."
 *
 * ── WHY IT IS A COMPONENT AND NOT A PARAGRAPH IN THE ROUTE ───────────────────
 * It was a paragraph, inside the week branch only. That left a hole a single
 * click could reach: on `?view=day` the timeline draws today's column, so
 * picking any other day in the calendar produced an empty screen — and the
 * month grid had no such note at all, so a picked date outside its 42 days did
 * the same. A view that renders nothing and says nothing is the exact class
 * `no-impossible-remedy.spec.ts` was written for, one state along.
 *
 * The count is measured against the days the view actually DRAWS, and the link
 * carries the reader's tab, search and picked date forward — otherwise the
 * sentence promises N posts and the destination shows a different number.
 */
export function OffGridNote({
  count,
  carry,
}: {
  count: number
  /** The query the list must open with for its length to match `count`. */
  carry: Record<string, string>
}) {
  if (count <= 0) return null

  return (
    <p className="type-meta text-muted">
      {count === 1 ? '1 post is' : `${count} posts are`} not on this view, with no date yet or a
      date outside it.{' '}
      <Link href={{ pathname: '/planner', query: carry }} className="card-link text-accent">
        See them in the list
      </Link>
      .
    </p>
  )
}
