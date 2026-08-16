import { PaneHeader, PaneScroll } from '@/components/inbox/inbox-panes'

/**
 * The list pane's frame, shared by every inbox surface.
 *
 * Holds the pane's title, its optional count, and the one quiet line shown when
 * there is nothing — deliberately NOT the reason, which lives once in the thread
 * pane. A list column that also explains itself is the second voice that makes
 * three empty panes read as a broken screen.
 *
 * `children` is the surface's own rows, so conversations, commented posts and
 * reviews stay three different lists inside one identical frame.
 */
export function SurfaceList({
  title,
  count,
  emptyLine,
  isEmpty,
  toolbar,
  children,
}: {
  title: string
  /** Unread or pending count. Omitted entirely at zero — a "0" badge is noise. */
  count?: number
  emptyLine: string
  isEmpty: boolean
  /** Search, filters — hidden when there is nothing to filter. */
  toolbar?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <>
      <PaneHeader>
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h2>
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
          <p className="px-3 py-4 text-[12px] text-muted">{emptyLine}</p>
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
