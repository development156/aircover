'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { cancelSchedule, schedulePost } from '@/app/actions/posts-schedule'
import { Button } from '@/components/ui/button'

/**
 * ── LOADED WHEN THE ROW IS OPENED, NOT WHEN THE PAGE IS ──────────────────────
 * `ScheduleField` pulls in a month calendar, a half-hourly slot table and the
 * per-channel connection readout. On `/posts/[id]` that is the screen's whole
 * purpose. Here it sits behind a collapsed row that most visits never open, and
 * shipping it on first load pushed `/planner` past its JavaScript budget:
 * MEASURED on Vercel at 835.8 KiB against 827.5 + 8 KiB of slack. The static
 * import cost every planner visit those bytes to render a button.
 *
 * `ssr: false` because the field is interactive from its first frame — it reads
 * the reader's own clock in an effect and renders a waiting line until it has
 * one, so there is no server output worth sending.
 */
const ScheduleField = dynamic(
  () => import('@/components/posts/schedule-field').then((m) => m.ScheduleField),
  { ssr: false },
)

export interface PlannerRescheduleProps {
  postId: string
  /** The workspace's zone, from the row. The picker builds and labels its times in it. */
  zone: string
  channels: ChannelSet
  /** ISO string from `posts.scheduled_at`, or null. */
  value: string | null
  /**
   * Channels with a live connection, and whether the dispatcher is on. Both are
   * server facts, both are read on `/planner` already, and until now neither
   * reached this control — so a post could be scheduled here onto a channel with
   * no account and nothing on the screen said a word. See `ScheduleField`.
   */
  connected?: ReadonlySet<Channel>
  autoPublish?: boolean
}

/**
 * Collapsed by default — a datetime input on every row is noise.
 *
 * ── WHY THIS NO LONGER GOES THROUGH savePost ─────────────────────────────────
 * It used to, and that was a silent no-op. `savePost` writes `scheduled_at` and
 * deliberately refuses `status`, so a post scheduled from this row kept
 * `status = 'draft'` — outside DISPATCHABLE_STATUSES — and would never have been
 * picked up. The editor was fixed to use the scheduling RPCs; this row was not,
 * which left the bug alive on the screen most likely to be used for scheduling in
 * the first place.
 *
 * Now it calls exactly what the editor calls, so there is one scheduling rulebook
 * rather than two that disagree. The RPCs also enforce the role and refuse a post
 * that is already going out — neither of which savePost ever checked.
 *
 * Honest scope, unchanged: the lead/future check lives in `ScheduleField`
 * (CLIENT-side only). Server-side lead validation is still a filed ask.
 */
export function PlannerReschedule({
  postId,
  zone,
  channels,
  value,
  connected,
  autoPublish = false,
}: PlannerRescheduleProps) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(value)
  const [pending, startTransition] = useTransition()

  function save(iso: string | null) {
    // `pending` also blocks overlapping commits: two in-flight saves can land
    // out of order, leaving the field showing one time and the DB holding another.
    if (pending || iso === current) return
    startTransition(async () => {
      // `current !== null` tells the action whether this is a first arming or a
      // move: release_post_for_publish coalesces and will not shift an existing
      // time, and reschedule_post is the one that overwrites.
      const result =
        iso === null
          ? await cancelSchedule(postId)
          : await schedulePost(postId, iso, current !== null)
      if (result.ok) {
        setCurrent(result.scheduledAt)
        toast.success(iso ? 'Rescheduled' : 'Schedule cleared')
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
      >
        {/* "Reschedule" states that a schedule exists. MEASURED on the
            /planner list: seven of eight rows read "Not scheduled" and offered
            "Reschedule" — a verb for an event that had never happened. The
            control is the same; the word now matches what the row says about
            itself two columns to the left. */}
        {open ? 'Close' : current ? 'Reschedule' : 'Schedule'}
      </Button>
      {/* w-80, not w-64: a seven-column month grid in 256px leaves each day
          about 30px, under the 44px touch floor and too tight to read. */}
      {open ? (
        <div className="w-80" aria-busy={pending}>
          <ScheduleField
            zone={zone}
            channels={channels}
            value={current}
            onChange={save}
            autoPublish={autoPublish}
            connected={connected}
          />
        </div>
      ) : null}
    </div>
  )
}
