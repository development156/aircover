import {
  DAY_PARTS,
  MIN_SLOT_POSTS,
  WEEKDAYS,
  bestSlotSentence,
  shadeOf,
  slotLabel,
  type Slot,
  type Timing,
} from '@/lib/analytics/timing'

/**
 * WHEN TO POST, AS A GRID A HUMAN CAN SCAN AND A SCREEN READER CAN HEAR.
 *
 * ── SHADE IS A HINT, NEVER THE ONLY WAY IN ───────────────────────────────────
 * `shadeOf` returns a ratio against the workspace's own average, drawn as
 * varying opacity of `--accent` — never a hue ramp, and never a raw hex. A
 * cell below the post floor gets no shade at all: it is drawn as unread, not
 * as a poor reading, because `timing.ts` already refuses to average fewer
 * than `MIN_SLOT_POSTS`. Every cell also carries a `title` and a visually
 * hidden sentence, because a table where the only signal is a background tint
 * is unreadable without eyes.
 */
export function TimingHeatmap({ timing, timezone }: { timing: Timing; timezone: string }) {
  if (timing.kind === 'none') {
    return (
      <div className="space-y-1">
        <p className="type-body text-muted">
          {timing.reason === 'no-history'
            ? 'Not enough posts yet to show timing patterns. Publish a few more and Sahoda will start mapping which days and times work best.'
            : 'Not enough posts have reported at a common age yet to show timing patterns. Sahoda needs several posts read at the same age to compare them fairly.'}
        </p>
      </div>
    )
  }

  const byKey = new Map<string, Slot>(
    timing.slots.map((slot) => [`${slot.weekday}|${slot.part}`, slot]),
  )
  const sentence = bestSlotSentence(timing)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1">
          <caption className="sr-only">
            Average reach by weekday and time of day, read {timing.ageDays}{' '}
            {timing.ageDays === 1 ? 'day' : 'days'} after each post went out.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="type-meta text-muted">
                <span className="sr-only">Weekday</span>
              </th>
              {DAY_PARTS.map((part) => (
                <th key={part.id} scope="col" className="px-2 py-1 type-meta text-muted">
                  {part.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((weekday) => (
              <tr key={weekday}>
                <th
                  scope="row"
                  className="whitespace-nowrap px-2 py-1 text-left type-meta text-muted"
                >
                  {weekday}
                </th>
                {DAY_PARTS.map((part) => {
                  const slot = byKey.get(`${weekday}|${part.id}`)
                  if (!slot) return <td key={part.id} />
                  const shade = shadeOf(slot, timing.slots)
                  const hasReading = slot.average !== null
                  const label = slotLabel(weekday, part.id)
                  const description = hasReading
                    ? `${label}: average ${slot.average!.toLocaleString('en-IN')} reach across ${slot.posts} ${slot.posts === 1 ? 'post' : 'posts'}.`
                    : `${label}: not enough posts yet (${slot.posts} of ${MIN_SLOT_POSTS}), so no reading is shown.`
                  return (
                    <td key={part.id} className="p-0">
                      <div
                        title={description}
                        className="flex h-14 min-w-[64px] items-center justify-center rounded-sm surface-ring type-meta tabular-nums text-ink"
                        style={
                          hasReading && shade !== null
                            ? {
                                backgroundColor: `color-mix(in srgb, var(--acc) ${Math.min(shade * 40, 90)}%, transparent)`,
                              }
                            : undefined
                        }
                        data-shaded={hasReading ? 'true' : 'false'}
                      >
                        <span aria-hidden>
                          {hasReading ? slot.average!.toLocaleString('en-IN') : '—'}
                        </span>
                        <span className="sr-only">{description}</span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sentence ? <p className="type-body text-ink">{sentence}</p> : null}

      <p className="type-meta text-muted">
        Measured {timing.ageDays} {timing.ageDays === 1 ? 'day' : 'days'} after each post went out.
        Times shown in {timezone}.
      </p>
    </div>
  )
}
