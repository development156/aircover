import type { VariantPublishStatus } from '@sahoda/shared'

import type { VariantStatusRow } from '@/lib/posts/variant-status'

/**
 * WHAT A POST ACTUALLY DID — the one place that answers it.
 *
 * ── WHY THIS MODULE EXISTS ───────────────────────────────────────────────────
 * `posts.status` does not answer it and never has. The publish path writes
 * `post_variants` and leaves the post row alone: the manual route
 * (`api/posts/[postId]/publish`) only ever calls `markVariant`, and the
 * dispatcher's settle write (`pgDispatch.ts:165`) sits behind
 * `SAHODA_PUBLISH_ENABLED`, which defaults off. So a post that is live on every
 * channel it targets still reads `approved`.
 *
 * Three consumers read that column and inherited the lie:
 *   1. `autoPublishTruth` — said "this time has passed and nothing was
 *      published" for four production posts whose own channel chips, two inches
 *      above, read "published". Fixed by giving it the variant rows.
 *   2. `LiveStatusBadge` / `certaintyFor` — gated `.is-real` on
 *      `status === 'published'`, so a fully live post rendered `committed`.
 *   3. The week grid and the home week strip — the same `certaintyFor` call,
 *      one layer up, on a surface with no variant data at all.
 *
 * That is three instances of one defect, which is why this is a module and not
 * a convention. `DisplayPost` (`display-post.ts`) makes a fourth a type error.
 *
 * ── SIMULATED IS NOT RECOMPUTED HERE ─────────────────────────────────────────
 * `variantStatusRow` computes `simulated` from the `fixture://` permalink and
 * then nulls that permalink — "computed once, before the id is erased, because
 * afterwards the difference is gone" (`variant-status.ts:90-92`). This module
 * READS `row.simulated` and never re-derives it. There is no second sniff of a
 * permalink here and there must never be one: the permalink reaching this layer
 * is already nulled, so a re-derivation would silently report every fixture run
 * as a real publish.
 *
 * The same rule retired `post_publish_logs.mode`, which was a second,
 * independent derivation of the same fact off a different table with a
 * different failure mode. One fact, one derivation, one place.
 *
 * Pure: no React, no I/O, no clock.
 */

/**
 * A channel that is still expected to go somewhere.
 *
 * `published` and `skipped` are absent for opposite reasons and the same
 * conclusion — one is done, one was never going — and neither can be waiting.
 * `publishing` IS outstanding: a claim is held right now, so "nothing was
 * published" is not merely unproven, it is being decided as we render.
 */
const OUTSTANDING: ReadonlySet<VariantPublishStatus> = new Set<VariantPublishStatus>([
  'pending',
  'scheduled',
  'publishing',
  'failed',
])

export interface PublishEvidence {
  /** Published AND not a fixture run — the only rows that prove a platform received it. */
  live: number
  /** Published, but through the fixture rail: the row says published, no platform saw it. */
  simulated: number
  /** Still expected to go somewhere — see `OUTSTANDING`. */
  outstanding: number
  /**
   * The subset of `outstanding` that has already had its attempt and lost.
   *
   * Separate from `outstanding` because the two support opposite sentences: a
   * `pending` channel has not happened YET, a `failed` one is not going to. Without
   * the split, "nothing published and nothing left to try" — the only honest basis
   * for a failed claim — is not expressible.
   */
  failed: number
  /**
   * Rows actually read for this post.
   *
   * ── ZERO IS NOT EVIDENCE OF NO PUBLISH ───────────────────────────────────
   * `listVariantStates` returns an empty map on ANY read failure (`read.ts:338`,
   * `read.ts:348`), and `.get(id)` cannot distinguish "this post has no variants"
   * from "the query threw". Without this count, an outage and a genuinely
   * unpublished post arrive here as the same `{live: 0, simulated: 0,
   * outstanding: 0}` — and every published post on the page would demote to a
   * weaker claim mid-session, or worse, a stronger negative one.
   *
   * So the count is carried and `postOutcome` reports `unknown` on zero. Three
   * `skipped` rows are `{0,0,0}` too, but with `channels: 3` — known, and
   * genuinely nothing outstanding.
   */
  channels: number
}

/**
 * What the variant rows PROVE, which is the only thing an outcome may speak from.
 *
 * `simulated` is counted apart from `live` rather than folded into it because the
 * two support opposite sentences — see the module note on why it is read and
 * never recomputed.
 */
export function publishEvidence(variants: readonly VariantStatusRow[]): PublishEvidence {
  let live = 0
  let simulated = 0
  let outstanding = 0
  let failed = 0
  for (const row of variants) {
    if (row.status === 'published') {
      if (row.simulated) simulated += 1
      else live += 1
    } else if (OUTSTANDING.has(row.status)) {
      outstanding += 1
      if (row.status === 'failed') failed += 1
    }
  }
  return { live, simulated, outstanding, failed, channels: variants.length }
}

/**
 * What this post DID, in one word.
 *
 * - `unknown`   — no rows to read from, or the read failed. Claim NOTHING.
 * - `none`      — rows exist; nothing published, and what is left has not been tried.
 * - `live`      — every channel that is going anywhere is out on a real platform.
 * - `partial`   — live somewhere, and not live somewhere else.
 * - `simulated` — published, but only through the fixture rail: no platform saw it.
 * - `failed`    — nothing live, nothing simulated, and every channel left has lost.
 */
export type PostOutcome = 'unknown' | 'none' | 'live' | 'partial' | 'simulated' | 'failed'

/**
 * Collapse the evidence to one answer, always in the UNDER-claiming direction.
 *
 * The order of these branches is the honesty rule, made mechanical. A platform
 * holding the post outranks everything below it, and nothing may deny it — the
 * clock is not evidence about whether something went out. Below that, each
 * branch may only ever weaken the claim.
 */
export function postOutcome(evidence: PublishEvidence): PostOutcome {
  // Nothing was read. An outage and an unpublished post are indistinguishable
  // here, so this says so rather than picking the flattering answer or the
  // damning one.
  if (evidence.channels === 0) return 'unknown'

  // A platform has it. A fixture channel counts as unfinished alongside a live
  // one: the row says published and no platform ever saw it, so the post is not
  // out everywhere it was aimed.
  if (evidence.live > 0) {
    return evidence.outstanding > 0 || evidence.simulated > 0 ? 'partial' : 'live'
  }

  // Published only through the fixture rail. "Nothing was published" is true of
  // the platforms and false of the screen, which shows channels marked
  // published — so this names the simulation instead of denying the chips.
  if (evidence.simulated > 0) return 'simulated'

  // Nothing live, nothing simulated, and every remaining channel has already had
  // its attempt. `failed === outstanding` is the whole guard: one `pending`
  // channel among four failures means the post is still going somewhere, and
  // calling that "failed" would write off an attempt nobody has made yet.
  if (evidence.failed > 0 && evidence.failed === evidence.outstanding) return 'failed'

  return 'none'
}

/**
 * The boundary, as one call: rows in, answer out.
 *
 * Every consumer that renders "what happened" goes through THIS, not through
 * `posts.status`. Takes the rows in position and never optionally — `variants?:`
 * is the shape that produced two defects in two days elsewhere in this app
 * (`lagHours?`, `simulated?`): a call site that forgets it gets a silent default
 * instead of a type error, and the default is invisible precisely where it is
 * wrong. Pass `[]` to mean "no rows", which reports `unknown`.
 */
export function outcomeOf(variants: readonly VariantStatusRow[]): PostOutcome {
  return postOutcome(publishEvidence(variants))
}
