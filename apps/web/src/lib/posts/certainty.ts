import type { PostStatus } from '@sahoda/shared'

import type { PostOutcome } from '@/lib/posts/publish-evidence'

/**
 * The Certainty System (UI_RULES_v3): how real a thing is, in four levels, each
 * with a STRUCTURAL signature that survives recolour, greyscale and colour
 * blindness. The app wears each customer's brand, so no state may depend on
 * colour to be understood.
 *
 * Two levels here are NOT certainty levels and are named so deliberately:
 *   `failed`  — a danger stroke. Failure is not a degree of realness, it is a
 *               different axis, and giving it a certainty treatment would imply
 *               a failed publish sits somewhere on the "did it happen" scale.
 *   `neutral` — no claim at all. Reserved for statuses that carry no UI.
 */
export type CertaintyLevel = 'real' | 'committed' | 'proposed' | 'simulated' | 'failed' | 'neutral'

export interface Certainty {
  level: CertaintyLevel
  /**
   * Required visible text for `simulated`, null for everything else. The hatch
   * alone is not a claim (UI_RULES_v3), so the label is part of the mapping's
   * output rather than something each call site must remember to add.
   */
  label: string | null
}

const SIMULATED_LABEL = 'Simulated'

/**
 * Map a post's INTENT and its OUTCOME onto a certainty level.
 *
 * ── WHY THIS TAKES TWO ARGUMENTS AND NOT ONE ─────────────────────────────────
 * They answer different questions and only one of them is evidence.
 *
 * `intent` is `posts.status`: what a PERSON committed to. Every write to that
 * column is a decision — `approvePost` writes `approved`, `schedule_post`
 * writes `scheduled`, inserts write `draft`, `savePost` refuses it outright.
 *
 * `outcome` is what the variant rows PROVE (`publish-evidence.ts`). It is the
 * only admissible evidence for `.is-real`, because a publish is recorded on
 * `post_variants` and nowhere else.
 *
 * ── WHAT THIS USED TO DO, AND WHY IT WAS WRONG ───────────────────────────────
 * It gated `real` on `intent === 'published'`. Nothing writes that value on the
 * paths that actually run: the manual publish route touches only
 * `post_variants`, and the dispatcher's settle write is behind
 * `SAHODA_PUBLISH_ENABLED`, off by default. So a post live on every channel sat
 * at `approved` and rendered `committed` — the identical defect
 * `autoPublishTruth` was fixed for, one layer up, on three more surfaces.
 *
 * Its second input was `post_publish_logs.mode`, a SECOND derivation of
 * "simulated" off a different table with its own failure mode. Two sources for
 * one fact is how they drift; `mode` is gone and the variant row's `simulated`
 * flag — computed once, before the permalink is nulled — is the only one left.
 *
 * ── THE DIRECTION IS ALWAYS DOWN ─────────────────────────────────────────────
 * Outcome may only ever STRENGTHEN a claim to `real`, and `unknown` strengthens
 * nothing. Where the evidence says nothing, intent alone decides, and intent can
 * never reach `real` on its own — approving a post is not publishing it.
 */
export function certaintyFor(intent: PostStatus, outcome: PostOutcome): Certainty {
  switch (outcome) {
    // A platform has it, on every channel this post was aimed at. The one claim
    // in the system that says "this happened", and the only evidence for it.
    case 'live':
      return { level: 'real', label: null }
    // Published, but only against the fixture rail. Not a weaker version of real
    // — the opposite assertion, and it must be said in words as well as hatch.
    case 'simulated':
      return { level: 'simulated', label: SIMULATED_LABEL }
    // Partly out. `real` would claim the whole post is live; `failed` would deny
    // the channel that is. `committed` under-claims, which this module's rule
    // says to prefer — and the per-channel breakdown is where `.is-real`
    // belongs, on the one channel that earned it.
    case 'partial':
      return { level: 'committed', label: null }
    // Every channel has had its attempt and none survived.
    case 'failed':
      return { level: 'failed', label: null }
    // 'none'    — rows exist, nothing has published yet.
    // 'unknown' — nothing was read, possibly because the read failed.
    // Neither is evidence of anything, so neither may move the claim. Intent
    // decides alone, below.
    case 'none':
    case 'unknown':
      break
  }

  switch (intent) {
    // The user committed to a time or to the content. True in every case here,
    // and it overstates nothing.
    case 'approved':
    case 'scheduled':
    case 'publishing':
      return { level: 'committed', label: null }
    // The dispatcher settled the post itself, but the variant rows do not (yet)
    // bear it out — a rollup that landed before the rows, or a read that came
    // back empty. Under-claim rather than paint `.is-real` on unread evidence.
    case 'published':
    case 'partial':
      return { level: 'committed', label: null }
    case 'idea':
    case 'draft':
      return { level: 'proposed', label: null }
    case 'failed':
      return { level: 'failed', label: null }
    // No UI is built for these two, and no code path writes them today. They
    // stay mapped so the switch remains exhaustive over PostStatus, and claim
    // nothing.
    case 'review':
    case 'expired':
      return { level: 'neutral', label: null }
  }
}
