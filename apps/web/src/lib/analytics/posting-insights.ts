import 'server-only'

import type {
  ScopedProfileId,
  ZernioDecayBucket,
  ZernioFollowerAccount,
  ZernioFollowerPoint,
  ZernioFrequencyRow,
  ZernioReads,
} from '@sahoda/publishing'

import { ScopeError, profileForWorkspace } from '@/lib/zernio/scope'
import { zernioClientReads } from '@/lib/zernio/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * THREE LIVE POSTING READS, IN ONE PAGE-LEVEL AWAIT.
 *
 * ── WHY THEY ARE ONE FUNCTION AND NOT THREE ──────────────────────────────────
 * `read-waterfall.test.ts` fails a route that gains a SEQUENTIAL read, and it
 * counts by name from the page's own source. Three readers is three names,
 * three entries in the baseline, and — the part that actually matters — three
 * separate resolutions of the same workspace and the same profile. They share a
 * scope, so they resolve it once and then go out together.
 *
 * ── EACH SECTION FAILS ALONE ─────────────────────────────────────────────────
 * `Promise.allSettled`, not `all`. Follower stats and content decay are
 * different endpoints with different add-on requirements, and one of them
 * refusing must cost its own card rather than the other two. The same rule
 * `page-data.ts` states for the page.
 *
 * ── NOTHING HERE IS PROVEN AGAINST THE WIRE ──────────────────────────────────
 * `[DOC]`. The three endpoints' shapes come from Zernio's OpenAPI spec and no
 * workspace with a connected account was reachable from the sandbox this was
 * written in. The readers narrow defensively for exactly that reason: every
 * figure is `number | null`, a row missing the field that names it is dropped,
 * and an empty answer is reported as empty rather than as a fault.
 */

/** Why a section has nothing, in the four flavours this page keeps apart. */
export type PostingAbsence =
  /** No Zernio profile for this workspace. Nothing could be asked. */
  | 'not-connected'
  /** No publishing key in this deployment. Ours, and no retry can help. */
  | 'not-configured'
  /** We asked and did not get an answer, or the plan refused it. */
  | 'unreadable'

export interface FollowerSeries {
  accountId: string
  platform: string
  username: string | null
  currentFollowers: number | null
  growth: number | null
  points: ZernioFollowerPoint[]
}

export type Section<T> = { kind: 'ready'; value: T } | { kind: 'absent'; absence: PostingAbsence }

export interface PostingInsights {
  followers: Section<FollowerSeries[]>
  frequency: Section<ZernioFrequencyRow[]>
  decay: Section<ZernioDecayBucket[]>
}

function allAbsent(absence: PostingAbsence): PostingInsights {
  const absent = { kind: 'absent', absence } as const
  return { followers: absent, frequency: absent, decay: absent }
}

/**
 * Join each account to its own series, dropping any that has neither.
 *
 * An account with no series is NOT an account at zero followers; Zernio simply
 * holds no history for it yet, which is the ordinary state for one connected
 * this week. It is left out of the chart and counted in the sentence under it.
 */
export function followerSeries(
  accounts: readonly ZernioFollowerAccount[],
  stats: Readonly<Record<string, ZernioFollowerPoint[]>>,
): FollowerSeries[] {
  return accounts
    .map((account) => ({
      accountId: account.id,
      platform: account.platform,
      username: account.username,
      currentFollowers: account.currentFollowers,
      growth: account.growth,
      points: stats[account.id] ?? [],
    }))
    .sort((a, b) => a.platform.localeCompare(b.platform))
}

export async function readPostingInsights(view: {
  from: string
  to: string
}): Promise<PostingInsights> {
  let reads: ZernioReads | null
  try {
    reads = zernioClientReads()
  } catch {
    return allAbsent('not-configured')
  }
  if (reads === null) return allAbsent('not-configured')

  let profile: ScopedProfileId
  try {
    const workspace = await activeWorkspaceRead()
    // A workspace read that FAILED is not a workspace with nothing connected.
    if (workspace.status === 'unreadable') return allAbsent('unreadable')
    if (workspace.status === 'none') return allAbsent('not-connected')
    profile = await profileForWorkspace(workspace.workspace.id)
  } catch (error) {
    if (error instanceof ScopeError) return allAbsent('not-connected')
    return allAbsent('unreadable')
  }

  // One refusal must cost one card. The add-on requirements differ between
  // these three endpoints, so a legacy plan can genuinely answer one and refuse
  // another.
  const [followers, frequency, decay] = await Promise.allSettled([
    reads.followerStats(profile, { fromDate: view.from, toDate: view.to, granularity: 'daily' }),
    reads.postingFrequency(profile),
    reads.contentDecay(profile),
  ])

  return {
    followers:
      followers.status === 'fulfilled'
        ? { kind: 'ready', value: followerSeries(followers.value.accounts, followers.value.stats) }
        : { kind: 'absent', absence: 'unreadable' },
    frequency:
      frequency.status === 'fulfilled'
        ? { kind: 'ready', value: frequency.value.frequency }
        : { kind: 'absent', absence: 'unreadable' },
    decay:
      decay.status === 'fulfilled'
        ? { kind: 'ready', value: decay.value.buckets }
        : { kind: 'absent', absence: 'unreadable' },
  }
}
