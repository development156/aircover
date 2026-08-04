import type { Channel, PublishAdapter, PublishRequest, PublishSuccess } from '@sahoda/shared'

/**
 * The fixture adapter — the honest, labelled stand-in used behind the fixture-mode flag
 * when live platform credentials do not exist yet. It performs NO network I/O and its
 * result is ALWAYS `mode: 'fixture'` with a `fixture://` permalink, so it can never be
 * mistaken for a real publish (CLAUDE.md honesty rule). The durable job surfaces this as
 * "simulated" and writes `mode='fixture'` to post_publish_logs.
 */
export interface FixtureAdapterOptions {
  /** Injectable clock — deterministic in tests, real wall-clock in production. */
  now?: () => Date
}

export function createFixtureAdapter(
  channel: Channel,
  opts: FixtureAdapterOptions = {},
): PublishAdapter {
  const now = opts.now ?? (() => new Date())

  return {
    channel,
    async publish(req: PublishRequest): Promise<PublishSuccess> {
      const platformPostId = `fixture-${req.postId}-${req.variantId}`
      return {
        platformPostId,
        permalink: `fixture://${channel}/${platformPostId}`,
        publishedAt: now().toISOString(),
        mode: 'fixture',
      }
    },
  }
}
