import { AdapterError, type Channel, type PublishAdapter } from '@sahoda/shared'
import {
  createFixtureAdapter,
  createGbpAdapter,
  createZernioAdapter,
  createXAdapter,
  createZernioClient,
  type ReadMedia,
  type Transport,
} from '@sahoda/publishing'
import type { PostFormat } from '@sahoda/publishing'
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
  /**
   * Zernio API key. Absent ⇒ the Zernio rail throws NO_ADAPTER like any other
   * channel we cannot really publish — never a fixture, which would be
   * mock-success in a production path.
   */
  zernioApiKey?: string

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
/**
 * `viaZernio` is an ARGUMENT rather than a dep because it is a property of the
 * connection this attempt resolved, not of the process. A workspace holding its own
 * X grant publishes through the native adapter; one that connected X through Zernio
 * publishes through the rail. Same channel, same deployment, different answer.
 */
export function createAdapterSelector(
  deps: AdapterSelectorDeps,
): (c: Channel, viaZernio: boolean, format: PostFormat | null) => PublishAdapter {
  return (channel: Channel, viaZernio: boolean, format: PostFormat | null): PublishAdapter => {
    if (deps.mode === 'fixture') return createFixtureAdapter(channel, { now: deps.now })

    // The rail first, when the resolved connection is one of Zernio's. Checked
    // before the native adapters because a workspace can legitimately have both
    // kinds of row and the connection that was actually resolved is the answer.
    if (viaZernio && deps.zernioApiKey) {
      return createZernioAdapter(channel, {
        client: createZernioClient({ transport: deps.transport, apiKey: deps.zernioApiKey }),
        // The rail is the only adapter that can act on a format: the native x and
        // gbp adapters speak their platforms' own APIs and have no
        // `platformSpecificData` to put it in. `runPublishPost` refuses a variant
        // that contradicts its format before any adapter is reached, so a native
        // publish is never left claiming a format it did not send.
        format,
        now: deps.now,
      })
    }

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
      case 'instagram':
        // Instagram has no native adapter — Zernio holds the Meta credential and we
        // file no app review. If the rail above did not take it, there is nothing
        // else to try, and falling through to the fixture would report a post as
        // published that was never sent.
        break
      case 'linkedin':
        // No native adapter either. Reached only when the connection is not a
        // Zernio one, i.e. there is no way to publish it.
        break
    }

    throw new AdapterError({
      message: `No live publish adapter exists for ${channel}.`,
      code: 'NO_ADAPTER',
      classification: 'permanent',
      channel,
    })
  }
}
