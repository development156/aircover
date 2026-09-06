'use client'

import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { buttonVariants } from '@/components/ui/button'
import { ScheduleField } from '@/components/posts/schedule-field'
import { cn } from '@/lib/utils'

export interface FinishScheduleProps {
  /** The workspace's zone, read on the server. The picker builds and labels its times in it. */
  zone: string
  channels: ChannelSet
  scheduledAt: string | null
  onScheduleChange: (iso: string | null) => void
  scheduleError: string | null
  autoPublish: boolean
  connected?: ReadonlySet<Channel>
}

/**
 * WHEN THE POST GOES OUT, plus the one link a person wants while deciding.
 *
 * ── WHY THIS IS A SEPARATE FILE ──────────────────────────────────────────────
 * So `FinishPanel` can load it on demand. It is behind a deliberate choice now,
 * and it drags in `ScheduleField` (318 lines), the schedule-choice maths, the
 * lead-time validator and the connection-gap copy. MEASURED: with this half and
 * the publish half imported normally, `/(app)/posts/[id]` built to 948.3 kB
 * against a 937.2 kB budget with 8 kB of slack, which fails. See `finish-panel.tsx`.
 */
export default function FinishSchedule({
  zone,
  channels,
  scheduledAt,
  onScheduleChange,
  scheduleError,
  autoPublish,
  connected,
}: FinishScheduleProps) {
  return (
    <div className="space-y-3 border-t border-line pt-4">
      {/* ── THE CALENDAR, BESIDE THE THING IT IS ABOUT ────────────────────────
          A real link to a real screen. `/planner` is built and shows what is
          already booked, which is the question a person asks the instant they
          pick a day: is anything else going out then? A time chosen without that
          is chosen blind.

          A LINK, not a button that pushes: `router.push` would not survive a
          reload, would not appear in the page's link list and could not be
          opened in a new tab, which is exactly what somebody comparing two
          screens wants to do. docs/26 §10.2. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-meta text-muted">
          Sahoda checks the time against each channel&rsquo;s own lead time.
        </p>
        <Link
          href="/planner"
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0')}
        >
          <CalendarDays size={14} aria-hidden />
          See the calendar
        </Link>
      </div>

      <ScheduleField
        zone={zone}
        channels={channels}
        value={scheduledAt}
        onChange={onScheduleChange}
        autoPublish={autoPublish}
        error={scheduleError}
        connected={connected}
      />
    </div>
  )
}
