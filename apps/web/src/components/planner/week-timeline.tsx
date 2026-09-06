import Link from 'next/link'

import { ChannelMark } from '@/components/posts/channel-mark'
import { CERTAINTY_CLASS, certaintyFor } from '@/lib/posts/certainty'
import type { DisplayPost } from '@/lib/posts/display-post'
import { outcomeOf } from '@/lib/posts/publish-evidence'
import type { VariantStatusRow } from '@/lib/posts/variant-status'
import { formatScheduledClock } from '@/lib/posts/schedule-format'
import { hourRange, placeDay } from '@/lib/planner/week-window'
import { dayKey } from '@/lib/time/day-key'
import { zoneLabel } from '@/lib/time/zone'
import { cn } from '@/lib/utils'

import { NowLine } from './now-line'

/**
 * The week, on a clock.
 *
 * The `WeekGrid` this replaced was seven columns of stacked chips: it answered
 * "what is on Wednesday" and could not answer "what goes out before lunch",
 * because nothing in it was positioned by time. This one places every post at
 * its own minute, in the WORKSPACE'S zone.
 *
 * ── THE COLUMN AND THE ROW ARE FACTS ABOUT ONE ZONE ──────────────────────────
 * The zone comes down from the page, which resolved the workspace's. Every
 * placement, every column header, the now-line and the caption on the hour
 * rail all read it. When the caption alone moved to the workspace zone and the
 * placement stayed in IST, a New York post was drawn in the wrong column under
 * the right time; both now read the same value, so they cannot disagree.
 *
 * ── THE STATUS ON A CARD IS THE CERTAINTY RUNG, NOT A NEW VOCABULARY ─────────
 * The reference codes three badges — Pending amber, Scheduled blue, Approved
 * green. This product has one status vocabulary and it is structural: solid /
 * hairline+wash / dashed / hatched, each surviving greyscale, a tenant's Brand
 * Skin and a colour-blind reader (docs/37 §9). A second vocabulary on this one
 * surface would say the same thing a fourth way and disagree with /posts,
 * /approvals and Home the first time a status is added. So the card wears its
 * rung, and the rung carries the word.
 *
 * ── THE HOURS ARE DERIVED ────────────────────────────────────────────────────
 * A fixed 8-to-6 window hides a 7am post completely, with nothing on screen
 * saying it did. `hourRange` widens to cover whatever the week actually holds.
 *
 * ── NO ALL-DAY ROW ───────────────────────────────────────────────────────────
 * The reference has one. This product has no all-day concept: a post either has
 * a `scheduled_at` or it is UNSCHEDULED, which means no date at all, not "this
 * day, no time". Filing those under a specific day would invent a date. They
 * stay in the list view, which is the only view that can show them honestly.
 */

/** One hour of grid. Also the card's own height, so a card is an hour tall. */
const HOUR_PX = 56
/** The visual extent of a card, in minutes — what "overlapping" means here. */
const SLOT_MINUTES = 60
/** How far each overlapping card is pushed right of the one before it. */
const STAGGER_PX = 14

/** "Wed 2" — a column header, in the grid's zone. Cached per zone like every other formatter. */
const COL_CACHE = new Map<string, Intl.DateTimeFormat>()

