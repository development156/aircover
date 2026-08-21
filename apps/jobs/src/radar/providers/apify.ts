import { z } from 'zod'

import type { RadarPost, SocialSnapshot } from '@sahoda/shared'

/**
 * SOCIAL — reading a competitor's public profile through an Apify actor.
 *
 * ── WHY A SCRAPER AND NOT AN API ─────────────────────────────────────────────
 * No platform offers an API for reading an account you do not own. Instagram's
 * Graph API reads accounts you have a token for; Zernio, which this product
 * already uses, reads the customer's OWN connected accounts. A competitor has
 * given us nothing to authenticate with, so the only route to "what did they
 * post yesterday" is a public-page scraper. The trade that comes with it is
 * written down in docs/34_Radar_Sourcing.md, in plain language, because it is the
 * founder's to accept and not ours.
 *
 * ── THE COST, MEASURED 2026-08-22 AGAINST A REAL ACCOUNT ─────────────────────
 * One profile check: $0.0026. Confirmed twice — `eventUsage.profile.eventTotalUsd`
 * on the run, and `PAID_ACTORS_PER_EVENT` in the account's own monthly ledger.
 * One request returns the follower count AND the latest 12 posts, so a day's
 * social watch on one competitor is one charge, not thirteen.
 *
 * ⚠ THE TRAP THAT WOULD HAVE WRITTEN A FABRICATED ZERO ⚠
 * The run object returned by `?waitForFinish=` reports `usageTotalUsd: 0`. The
 * charge is accounted AFTER the run terminates, so the response that tells you
 * the run succeeded does not yet know what it cost. Re-fetching the same run id a
 * moment later reports 0.0026. A collector that trusted the first answer would
 * record every social check as free, and the founder's cost report would say
 * Radar costs nothing right up until the invoice arrived. `readRunCost` below
 * re-fetches, and returns null rather than 0 when it still cannot tell —
 * "we do not know what this cost" and "this cost nothing" are different facts.
 */

const ACTOR = 'apify~instagram-profile-scraper'
const API = 'https://api.apify.com/v2'

/** The list price, used as the reservation estimate before the real figure exists. */
export const APIFY_PROFILE_ESTIMATE_MICROS = 2600

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/**
 * What the actor returns. Every metric is OPTIONAL on purpose: Instagram
 * withholds counts from some accounts and returns the field absent rather than
 * zero, and a schema with `.default(0)` would turn "they did not say" into
 * "they have none" — a number Radar invented. This codebase has already shipped
 * that confusion once and the fix was the same: omit.
 */
const profileSchema = z.object({
  username: z.string().min(1),
  fullName: z.string().optional(),
  followersCount: z.number().int().nonnegative().optional(),
  followsCount: z.number().int().nonnegative().optional(),
  postsCount: z.number().int().nonnegative().optional(),
  latestPosts: z
    .array(
      z.object({
        id: z.string().optional(),
        shortCode: z.string().optional(),
        url: z.string().optional(),
        timestamp: z.string().optional(),
        caption: z.string().optional(),
        likesCount: z.number().int().optional(),
        commentsCount: z.number().int().optional(),
      }),
    )
    .optional(),
})

export interface ApifyOptions {
  token: string
  fetch?: FetchLike
  /** How long to wait for the actor. The measured run took 11.7 seconds. */
  waitSeconds?: number
}

export interface SocialFetch {
  snapshot: SocialSnapshot
  /** Null means "we could not find out", never "it was free". */
  costMicros: number | null
  runId: string
}

/**
 * Ask Apify what a finished run cost.
 *
 * Separate from the run itself so the delay described above is visible, and so
 * the settlement can happen after the snapshot is safely written.
 */
