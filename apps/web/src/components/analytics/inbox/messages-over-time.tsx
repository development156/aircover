import { Panel, PanelHead } from '@/components/charts/panel'
import type { ZernioInboxVolumeDay } from '@sahoda/publishing'

/**
 * Received vs sent vs read, per day.
 *
 * Hand-drawn SVG polylines, no chart library, matching `timing-heatmap.tsx`
 * and `trend-area.tsx`'s convention of tokens-only colour: `--acc` for
 * received (the line the reader came to see), `--ink` at reduced opacity for
 * sent, and a dashed `--acc` stroke for read. A day absent from the series is
 * a GAP, not a zero — Zernio only sends days it actually has a bucket for.
 */
const W = 640
const H = 180
const PAD_TOP = 12
const PAD_BOTTOM = 20
const PAD_X = 8

function pathFor(points: readonly { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
}

export function MessagesOverTime({ days }: { days: readonly ZernioInboxVolumeDay[] }) {
  if (days.length === 0) {
    return (
      <Panel className="space-y-4">
        <PanelHead title="Messages over time" />
        <p className="type-body text-muted">
          No inbox activity in this window yet. This is where the daily received, sent and read
          counts will go.
        </p>
      </Panel>
    )
  }

  const top = Math.max(1, ...days.map((d) => Math.max(d.received, d.sent, d.read)))
  const innerW = W - PAD_X * 2
  const innerH = H - PAD_TOP - PAD_BOTTOM
  const xAt = (i: number) =>
    PAD_X + (days.length === 1 ? innerW / 2 : (i / (days.length - 1)) * innerW)
  const yAt = (value: number) => PAD_TOP + innerH - (value / top) * innerH

  const received = days.map((d, i) => ({ x: xAt(i), y: yAt(d.received) }))
  const sent = days.map((d, i) => ({ x: xAt(i), y: yAt(d.sent) }))
  const read = days.map((d, i) => ({ x: xAt(i), y: yAt(d.read) }))

  const first = days[0]!
  const last = days[days.length - 1]!

  return (
    <Panel className="space-y-4">
      <PanelHead
        title="Messages over time"
        sub="Received, sent and read, per day."
        trailing={<Legend />}
      />

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-hidden>
        <line
          x1={PAD_X}
          y1={H - PAD_BOTTOM}
          x2={W - PAD_X}
          y2={H - PAD_BOTTOM}
          stroke="var(--border)"
          strokeWidth={1}
        />
        <path
          d={pathFor(sent)}
          fill="none"
          stroke="var(--ink)"
          strokeOpacity={0.35}
          strokeWidth={2}
        />
        <path
          d={pathFor(read)}
          fill="none"
          stroke="var(--acc)"
          strokeWidth={2}
          strokeDasharray="4 3"
        />
        <path d={pathFor(received)} fill="none" stroke="var(--acc)" strokeWidth={2.5} />
      </svg>

      <table className="sr-only">
        <caption>Daily inbox message volume, received, sent and read.</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Received</th>
            <th scope="col">Sent</th>
            <th scope="col">Read</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.received}</td>
              <td>{d.sent}</td>
              <td>{d.read}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="type-meta text-muted tabular-nums">
        {first.date} to {last.date} · {days.length} {days.length === 1 ? 'day' : 'days'} measured
      </p>
    </Panel>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 type-meta text-muted">
      <span className="flex items-center gap-1">
        <span className="inline-block h-0.5 w-3 bg-accent" aria-hidden /> Received
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-0.5 w-3 bg-ink opacity-35" aria-hidden /> Sent
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-0.5 w-3 border-t-2 border-dashed border-accent"
          aria-hidden
        />{' '}
        Read
      </span>
    </div>
  )
}
