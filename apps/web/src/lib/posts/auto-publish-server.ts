import 'server-only'

import { publishFromCronEnabled } from '@/lib/cron/publish-enabled'

/**
 * Whether a scheduled post will actually reach a platform by itself in THIS
 * environment.
 *
 * ── WHY THIS IS A SERVER READ AND NOT A CONSTANT ─────────────────────────────
 * "Will this post go out by itself?" has a different answer in two deployments
 * of the same code, and the copy under the schedule picker is a promise about
 * the world. A component that assumed on would promise auto-publish where the
 * switches are off, which is the fake-success state this surface exists to
 * prevent. One that assumed off would tell a customer to copy the post across by
 * hand while the sweep publishes it too: a duplicate, caused by our own copy.
 *
 * ── IT IS THREE SWITCHES, NOT ONE, AND THAT WAS THE DEFECT ───────────────────
 * This read `SAHODA_PUBLISH_DISPATCH_MODE` alone and selected "Goes out on its
 * own at this time." The sweep needs all three:
 *
 *   1. `SAHODA_PUBLISH_DISPATCH_MODE=on` — without it the sweep does not even
 *      classify a due post as a dispatch.
 *   2. `publishFromCronEnabled()` — `cron/sweeps/route.ts` calls this exact
 *      predicate before it builds a publisher, and throws
 *      `PublishQueueUnavailableError` when it is false, which leaves the variant
 *      pending and untouched.
 *   3. `SAHODA_PUBLISH_MODE=live` — the fixture rail runs the whole dispatch and
 *      reaches no platform, so a customer promised a post gets a simulation.
 *
 * An operator who turned on the dispatcher alone had every card say "Auto-posts"
 * and nothing go out. The sweep's own predicate is imported rather than
 * restated, so a change to what the sweep requires changes what this promises.
 */
export function autoPublishEnabled(): boolean {
  return autoPublishGap() === null
}

/** Which of the three switches is not set, in the order an operator turns them on. */
export type AutoPublishGap = 'dispatch' | 'publish' | 'rail'

/**
 * The first missing switch, or `null` when a scheduled post really does go out.
 *
 * `autoPublishEnabled()` answers the customer's question and is the only thing
 * copy may read. This answers the operator's: "I set the flag, why is the card
 * still saying it won't post itself?" It has NO consumer yet beyond the test
 * that pins the ordering, and it is named that way deliberately rather than
 * described as something the ops surface already reads. Whatever picks it up
 * must be a server log or an admin screen, never customer copy: these are our
 * environment variable names, not the reader's situation.
 *
 * Ordered, not a set: the dispatcher comes first because without it nothing is
 * classified, then the publish permission, then the rail. Turning them on in
 * that order never leaves a half-armed state that publishes something unintended.
 */
export function autoPublishGap(): AutoPublishGap | null {
  if (process.env.SAHODA_PUBLISH_DISPATCH_MODE !== 'on') return 'dispatch'
  if (!publishFromCronEnabled()) return 'publish'
  // Exact match on `live`, not "anything but fixture": `publishMode` defaults to
  // the fixture rail, and an unrecognised or empty value must not read as a
  // promise that a real platform will be reached.
  if (process.env.SAHODA_PUBLISH_MODE !== 'live') return 'rail'
  return null
}
