/**
 * Radar's database port.
 *
 * An interface rather than a Postgres client so the spending cap, the runner and
 * the differ can each be executed in a test without a database — and so the one
 * property that matters ("the provider is never called when the cap refuses") can
 * be proved by counting calls rather than by reading code.
 *
 * Every write goes through a SECURITY DEFINER function. Nothing here issues an
 * UPDATE or a DELETE against a customer-facing table: `competitor_snapshots` and
 * `competitor_changes` both carry `app.block_mutations()`, so an attempt would
 * fail rather than quietly rewrite history.
 */

export interface DueSource {
  sourceId: string
  competitorId: string
  kind: 'website' | 'instagram' | 'x' | 'linkedin' | 'facebook'
  locator: string
  cadence: 'daily' | 'weekly'
  /** The cheap check's memory. Null on a source never successfully seen. */
  etag: string | null
  lastModified: string | null
  contentHash: string | null
  lastSeenAt: string | null
}

export interface BeginFetchRequest {
  sourceId: string
  mode: 'cheap' | 'render'
  provider: 'direct' | 'zyte' | 'apify'
  estimateMicros: number
  costBasis: 'measured' | 'estimated' | 'free'
}

export type BeginFetchResult =
  | { allowed: true; reservationId: string; subscriberCount: number }
  | {
      allowed: false
      reason: 'DAILY_CAP' | 'WORKSPACE_CAP' | 'NO_SUBSCRIBERS'
      spentMicros?: number
      capMicros?: number
      workspaceId?: string
    }

export interface FinishFetchRequest {
  reservationId: string
  outcome: 'unchanged' | 'changed' | 'could_not_check'
  costMicros: number
  costBasis: 'measured' | 'estimated' | 'free'
  detail: Record<string, unknown>
}

export interface SnapshotWrite {
  sourceId: string
  payload: unknown
  contentHash: string
  capturedAt: string
}

export interface ChangeWrite {
  fromSnapshotId: string
  toSnapshotId: string
  changeKind: 'new_posts' | 'audience_moved' | 'page_content'
  summary: string
  detail: Record<string, unknown>
}

export interface RadarDb {
  /** Sources whose cadence says they are due, cheapest-to-serve first. */
  dueSources(limit: number): Promise<DueSource[]>

  beginFetch(request: BeginFetchRequest): Promise<BeginFetchResult>
  finishFetch(request: FinishFetchRequest): Promise<void>

  /**
   * Write a snapshot, or do nothing if today's already exists.
   *
   * "Or do nothing" is not a convenience: the table blocks UPDATE outright, so a
   * writer built on "create or update" would fail every day after the first.
   * Returns null when the day was already covered.
   */
  insertSnapshot(write: SnapshotWrite): Promise<{ id: string; capturedOn: string } | null>

  /** The most recent snapshot BEFORE the one just written, for the differ. */
  previousSnapshot(
    sourceId: string,
    beforeCapturedOn: string,
  ): Promise<{ id: string; capturedOn: string; payload: unknown } | null>

  insertChange(write: ChangeWrite): Promise<void>

  /** Remember what the server said, so tomorrow's check can be free. */
  rememberCheck(
    sourceId: string,
    memory: { etag: string | null; lastModified: string | null; contentHash: string | null },
    seen: boolean,
  ): Promise<void>
}
