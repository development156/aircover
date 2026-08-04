import type { PublishAdapter } from '@sahoda/shared'

import { createZernioAdapter, type ZernioAdapterDeps } from './zernio'

/**
 * Instagram, via the Zernio rail.
 *
 * ── WHY THIS ADAPTER POLLS ────────────────────────────────────────────────────
 * Instagram publishing is TWO-PHASE and Zernio returns before it finishes. Observed
 * [LIVE] on 2026-07-31, publishing the first real post through this integration:
 *
 *   HTTP 201
 *   { "message": "Post published successfully",
 *     "post": { "status": "publishing",
 *               "platforms": [{ "status": "processing",
 *                               "platformSpecificData": { "lastPublishStage": "awaiting-finalize",
 *                                                         "pendingContainerId": "…" } }] } }
 *
 * No platformPostId. No platformPostUrl. The post went live ~14 seconds later.
 *
 * Their own OpenAPI spec says "Immediate posts (publishNow: true) include
 * platformPostUrl in the response". For Instagram that is **false**. The spec is
 * wrong; the observation is right.
 *
 * ── THE ONE RULE ──────────────────────────────────────────────────────────────
 * Doc 13 §5: `.is-real` keys off the PRESENCE OF platformPostUrl, never off which
 * code path ran. This adapter is where that rule is enforced or lost: an adapter
 * that maps `201 → published` would mark posts real while they sit in a container
 * flow, and would never learn whether they failed at finalize. So success here means
 * exactly one thing — a URL came back. A post is real if there is a link to it on
 * the internet.
 *
 * Note also `lastPublishStage` stays `awaiting-finalize` on a post that IS published.
 * It is a stale breadcrumb, not a state machine. Do not build on it.
 */

export type InstagramAdapterDeps = ZernioAdapterDeps

/**
 * Instagram on the Zernio rail.
 *
 * Now a thin alias over `createZernioAdapter`: everything this file used to do is
 * in there, generalised over the channel, because x, gbp and linkedin publish
 * through exactly the same call. The name survives because instagram is the
 * channel with the sharp edges — two-phase publish, mandatory media, an
 * accountId Zernio validates against the whole team — and a call site that says
 * `createInstagramAdapter` is naming the thing it actually means.
 *
 * The commentary above is kept in place: it is the observed evidence for why the
 * poll exists at all, and it belongs next to the channel that produced it.
 */
export function createInstagramAdapter(deps: InstagramAdapterDeps): PublishAdapter {
  return createZernioAdapter('instagram', deps)
}
