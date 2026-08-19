import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * One metric's history, as days.
 *
 * ── WHAT THIS READ IS ALLOWED TO SAY ─────────────────────────────────────────
 * The same rule the post cards and the comparison already follow, applied to a
 * shape that makes breaking it easier: a number that was never measured must not
 * become a zero, and a day with no measurement must not become a point.
 *
 * A chart is the most dangerous place in this product to get that wrong. A table
 * shows a gap as a gap because the cell is visibly empty; a line drawn through a
 * missing day looks exactly like a measurement, and a zero plotted for an
 * unmeasured day draws a cliff that never happened. So a day with no rows
 * produces NO POINT, and the drawing breaks the line there rather than spanning it.
 *
 * ── THE THREE-DAY FLOOR ──────────────────────────────────────────────────────
 * Below three measured days there is no chart, only a sparse state. Two points
 * are a straight line between them and say nothing the current number does not
 * already say — worse, they IMPLY a rate of change that two readings cannot
 * support. The floor is evaluated on the series being drawn, not on how many rows
 * the table holds: ten days of Instagram history must not license a two-point
 * LinkedIn line.
 */

/** Fewer measured days than this is not a trend, whatever the table holds. */
export const MIN_SERIES_DAYS = 3

/** How far back a chart looks. */
export const SERIES_WINDOW_DAYS = 30

/**
 * Most rows one read will take.
 *
 * The aggregation happens HERE rather than in SQL, and not by preference: the data
 * API in front of Postgres has no GROUP BY, so a per-day total is either this or a
 * database function of its own. Thirty days of a busy workspace is a few thousand
 * rows, which is a cheap read and a trivial reduce — and the alternative is another
 * migration for the founder to apply before any of this works.
 *
 * The cap is stated rather than silent: past it the read reports `unreadable`,
 * because a total assembled from a truncated set is a subtotal wearing a total's
 * clothes, and this file's entire job is not to draw one of those.
 */
export const SERIES_ROW_CAP = 5000

export type SeriesMetric = 'impressions' | 'reach' | 'engagement'

export interface SeriesPoint {
  /** The day, `YYYY-MM-DD`, as the platform measured it. */
  day: string
  /** Running totals summed across every channel measured that day. */
  total: number
  /** How many post-channels contributed. Rendered, never hidden — see below. */
  series: number
}

/**
 * What a chart may draw, or why it may not.
 *
 * `unavailable` and `unreadable` are kept apart because they are different claims.
 * The first says Sahoda is not keeping this history yet, which is true and is the
 * state production is in until migration 20260819000100 is applied. The second
 * says we could not read a history that may well exist — and telling someone we
 * keep no history when we could not reach the database would be a false statement
 * about their data.
 */
export type MetricSeries =
  | { kind: 'unavailable' }
  | { kind: 'unreadable' }
  /**
   * There is no workspace, so there is nothing this history could belong to.
   *
   * ── WHY THIS IS NOT `unreadable` ────────────────────────────────────────────
   * It was, and `e2e/no-impossible-remedy.spec.ts` caught it: the card told a
   * brand-new account "Sahoda could not read the history — reload to try again",
   * on an account where nothing had failed and where reloading cannot produce a
   * workspace. That is the same "could not look" / "looked and found nothing"
   * collapse `lib/inbox/emptiness.ts` exists to keep apart, arriving through a new
   * read that had not learned the rule.
   *
   * A remedy that cannot work is worse than no remedy: it sends someone to press a
   * button forever instead of telling them what is actually true.
   */
  | { kind: 'no-workspace' }
  | { kind: 'empty' }
  | { kind: 'sparse'; days: number }
  | { kind: 'ready'; points: SeriesPoint[]; minSeries: number; maxSeries: number }

interface SnapshotRow {
  measured_on?: unknown
  value?: unknown
}

/** `bigint` arrives as a string over the wire. Anything unparseable is not a number. */
function valueOf(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function dayOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null
}

/** The first day in the window, as `YYYY-MM-DD` UTC. */
export function windowStart(now: Date, days: number = SERIES_WINDOW_DAYS): string {
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return start.toISOString().slice(0, 10)
}

/**
 * Turn rows into days, and decide whether there is a chart at all.
 *
 * Exported and pure so the floor can be tested at its boundary without a database.
 */
