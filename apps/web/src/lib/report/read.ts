import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * THE THREE NUMBERS, AND THE ONLY BASELINE THIS PRODUCT HAS EARNED.
 *
 * ── A BASELINE IS FOUR WEEKS OF THE SAME MEASUREMENT, NOT A GUESS ────────────
 * "Up 34% on your normal" is a claim about the reader's business, so a normal
 * has to be a measurement before it can be a comparison. Here it is the mean of
 * the three complete weeks BEFORE the reported one, each computed exactly the
 * way the reported week is computed. Fewer than three weeks that carried a
 * published, measured post and there is no normal — the caller is handed `null`
 * and says "first weeks, still learning your normal" rather than dividing by
 * whatever it has.
 *
 * ── A POST BELONGS TO THE WEEK IT WENT OUT, NOT THE DAY IT WAS MEASURED ──────
 * `post_metric_snapshots.value` is a LIFETIME running total, stated as such in
 * its own migration. Bucketing readings by `measured_on` and summing would count
 * the same post's whole life again in every week it happened to be polled, and
 * would make a workspace look like it grew every week it published nothing. So
 * the publish log decides the week and the highest reading decides the value.
 *
 * ── A FAILED READ IS `unreadable`, NEVER ZERO ────────────────────────────────
 * Zero people reached is a sentence about somebody's business. Not knowing is a
 * sentence about us. The two are never merged here.
 */

const DAY_MS = 86_400_000

/** Weeks of history required before a normal exists. */
export const BASELINE_WEEKS = 3

export type WeeklyRead =
  | {
      status: 'ok'
      value: number
      baseline: number | null
      /** Posts that went out in the reported week, measured or not. */
      postsRan: number
      /** Posts that went out AND came back with a reading. */
      postsMeasured: number
    }
  | { status: 'unreadable' }

export type CountRead =
  { status: 'ok'; value: number; previous: number | null } | { status: 'unreadable' }

function weeksBefore(fromIso: string, weeks: number): string {
  const from = new Date(`${fromIso}T00:00:00Z`)
  return new Date(from.getTime() - weeks * 7 * DAY_MS).toISOString().slice(0, 10)
}

/** Which of the four buckets a day falls in. 0 is the reported week, 1..3 older. */
function bucketOf(dayIso: string, fromIso: string): number {
  const days = Math.floor(
    (new Date(`${fromIso}T00:00:00Z`).getTime() - new Date(dayIso).getTime()) / DAY_MS,
  )
  if (days < 0) return 0
  return Math.floor(days / 7) + 1
}

/**
 * People reached last week, and the workspace's own normal.
 *
 * `metric` is 'reach' because that is the one word in the stored vocabulary that
 * means a person saw it. The other two are a count of servings and a count of
 * taps, and neither answers the question this card asks.
 */
