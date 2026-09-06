import type { Pool } from 'pg'

/**
 * WHAT RADAR TRIED, FOR ONE WORKSPACE — the read side of `radar_fetch_log`.
 *
 * ── WHY THIS IS HERE AND NOT IN apps/web ────────────────────────────────────
 * `radar_fetch_log` has RLS enabled and NO POLICIES
 * (`20260822060100_radar_snapshots.sql`), so a member session selecting from it
 * gets zero rows and no error. apps/web reads Supabase as the signed-in user by
 * design — `lib/supabase/server.ts` says "No service-role client in apps/web" —
 * so the screen could show what MOVED and could never show what FAILED, which
 * is the one distinction the whole Radar screen exists to make. Production
 * proved the cost of that: the first real pass recorded three
 * `could_not_check` rows and /radar rendered nothing at all about them.
 *
 * ── THE SHAPE THAT MAKES THE ELEVATED READ SAFE ─────────────────────────────
 * The workspace id is an ARGUMENT AND THE JOIN, not a filter the caller applies
 * afterwards. `radar_fetch_log → competitor_sources → competitor_subscriptions`
 * with `sub.workspace_id = $1` cannot be aimed at another tenant's rows even if
 * every check above it were deleted. That is the same construction
 * `app.radar_workspace_spend_today` uses, SECURITY DEFINER, over this exact
 * table — this is its read-only sibling and not a new level of trust.
 *
 * ── AND THE PROJECTION IS THE OTHER HALF OF IT ──────────────────────────────
 * The migration names the leak precisely: `subscriber_count` would tell one
 * workspace how many OTHERS watch a competitor, "the who-is-watching-whom
 * disclosure arriving through the billing door". So this query does not SELECT
 * it, and does not select `cost_micros` either — what Sahoda pays a provider is
 * not the customer's number. Not "does not return them": does not NAME them, so
 * a later widening of the projection has to be written on purpose.
 *
 * `detail` is likewise projected to `detail->>'why'` alone. The blob also holds
 * `error` (a raw `TypeError: …` from the transport) and `runId` (an Apify
 * identifier), and neither is a sentence for a shop owner. The web side maps
 * the `why` strings it recognises and falls back to a generic sentence for the
 * rest, the same way `STORE_REFUSALS` treats an unknown throw as raw.
 */

/** One attempt on one source, reduced to what a customer may be told. */
export interface RadarAttemptRow {
  sourceId: string
  competitorId: string
  /** `pending` | `unchanged` | `changed` | `could_not_check`, as stored. */
  outcome: string
  /** The checker's own words, or null. Never the whole `detail` blob. */
  why: string | null
  /** ISO timestamp of the attempt. */
  fetchedAt: string
}

export interface RadarAttemptQuery {
  /** How far back to look. The feed shows recent days; older rows are noise. */
  sinceDays?: number
  /** A wall on the read, newest first. */
  limit?: number
}

const DEFAULT_SINCE_DAYS = 45
const DEFAULT_LIMIT = 400

export async function readRadarAttempts(
  pool: Pool,
  workspaceId: string,
  query: RadarAttemptQuery = {},
): Promise<RadarAttemptRow[]> {
  const sinceDays = query.sinceDays ?? DEFAULT_SINCE_DAYS
  const limit = query.limit ?? DEFAULT_LIMIT

  const { rows } = await pool.query<{
    source_id: string
    competitor_id: string
    outcome: string
    why: string | null
    fetched_at: string
  }>(
    `select l.source_id,
            cs.competitor_id,
            l.outcome,
            l.detail->>'why' as why,
            l.fetched_at
       from radar_fetch_log l
       join competitor_sources cs on cs.id = l.source_id
       join competitor_subscriptions sub
         on sub.competitor_id = cs.competitor_id
        and sub.workspace_id = $1::uuid
      where l.fetched_at > now() - ($2::int * interval '1 day')
      order by l.fetched_at desc
      limit $3`,
    [workspaceId, sinceDays, limit],
  )

  return rows.map((r) => ({
    sourceId: r.source_id,
    competitorId: r.competitor_id,
    outcome: r.outcome,
    why: r.why,
    fetchedAt: new Date(r.fetched_at).toISOString(),
  }))
}