export function seriesFromRows(rows: readonly SnapshotRow[]): MetricSeries {
  const byDay = new Map<string, { total: number; series: number }>()

  for (const row of rows) {
    const day = dayOf(row.measured_on)
    const value = valueOf(row.value)
    // A row we cannot read is dropped rather than counted as zero. It also does
    // not create a day — an unreadable row is not evidence anything was measured.
    if (day === null || value === null) continue
    const bucket = byDay.get(day) ?? { total: 0, series: 0 }
    bucket.total += value
    bucket.series += 1
    byDay.set(day, bucket)
  }

  if (byDay.size === 0) return { kind: 'empty' }
  if (byDay.size < MIN_SERIES_DAYS) return { kind: 'sparse', days: byDay.size }

  const points: SeriesPoint[] = [...byDay.entries()]
    .map(([day, bucket]) => ({ day, total: bucket.total, series: bucket.series }))
    .sort((a, b) => a.day.localeCompare(b.day))

  const counts = points.map((point) => point.series)
  return {
    kind: 'ready',
    points,
    // Coverage is REPORTED, not smoothed. The number of post-channels measured can
    // differ from day to day, and a total that quietly covered fewer of them draws
    // a fall that never happened. The screen states the range instead of hiding it.
    minSeries: Math.min(...counts),
    maxSeries: Math.max(...counts),
  }
}

/**
 * Read one metric's history for the active workspace.
 *
 * ── TELLING "NOT KEPT YET" FROM "COULD NOT READ" ─────────────────────────────
 * Both arrive as a refused request and no error code is trusted to separate them —
 * the two layers involved report a missing table differently and neither was
 * observable from here. So the question is asked a second way instead: if the
 * history read is refused, a trivial read of a table that certainly exists is
 * tried. If THAT answers, the database is reachable and the first refusal was
 * about the table itself. If it does not, nothing can be claimed about the
 * history, and the screen says so.
 *
 * NEVER REJECTS. `page-data.ts` states the rule this follows: a hiccup in one
 * section of the analytics page must cost that section, not the page.
 */
/**
 * How long "this database keeps no history" is trusted before it is asked again.
 *
 * The same argument as the variant-version probe next door: until migration
 * 20260819000100 is applied, the read below is REFUSED on every single load of the
 * analytics page, and the follow-up question costs a second request each time. The
 * answer changes at most once, ever.
 *
 * Only the `unavailable` verdict is remembered — never data, and never a failure.
 * The cost is staleness in one direction: for up to this long after the founder
 * applies the migration, a running instance still shows the "no history yet" card.
 * That is the safe direction, and it clears itself without a deployment.
 */
const UNAVAILABLE_TTL_MS = 5 * 60 * 1000

let unavailableSince: number | null = null

export async function readMetricSeries(
  metric: SeriesMetric,
  now: Date = new Date(),
): Promise<MetricSeries> {
  try {
    if (unavailableSince !== null && Date.now() - unavailableSince < UNAVAILABLE_TTL_MS) {
      return { kind: 'unavailable' }
    }

    const workspace = await activeWorkspaceRead()
    // Three answers, and they are three different sentences. `none` is an account
    // that has not made a workspace yet — nothing failed. `unreadable` is a read
    // that did fail, and only that one earns a retry.
    if (workspace.status === 'none') return { kind: 'no-workspace' }
    if (workspace.status !== 'ok') return { kind: 'unreadable' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_metric_snapshots')
      .select('measured_on, value')
      .eq('workspace_id', workspace.workspace.id)
      .eq('metric', metric)
      .gte('measured_on', windowStart(now))
      .order('measured_on', { ascending: true })
      .limit(SERIES_ROW_CAP)

    if (error || !data) {
      const verdict = await refusalKind(supabase)
      // Only the "not kept yet" answer is remembered. A failure is not: it may be
      // gone on the next request, and caching it would keep a working chart dark.
      if (verdict.kind === 'unavailable') unavailableSince = Date.now()
      return verdict
    }

    // At the cap the population is truncated, and a truncated population makes
    // every total on the chart a subtotal. Refused rather than drawn.
    if (data.length >= SERIES_ROW_CAP) return { kind: 'unreadable' }

    return seriesFromRows(data as SnapshotRow[])
  } catch {
    return { kind: 'unreadable' }
  }
}

/**
 * Was the history refused because it is not kept yet, or because nothing answered?
 *
 * ── WHAT THIS ANSWERS, AND WHAT IT DOES NOT ──────────────────────────────────
 * It establishes that the database is REACHABLE, and infers from that the refusal
 * above was about the history table. That inference is sound in the case it exists
 * for — the table genuinely absent, which is production today — and it has one
 * narrow gap: after the migration lands, a transient failure specific to this one
 * table would be reported as "Sahoda keeps no history yet", which would be wrong.
 *
 * Left as it is rather than chased, because closing it means matching an error code
 * to say WHY a request was refused, and that is the branch this file avoided on
 * purpose. The wrong copy lasts one reload; a mis-matched code picks the wrong
 * branch silently and forever.
 */
async function refusalKind(
  supabase: ReturnType<typeof createServerSupabase>,
): Promise<MetricSeries> {
  try {
    const { error } = await supabase.from('posts').select('id').limit(1)
    // The database answered about a table that certainly exists, so the refusal
    // above was about the history table — which simply is not there yet.
    return error ? { kind: 'unreadable' } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unreadable' }
  }
}
