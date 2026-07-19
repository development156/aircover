import type { Post } from '@sahoda/shared'

/**
 * Buckets are keyed by IST calendar day because that is the zone the UI
 * renders and SAYS (`post-card.tsx` labels every schedule "IST"). Keying by
 * UTC would file a 00:01 IST post under yesterday's column.
 */
const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const DAY_MS = 86_400_000

export interface DayBucket {
  /** IST calendar date, YYYY-MM-DD. */
  key: string
  /**
   * An instant inside the IST day (today's wall time + i×24h). Only ever
   * formatted in Asia/Kolkata — same zone as `key` — so label and key always
   * agree; IST has no DST, so +24h advances the IST day exactly once.
   */
  date: Date
  posts: Post[]
}

export interface WeekBuckets {
  days: DayBucket[]
  /** No timestamp, or one that does not parse. */
  unscheduled: Post[]
  /** Parseable but before today or past the window — shown, never dropped. */
  outside: Post[]
}

function istKeyOf(at: Date): string {
  return DAY_KEY.format(at)
}

/** Rolling window of `dayCount` IST days starting today, plus honest overflow buckets. */
export function bucketWeek(posts: Post[], now: Date, dayCount = 7): WeekBuckets {
  const days: DayBucket[] = []
  const byKey = new Map<string, DayBucket>()
  for (let i = 0; i < dayCount; i++) {
    const date = new Date(now.getTime() + i * DAY_MS)
    const bucket: DayBucket = { key: istKeyOf(date), date, posts: [] }
    days.push(bucket)
    byKey.set(bucket.key, bucket)
  }

  const unscheduled: Post[] = []
  const outside: Post[] = []
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
    const bucket = byKey.get(istKeyOf(at))
    if (bucket) bucket.posts.push(post)
    else outside.push(post)
  }

  for (const bucket of days) {
    bucket.posts.sort(
      (a, b) => new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime(),
    )
  }

  return { days, unscheduled, outside }
}