function columnLabel(zone: string, day: Date): string {
  let f = COL_CACHE.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-IN', { timeZone: zone, weekday: 'short', day: 'numeric' })
    COL_CACHE.set(zone, f)
  }
  return f.format(day)
}

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve} ${suffix}`
}

export interface WeekTimelineProps {
  days: Date[]
  posts: DisplayPost[]
  variantStates: ReadonlyMap<string, readonly VariantStatusRow[]>
  /** Today, for highlighting the column. Server time is fine: it is an instant. */
  today: Date
  /** The workspace's zone, resolved by the page. Every column and row is read in it. */
  zone: string
}

export function WeekTimeline({ days, posts, variantStates, today, zone }: WeekTimelineProps) {
  const { from, to } = hourRange(zone, posts)
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const bodyHeight = (to - from + 1) * HOUR_PX
  const todayKey = dayKey(zone, today)

  const byDay = new Map<string, DisplayPost[]>()
  for (const post of posts) {
    if (post.scheduled_at === null) continue
    const key = dayKey(zone, new Date(post.scheduled_at))
    const bucket = byDay.get(key)
    if (bucket) bucket.push(post)
    else byDay.set(key, [post])
  }

  return (
    /* `planner.week` is the seeded tour's anchor for this view. It lived on the
       retired `WeekGrid`, which no route rendered, so the step auto-skipped in
       silence; it sits on the surface the reader actually sees now. */
    <div
      className="overflow-x-auto rounded-card border border-line-soft bg-surface"
      data-guide="planner.week"
    >
      {/* min-width keeps seven readable columns on a phone and lets the
          container scroll, rather than crushing them to 40px each. */}
      <div className="min-w-[760px]">
        {/* HEADER */}
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-line-soft">
          {/* The zone every time in this grid is read in, said once. The cards
              carry the clock alone so the certainty word beside it survives a
              100px column. */}
          <div className="flex items-end justify-end px-2 py-2.5">
            <span className="type-eyebrow text-ink-mute">{zoneLabel(zone, today)}</span>
          </div>
          {days.map((day) => {
            const isToday = dayKey(zone, day) === todayKey
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'border-l border-line-soft px-2 py-2.5 text-center',
                  isToday && 'bg-brand-wash',
                )}
              >
                <p className={cn('type-eyebrow', isToday ? 'text-brand-text' : 'text-ink-mute')}>
                  {columnLabel(zone, day)}
                </p>
              </div>
            )
          })}
        </div>

        {/* BODY */}
        <div className="grid grid-cols-[56px_repeat(7,1fr)]">
          {/* The hour rail. */}
          <div>
            {hours.map((hour) => (
              <div
                key={hour}
                className="relative border-b border-line-soft last:border-b-0"
                style={{ height: HOUR_PX }}
              >
                <span className="absolute -top-2 right-2 type-meta text-ink-mute">
                  {hourLabel(hour)}
                </span>
              </div>
            ))}
          </div>

          {days.map((day) => {
            const key = dayKey(zone, day)
            const isToday = key === todayKey
            const placed = placeDay(zone, byDay.get(key) ?? [], SLOT_MINUTES)

            return (
              <div
                key={day.toISOString()}
                className={cn('relative border-l border-line-soft', isToday && 'bg-brand-wash/40')}
                style={{ height: bodyHeight }}
              >
                {/* The hour lines, drawn once per cell so they meet the rail. */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-line-soft last:border-b-0"
                    style={{ height: HOUR_PX }}
                  />
                ))}

                {isToday ? (
                  <NowLine zone={zone} fromHour={from} toHour={to} hourPx={HOUR_PX} />
                ) : null}

                {placed.map(({ post, minutes, lane }) => {
                  const certainty = certaintyFor(
                    post.intent,
                    outcomeOf(variantStates.get(post.id) ?? []),
                  )
                  const top = ((minutes - from * 60) / 60) * HOUR_PX
                  // OVERLAP IS A STAGGER, NOT A SPLIT. Dividing the column
                  // between them looked correct and destroyed the content:
                  // MEASURED at 1440, two overlapping posts came out 72px wide
                  // and rendered "Serv..." and "Ever..." — a card carrying a
                  // channel mark, a time and four characters of a title is not
                  // showing you your week. Offsetting keeps almost the full
                  // width on each; the one behind stays legible because the
                  // titles start at different x.
                  const inset = lane * STAGGER_PX
                  const width = `calc(100% - ${inset + 4}px)`
                  const left = `${inset + 2}px`
                  const channel = post.channels[0]

                  return (
                    <Link
                      key={post.id}
                      href={`/posts/${post.id}`}
                      data-certainty={certainty.level}
                      style={{ top, left, width, height: HOUR_PX - 6, zIndex: 5 + lane }}
                      className={cn(
                        'absolute flex flex-col gap-0.5 overflow-hidden rounded-sm px-2 py-1.5 transition-micro hover:shadow-brand',
                        CERTAINTY_CLASS[certainty.level],
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {channel !== undefined ? <ChannelMark channel={channel} size={13} /> : null}
                        <span className="min-w-0 flex-1 truncate type-meta font-semibold">
                          {post.title?.trim() || 'Untitled post'}
                        </span>
                      </span>
                      <span className="truncate type-eyebrow text-ink-mute">
                        {/* The clock alone. The zone is stated ONCE, on the
                            hour rail's header, because every card here is placed
                            in the same `zone` — so it is a fact about the grid
                            and not about each card. Repeating it truncated the
                            certainty word out of a 100px column. */}
                        {formatScheduledClock(post.scheduled_at, zone)}
                        {certainty.label !== null ? ` · ${certainty.label}` : null}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
