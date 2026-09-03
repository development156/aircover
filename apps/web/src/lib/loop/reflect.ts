import type { Channel } from '@sahoda/shared'

import { compareGroups, type NoLearningReason } from '@/lib/analytics/grouped-lift'

/**
 * REFLECT — turning last week's numbers into a learning, or honestly declining to.
 *
 * ── THERE IS NO MODEL CALL IN THIS FILE, AND THAT IS THE DESIGN ──────────────
 * FSD M2 calls this an "insight pass", which reads like a prompt. It is
 * arithmetic instead, deliberately.
 *
 * A learning is a claim about the CUSTOMER'S OWN BUSINESS — "your Tuesday posts
 * reach more people than your Friday ones" — and that is the one class of
 * statement this product may never invent. If a model produced it, the only
 * thing standing between a customer and a fabricated fact would be an
 * instruction in a prompt, and the test for it would assert on output copy,
 * which a prompt-instructed model passes while inventing freely.
 *
 * Computed here, the guarantee is structural: this module imports no mesh, holds
 * no port, and cannot reach a provider. Every number it emits is a division of
 * two numbers that came out of `post_metric_snapshots`. There is no path by
 * which it says something no row supports.
 *
 * ── THE EVIDENCE FLOOR IS THE ACTUAL SUBSTANCE ───────────────────────────────
 * "Produced by a query" is NOT the same as "true enough to tell someone", and
 * the live data is the proof. Production today holds, for the one workspace with
 * any history at all:
 *
 *     instagram   5 posts, impressions 1–3
 *     linkedin    1 post,  impressions 63
 *
 * A per-channel mean comparison over that says LinkedIn beats Instagram
 * thirty-one fold. Every figure in that sentence comes from a real row, and the
 * sentence is worthless — one post is not a channel's performance. That is the
 * invented insight arriving through arithmetic rather than through a model, and
 * a floor is the only thing that stops it.
 *
 * So a comparison must clear all four gates below, and when it does not, this
 * returns the REASON rather than a weaker claim.
 */

/**
 * THE FIVE GATES NOW LIVE IN `lib/analytics/grouped-lift.ts`, AND SO DOES THE
 * ARITHMETIC THIS FILE USED TO HOLD.
 *
 * The analytics report needs the identical comparison over the DAY OF THE WEEK a
 * post went out rather than over its channel. Copying the gates would have meant
 * two sets of thresholds drifting apart, and the one that drifted looser would be
 * the one that published a false claim. So the comparison was generalised over its
 * grouping and this file passes the channel as the group.
 *
 * They are re-exported here because every argument for their VALUES is written
 * beside them, and because `reflect`'s own tests and the cycle store import them
 * from this path.
 */
export {
  MIN_GROUPS,
  MIN_LEADER_MEAN,
  MIN_LIFT,
  MIN_MEASURED_DAYS,
  MIN_POSTS_PER_GROUP,
} from '@/lib/analytics/grouped-lift'
export type { NoLearningReason }

/** One measurement, as `post_metric_snapshots` stores it. */
export interface MetricObservation {
  post_id: string
  channel: Channel
  metric: string
  value: number
  measured_on: string
}

export interface ChannelLearning {
  metric: string
  leader: Channel
  runnerUp: Channel
  leaderMean: number
  runnerUpMean: number
  /** How many times better, to one decimal. Derived, never stored as prose. */
  lift: number
  postIds: readonly string[]
  sampleSize: number
  windowDays: number
}

export interface ReflectResult {
  learnings: readonly ChannelLearning[]
  /** Present exactly when `learnings` is empty. */
  reason: NoLearningReason | null
  /** True when nothing was measured at all — the column the cycle stores. */
  skippedNoHistory: boolean
}

/**
 * What last week's numbers support, for one metric.
 *
 * Returns at most ONE learning. FSD M2 allows one to three; this emits the
 * single strongest comparison it can defend rather than filling a quota, because
 * a quota is what turns a second-best observation into a claim.
 */
