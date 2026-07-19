'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { Channel } from '@sahoda/shared'

import { savePost } from '@/app/actions/posts'
import { ScheduleField } from '@/components/posts/schedule-field'
import { Button } from '@/components/ui/button'

export interface PlannerRescheduleProps {
  postId: string
  channels: Channel[]
  /** ISO string from `posts.scheduled_at`, or null. */
  value: string | null
}

/**
 * Collapsed by default — a datetime input on every row is noise. Saves go
 * through `savePost`, the same single-field patch the editor uses, so the
 * planner does not invent a second scheduling rulebook. Honest scope: the
 * lead/future check lives in `ScheduleField` (CLIENT-side only) — `savePost`
 * accepts any parseable timestamptz, past dates included. Server-side lead
 * validation is a filed ask (REQUESTS.md), not something this wrapper claims.
 */
export function PlannerReschedule({ postId, channels, value }: PlannerRescheduleProps) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(value)
  const [pending, startTransition] = useTransition()

  function save(iso: string | null) {
    // `pending` also blocks overlapping commits: two in-flight saves can land
    // out of order, leaving the field showing one time and the DB holding another.
    if (pending || iso === current) return
    startTransition(async () => {
      const result = await savePost(postId, { scheduled_at: iso })
      if (result.ok) {
        setCurrent(iso)
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
        {open ? 'Close' : 'Reschedule'}
      </Button>
      {open ? (
        <div className="w-64" aria-busy={pending}>
          <ScheduleField channels={channels} value={current} onChange={save} />
        </div>
      ) : null}
    </div>
  )
}
