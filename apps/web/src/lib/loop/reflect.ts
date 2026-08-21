import type { Channel } from '@sahoda/shared'

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
 * Observations per arm of a comparison. Two posts cannot distinguish a channel's
 * performance from one unusual afternoon, and the first arrangement of the live
 * data that would have shipped a false learning had an arm of exactly one.
 */
export const MIN_POSTS_PER_GROUP = 3

/** Below this there is no comparison to make, only a single group. */
export const MIN_GROUPS = 2

/**
 * How much the leader must beat the runner-up by, as a proportion.
 *
 * A margin under a quarter is inside the noise of platform reporting at the
 * sample sizes an SMB actually has, and a learning is written into the Brand
 * Brain and then shapes every future post — so the cost of a wrong one is paid
 * repeatedly, not once.
 */
export const MIN_LIFT = 0.25

/**
 * The leader's own mean must reach this before a ratio between means means
 * anything.
 *
 * Without it, 3 impressions against 1 is a "three-fold lift" and it is nothing
 * of the kind — it is two very small numbers, either of which moves by one when
 * a person opens their own post. This is the gate the live Instagram data fails,
 * and it should.
 */
export const MIN_LEADER_MEAN = 10

/** One measurement, as `post_metric_snapshots` stores it. */
export interface MetricObservation {
  post_id: string
  channel: Channel
  metric: string
  value: number
  measured_on: string
}

/** Why a window produced no learning. Each is a different sentence to the reader. */
export type NoLearningReason =
  /** Nothing has ever been measured for this workspace. */
  | 'no_history'
  /** Measurements exist, but not enough of them to compare anything. */
  | 'too_few_posts'
  /** Enough posts, but they are all on one channel — there is no comparison. */
  | 'single_group'
  /** A comparison was possible and the gap was not big enough to be worth saying. */
  | 'difference_too_small'
  /** The numbers involved are too small for a ratio between them to mean anything. */
  | 'numbers_too_small'

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

/** Mean, rounded to one decimal so a report never prints sixteen digits. */
function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

/** Distinct calendar days the observations span, inclusive of both ends. */
function windowDays(observations: readonly MetricObservation[]): number {
  const days = new Set(observations.map((o) => o.measured_on))
  return Math.max(1, days.size)
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
  // ── GATE 0: nothing was ever measured ──────────────────────────────────────
  // Checked against the WHOLE input, before filtering by metric, so a workspace
  // that has snapshots of some other metric is not told it has no history.
  if (observations.length === 0) {
    return { learnings: [], reason: 'no_history', skippedNoHistory: true }
  }

  const relevant = observations.filter((o) => o.metric === metric)
  if (relevant.length === 0) {
    return { learnings: [], reason: 'too_few_posts', skippedNoHistory: false }
  }

  // One value per post per channel — a post measured on three days is ONE post,
  // not three. Averaging its dailies first is what stops a post that happens to
  // have been measured more often from counting more.
  const perPost = new Map<string, { channel: Channel; postId: string; values: number[] }>()
  for (const o of relevant) {
    const key = `${o.channel}:${o.post_id}`
    const found = perPost.get(key)
    if (found) found.values.push(o.value)
    else perPost.set(key, { channel: o.channel, postId: o.post_id, values: [o.value] })
  }

  const byChannel = new Map<Channel, { postIds: string[]; means: number[] }>()
  for (const entry of perPost.values()) {
    const group = byChannel.get(entry.channel) ?? { postIds: [], means: [] }
    group.postIds.push(entry.postId)
    group.means.push(mean(entry.values))
    byChannel.set(entry.channel, group)
  }

  // ── GATE 1: each arm needs enough posts ────────────────────────────────────
  // Applied BEFORE counting groups, so a channel with one post is not an arm.
  const eligible = [...byChannel.entries()]
    .filter(([, g]) => g.postIds.length >= MIN_POSTS_PER_GROUP)
    .map(([channel, g]) => ({
      channel,
      postIds: g.postIds,
      mean: mean(g.means),
      n: g.postIds.length,
    }))
    .sort((a, b) => b.mean - a.mean)

  if (eligible.length === 0) {
    return { learnings: [], reason: 'too_few_posts', skippedNoHistory: false }
  }

  // ── GATE 2: a comparison needs two arms ────────────────────────────────────
  if (eligible.length < MIN_GROUPS) {
    return { learnings: [], reason: 'single_group', skippedNoHistory: false }
  }

  const leader = eligible[0]
  const runnerUp = eligible[1]
  // `noUncheckedIndexedAccess` is on, and it is right to insist: the length
  // check above is a separate statement from these reads, and a future edit that
  // moved one without the other would index past the end silently.
  if (!leader || !runnerUp) {
    return { learnings: [], reason: 'single_group', skippedNoHistory: false }
  }

  // ── GATE 3: the numbers must be big enough for a ratio to mean anything ────
  // Before the lift check, because 3-against-1 clears any lift threshold and is
  // still not a finding.
  if (leader.mean < MIN_LEADER_MEAN) {
    return { learnings: [], reason: 'numbers_too_small', skippedNoHistory: false }
  }

  // ── GATE 4: the gap must be worth saying ───────────────────────────────────
  // A zero runner-up would make the ratio infinite, so the lift is measured
  // against the leader's own scale in that case rather than dividing by zero.
  const lift = runnerUp.mean === 0 ? 1 : leader.mean / runnerUp.mean
  if (lift - 1 < MIN_LIFT) {
    return { learnings: [], reason: 'difference_too_small', skippedNoHistory: false }
  }

  return {
    learnings: [
      {
        metric,
        leader: leader.channel,
        runnerUp: runnerUp.channel,
        leaderMean: leader.mean,
        runnerUpMean: runnerUp.mean,
        lift: Math.round(lift * 10) / 10,
        postIds: [...leader.postIds, ...runnerUp.postIds],
        sampleSize: leader.n + runnerUp.n,
        windowDays: windowDays(relevant),
      },
    ],
    reason: null,
    skippedNoHistory: false,
  }
}
