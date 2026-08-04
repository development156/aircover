import 'server-only'

/**
 * Whether scheduled auto-publish is actually switched on in THIS environment.
 *
 * ── WHY THIS IS A SERVER READ AND NOT A CONSTANT ─────────────────────────────
 * The dispatcher publishes only when `SAHODA_PUBLISH_DISPATCH_MODE` is `on`; it
 * defaults to `off` and `report` classifies without writing. So "will this post
 * go out by itself?" has a different answer in two deployments of the same code,
 * and the copy under the schedule picker is a promise about the world.
 *
 * Until now the answer was permanently no, and the UI said so in plain words.
 * Both halves of that are now conditional, and neither may be guessed at: a
 * component that assumed `on` would promise auto-publish in an environment where
 * the flag is off, which is the fake-success state this whole surface exists to
 * prevent. One that assumed `off` would tell a customer to copy the post across
 * by hand while the sweep publishes it too — a duplicate, caused by our own copy.
 */
export function autoPublishEnabled(): boolean {
  return process.env.SAHODA_PUBLISH_DISPATCH_MODE === 'on'
}