export function reflect(
  observations: readonly MetricObservation[],
  metric = 'impressions',
): ReflectResult {
  // Every gate this function used to hold is now `compareGroups`, called here
  // with the CHANNEL as the arm.
  //
  // ── ONE BEHAVIOUR DID CHANGE, AND IT IS WRITTEN DOWN RATHER THAN GLOSSED ───
  // I first claimed this refactor changed nothing. An audit disproved it. The
  // old sort was `b.mean - a.mean` with NO tie-break, so two arms with equal
  // means came out in Map insertion order, which is the order the rows happened
  // to arrive in. `compareGroups` breaks that tie on the arm's name.
  //
  // MEASURED against the pre-refactor code: instagram x3 at 100, linkedin x3 at
  // 50, facebook x4 at 50 gives the same leader and the same lift either way,
  // but the RUNNER-UP changes from linkedin to facebook, and `sampleSize` from 6
  // to 7. The lift is unaffected because the tie is at position two.
  //
  // Kept rather than reverted, because a learning is written into the Brand
  // Brain and the old behaviour made which one depended on row order: the same
  // week's data could produce two different stored learnings on two runs. This
  // is the deterministic version. `grouped-lift.test.ts` pins it.
  const comparison = compareGroups(
    observations.map((o) => ({
      postId: o.post_id,
      group: o.channel,
      metric: o.metric,
      value: o.value,
      measuredOn: o.measured_on,
    })),
    metric,
  )

  if (comparison.kind === 'none') {
    // `skippedNoHistory` is the column the cycle stores and it means one thing
    // only: nothing was ever measured. Every other reason is a comparison that
    // was attempted and declined, which is a different fact about the workspace.
    return {
      learnings: [],
      reason: comparison.reason,
      skippedNoHistory: comparison.reason === 'no_history',
    }
  }

  const lift = comparison.lift
  return {
    learnings: [
      {
        metric: lift.metric,
        // The arms came from `o.channel`, so they are channels coming back out.
        // The cast is the one place that knowledge lives, and it is directly
        // above the map that put them in.
        leader: lift.leader as Channel,
        runnerUp: lift.runnerUp as Channel,
        leaderMean: lift.leaderMean,
        runnerUpMean: lift.runnerUpMean,
        lift: lift.lift,
        postIds: lift.postIds,
        sampleSize: lift.sampleSize,
        windowDays: lift.windowDays,
      },
    ],
    reason: null,
    skippedNoHistory: false,
  }
}

/**
 * WHAT THE CYCLE SUMMARY SAYS ABOUT REFLECT, ONE SENTENCE PER REASON.
 *
 * ── WHY THESE ARE SIX SENTENCES AND NOT ONE ──────────────────────────────────
 * "Sahoda had nothing to reflect on" and "Sahoda reflected and found nothing
 * worth saying" are different claims about a customer's business, and only one
 * of them is an admission that this product has no history for them yet. The
 * screen used to make the second claim in every case except `no_history`,
 * because the reason was not stored.
 *
 * Each says what was MEASURED and what was not, and none of them offers a
 * remedy that cannot work: none of these states is fixed by pressing anything,
 * so none of them asks a person to.
 *
 * `null` is returned for a reason this build does not know, which is what a
 * cycle written before `reflect_reason` existed carries. A sentence invented
 * for an unrecognised value would be a claim no query behind it made.
 */
export function reflectSentence(reason: string | null): string | null {
  switch (reason) {
    case 'no_history':
      return 'It had nothing to reflect on. No post of yours has been measured yet, so there was nothing to learn from.'
    case 'too_few_posts':
      return 'It read your numbers and left them alone. Too few of your posts have been measured for a comparison to mean anything.'
    case 'single_group':
      return 'It read your numbers and left them alone. Everything measured so far is on one channel, so there was nothing to compare it with.'
    case 'too_few_days':
      return 'It read your numbers and left them alone. Everything measured so far falls inside a couple of days, which is too short a stretch to tell a pattern from a good afternoon.'
    case 'numbers_too_small':
      return 'It read your numbers and left them alone. The figures involved are still small enough that the difference between them could be one person opening a post.'
    case 'difference_too_small':
      return 'It compared your channels and found them close enough that the gap is not worth acting on.'
    default:
      return null
  }
}
