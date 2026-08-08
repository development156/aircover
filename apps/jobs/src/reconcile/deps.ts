import { ZERNIO_PLATFORM_NAME, createZernioClient, fetchTransport } from '@sahoda/publishing'
import type { ZernioClient } from '@sahoda/publishing'

import { getRuntime } from '../runtime'
import { ZernioNotProvisionedError } from './failures'
import { createReconcileStore } from './store'
import type {
  AccountFacts,
  PublishResolution,
  ReconcileMode,
  ReconcileSweepDeps,
  UnresolvedPublish,
} from './sweep'

/**
 * What the reconciliation pass asks Zernio, wired to what it writes.
 *
 * The four SQL statements live in ./store so they can be executed in a test rather
 * than read; this module is the platform half — the client, and the two reads that
 * turn a Zernio response into the sweep's own vocabulary.
 */

export interface ReconcileDepsOptions {
  mode?: ReconcileMode
  limit?: number
  /** Where the real cause of a failed unit goes. See ./failures. */
  onFailure?: ReconcileSweepDeps['onFailure']
}

export function reconcileSweepDeps(opts: ReconcileDepsOptions = {}): ReconcileSweepDeps {
  const { env, pool } = getRuntime()
  const store = createReconcileStore({ pool, limit: opts.limit })

  // Null when the rail is not provisioned. Every reader below then refuses in the
  // open rather than inventing an answer about someone's account.
  const client: ZernioClient | null = env.zernioApiKey
    ? createZernioClient({ transport: fetchTransport(), apiKey: env.zernioApiKey })
    : null

  // A typed refusal rather than a bare Error: the sweep classifies what it catches
  // for a public response body, and "this environment has no key" must not be filed
  // under the same unknown-fault token as a database that would not answer.
  const needClient = (): ZernioClient => {
    if (!client) throw new ZernioNotProvisionedError()
    return client
  }

  return {
    mode: opts.mode ?? 'off',
    onFailure: opts.onFailure,

    listConnectionsToCheck: store.listConnectionsToCheck,
    listUnresolvedPublishes: store.listUnresolvedPublishes,
    applyAccountFacts: store.applyAccountFacts,
    applyResolution: store.applyResolution,

    async readAccounts(profileId: string): Promise<AccountFacts[]> {
      const accounts = await needClient().listAccounts(profileId)
      return accounts.map((a) => ({
        accountId: a._id,
        needsReconnection: a.needsReconnection === true,
        platformStatus: typeof a.platformStatus === 'string' ? a.platformStatus : null,
        // The one input to the T-7 warning. Absent on the response means the column
        // keeps whatever it already held (see the store's `coalesce`) — never that
        // the deadline moved.
        tokenExpiresAt: typeof a.tokenExpiresAt === 'string' ? a.tokenExpiresAt : null,
      }))
    },

    /**
     * How one post ended, read from the platform.
     *
     * The same rule the adapter enforces applies here and is the reason this
     * function exists at all: a post is resolved when there is a URL, never when a
     * status field says so. `published` without a `platformPostUrl` is reported as
     * still pending, because there is nothing to show anybody.
     */
    async readPublish(item: UnresolvedPublish): Promise<PublishResolution> {
      const post = await needClient().getPost(item.providerPostId)
      // Zernio names GBP `google`; the rest match our channel names. One mapping,
      // shared with the adapter, so a rename cannot make this silently find nothing.
      const wanted = ZERNIO_PLATFORM_NAME[item.channel]
      const leg = post.platforms?.find((p) => p.platform === wanted)
      if (leg?.platformPostUrl) {
        return {
          kind: 'published',
          permalink: leg.platformPostUrl,
          // The leg's OWN id, not `item.providerPostId` — that one is Zernio's `_id`,
          // which is how we addressed this post above and is not a platform id. This
          // is the whole reason to re-read: by now the platform has issued a real one.
          // Null when it still has not; the column stays empty rather than wrong.
          platformPostId: typeof leg.platformPostId === 'string' ? leg.platformPostId : null,
        }
      }
      if (leg?.status === 'failed') {
        const reason = leg.error ?? leg.errorMessage ?? null
        return { kind: 'failed', reason: typeof reason === 'string' ? reason : null }
      }
      return { kind: 'pending' }
    },
  }
}
