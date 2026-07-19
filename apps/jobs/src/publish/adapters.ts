import { AdapterError, type Channel, type PublishAdapter } from '@sahoda/shared'
import {
  createFixtureAdapter,
  createGbpAdapter,
  createXAdapter,
  type ReadMedia,
  type Transport,
} from '@sahoda/publishing'
import type { PublishMode } from './runPublishPost'

export interface AdapterSelectorDeps {
  mode: PublishMode
  transport: Transport
  /** Storage path → raw bytes, for X media upload. Absent ⇒ the adapter rejects media. */
  readMedia?: ReadMedia
  /**
   * Storage path → publicly fetchable image URL, for GBP. Note this is SYNCHRONOUS while
   * Supabase signed URLs are async, so callers pre-sign every path and close over the map.
   */
  publicMediaUrl?: (storagePath: string) => string
  now?: () => Date
}

/**
 * Channel → adapter. packages/publishing exports no registry or factory, so the mapping
 * lives here by design; it is the one place that knows which channels can really publish.
 *
 * A channel with no adapter throws a permanent AdapterError instead of falling back to the
 * fixture: the Constraint Engine marks linkedin publishable but no linkedin adapter ships,
 * and silently simulating it would be mock-success in a production path (CLAUDE.md).
 */
export function createAdapterSelector(deps: AdapterSelectorDeps): (c: Channel) => PublishAdapter {
  return (channel: Channel): PublishAdapter => {
    if (deps.mode === 'fixture') return createFixtureAdapter(channel, { now: deps.now })

    switch (channel) {
      case 'x':
        return createXAdapter({
          transport: deps.transport,
          readMedia: deps.readMedia,
          now: deps.now,
        })
      case 'gbp':
        return createGbpAdapter({
          transport: deps.transport,
          publicMediaUrl: deps.publicMediaUrl,
          now: deps.now,
        })
      default:
        throw new AdapterError({
          message: `No live publish adapter exists for ${channel}.`,
          code: 'NO_ADAPTER',
          classification: 'permanent',
          channel,
        })
    }
  }
}
