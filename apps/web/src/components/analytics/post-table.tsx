import { Card, CardLabel } from '@/components/ui/card'
import { CoverageLine, Figure } from '@/components/analytics/figure'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { metricCopy } from '@/lib/analytics/copy'
import { coverageFor, rankBy, unmeasuredFor, type ComparableRow } from '@/lib/analytics/compare'

/**
 * Post against post, ranked.
 *
 * ── THE RANKING IS WHERE THE ZERO GETS BACK IN ───────────────────────────────
 * A pending post has no impressions figure to sort by. Give it 0 — which is what
 * any ordinary `sort((a, b) => b.value - a.value)` over a coalesced array does —
 * and it lands at the bottom of the list, in the position that means "this post
 * reached the fewest people". The card for that post is careful to show a dash. The
 * ranking would have made the claim on its behalf, without ever rendering a zero.
 *
 * So `rankBy` returns only rows that carry a real number, and everything else is
 * rendered BELOW in its own group, where each row states its own reason and no
 * position is implied. Two lists, because they are two different kinds of fact:
 * one is an order, the other is a queue.
 */

/** Deliberately not "top 5". A cut-off is a claim about the tail; this shows all of it. */
export function PostTable({ rows }: { rows: readonly ComparableRow[] }) {
  const ranked = rankBy(rows, 'impressions')
  const waiting = unmeasuredFor(rows, 'impressions')

  if (rows.length === 0) return null

  /** The full metric row for a ranked entry — looked up once, by identity. */
  const stateFor = (postId: string, channel: string) =>
    rows.find((row) => row.postId === postId && row.channel === channel)?.state

  return (
    <Card className="space-y-3">
      <CardLabel>By post · ordered on impressions</CardLabel>

      {ranked.length === 0 ? (
        <p className="type-body text-ink">
          {/* NOT an empty table, and NOT a row of zeroes. Nothing has reported. */}
          None of your published posts has reported metrics yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse type-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="py-2 pr-4 font-semibold text-muted">
                  Post
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold text-muted">
                  Channel
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold text-muted">
                  Impressions
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold text-muted">
                  Reach
                </th>
                <th scope="col" className="py-2 text-right font-semibold text-muted">
                  Engagement
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((row) => {
                const state = stateFor(row.postId, row.channel)
                const metrics = state?.kind === 'ready' ? state.metrics : null
                return (
                  <tr
                    key={`${row.postId}:${row.channel}`}
                    className="border-b border-line last:border-0"
                  >
                    <th
                      scope="row"
                      className="max-w-[22ch] truncate py-2 pr-4 text-left font-medium text-ink"
                    >
                      {row.title}
                    </th>
                    <td className="py-2 pr-4 text-muted">{CHANNEL_LABELS[row.channel]}</td>
                    <td className="py-2 pr-4 text-right">
                      <Figure value={row.value} />
                    </td>
                    {/* Reach and engagement are read from the SAME state, not
                        re-derived: a row measured for impressions can still hold a
                        null reach, and `Figure` renders that as a dash rather than
                        letting the row's presence imply every column arrived. */}
                    <td className="py-2 pr-4 text-right">
                      <Figure value={metrics?.reach ?? null} />
                    </td>
                    <td className="py-2 text-right">
                      <Figure value={metrics?.engagement ?? null} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CoverageLine coverage={coverageFor(rows, 'impressions')} noun="published channels" />

      {waiting.length > 0 ? (
        <section className="space-y-2 border-t border-line pt-3">
          <h3 className="type-meta font-semibold text-muted">
            Not ranked, no measurement yet ({waiting.length})
          </h3>
          <ul className="space-y-1.5">
            {waiting.map((row) => {
              const copy = metricCopy(row.state, row.channel)
              return (
                <li
                  key={`${row.postId}:${row.channel}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                >
                  <span className="max-w-[24ch] truncate type-sm text-ink">{row.title}</span>
                  <span className="type-meta text-muted">
                    {CHANNEL_LABELS[row.channel]} · {copy.headline}
                  </span>
                  {/* The reason, in full. This list's whole job is to be the place
                      a gap is explained rather than silently ordered last. */}
                  {copy.detail ? (
                    <span className="w-full type-meta text-muted">{copy.detail}</span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </Card>
  )
}
