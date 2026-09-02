import { CHANNEL_LABELS } from '@/components/posts/channel-label'

import { describePublishError } from './publish-error-copy'
import { presentViolation } from './violation-copy'

/**
 * The one sentence the publish route hands the person who pressed Publish.
 *
 * ── TWO SOURCES, ONE SCREEN ──────────────────────────────────────────────────
 * `runPublishPost` fails with a message from one of two places. Sahoda's own
 * code writes some of them for a reader, figures and all: the Constraint
 * Engine's "allows 280 characters; this has 312", the per-day cap's "held until
 * tomorrow". The rest were THROWN, by an adapter or the database driver, and
 * for Zernio that text is built from the provider's response body. Until
 * 2026-09-02 the route forwarded both verbatim, so "createPost: HTTP 500
 * <html>" reached a shop owner's screen on the highest-stakes button in the app.
 *
 * The job says which kind each one is (`customerReadable`), because only the
 * job knows: MEDIA_REQUIRED comes from the engine and from the adapter with the
 * same code. This function trusts that flag and nothing else about the message.
 *
 *  · Not readable: the CODE picks a sentence from the allowlist in
 *    `publish-error-copy`, and an unknown code degrades to its safe generic.
 *    The thrown text is in `post_publish_logs` for an operator; it is never
 *    returned here, whatever it says.
 *  · Readable: the sentence is kept, because a code-mapped one would be vaguer
 *    than the truth it replaced. It goes through `presentViolation`, which turns
 *    a LEADING channel key into its label ("x allows" → "X allows") and groups
 *    long digits, and touches nothing else.
 */
export interface PublishFailureSource {
  code: string
  message: string
  customerReadable: boolean
}

export function publishFailureMessage(failure: PublishFailureSource): string {
  if (!failure.customerReadable) return describePublishError(failure.code).message
  return presentViolation(failure.message, CHANNEL_LABELS)
}
