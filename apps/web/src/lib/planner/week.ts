import type { DisplayPost } from '@/lib/posts/display-post'
import { addDaysInZone, dayKey } from '@/lib/time/day-key'

/**
 * Buckets are keyed by the calendar day of the WORKSPACE'S zone, because that
 * is the zone every screen renders and says. Keying by UTC would file a 00:01
 * post under yesterday's column; keying by a hardcoded IST, as this did until
 * 2026-09-06, did the same thing to every workspace that is not in India.
 */

export interface DayBucket {
  /** Calendar date in the zone, YYYY-MM-DD. */
  key: string
  /**
   * An instant inside the day (the start instant stepped `i` calendar days).
   * Only ever formatted in the same zone as `key`, so label and key agree
   * whatever the offset did in between.
   */
  date: Date
  posts: DisplayPost[]
}

export interface WeekBuckets {
  days: DayBucket[]
  /** No timestamp, or one that does not parse. */
  unscheduled: DisplayPost[]
}

/**
 * `dayCount` consecutive days of `zone` starting on `start`'s day, each holding
 * the posts scheduled inside it, plus the honest bucket for posts with no day.
 *
 * A dated post OUTSIDE the run is simply not in any bucket. It is not dropped
 * from the product: the planner counts what its view cannot draw
 * (`OffGridNote`) against the very keys this returns, and the list view shows
 * everything. The `outside` bucket that used to sit beside `unscheduled` had
 * one reader, the retired `WeekGrid`, and a bucket nothing reads is a claim
 * nothing checks.
 */
export function bucketWeek(
  zone: string,
  posts: DisplayPost[],
  start: Date,
  dayCount = 7,
): WeekBuckets {
  const days: DayBucket[] = []
  const byKey = new Map<string, DayBucket>()
  for (let i = 0; i < dayCount; i++) {
    const date = addDaysInZone(zone, start, i)
    const bucket: DayBucket = { key: dayKey(zone, date), date, posts: [] }
    days.push(bucket)
    byKey.set(bucket.key, bucket)
  }

  const unscheduled: DisplayPost[] = []
  for (const post of posts) {
    if (!post.scheduled_at) {
      unscheduled.push(post)
      continue
    }
    const at = new Date(post.scheduled_at)
    if (Number.isNaN(at.getTime())) {
      unscheduled.push(post)
      continue
    }
    byKey.get(dayKey(zone, at))?.posts.push(post)
  }

  for (const bucket of days) {
    bucket.posts.sort(
      (a, b) => new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime(),
    )
  }

  return { days, unscheduled }
}
