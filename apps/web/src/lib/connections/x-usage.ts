import 'server-only'

import { xRationWindowStart } from '@sahoda/publishing'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * How many X posts this workspace has actually sent this calendar month.
 *
 * ── WHY THIS COUNTS LOGS AND NOT VARIANTS ────────────────────────────────────
 * The obvious query is `post_variants where channel='x' and publish_status =
 * 'published'`. MEASURED against production on 2026-08-19, that query returns **3**
 * — and every one of those three is a FIXTURE run whose permalink begins
 * `fixture://`. Nothing reached X and nothing was billed. Feeding a spend meter
 * from there would report money that was never spent and would eventually refuse a
 * customer over it.
 *
 * `post_publish_logs` carries `mode`, so it can tell a live send from a rehearsal.
 * Filtered to `mode = 'live'` and `status = 'succeeded'`, the same production data
 * returns **0 live X sends, ever** — which is the true number, and the one the
 * meter renders.
 *
 * ── WHY `created_at` AND NOT `published_at` ──────────────────────────────────
 * X bills per REQUEST, at the moment the request is made. `created_at` is when the
 * attempt row was written; `published_at` is nullable and describes the platform's
 * view. Counting the nullable column would silently drop billed requests whose
 * timestamp never arrived, which biases the meter in the permissive direction —
 * the one direction a spending cap must never be wrong in.
 */

/**
 * `null` is not a number and must not be rendered as one.
 *
 * `unreadable` and a count of zero are different claims — the wallet's rule, and
 * the reason `readConnections` exists in the shape it does. "0 of 12 used" off a
 * failed read is a fabricated reading of the customer's own spend.
 */
export type XUsageRead =
  | { status: 'ok'; used: number; since: Date }
  | { status: 'unreadable' }
  | { status: 'no-workspace' }

export async function readXUsage(
  workspaceId: string | null,
  now: Date = new Date(),
): Promise<XUsageRead> {
  if (!workspaceId) return { status: 'no-workspace' }

  // The SAME window `runPublishPost` counts against. Reimplementing it here would
  // let the meter and the refusal disagree by a timezone — the customer shown one
  // number and refused on another.
  const since = xRationWindowStart(now)
  const supabase = createServerSupabase()

  // `head: true` with an exact count: the rows themselves are never read, only
  // counted. A publish log row carries an `error` payload and a platform id, and
  // this screen has no business pulling either across the wire to produce one
  // integer.
  const { count, error } = await supabase
    .from('post_publish_logs')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('channel', 'x')
    .eq('mode', 'live')
    .eq('status', 'succeeded')
    .gte('created_at', since.toISOString())

  // `count` is nullable on the client type even when the query succeeds. Treating
  // a null count as 0 would turn "the database declined to count" into "you have
  // spent nothing", so both failure shapes land on `unreadable`.
  if (error || count === null) return { status: 'unreadable' }

  return { status: 'ok', used: count, since }
}
