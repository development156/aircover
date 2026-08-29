/**
 * ONE GATED COMPARISON, OVER ANY GROUPING.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM `reflect()` ──────────────────────────────
 * `reflect()` already holds the only defensible way this product turns a pile of
 * measurements into a claim about somebody's business: average per post first,
 * then require enough posts per arm, two arms, a wide enough window, numbers big
 * enough for a ratio to mean anything, and a gap worth saying. Five gates, each
 * of which exists because the live data would otherwise have shipped a false
 * learning.
 *
 * Its one limitation is that the arms are hard-wired to CHANNELS. The analytics
 * report needs the same comparison over the day of the week a post went out —
 * "Tuesdays beat Fridays" is the single sentence that makes a weekly report read
 * like a colleague rather than a dashboard.
 *
 * ── AND WHY IT IS NOT A SECOND COPY OF THE GATES ─────────────────────────────
 * Copying them would mean two sets of thresholds drifting apart, and the one
 * that drifted looser would be the one that published a false claim. So the
 * gates live HERE, once, and `reflect()` delegates to this with the channel as
 * the group key. The thresholds moved with them, arguments intact, and `reflect`
 * re-exports them so its own tests and the cycle store keep their import path.
 *
 * Pure: no I/O, no clock, no React, and no model call — the same structural
 * guarantee `reflect()` makes. Every number out of here is a division of two
 * numbers that came out of `post_metric_snapshots`.
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
 * Distinct days the window must span before a comparison is worth making.
 *
 * ── THE GATE THE OTHER FOUR CANNOT COVER ─────────────────────────────────────
 * Three posts per arm, two arms, a leader mean over ten and a lift over a
 * quarter can ALL be satisfied by measurements taken on a single day. That is
 * one afternoon: a post that happened to go out when somebody's audience was
 * awake, a platform's reporting still settling, one share by one person with a
 * large following. Every gate above counts POSTS, and none of them can tell six
 * posts across six days from six posts across one.
 *
 * Three is the same floor the rest of the product already uses for the same
 * reason: below three measured days there is no chart, because two points are a
 * straight line between them and say nothing the number does not.
 *
 * `measured_on` is the day, so this counts distinct calendar days rather than
 * rows: a post measured hourly for a day is one day of evidence, not
 * twenty-four.
 */
export const MIN_MEASURED_DAYS = 3

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

/** Why a window produced no learning. Each is a different sentence to the reader. */
export type NoLearningReason =
  /** Nothing has ever been measured for this workspace. */
  | 'no_history'
  /** Measurements exist, but not enough of them to compare anything. */
  | 'too_few_posts'
  /** Enough posts, but they are all on one channel — there is no comparison. */
  | 'single_group'
  /** Enough posts, but they were all measured inside too short a window. */
  | 'too_few_days'
  /** A comparison was possible and the gap was not big enough to be worth saying. */
  | 'difference_too_small'
  /** The numbers involved are too small for a ratio between them to mean anything. */
  | 'numbers_too_small'

/** One measurement, already reduced to the arm it belongs to. */
export interface GroupedObservation {
  postId: string
  /** The arm. A channel, a weekday, whatever the caller is comparing. */
  group: string
  metric: string
  value: number
  /** `YYYY-MM-DD`. Only ever counted as a distinct day, never differenced. */
  measuredOn: string
}

/** The comparison that cleared every gate. */
export interface GroupLift {
  metric: string
  leader: string
  runnerUp: string
  leaderMean: number
  runnerUpMean: number
  /** How many times better, to one decimal. Derived, never stored as prose. */
  lift: number
  postIds: readonly string[]
  sampleSize: number
  windowDays: number
  /** Posts behind the leading arm alone. The evidence a reader weighs. */
  leaderPosts: number
  runnerUpPosts: number
}

/**
 * A comparison, or the reason there is not one.
 *
 * The reasons are `reflect`'s own, deliberately: they already have a sentence
 * each in `reflectSentence`, and inventing a seventh reason here would be a
 * state with no words attached.
 */
export type GroupComparison =
  { kind: 'lift'; lift: GroupLift } | { kind: 'none'; reason: NoLearningReason }

/** Mean, rounded to one decimal so a report never prints sixteen digits. */
function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

/**
 * Compare the arms of one grouping on one metric.
 *
 * Returns at most ONE comparison — the strongest it can defend. A quota is what
 * turns a second-best observation into a claim.
 */
