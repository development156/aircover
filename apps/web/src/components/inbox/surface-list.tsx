import { PaneHeader, PaneScroll } from '@/components/inbox/inbox-panes'

/**
 * The list pane's frame, shared by every inbox surface.
 *
 * Holds the pane's title, its optional count, and the one quiet line naming what
 * this column will hold — deliberately NOT the reason it is empty, which lives
 * once in the thread pane, and deliberately not a claim that it IS empty. A list
 * column that also explains itself is the second voice that makes three empty
 * panes read as a broken screen.
 *
 * `children` is the surface's own rows, so conversations, commented posts and
 * reviews stay three different lists inside one identical frame.
 */
export function SurfaceList({
  title,
  count,
  waitingLine,
  isEmpty,
  toolbar,
  children,
}: {
  title: string
  /** Unread or pending count. Omitted entirely at zero — a "0" badge is noise. */
  count?: number
  /**
   * What appears in this column, in the future tense — NOT an empty state.
   *
   * Renamed from `emptyLine`, because what the pages passed into it was an
   * absence claim ("No posts have comments yet.", "Nothing read yet.") while the
   * thread pane two columns over was stating the same absence with its reason
   * and its remedy. Two announcements of one nothing, and free to disagree: one
   * pane said a READ had not happened while the other said a CONNECTION had not.
   * See `conversation-list.tsx` for the measurement.
   */
  waitingLine: string
  isEmpty: boolean
  /** Search, filters — hidden when there is nothing to filter. */
  toolbar?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <>
      <PaneHeader>
        <div className="flex items-center gap-2">
          <h2 className="type-h3">{title}</h2>
          {count !== undefined && count > 0 ? (
            <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-tint px-[5px] text-[11px] font-bold text-accent tabular-nums">
              {count}
            </span>
          ) : null}
        </div>
        {/* A search box over zero rows is a control that cannot succeed. */}
        {!isEmpty && toolbar ? <div className="mt-3">{toolbar}</div> : null}
      </PaneHeader>

      <PaneScroll>
        {isEmpty ? (
          // Quiet, and top-aligned rather than floated to the middle of a 730px
          // column. The thread pane beside it carries the reason and the remedy
          // (docs/26 §4.1); this line only names what the column is for.
          <p className="p-3 type-meta text-muted">{waitingLine}</p>
        ) : (
          <ul>{children}</ul>
        )}
      </PaneScroll>
    </>
  )
}

/** One row in a list pane — the shared hit area, so all three surfaces match. */
export function SurfaceRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="border-b border-line-soft last:border-b-0 [&>a]:block [&>a]:px-3 [&>a]:py-3 [&>a]:transition-micro hover:[&>a]:bg-s2">
      {children}
    </li>
  )
}
