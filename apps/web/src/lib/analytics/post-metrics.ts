import 'server-only'

import {
  classifyPostMetrics,
  type MetricAvailability,
  type ZernioPostAnalyticsResult,
} from '@sahoda/publishing'
import type { PostVariant } from '@sahoda/shared'

import { cache } from 'react'

import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'
import { profileForWorkspace } from '@/lib/zernio/scope'
import { zernioClientReads } from '@/lib/zernio/server'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

/**
 * Per-post, per-channel metrics — impressions, reach and engagement.
 *
 * ── WHAT THIS MODULE REFUSES TO DO ───────────────────────────────────────────
 * It never returns a number it cannot justify. Every path that fails — no workspace,
 * no Zernio profile, an unprovisioned key, a thrown call, a post with no platform id
 * — resolves to a `MetricAvailability` that SAYS so. There is no fallback to zero
 * anywhere in this file, because a zero here is indistinguishable from a real
 * measurement of nothing and would read as "your post reached no one".
 *
 * The classification itself lives in `@sahoda/publishing` and is pure. This module
 * only supplies its inputs: the analytics answer, the publish time, and the key.
 */

/** Memoised per request, so a page's several metric reads share one lookup. */
const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const workspace = await getActiveWorkspace()
  return workspace?.id ?? null
})

/**
 * Most calls one render may make.
 *
 * `postAnalytics` has no batch form we can trust — `listPostAnalytics` returns
 * `unknown[]` with no verified join key, and guessing one would mismatch metrics to
 * posts silently. So this is one call per published channel, bounded.
 *
 * The two paths get different ceilings because they carry different risk. A LIST can
 * hold fifty published posts, and every call is latency the whole page waits on, so
 * it stays at roughly one round; posts past the cap say "open the post to see its
 * metrics", which is true and actionable. A DETAIL page is one post — at most four
 * channels — so it is never the bottleneck and gets room to spare.
 */
export const LIST_METRIC_CALLS = 6
export const DETAIL_METRIC_CALLS = 8

/** In-flight calls at once. Zernio rate-limits at 60/min; this stays well under. */
const CONCURRENCY = 4

export interface ChannelMetrics {
  channel: PostVariant['channel']
  state: MetricAvailability
}

/** One channel we can actually ask about: published, live, and with an analytics key. */
interface Target {
  postId: string
  channel: PostVariant['channel']
  platformPostId: string
}

/**
 * When each channel of each post actually went out.
 *
 * `published_at` lives only on `post_publish_logs` — neither `posts` nor
 * `post_variants` records it — and the lag window is measured from it. Keyed
 * `postId::channel`; only succeeded rows count, and the latest wins.
 */
async function publishTimes(workspaceId: string, postIds: string[]): Promise<Map<string, string>> {
  const times = new Map<string, string>()
  if (postIds.length === 0) return times

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('post_publish_logs')
    .select('post_id, channel, status, published_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'succeeded')
    .in('post_id', postIds)

  if (error || !data) return times

  for (const row of data as {
    post_id?: unknown
    channel?: unknown
    published_at?: unknown
  }[]) {
    if (typeof row.post_id !== 'string' || typeof row.channel !== 'string') continue
    if (typeof row.published_at !== 'string') continue
    const key = `${row.post_id}::${row.channel}`
    const seen = times.get(key)
    // Latest succeeded attempt is the one the platform is reporting on.
    if (!seen || Date.parse(row.published_at) > Date.parse(seen)) times.set(key, row.published_at)
  }
  return times
}

/** Run `work` over `items` a few at a time rather than all at once. */
async function mapCapped<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(work))))
  }
  return out
}

/**
 * Metric state for every channel of every post given.
 *
 * Returns a state for EVERY row, not only the ones we called for: "not published"
 * and "no platform id" are answers, and a card that silently omits a channel would
 * imply the channel has nothing to say rather than that we never asked.
 *
 * NEVER REJECTS. `read.ts` states the rule this follows — "every read degrades to
 * empty/null rather than throwing: the app shell must survive" — and metrics are the
 * least important thing on the posts list. A Supabase hiccup here must cost the
 * numbers, not the page.
 */
