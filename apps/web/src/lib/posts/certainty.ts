import type { PostStatus } from '@sahoda/shared'

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

/**
 * What the publish logs say about a post, collapsed to one answer.
 *
 * `null` means UNKNOWN — no log rows, or the read failed. `mixed` means the post
 * published live on one channel and against the fixture on another. Both are
 * first-class: `mode` lives on `post_publish_logs`, a separate read that can
 * fail, so "we don't know" is a normal input here rather than an edge case.
 */
export type PostPublishMode = 'live' | 'fixture' | 'mixed' | null

const SIMULATED_LABEL = 'Simulated'

/**
 * Map a post's status and publish mode onto a certainty level.
 *
 * The honesty rule, made mechanical: `.is-real` claims "it happened", and the
 * only evidence for that is a succeeded publish log with `mode = 'live'`.
 * Everything short of that proof falls back to a WEAKER claim — never a stronger
 * one, and never a different one.
 *
 * Why unknown and mixed both land on `committed` rather than `simulated`:
 * simulated is not weaker than real, it is the opposite assertion. It says the
 * publish was NOT real. Rendering that on a missing log would be its own lie,
 * and on a mixed post it would erase a channel that genuinely went out.
 * `committed` under-claims — "you approved it" — which is true in every one of
 * those cases and overstates nothing.
 */
export function certaintyFor(status: PostStatus, mode: PostPublishMode): Certainty {
  if (status === 'published') {
    if (mode === 'live') return { level: 'real', label: null }
    if (mode === 'fixture') return { level: 'simulated', label: SIMULATED_LABEL }
    // 'mixed' and null (unknown) — under-claim rather than pick a side.
    return { level: 'committed', label: null }
  }

  // Status is the gate; mode only ever refines a published post. A stray log on
  // a post that was later reset must not promote it.
  switch (status) {
    case 'approved':
      return { level: 'committed', label: null }
    case 'idea':
    case 'draft':
      return { level: 'proposed', label: null }
    case 'failed':
      return { level: 'failed', label: null }
    // Partly out. `real` would claim the whole post is live; `failed` would deny
    // the channel that is. `committed` under-claims, which this module's own rule
    // says to prefer — and the per-channel breakdown is where `.is-real` belongs,
    // on the one channel that earned it.
    case 'partial':
      return { level: 'committed', label: null }
    // Both are now written for real: `scheduled` by release_post_for_publish and
    // `publishing` by the dispatcher's claim. The user has committed to a time and
    // the work is under way — a claim about intent, not about the world.
    case 'scheduled':
    case 'publishing':
      return { level: 'committed', label: null }
    // No UI is built for these two, and no code path writes them today. They stay
    // mapped so the switch remains exhaustive over PostStatus, and claim nothing.
    case 'review':
    case 'expired':
      return { level: 'neutral', label: null }
  }
}

/**
 * Collapse a post's publish-log modes into one answer.
 *
 * Only SUCCEEDED logs count. A failed attempt against the live adapter is not
 * evidence that anything was published, so it must not make a post look real.
 */
export function collapseModes(modes: ReadonlyArray<'live' | 'fixture'>): PostPublishMode {
  if (modes.length === 0) return null
  const hasLive = modes.includes('live')
  const hasFixture = modes.includes('fixture')
  if (hasLive && hasFixture) return 'mixed'
  return hasLive ? 'live' : 'fixture'
}