export async function readReach(
  workspaceId: string,
  fromIso: string,
  toIso: string,
): Promise<WeeklyRead> {
  const supabase = createServerSupabase()
  const since = weeksBefore(fromIso, BASELINE_WEEKS)

  const [logs, snapshots] = await Promise.all([
    supabase
      .from('post_publish_logs')
      .select('post_id, published_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'succeeded')
      .gte('published_at', `${since}T00:00:00Z`)
      .lte('published_at', `${toIso}T23:59:59Z`),
    supabase
      .from('post_metric_snapshots')
      .select('post_id, value')
      .eq('workspace_id', workspaceId)
      .eq('metric', 'reach'),
  ])
  if (logs.error || snapshots.error) return { status: 'unreadable' }

  // One publish week per post: the earliest successful send. A retry on Friday
  // does not move a Tuesday post into a different week.
  const publishedIn = new Map<string, number>()
  for (const row of logs.data ?? []) {
    const at = row.published_at as string | null
    if (!at) continue
    const bucket = bucketOf(at, fromIso)
    if (bucket > BASELINE_WEEKS) continue
    const found = publishedIn.get(row.post_id as string)
    if (found === undefined || bucket > found) publishedIn.set(row.post_id as string, bucket)
  }

  // One value per post: the highest reading it ever reached.
  const highest = new Map<string, number>()
  for (const row of snapshots.data ?? []) {
    const id = row.post_id as string
    if (!publishedIn.has(id)) continue
    const value = Number(row.value)
    if (!Number.isFinite(value)) continue
    const found = highest.get(id)
    if (found === undefined || value > found) highest.set(id, value)
  }

  const totals = new Array<number>(BASELINE_WEEKS + 1).fill(0)
  const measured = new Array<number>(BASELINE_WEEKS + 1).fill(0)
  for (const [postId, bucket] of publishedIn) {
    const value = highest.get(postId)
    if (value === undefined) continue
    totals[bucket] = (totals[bucket] ?? 0) + value
    measured[bucket] = (measured[bucket] ?? 0) + 1
  }

  const priorWeeks = totals.slice(1).filter((_, i) => (measured[i + 1] ?? 0) > 0)
  const baseline =
    priorWeeks.length >= BASELINE_WEEKS
      ? Math.round(priorWeeks.reduce((a, b) => a + b, 0) / priorWeeks.length)
      : null

  let postsRan = 0
  for (const bucket of publishedIn.values()) if (bucket === 0) postsRan += 1

  return {
    status: 'ok',
    value: totals[0] ?? 0,
    baseline,
    postsRan,
    postsMeasured: measured[0] ?? 0,
  }
}

/** People who wrote back: one count per conversation, not per message. */
export async function readReplies(
  workspaceId: string,
  fromIso: string,
  toIso: string,
): Promise<CountRead> {
  const supabase = createServerSupabase()
  const since = weeksBefore(fromIso, 1)
  const { data, error } = await supabase
    .from('inbox_threads')
    .select('id, posted_at')
    .eq('workspace_id', workspaceId)
    .gte('posted_at', `${since}T00:00:00Z`)
    .lte('posted_at', `${toIso}T23:59:59Z`)
  if (error) return { status: 'unreadable' }

  let now = 0
  let before = 0
  for (const row of data ?? []) {
    const at = row.posted_at as string | null
    if (!at) continue
    if (bucketOf(at, fromIso) === 0) now += 1
    else before += 1
  }
  // A week with no stored conversations at all is not evidence of a quiet week
  // before it, so the previous count is only a comparison when something was
  // seen in that window.
  return { status: 'ok', value: now, previous: (data ?? []).length > 0 ? before : null }
}

/** Enquiries that arrived last week, and how many nobody has answered. */
export async function readEnquiries(
  workspaceId: string,
  fromIso: string,
  toIso: string,
): Promise<{ status: 'ok'; value: number; unanswered: number } | { status: 'unreadable' }> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('leads')
    .select('id, status')
    .eq('workspace_id', workspaceId)
    .gte('created_at', `${fromIso}T00:00:00Z`)
    .lte('created_at', `${toIso}T23:59:59Z`)
  if (error) return { status: 'unreadable' }
  const rows = data ?? []
  return {
    status: 'ok',
    value: rows.length,
    unanswered: rows.filter((r) => r.status === 'new').length,
  }
}

/**
 * When each of this week's posts is due, in the owner's own zone.
 *
 * The brief carries a SUGGESTED slot, which is what the planner proposed and not
 * what is booked. A row that said "Tuesday 9am" from a suggestion would be a
 * schedule the reader could not find anywhere else in the product, so the day
 * and time come from the post itself or the row simply has none.
 */
export async function readPlanTimes(
  workspaceId: string,
  postIds: readonly string[],
): Promise<Map<string, string | null>> {
  if (postIds.length === 0) return new Map()
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('posts')
    .select('id, scheduled_at')
    .eq('workspace_id', workspaceId)
    .in('id', [...postIds])
  if (error) return new Map()
  return new Map(
    (data ?? []).map((row) => [row.id as string, (row.scheduled_at as string) ?? null]),
  )
}
