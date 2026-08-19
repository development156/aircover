import { createZernioReads, fetchTransport, type ZernioReads } from '@sahoda/publishing'
import type { ScopedProfileId, ZernioPostAnalyticsResult } from '@sahoda/publishing'

import { getRuntime } from '../runtime'
import { createMetricStore } from './store'
import type { MetricCaptureDeps } from './capture'

/**
 * What the metric-history pass asks Zernio, wired to what it writes.
 *
 * The READ surface only. `createZernioReads` has no method that can publish or
 * reply, so a nightly job whose entire purpose is to copy numbers into a table
 * holds no handle that could post to a customer's account.
 */

export interface MetricCaptureDepsOptions {
  limit?: number
  now?: Date
}

/**
 * A missing key is not a silent no-op.
 *
 * Without it the pass cannot ask anything, and returning zero targets would report
 * a clean night — "nothing to measure" — for an environment that simply is not
 * provisioned. The two are different and the report must not blur them.
 */
export class ZernioNotProvisionedError extends Error {
  constructor() {
    super('No Zernio API key in this environment, so no metrics can be read.')
    this.name = 'ZernioNotProvisionedError'
  }
}

export function metricCaptureDeps(opts: MetricCaptureDepsOptions = {}): MetricCaptureDeps {
  const { env, pool } = getRuntime()
  const store = createMetricStore({ pool, limit: opts.limit })

  const reads: ZernioReads | null = env.zernioApiKey
    ? createZernioReads({ transport: fetchTransport(), apiKey: env.zernioApiKey })
    : null

  return {
    listTargets: store.listTargets,
    writeSnapshots: store.writeSnapshots,
    now: opts.now,

    async readPostAnalytics(
      profileId: string,
      platformPostId: string,
    ): Promise<ZernioPostAnalyticsResult> {
      if (!reads) throw new ZernioNotProvisionedError()
      // ── THE ONE CAST IN THIS FILE, AND WHY IT IS SOUND ──────────────────────
      // `ScopedProfileId` is branded so that a profile id cannot be passed without
      // having been resolved for a known workspace — Zernio's analytics filter
      // defaults to EVERY profile on the key, so an unscoped read crosses tenants.
      //
      // The proof here is the JOIN, not a call to `scopeProfile`: the store reads
      // `zernio_profiles.profile_id` on `z.workspace_id = v.workspace_id`, so the
      // id and the post it is asked about came out of the same row of the same
      // query and cannot belong to different workspaces. `scopeProfile` checks
      // exactly that pairing; here the database has already enforced it.
      return reads.postAnalytics(profileId as ScopedProfileId, platformPostId)
    },
  }
}