export async function listPostMetrics(
  statesByPost: ReadonlyMap<string, readonly VariantStatusRow[]>,
  now: Date = new Date(),
  maxCalls: number = LIST_METRIC_CALLS,
): Promise<Map<string, ChannelMetrics[]>> {
  const result = new Map<string, ChannelMetrics[]>()
  const postIds = [...statesByPost.keys()]
  if (postIds.length === 0) return result

  /** Fill every row with one verdict, then let the fetched ones overwrite. */
  const seed = (state: (row: VariantStatusRow) => MetricAvailability) => {
    for (const [postId, rows] of statesByPost) {
      result.set(
        postId,
        rows.map((row) => ({ channel: row.channel, state: state(row) })),
      )
    }
    return result
  }

  /** What a row deserves before any call is made — the two no-call verdicts. */
  const preCall = (row: VariantStatusRow): MetricAvailability =>
    classifyPostMetrics({
      result: null,
      platformPostId: row.platformPostId,
      published: row.status === 'published',
      // Without this a fixture arrives as a published row with a null id, which reads
      // as "the platform gave us nothing" rather than "we never asked the platform".
      simulated: row.simulated,
      publishedAt: null,
      now,
    })

  try {
    return await fetchInto(result, statesByPost, postIds, seed, preCall, now, maxCalls)
  } catch (error) {
    // Any throw at all — no session, an unreachable database, a malformed row —
    // falls back to the honest no-call verdicts rather than propagating.
    console.error(
      '[analytics] post metrics read threw',
      error instanceof Error ? error.message : 'unknown',
    )
    return seed(preCall)
  }
}

/** The part that can throw. Split out so the wrapper above stays obviously total. */
async function fetchInto(
  result: Map<string, ChannelMetrics[]>,
  statesByPost: ReadonlyMap<string, readonly VariantStatusRow[]>,
  postIds: string[],
  seed: (state: (row: VariantStatusRow) => MetricAvailability) => Map<string, ChannelMetrics[]>,
  preCall: (row: VariantStatusRow) => MetricAvailability,
  now: Date,
  maxCalls: number,
): Promise<Map<string, ChannelMetrics[]>> {
  const workspaceId = await activeWorkspaceId()
  if (workspaceId === null) return seed(preCall)

  const reads = zernioClientReads()
  if (!reads) return seed(preCall)

  let profile
  try {
    profile = await profileForWorkspace(workspaceId)
  } catch {
    // No Zernio profile mapped to this workspace — nothing is connected. Say that,
    // rather than reporting every post as having no data.
    return seed((row) =>
      row.status === 'published' && row.platformPostId
        ? { kind: 'unavailable', reason: 'not-connected' }
        : preCall(row),
    )
  }

  seed(preCall)

  const targets: Target[] = []
  for (const [postId, rows] of statesByPost) {
    for (const row of rows) {
      if (row.status !== 'published' || !row.platformPostId) continue
      targets.push({ postId, channel: row.channel, platformPostId: row.platformPostId })
    }
  }
  if (targets.length === 0) return result

  const times = await publishTimes(workspaceId, postIds)
  const asked = targets.slice(0, maxCalls)
  const skipped = targets.slice(maxCalls)

  const fetched = await mapCapped(asked, CONCURRENCY, async (target) => {
    try {
      const answer = await reads.postAnalytics(profile, target.platformPostId)
      return { target, state: classify(target, answer, times, now) }
    } catch {
      // A thrown call is "we could not read it" — never "there is nothing".
      return { target, state: { kind: 'unavailable', reason: 'unreadable' } as MetricAvailability }
    }
  })

  const verdicts = [
    ...fetched,
    // Past the ceiling: nothing failed, we simply did not ask. `not-loaded` says
    // that and points at the detail view, instead of advising a refresh that would
    // hit the same cap.
    ...skipped.map((target) => ({
      target,
      state: { kind: 'unavailable', reason: 'not-loaded' } as MetricAvailability,
    })),
  ]

  for (const { target, state } of verdicts) {
    const rows = result.get(target.postId)
    if (!rows) continue
    const row = rows.find((r) => r.channel === target.channel)
    if (row) row.state = state
  }
  return result
}

function classify(
  target: Target,
  answer: ZernioPostAnalyticsResult,
  times: ReadonlyMap<string, string>,
  now: Date,
): MetricAvailability {
  return classifyPostMetrics({
    result: answer,
    platformPostId: target.platformPostId,
    published: true,
    publishedAt: times.get(`${target.postId}::${target.channel}`) ?? null,
    now,
  })
}

/**
 * One post's channels, for the detail view. Same rules, same refusals.
 *
 * Gets its own ceiling rather than inheriting the list's: one post is at most four
 * channels, so the cap that protects a fifty-post list would be wrong here — and
 * "open the post to see its metrics" is nonsense advice on the post.
 */
export async function readPostMetrics(
  postId: string,
  rows: readonly VariantStatusRow[],
  now: Date = new Date(),
): Promise<ChannelMetrics[]> {
  const byPost = await listPostMetrics(new Map([[postId, rows]]), now, DETAIL_METRIC_CALLS)
  return byPost.get(postId) ?? []
}
