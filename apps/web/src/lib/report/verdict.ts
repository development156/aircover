/**
 * THE VERDICT — the one sentence that answers "was last week good?".
 *
 * ── PURE, AND IT TAKES ITS OWN FIGURES ───────────────────────────────────────
 * Nothing here reads a clock, a database or a request. Every input is measured
 * elsewhere and handed in, so the rules below can be tested by stating a week
 * and reading the sentence back. That is the only way a rule like "both down
 * says it directly, no softening" can be proven rather than asserted.
 *
 * ── A MISSING BASELINE IS NOT A FLAT WEEK ────────────────────────────────────
 * `baseline: null` means the workspace has too little history to have a normal
 * yet. It must never fall through to "no change", which is a comparison, and a
 * comparison this product has not earned. It suppresses the verdict instead.
 *
 * ── UNDER TWO MEASURED POSTS THERE IS NO VERDICT AT ALL ──────────────────────
 * One post is simultaneously the best and the worst week Sahoda has seen, and a
 * verdict drawn from it would be a coin toss printed in the largest type on the
 * page.
 */

export const MIN_POSTS_FOR_VERDICT = 2

export interface VerdictInput {
  /** Carried into the suppressed sentence, so it can state the real count. */
  postsMeasured: number
  /** People reached last week, and the workspace's own normal. Null when unknown. */
  reach: { value: number; baseline: number | null }
  /** People who wrote back last week, and the week before. Null when unknown. */
  replies: { value: number; previous: number | null }
}

export type Verdict =
  | {
      kind: 'none'
      reason: 'too-few-posts' | 'no-baseline' | 'unreadable'
      /** Posts measured, so the sentence can say the real number. */
      measured?: number
    }
  | { kind: 'good' | 'mixed' | 'poor'; headline: string; support: string }

/** A change big enough to be worth a sentence. Below this a week is flat. */
const MOVED = 0.1

/**
 * `before` is guaranteed positive by the caller. It used to answer `'up'` for a
 * zero baseline, which is not a measured rise: three weeks that each reached
 * nobody is not a normal, and "a good week" drawn from it would be the product
 * congratulating somebody on arithmetic rather than on their business.
 */
function move(now: number, before: number): 'up' | 'down' | 'flat' {
  const delta = (now - before) / before
  if (delta >= MOVED) return 'up'
  if (delta <= -MOVED) return 'down'
  return 'flat'
}

/** Whole percent, always positive — the direction is carried by the sentence. */
export function percentMove(now: number, before: number): number | null {
  if (before <= 0) return null
  return Math.abs(Math.round(((now - before) / before) * 100))
}

export function verdictOf(input: VerdictInput): Verdict {
  if (input.postsMeasured < MIN_POSTS_FOR_VERDICT) {
    return { kind: 'none', reason: 'too-few-posts', measured: input.postsMeasured }
  }
  const { baseline } = input.reach
  const { previous } = input.replies
  // A zero normal is not a normal. Nothing can be a percentage above nothing,
  // and every sentence below this line is a percentage.
  if (baseline === null || previous === null || baseline <= 0 || previous <= 0) {
    return { kind: 'none', reason: 'no-baseline' }
  }

  const reachMove = move(input.reach.value, baseline)
  const replyMove = move(input.replies.value, previous)
  const reachPct = percentMove(input.reach.value, baseline)
  const replyPct = percentMove(input.replies.value, previous)

  if (reachMove === 'up' && replyMove === 'up') {
    return {
      kind: 'good',
      headline: 'A good week.',
      support: `More people saw you than usual${reachPct === null ? '' : `, ${reachPct}% above your normal`}, and more of them wrote back.`,
    }
  }

  if (reachMove === 'down' && replyMove === 'down') {
    return {
      kind: 'poor',
      headline: 'A weak week.',
      support: `Fewer people saw you than usual${reachPct === null ? '' : `, ${reachPct}% below your normal`}, and fewer wrote back. Sahoda has not worked out why, and will not guess.`,
    }
  }

  // Mixed, and the rule is to name the ONE thing that moved rather than
  // averaging two directions into a shrug. Reach is named when it moved;
  // otherwise replies did, because a flat-flat week never reaches here.
  if (reachMove !== 'flat') {
    return {
      kind: 'mixed',
      headline: 'A mixed week.',
      support:
        reachMove === 'up'
          ? `More people saw you${reachPct === null ? '' : `, ${reachPct}% above your normal`}, but no more of them wrote back.`
          : `Fewer people saw you${reachPct === null ? '' : `, ${reachPct}% below your normal`}, though the ones who did still wrote back.`,
    }
  }

  if (replyMove !== 'flat') {
    return {
      kind: 'mixed',
      headline: 'A mixed week.',
      support:
        replyMove === 'up'
          ? `As many people saw you as usual, and ${replyPct === null ? 'more' : `${replyPct}% more`} of them wrote back.`
          : `As many people saw you as usual, but ${replyPct === null ? 'fewer' : `${replyPct}% fewer`} wrote back.`,
    }
  }

  return {
    kind: 'mixed',
    headline: 'A steady week.',
    support: 'As many people saw you as usual, and as many wrote back. Nothing moved either way.',
  }
}
