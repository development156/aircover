import 'server-only'

import { readCronRun } from '@/lib/cron/heartbeat-store'
import { forDisplay } from '@/lib/posts/display-post'
import { listPosts } from '@/lib/posts/read'
import { readLedger } from '@/lib/wallet/read'

import { liveLines, type LiveLine } from './live'

export interface LiveFeed {
  lines: LiveLine[]
  /** ISO time the feed was read, so the client can say how fresh it is. */
  readAt: string
}

/**
 * Three reads the dashboard already makes, in parallel, turned into sentences.
 * `readCronRun` answers null without Upstash credentials, which the console
 * renders as the schedule rather than as a failure — the sweep's existence is
 * not in doubt, only its last timestamp.
 */
export async function readLiveFeed(now: Date = new Date()): Promise<LiveFeed> {
  const [posts, ledger, sweepRanAt] = await Promise.all([
    listPosts(),
    readLedger(),
    readCronRun('sweeps').catch(() => null),
  ])
  return {
    lines: liveLines({
      posts: posts.map(forDisplay).map((post) => ({
        id: post.id,
        title: post.title,
        intent: post.intent,
        updated_at: post.updated_at,
        scheduled_at: post.scheduled_at,
        origin: post.origin,
      })),
      ledger: ledger.unreadable ? [] : ledger.entries,
      sweepRanAt,
      now,
    }),
    readAt: now.toISOString(),
  }
}