export function compareGroups(
  observations: readonly GroupedObservation[],
  metric = 'impressions',
): GroupComparison {
  // ── GATE 0: nothing was ever measured ──────────────────────────────────────
  // Against the WHOLE input, before filtering by metric, so a workspace holding
  // snapshots of some other metric is not told it has no history.
  if (observations.length === 0) return { kind: 'none', reason: 'no_history' }

  const relevant = observations.filter((o) => o.metric === metric)
  if (relevant.length === 0) return { kind: 'none', reason: 'too_few_posts' }

  // One value per post per arm. A post measured on three days is ONE post, not
  // three: averaging its dailies first is what stops a post that happens to have
  // been polled more often from counting more.
  // NESTED rather than a joined string key. A group here is any label the caller
  // chose, and "Tuesday morning" has a space in it, so a flat `group + postId`
  // key is one separator collision away from merging two different posts into one.
  const perGroup = new Map<string, Map<string, number[]>>()
  for (const o of relevant) {
    const arm = perGroup.get(o.group) ?? new Map<string, number[]>()
    const values = arm.get(o.postId) ?? []
    values.push(o.value)
    arm.set(o.postId, values)
    perGroup.set(o.group, arm)
  }

  const byGroup = new Map<string, { postIds: string[]; means: number[] }>()
  for (const [group, arm] of perGroup) {
    const postIds: string[] = []
    const means: number[] = []
    for (const [postId, values] of arm) {
      postIds.push(postId)
      means.push(mean(values))
    }
    byGroup.set(group, { postIds, means })
  }

  // ── GATE 1: each arm needs enough posts ────────────────────────────────────
  // Applied BEFORE counting arms, so an arm with one post is not an arm.
  const eligible = [...byGroup.entries()]
    .filter(([, arm]) => arm.postIds.length >= MIN_POSTS_PER_GROUP)
    .map(([group, arm]) => ({
      group,
      postIds: arm.postIds,
      mean: mean(arm.means),
      n: arm.postIds.length,
    }))
    // Ties broken by name so the same input never produces two different
    // sentences. An unstable leader is a claim that changes on reload.
    .sort((a, b) => b.mean - a.mean || a.group.localeCompare(b.group))

  if (eligible.length === 0) return { kind: 'none', reason: 'too_few_posts' }

  // ── GATE 2: a comparison needs two arms ────────────────────────────────────
  if (eligible.length < MIN_GROUPS) return { kind: 'none', reason: 'single_group' }

  // ── GATE 2b: a week, not an afternoon ──────────────────────────────────────
  // AFTER the post gates, deliberately. With too few posts the binding
  // constraint is that the customer has not published enough and telling them to
  // wait is the wrong instruction; with enough posts inside one day, waiting is
  // exactly the remedy. Report the thing that has to be fixed first.
  const days = new Set(relevant.map((o) => o.measuredOn)).size
  if (Math.max(1, days) < MIN_MEASURED_DAYS) return { kind: 'none', reason: 'too_few_days' }

  const leader = eligible[0]
  const runnerUp = eligible[1]
  // `noUncheckedIndexedAccess` is on and it is right to insist: the length check
  // above is a separate statement from these reads, and an edit that moved one
  // without the other would index past the end silently.
  if (!leader || !runnerUp) return { kind: 'none', reason: 'single_group' }

  // ── GATE 3: numbers big enough for a ratio to mean anything ────────────────
  // Before the lift check, because 3-against-1 clears any lift threshold and is
  // still not a finding.
  if (leader.mean < MIN_LEADER_MEAN) return { kind: 'none', reason: 'numbers_too_small' }

  // ── GATE 4: the gap must be worth saying ───────────────────────────────────
  // A zero runner-up would make the ratio infinite, so the lift is measured
  // against the leader's own scale in that case rather than dividing by zero.
  const ratio = runnerUp.mean === 0 ? 1 : leader.mean / runnerUp.mean
  if (ratio - 1 < MIN_LIFT) return { kind: 'none', reason: 'difference_too_small' }

  return {
    kind: 'lift',
    lift: {
      metric,
      leader: leader.group,
      runnerUp: runnerUp.group,
      leaderMean: leader.mean,
      runnerUpMean: runnerUp.mean,
      lift: Math.round(ratio * 10) / 10,
      postIds: [...leader.postIds, ...runnerUp.postIds],
      sampleSize: leader.n + runnerUp.n,
      windowDays: Math.max(1, days),
      leaderPosts: leader.n,
      runnerUpPosts: runnerUp.n,
    },
  }
}
