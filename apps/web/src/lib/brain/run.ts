import 'server-only'

import type { MarketingObservation } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'

import { audienceGrowth, type NoGrowthReason } from './observe/audience-growth'
import { channelReturn, type NoChannelReason } from './observe/channel-return'
import { editDistance, type NoDeltaReason } from './observe/edit-distance'
import { toneDrift, type NoDriftReason } from './observe/tone-drift'
import {
  readAudienceReadings,
  readCapturedPosts,
  readChannelOutcomes,
  readPublishedPosts,
  saveObservation,
  workspacesWithAudience,
  workspacesWithCapturedDrafts,
  workspacesWithChannelMetrics,
  workspacesWithPublishedPosts,
} from './store'

/**
 * ONE WEEKLY PASS OF THE MARKETING BRAIN.
 *
 * ── IT SPENDS NOTHING, WHICH IS WHY IT IS NOT PART OF THE LOOP CRON ──────────
 * The Loop's Sunday tick opens cycles and buys model calls, so it defaults OFF
 * and a person has to turn it on. This pass counts characters in text the
 * customer already published: no provider, no ledger, no hold. Riding the Loop's
 * route would have tied a free computation to a paid switch, so the first
 * workspace to leave the Loop off would silently get no Marketing Brain either,
 * and nothing on any screen would say why.
 *
 * ── EVERY WORKSPACE THAT DECLINES SAYS WHY ───────────────────────────────────
 * `declined` is a count per reason, not a total. "18 workspaces produced
 * nothing" is indistinguishable from a broken job; "18 had too few posts" is a
 * product that is working and waiting. This is the same reason
 * `runScheduledLoopCycles` itemises its outcomes instead of returning a number.
 */

export interface BrainPassResult {
  workspaces: number
  /** Rows written for the first time today. */
  inserted: number
  /** Rows that already existed for today and were refreshed by a re-run. */
  refreshed: number
  /**
   * How many workspaces produced nothing, by the reason they produced nothing.
   *
   * Keys are `<kind>:<reason>`. The prefix is load-bearing rather than tidy:
   * `tone_drift` and `edit_distance` both decline with `too_few_posts` and with
   * `window_too_short`, and those mean different things about different
   * populations. Merged under a bare reason, "31 too_few_posts" would be two
   * unrelated facts added together, and no reader could tell which computer was
   * waiting on data.
   */
  declined: Record<string, number>
  /** Workspaces whose pass threw. Counted, never silently folded into `declined`. */
  failed: number
}

/**
 * How far back a habit claim may look.
 *
 * Two hundred posts is roughly four years for a business posting weekly and
 * about seven months for one posting daily. The cap exists so the arithmetic
 * cost is bounded per workspace; it is applied oldest-first-truncated by the
 * store's `order by published_on asc`, which means a very prolific business is
 * compared on its EARLIEST two hundred posts and would be told about a drift
 * that ended years ago.
 *
 * That is wrong, and it is why the slice below takes the tail rather than
 * trusting the limit: the store bounds the query, this bounds the claim to the
 * most recent posts, and the two together mean a busy workspace is described by
 * what it is doing now.
 */
export const MAX_POSTS_CONSIDERED = 200

