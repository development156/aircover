import type { Route } from 'next'
import Link from 'next/link'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import {
  normalOf,
  pageOf,
  sortRows,
  versusNormal,
  versusSentence,
  type SortDirection,
  type SortKey,
} from '@/lib/analytics/rows'
import type { PublishedRow } from '@/lib/analytics/window-data'

/**
 * EVERY POST, AS A REAL TABLE.
 *
 * ── A REAL `<table>`, NOT A GRID OF DIVS ─────────────────────────────────────
 * The brief asks for it and it is not a preference. A screen reader announces a
 * table's row and column headers as it moves, so "1,410" is heard as "Monsoon
 * offer, reached, 1,410". The same numbers in a flex grid are heard as a list of
 * bare figures, which is the whole content of this section made useless.
 *
 * ── SORTING IS LINKS, SO THERE IS NO CLIENT JAVASCRIPT HERE ──────────────────
 * The whole view already lives in the URL, so a column header is a link to the
 * same page sorted differently. That keeps this a server component, makes a
 * sorted view shareable, and means the ordering survives a refresh — the same
 * three reasons the filters are links.
 *
 * ── AND WHAT THE ORDERING REFUSES ────────────────────────────────────────────
 * `sortRows` holds an unmeasured post out of the reach comparison rather than
 * sorting it as a zero. A post the platform has not reported on, placed at the
 * bottom of a list sorted by reach, has been called the worst post of the month
 * without a zero ever being drawn.
 */

const COLUMNS: ReadonlyArray<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: 'title', label: 'Post' },
  { key: 'channel', label: 'Channel' },
  { key: 'published', label: 'Published' },
  { key: 'reach', label: 'People reached', numeric: true },
]

export function PostRows({
  rows,
  sort,
  direction,
  page,
  hrefFor,
  ageDays,
  timezone,
}: {
  rows: readonly PublishedRow[]
  sort: SortKey
  direction: SortDirection
  page: number
  /** Builds a link to this same view with one thing changed. */
  hrefFor: (change: { sort?: string; dir?: string; page?: string }) => Route
  /** The age every reach figure was read at. Stated, never implied. */
  ageDays: number | null
  timezone: string
}) {
  const normal = normalOf(rows)
  const view = pageOf(sortRows(rows, sort, direction), page)

  if (rows.length === 0) {
    return (
      <section aria-labelledby="every-post" className="surface-ring rounded-card bg-surface p-5">
        <h2 id="every-post" className="type-h3 text-ink">
          Every post
        </h2>
        <p className="mt-2 max-w-[62ch] type-sm text-muted">
          Nothing went out in this period. Widen the dates, or pick a different channel.
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="every-post" className="surface-ring rounded-card bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="every-post" className="type-h3 text-ink">
          Every post
        </h2>
        <p className="type-meta text-muted">
          <span className="tabular-nums">{view.total}</span> in this period
          {view.pages > 1 ? (
            <>
              {' · page '}
              <span className="tabular-nums">{view.page}</span> of{' '}
              <span className="tabular-nums">{view.pages}</span>
            </>
          ) : null}
        </p>
      </div>

      {/* ── WIDE: THE TABLE ────────────────────────────────────────────────
          Hidden below `wide` rather than allowed to scroll sideways. A table a
          reader has to drag horizontally on a phone hides the numbers behind the
          gesture nobody makes. */}
      <div className="mt-4 max-wide:hidden">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Every post published in this period, with how many people it reached
            {ageDays === null ? '' : ` ${ageDays} days after it went out`}.
          </caption>
          <thead>
            <tr className="border-b border-line">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`pb-2 type-meta font-[550] text-muted ${column.numeric ? 'text-right' : 'text-left'}`}
                  aria-sort={
                    sort === column.key
                      ? direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <Link
                    href={hrefFor({
                      sort: column.key,
                      // Clicking the current column flips it; clicking another
                      // starts at the direction that column is usually read in.
                      dir:
                        sort === column.key
                          ? direction === 'desc'
                            ? 'asc'
                            : 'desc'
                          : column.numeric
                            ? 'desc'
                            : 'asc',
                      page: '1',
                    })}
                    className="transition-micro hover:text-ink"
                  >
                    {column.label}
                    {sort === column.key ? (
                      <span aria-hidden> {direction === 'asc' ? '↑' : '↓'}</span>
                    ) : null}
                  </Link>
                </th>
              ))}
              <th scope="col" className="pb-2 text-right type-meta font-[550] text-muted">
                Against your normal
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={`${row.postId}-${row.channel}`} className="border-b border-line-soft">
                <th scope="row" className="max-w-[32ch] truncate py-2 text-left font-normal">
                  <Link
                    href={`/posts/${row.postId}`}
                    className="type-sm transition-micro hover:text-accent"
                  >
                    {row.title}
                  </Link>
                </th>
                <td className="py-2 type-meta text-muted">
                  {CHANNEL_LABELS[row.channel] ?? row.channel}
                </td>
                <td className="py-2 type-meta text-muted">{dayIn(row.publishedAt, timezone)}</td>
                <td className="py-2 text-right type-sm tabular-nums">
                  {/* A dash, never a zero. The platform not having reported is
                      not a reading of nobody. */}
                  {row.reachAtAge === null ? (
                    <span className="text-muted" title="Not reported yet.">
                      —
                    </span>
                  ) : (
                    row.reachAtAge.toLocaleString('en-IN')
                  )}
                </td>
                <td className="py-2 text-right type-meta text-muted">
                  {versusSentence(versusNormal(row, normal))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── NARROW: STACKED CARDS ──────────────────────────────────────────
          Recomposed, not shrunk. Each card is the same five facts in reading
          order rather than four columns squeezed into a phone. */}
      <ul className="mt-4 space-y-2 wide:hidden">
        {view.rows.map((row) => (
          <li key={`${row.postId}-${row.channel}`} className="surface-ring rounded-md bg-s2 p-3">
            <Link href={`/posts/${row.postId}`} className="type-sm font-[550] hover:text-accent">
              {row.title}
            </Link>
            <p className="mt-1 type-meta text-muted">
              {CHANNEL_LABELS[row.channel] ?? row.channel} · {dayIn(row.publishedAt, timezone)}
            </p>
            <p className="mt-1 type-meta">
              <span className="tabular-nums">
                {row.reachAtAge === null ? '—' : row.reachAtAge.toLocaleString('en-IN')}
              </span>{' '}
              <span className="text-muted">
                reached · {versusSentence(versusNormal(row, normal))}
              </span>
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-3 type-meta text-muted">
        {ageDays === null
          ? 'No post has been measured yet, so this list has no reach to show.'
          : `Reach is each post's figure ${ageDays} days after it went out, so posts are compared at the same age.`}
      </p>

      {view.pages > 1 ? (
        <nav aria-label="Pages of posts" className="mt-3 flex items-center gap-3">
          {view.page > 1 ? (
            <Link
              href={hrefFor({ page: String(view.page - 1) })}
              className="type-meta transition-micro hover:text-accent"
            >
              Previous
            </Link>
          ) : null}
          {view.page < view.pages ? (
            <Link
              href={hrefFor({ page: String(view.page + 1) })}
              className="type-meta transition-micro hover:text-accent"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  )
}

/**
 * The publish day in the workspace's own clock.
 *
 * Not the server's, and not the reader's browser: this page states one zone in
 * its header and every date on it has to be in that zone, or the header is a
 * lie about four sections it does not control.
 */
function dayIn(iso: string, timeZone: string): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: 'numeric',
      month: 'short',
    }).format(new Date(at))
  } catch {
    return '—'
  }
}
