import {
  POPULATION_METRIC,
  createZernioReads,
  fetchTransport,
  scopeAccount,
  type AudiencePopulation,
  type ScopedAccountId,
  type ZernioInstagramDemographics,
  type ZernioReads,
} from '@sahoda/publishing'

import { getRuntime } from '../runtime'
import { createAudienceStore } from './store'
import type { AudienceCaptureDeps, FollowerHistory, FollowerPoint } from './capture'

/**
 * What the audience pass asks Zernio, wired to what it writes.
 *
 * The READ surface only. `createZernioReads` has no method that can publish or
 * reply, so a nightly job whose entire purpose is to copy numbers into a table
 * holds no handle that could post to a customer's account.
 */

export interface AudienceCaptureDepsOptions {
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
    super('No Zernio API key in this environment, so no audience can be read.')
    this.name = 'ZernioNotProvisionedError'
  }
}

/** A finite, non-negative count. Never a coerced 0. */
function count(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null
}

/**
 * One `{ date, value }` point out of Zernio's untyped `metrics` bag.
 *
 * Deliberately strict about the DATE. The analytics page once read the JSON key
 * `total` as a date and rendered "1 — No change over 1 day", every part of which was
 * invented. Here a point with an unusable date is dropped by the collector rather
 * than dated with a fallback, and this is the layer that hands it something to drop.
 */
function pointFrom(raw: unknown): FollowerPoint | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const date = record.date ?? record.end_time ?? record.timestamp
  const value = count(record.value ?? record.count ?? record.followers)
  if (typeof date !== 'string' || value === null) return null
  return { date, value }
}

/**
 * The `values` array of one series, or an empty list.
 *
 * `metricType=time_series` is what produces `values` at all. Under the default
 * `total_value` a metric arrives as `{ total: 1 }` with no points, which is why the
 * caller below asks for `time_series` explicitly — see `instagramFollowerHistory`,
 * where the same parameter is REFUSED by the sibling account-insights endpoint.
 */
export function seriesFrom(metrics: Record<string, unknown>, key: string): FollowerPoint[] {
  const raw = metrics[key]
  if (Array.isArray(raw)) {
    return raw.map(pointFrom).filter((p): p is FollowerPoint => p !== null)
  }
  if (typeof raw === 'object' && raw !== null) {
    const values = (raw as Record<string, unknown>).values
    if (Array.isArray(values)) {
      return values.map(pointFrom).filter((p): p is FollowerPoint => p !== null)
    }
  }
  return []
}

export function audienceCaptureDeps(opts: AudienceCaptureDepsOptions = {}): AudienceCaptureDeps {
  const { env, pool } = getRuntime()
  const store = createAudienceStore({ pool, limit: opts.limit })

  const reads: ZernioReads | null = env.zernioApiKey
    ? createZernioReads({ transport: fetchTransport(), apiKey: env.zernioApiKey })
    : null

  /**
   * ── THE ONE CAST IN THIS FILE, AND WHY IT IS SOUND ────────────────────────
   * `ScopedAccountId` is branded so an account id cannot be passed without having
   * been resolved for a known workspace — Zernio validates an id against the whole
   * team, so a wrong one is answered 200 with another customer's audience.
   *
   * The proof here is the JOIN, not a call to `scopeAccount`: the store reads
   * `connections.external_account->>'id'` on a row whose `profileId` was matched
   * against `zernio_profiles.profile_id` for the SAME workspace, in SQL. That is
   * exactly the pairing `scopeAccount` checks; here the database has already
   * enforced it, and `store.pglite.test.ts` executes the case where it does not.
   */
  const scoped = (accountId: string): ScopedAccountId => accountId as ScopedAccountId

  return {
    listTargets: store.listTargets,
    writeSnapshots: store.writeSnapshots,
    now: opts.now,

    async readDemographics(
      accountId: string,
      population: AudiencePopulation,
    ): Promise<ZernioInstagramDemographics> {
      if (!reads) throw new ZernioNotProvisionedError()
      return reads.instagramDemographics(scoped(accountId), {
        metric: POPULATION_METRIC[population] as
          'follower_demographics' | 'engaged_audience_demographics',
        // All four breakdowns. Asking for a subset would leave a dimension
        // permanently uncollected, and an uncollected day cannot be recovered.
        breakdown: 'age,city,country,gender',
      })
    },

    async readFollowerHistory(accountId: string): Promise<FollowerHistory | null> {
      if (!reads) throw new ZernioNotProvisionedError()
      const { metrics } = await reads.instagramFollowerHistory(scoped(accountId), {
        // `time_series` is what makes this a HISTORY. The default `total_value`
        // answers one number for the window and no dated points at all.
        metricType: 'time_series',
      })
      return {
        total: seriesFrom(metrics, 'follower_count'),
        gained: seriesFrom(metrics, 'followers_gained'),
        lost: seriesFrom(metrics, 'followers_lost'),
      }
    },
  }
}

/** Re-exported so a caller can construct the same brand the store's join proves. */
export { scopeAccount }