export async function runMarketingBrainPass(today: Date): Promise<BrainPassResult> {
  const computedOn = today.toISOString().slice(0, 10)
  // The union of all three, not any one list. A workspace that has published
  // nothing can still have a month of corrections worth measuring; one that
  // published before draft capture existed has no drafts at all; and metrics
  // arrive from a connected account, so a workspace can carry measured outcomes
  // for posts this job's other readers filtered out. Taking one list would
  // silently skip a whole computer for every workspace outside it.
  const workspaceIds = [
    ...new Set([
      ...(await workspacesWithPublishedPosts()),
      ...(await workspacesWithCapturedDrafts()),
      ...(await workspacesWithChannelMetrics()),
      ...(await workspacesWithAudience()),
    ]),
  ]

  const result: BrainPassResult = {
    workspaces: workspaceIds.length,
    inserted: 0,
    refreshed: 0,
    declined: {},
    failed: 0,
  }

  const decline = (
    kind: string,
    reason: NoDriftReason | NoDeltaReason | NoChannelReason | NoGrowthReason,
  ): void => {
    const key = `${kind}:${reason}`
    result.declined[key] = (result.declined[key] ?? 0) + 1
  }

  const record = async (
    workspaceId: string,
    kind: string,
    outcome: { observation: MarketingObservation | null; reason: string | null },
    fallback: NoDriftReason | NoDeltaReason | NoChannelReason | NoGrowthReason,
  ): Promise<void> => {
    if (!outcome.observation) {
      // Each computer returns exactly one of the two and its type says so. The
      // fallback is here because a future one could return neither, and the
      // count would silently stop adding up.
      decline(
        kind,
        (outcome.reason as NoDriftReason | NoDeltaReason | NoChannelReason | NoGrowthReason) ??
          fallback,
      )
      return
    }
    const { inserted } = await saveObservation(workspaceId, outcome.observation)
    if (inserted) result.inserted += 1
    else result.refreshed += 1
  }

  for (const workspaceId of workspaceIds) {
    try {
      // Both computers run for every workspace in the union, and each declines
      // on its own population. A workspace with published posts and no captured
      // drafts declines `edit_distance:no_captured_drafts`, which is a true
      // statement and a visibly different one from having produced nothing.
      const all = await readPublishedPosts(workspaceId, MAX_POSTS_CONSIDERED * 2)
      const posts = all.slice(-MAX_POSTS_CONSIDERED)
      await record(workspaceId, 'tone_drift', toneDrift(posts, computedOn), 'no_posts')

      const captured = await readCapturedPosts(workspaceId, MAX_POSTS_CONSIDERED * 2)
      await record(
        workspaceId,
        'edit_distance',
        editDistance(captured.slice(-MAX_POSTS_CONSIDERED), computedOn),
        'no_captured_drafts',
      )

      /**
       * Not sliced. The two computers above compare an EARLIER half against a
       * LATER one, so bounding them to recent posts is what keeps the claim
       * about now. This one compares channels against each other at a single
       * moment, so trimming the tail would drop whole channels rather than old
       * halves — the reader already returns one row per post per channel.
       */
      const outcomes = await readChannelOutcomes(workspaceId, MAX_POSTS_CONSIDERED * 2)
      await record(workspaceId, 'channel_return', channelReturn(outcomes, computedOn), 'no_metrics')

      /**
       * One observation PER CHANNEL, which is why this is the only computer the
       * runner loops over. A workspace on two platforms is growing on one and
       * shrinking on the other as often as not, and a single blended number
       * would hide exactly the fact worth acting on. `subject` carries the
       * channel, so the unique key keeps them apart.
       */
      const readings = await readAudienceReadings(workspaceId)
      const channels = [...new Set(readings.map((r) => r.channel))]
      if (channels.length === 0) {
        /**
         * Declared, not skipped. With no readings there is no channel to loop
         * over, so without this line a workspace with no connected account
         * would produce no `audience_growth` entry of any kind — silence that
         * reads identically to the computer never having run. Every sibling
         * says why it produced nothing and so does this one.
         */
        await record(
          workspaceId,
          'audience_growth',
          { observation: null, reason: 'no_audience_data' },
          'no_audience_data',
        )
      }
      for (const channel of channels) {
        await record(
          workspaceId,
          'audience_growth',
          audienceGrowth(
            readings.filter((r) => r.channel === channel),
            channel,
            computedOn,
          ),
          'no_audience_data',
        )
      }
    } catch (error) {
      // One workspace's failure must not end the pass for the rest. Counted
      // separately from `declined`, because "we could not look" and "we looked
      // and there was nothing" are different facts about the run.
      result.failed += 1
      reportServerError(error, { action: 'brain.pass', workspaceId })
    }
  }

  return result
}