export async function readRunCost(runId: string, options: ApifyOptions): Promise<number | null> {
  const doFetch = options.fetch ?? fetch
  const res = await doFetch(`${API}/actor-runs/${runId}`, {
    headers: { authorization: `Bearer ${options.token}` },
  })
  if (!res.ok) return null
  const body = (await res.json()) as {
    data?: { usageTotalUsd?: number; eventUsage?: Record<string, { eventTotalUsd?: number }> }
  }
  const events = body.data?.eventUsage
  const fromEvents = events
    ? Object.values(events).reduce((sum, e) => sum + (e.eventTotalUsd ?? 0), 0)
    : 0
  const total = fromEvents > 0 ? fromEvents : (body.data?.usageTotalUsd ?? 0)
  // A genuine zero is indistinguishable here from "not accounted yet", and the
  // honest answer to that ambiguity is null. The reservation's list-price
  // estimate stands, marked `estimated`, rather than being overwritten with a
  // zero nobody can vouch for.
  return total > 0 ? Math.round(total * 1_000_000) : null
}

/** One competitor's Instagram profile, as it is right now. */
export async function fetchInstagramProfile(
  handle: string,
  options: ApifyOptions,
): Promise<SocialFetch> {
  const doFetch = options.fetch ?? fetch
  const wait = options.waitSeconds ?? 180

  const run = await doFetch(`${API}/acts/${ACTOR}/runs?waitForFinish=${wait}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ usernames: [handle] }),
  })
  if (!run.ok) {
    throw new Error(`apify run failed: http ${run.status}`)
  }
  const runBody = (await run.json()) as {
    data: { id: string; status: string; defaultDatasetId: string }
  }
  if (runBody.data.status !== 'SUCCEEDED') {
    throw new Error(`apify run ${runBody.data.status}`)
  }

  const itemsRes = await doFetch(`${API}/datasets/${runBody.data.defaultDatasetId}/items`, {
    headers: { authorization: `Bearer ${options.token}` },
  })
  if (!itemsRes.ok) throw new Error(`apify dataset read failed: http ${itemsRes.status}`)
  const items = (await itemsRes.json()) as unknown[]
  if (items.length === 0) throw new Error('apify returned no profile')

  const profile = profileSchema.parse(items[0])
  const costMicros = await readRunCost(runBody.data.id, options)

  return { snapshot: toSnapshot(handle, profile), costMicros, runId: runBody.data.id }
}

/**
 * The actor's shape, narrowed to ours.
 *
 * Exported so the hostile-fixture test can drive it directly: a caption is
 * UNTRUSTED TEXT written by a competitor, and this function is the boundary where
 * it becomes stored evidence. Nothing here interprets it.
 */
export function toSnapshot(handle: string, profile: z.infer<typeof profileSchema>): SocialSnapshot {
  const posts: RadarPost[] = (profile.latestPosts ?? [])
    .map((p) => {
      const id = p.id ?? p.shortCode
      if (!id) return null
      return {
        id,
        ...(p.url ? { url: p.url } : {}),
        ...(p.timestamp ? { postedAt: p.timestamp } : {}),
        // Truncated at the boundary. A caption is a data point about their copy,
        // never an instruction — see packages/research/src/quarantine.ts for what
        // happens to it if it is ever shown to a model.
        ...(p.caption ? { caption: p.caption.slice(0, 2000) } : {}),
        ...(typeof p.likesCount === 'number' && p.likesCount >= 0
          ? { likeCount: p.likesCount }
          : {}),
        ...(typeof p.commentsCount === 'number' && p.commentsCount >= 0
          ? { commentCount: p.commentsCount }
          : {}),
      }
    })
    .filter((p): p is RadarPost => p !== null)
    .slice(0, 50)

  return {
    kind: 'social',
    handle,
    // Spread-if-present, never `?? 0`. The whole file turns on this.
    ...(profile.followersCount === undefined ? {} : { followers: profile.followersCount }),
    ...(profile.followsCount === undefined ? {} : { following: profile.followsCount }),
    ...(profile.postsCount === undefined ? {} : { postCount: profile.postsCount }),
    posts,
  }
}
