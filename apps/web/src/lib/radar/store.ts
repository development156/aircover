import 'server-only'

import {
  bindChanges,
  type CollectorChangeRow,
  type CollectorSnapshotRow,
  type SourceFacts,
} from './from-collector'
import { UNWIRED, type RadarStore } from './port'
import { createServerSupabase } from '@/lib/supabase/server'

import type { Competitor, CompetitorKind, RadarChange, RadarDay, RadarSnapshot } from './types'

/**
 * RADAR OVER SUPABASE — BOUND, AND THIS IS THE THIRD VERSION.
 *
 * ── BOUND 2026-08-25, WATCH LIST AND CHANGE FEED BOTH ───────────────────────
 * The two blocks below describe the first version (which guessed a column name
 * and 500'd every request) and the second (which deliberately bound nothing).
 * Both are kept because this version is the answer to them and would read as
 * recklessness without them.
 *
 * What changed is that the guessing stopped. Every name in every query here was
 * read out of `information_schema.columns` against the production project; every
 * embed was checked against `pg_constraint` for a real foreign key; and every
 * table's RLS policy was read before the query was written, because a policy that
 * does not admit the caller returns an EMPTY RESULT rather than an error, and a
 * silently empty change feed is the claim "nothing changed" about somebody else's
 * business.
 *
 * The one thing still unbound is `attempts` — see `groupByDay`. The collector
 * records failed fetches in `radar_fetch_log` and this file does not read it, so
 * the feed can say what moved and cannot yet say who it failed to reach.
 *
 * ── WHAT THE FIRST VERSION DID, AND WHAT IT COST ────────────────────────────
 * It queried `competitors` for `id, name, url, kind, added_on, last_observed_at`
 * — column names taken from TSD §Radar/Playbooks, which names the TABLES and not
 * their columns. The names were a guess dressed as a citation.
 *
 * MEASURED, in the smoke run of 2026-08-22:
 *
 *     Error: Could not read the watch list: column competitors.name does not exist
 *
 * The table is REAL — the wt-radar lane applied its migrations to the shared
 * database — so the missing-table branch never fired. A missing COLUMN is
 * Postgres 42703, not 42P01, so the throw went straight up and `/radar` returned
 * a 500. Two suites failed on it: `roadmap-honesty` (the screen rendered no text
 * at all, so nothing said "not built yet") and `every-section-loads` (no `h1`).
 *
 * ── SO THIS LANE BINDS NOTHING, WHICH IS WHAT IT WAS ASKED TO DO ────────────
 * The brief for this lane is explicit: stub the read behind an interface, do not
 * depend on that branch, do not duplicate its migrations. A speculative query is
 * a dependency on that branch — a worse one than an import, because it is
 * invisible until it runs and it fails as a crash rather than as a type error.
 *
 * There is no half-measure that helps. Widening the catch to swallow every
 * Postgres error would turn an RLS denial into "you are watching nobody", which
 * is the one failure that must never be silent. Narrowing the SELECT to `id`
 * alone is the same guess with a smaller surface. The honest position is that
 * this lane cannot read a schema it does not have.
 *
 * ── THE REAL SCHEMA, READ OUT OF THE LIVE DATABASE ON 2026-08-23 ────────────
 * Recorded here so the next attempt does not guess. Every name below came from
 * `information_schema.columns` against the production project, not from a doc:
 *
 *   competitors               id, display_name, created_at
 *   competitor_sources        id, competitor_id, kind, locator, cadence, etag,
 *                             last_modified, content_hash, last_seen_at, created_at
 *   competitor_snapshots      id, source_id, payload, content_hash, captured_at,
 *                             captured_on, created_at
 *   competitor_changes        id, source_id, from_snapshot_id, to_snapshot_id,
 *                             change_kind, day_span, summary, detail, detected_at
 *   competitor_subscriptions  id, workspace_id, competitor_id, label, created_by,
 *                             created_at
 *
 * TWO THINGS THAT WOULD BREAK A BINDING WRITTEN FROM THE PROSE, and both are the
 * reason the first attempt 500'd:
 *
 *   1. it is `display_name`, NOT `name`. That single wrong column is what
 *      returned 42703 on every visit to /radar.
 *   2. `competitors` has NO `workspace_id`. It is a SHARED catalogue; tenancy
 *      lives in `competitor_subscriptions`, so every read must join through it
 *      and a filter on `competitors.workspace_id` is a second 42703 waiting.
 *
 * All five tables exist in production and all five are EMPTY as of this date, so
 * a correct binding returns an honest empty state rather than rows — which means
 * "it renders" proves nothing here, and only a query that actually runs does.
 *
 * ── THE CONTRACT `port.ts` SET, AND WHERE EACH CLAUSE LANDED ────────────────
 *
 *   · `read()` — the watch list AND the change records, returning
 *     `collector: 'reading'` once BOTH are queried. DONE. `watch-list-only` is
 *     still returned when the change read FAILS, which is what keeps an empty
 *     feed from ever being rendered as "nothing changed".
 *   · `add()` / `remove()` — against the real columns. DONE.
 *   · Scan attempts stored on FAILURE too, so "we could not check today" can be
 *     rendered. NOT DONE HERE: `radar_fetch_log` exists and this file does not
 *     read it, so `attempts` is empty on every day. That state is the point of
 *     the screen, and it is the honest gap left in this binding.
 */

/**
 * ── THE KIND VOCABULARIES DO NOT MATCH, AND ONE SIDE CANNOT BE STORED ───────
 *
 * This screen's `CompetitorKind` is `website | instagram | google_business`.
 * The registry's CHECK admits `website | instagram | x | linkedin | facebook`.
 *
 * So `google_business` RAISES `RADAR_BAD_KIND` and can never be stored, and three
 * kinds the collector supports cannot be asked for. That is not a bug in either
 * side — they were written by different lanes against different briefs — but it
 * is a decision somebody has to make, and it is NOT this lane's: widening the
 * screen's union changes what `/radar`'s components render, and those belong to
 * wt-page-rest.
 *
 * Until then the mapping is explicit and the refusal is NAMED. Silently dropping
 * a Google Business entry, or coercing it to `website`, would tell a customer
 * they are watching something they are not.
 */
const KIND_TO_REGISTRY: Record<CompetitorKind, string | null> = {
  website: 'website',
  instagram: 'instagram',
  // No registry kind means this. `x`, `linkedin` and `facebook` exist there and
  // have no name here — see the block above.
  google_business: null,
}

/** What the registry calls a kind, mapped back for the screen. */
function kindFromRegistry(kind: string): CompetitorKind {
  return kind === 'instagram' ? 'instagram' : 'website'
}

/**
 * The change feed for a set of watched competitors, or null if it could not be read.
 *
 * NULL IS A REAL ANSWER AND NOT AN ERROR TO SWALLOW. The caller turns it into
 * `watch-list-only` — "Radar cannot tell you either way" — because an empty feed
 * rendered after a failed read is the claim "nothing changed", about somebody
 * else's business, made out of a broken query.
 *
 * ── TWO ROUND TRIPS, ON PURPOSE ───────────────────────────────────────────────
 * `competitor_changes` carries TWO foreign keys to `competitor_snapshots`
 * (`from_snapshot_id`, `to_snapshot_id`), so embedding both in one PostgREST
 * select means disambiguating by constraint name — a spelling that lives in the
 * database and fails at RUNTIME, not at compile time, when it drifts. This file
 * has already paid for one of those: a guessed column name cost every /radar
 * request a 500. Two plain selects and a join in TypeScript cannot fail that way.
 *
 * RLS does the tenancy, and it was READ before this was written rather than
 * assumed: `competitor_changes.t_select` and `competitor_snapshots.t_select` each
 * admit a member through `competitor_sources -> competitor_subscriptions ->
 * app.member_workspace_ids()`. The `in` filters below are a correctness filter on
 * top of that, never the boundary.
 */
async function readChanges(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  competitors: readonly Competitor[],
): Promise<RadarDay[] | null> {
  const names = new Map(competitors.map((c) => [c.id, c.name]))

  const { data: sourceRows, error: sourceError } = await supabase
    .from('competitor_sources')
    .select('id, competitor_id, locator')
    .in(
      'competitor_id',
      competitors.map((c) => c.id),
    )
  if (sourceError || !sourceRows) return null
  if (sourceRows.length === 0) return []

  const sources = new Map<string, SourceFacts>(
    sourceRows.map((row) => [
      String(row.id),
      { competitorId: String(row.competitor_id), locator: String(row.locator ?? '') },
    ]),
  )

  const { data: changeRows, error: changeError } = await supabase
    .from('competitor_changes')
    .select(
      'id, source_id, from_snapshot_id, to_snapshot_id, change_kind, day_span, summary, detail, detected_at',
    )
    .in('source_id', [...sources.keys()])
    .order('detected_at', { ascending: false })
    .limit(CHANGE_LIMIT)
  if (changeError || !changeRows) return null
  if (changeRows.length === 0) return []

  const rows = changeRows as unknown as CollectorChangeRow[]
  const snapshotIds = [...new Set(rows.flatMap((r) => [r.from_snapshot_id, r.to_snapshot_id]))]

  const { data: snapshotRows, error: snapshotError } = await supabase
    .from('competitor_snapshots')
    .select('id, source_id, captured_at')
    .in('id', snapshotIds)
  // Changes we can see whose EVIDENCE we cannot is not a feed with gaps in it —
  // it is a feed with no provenance, and this screen may not print one.
  if (snapshotError || !snapshotRows) return null

  const snapshots = new Map<string, CollectorSnapshotRow>(
    snapshotRows.map((row) => [String(row.id), row as unknown as CollectorSnapshotRow]),
  )

  const { changes } = bindChanges(rows, snapshots, sources, names)
  return groupByDay(changes)
}

/**
 * Changes into days, newest first.
 *
 * `attempts` is EMPTY on every day, and that is a real gap rather than an
 * oversight. The screen models a scan that was tried and failed — "we asked and
 * the answer did not come back" — and the collector records those in
 * `radar_fetch_log`, a table this binding does not read. So the feed can say what
 * moved and cannot yet say which competitor it failed to reach on a given day.
 * An empty list is the honest shape for that: `ScanAttempt` has a `not_attempted`
 * outcome, and inventing one per competitor per day would be asserting scans that
 * may never have run.
 */
function groupByDay(changes: readonly RadarChange[]): RadarDay[] {
  const byDate = new Map<string, RadarChange[]>()
  for (const change of changes) {
    const bucket = byDate.get(change.observedOn)
    if (bucket) bucket.push(change)
    else byDate.set(change.observedOn, [change])
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, list]) => ({ date, changes: list, attempts: [] }))
}

/**
 * How many changes one screen reads.
 *
 * A wall on the query, not on the truth: the feed is newest-first, so this drops
 * the OLDEST changes rather than a random slice. Radar writes at most a handful
 * of rows per source per week, so 200 is several months of a real watch list.
 */
const CHANGE_LIMIT = 200

/** One row of `competitor_sources`, as this screen reads it. */
interface RegistrySource {
  kind: string
  locator: string
  last_seen_at: string | null
}

/**
 * The most recent SUCCESSFUL read across a competitor's sources, or null.
 *
 * The latest rather than the earliest, and null unless at least one source has
 * actually been seen. A competitor watched on two addresses where only one has
 * ever loaded HAS been observed — reporting null there would say Radar has never
 * managed to read them, which is a different and worse claim than the truth.
 *
 * A row whose `last_seen_at` is null contributes nothing rather than counting as
 * a zero date, which would sort ahead of every real timestamp.
 */
function lastObservedFrom(sources: readonly RegistrySource[]): string | null {
  const seen = sources
    .map((s) => s.last_seen_at)
    .filter((at): at is string => typeof at === 'string' && at !== '')
  if (seen.length === 0) return null
  return seen.reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest))
}

export function supabaseRadarStore(): RadarStore {
  return {
    /**
     * The watch list, for real. The change feed is not wired, so this reports
     * `watch-list-only` — never `reading`, which would let an empty feed be drawn
     * as the claim "nothing changed this week".
     *
     * ── THE JOIN IS THROUGH THE SUBSCRIPTION, AND IT HAS TO BE ────────────────
     * `competitors` has NO `workspace_id`; it is a shared catalogue, and tenancy
     * lives entirely in `competitor_subscriptions`. A filter on
     * `competitors.workspace_id` is another 42703 waiting. RLS enforces the same
     * rule underneath, so this join is the honest expression of it rather than
     * the thing that makes it safe.
     */
    async read(workspaceId: string): Promise<RadarSnapshot> {
      const supabase = await createServerSupabase()
      const { data, error } = await supabase
        .from('competitor_subscriptions')
        // ONE STRING LITERAL, NOT A CONCATENATION. supabase-js parses this at
        // the TYPE level to shape the result; built with `+` it degrades to
        // `GenericStringError` and every field access below fails to compile.
        // The compile error is the good outcome — the same select assembled at
        // runtime would have typed as `any` and shipped.
        //
        // The SOURCES carry the address, the kind and the last successful read.
        // Before this they were `url: ''`, a hardcoded `website` and a flat
        // `null` — three fields the screen printed without having looked. Column
        // names come from `information_schema.columns` against the production
        // project on 2026-08-25, not from a doc: guessing them is what cost every
        // /radar request a 500 the first time.
        .select(
          'competitor_id, label, created_at, competitors(id, display_name, created_at, competitor_sources(kind, locator, last_seen_at))',
        )
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true })

      // The table genuinely not being there is the ONLY case that reads as
      // `absent`. Anything else is a real failure and must not be disguised as
      // "the feature is not built yet".
      if (error) {
        if (error.code === '42P01') return UNWIRED
        throw new Error(`Could not read the watch list: ${error.message}`)
      }

      const competitors: Competitor[] = (data ?? []).map((row) => {
        const c = row.competitors as unknown as {
          id: string
          display_name: string
          created_at: string
          competitor_sources?: RegistrySource[] | null
        } | null
        const sources = c?.competitor_sources ?? []
        // The FIRST source is the one the screen shows. A competitor may carry
        // several (a website and an Instagram account), and the watch list has
        // one line per business rather than per address — so this names one and
        // the others are not silently merged into it.
        const primary = sources[0] ?? null

        return {
          id: c?.id ?? String(row.competitor_id),
          // `display_name`, NOT `name`. The column the first binding guessed at
          // does not exist, and the guess cost every /radar request a 500.
          name: row.label ?? c?.display_name ?? 'Competitor',
          // The registry stores a normalised LOCATOR per source, not one url on
          // the competitor. An address that is genuinely absent stays an empty
          // string — the screen draws nothing for it — rather than becoming a
          // guess at the competitor's home page.
          url: primary?.locator ?? '',
          kind: kindFromRegistry(primary?.kind ?? 'website'),
          addedOn: String(row.created_at ?? c?.created_at ?? ''),
          // STILL NEVER INFERRED — but it is now READ rather than assumed.
          //
          // `last_seen_at` moves only on a successful read (apps/jobs pg.ts sets
          // it under `seen`), which is exactly the contract this field states.
          // Null still means no successful read has ever happened, which is true
          // of every row today because nothing runs the scan — the difference is
          // that it is now the database saying so rather than this file.
          lastObservedAt: lastObservedFrom(sources),
        }
      })

      // ── THE CHANGE FEED ───────────────────────────────────────────────────
      // Bound 2026-08-25. Until then this returned `watch-list-only`
      // unconditionally and the feed could never render, whatever the collector
      // had stored.
      //
      // A workspace watching NOBODY has no feed to read and no claim to make
      // about one, so it keeps `watch-list-only` rather than reporting `reading`
      // over a query that would have returned nothing anyway. The screen draws
      // its own "you are not watching anyone yet" from `competitors` being empty.
      if (competitors.length === 0) {
        return { collector: 'watch-list-only', competitors, days: [] }
      }

      const feed = await readChanges(supabase, competitors)
      // A FAILED READ IS NOT AN EMPTY FEED. `watch-list-only` is the honest
      // answer — "Radar cannot tell you either way" — and it is the sentence the
      // screen already has for exactly this. Returning `reading` with no days
      // would state that nothing changed, which is the one claim this screen must
      // never make by accident.
      if (feed === null) return { collector: 'watch-list-only', competitors, days: [] }

      return { collector: 'reading', competitors, days: feed }
    },

    /**
     * Subscribe to a competitor, through the door.
     *
     * `public.radar_subscribe` — NOT `app.radar_subscribe`, which is service-role
     * only and trusts its `p_workspace_id` and `p_created_by` arguments without
     * checking membership. The public wrapper takes identity from the JWT, checks
     * membership first, and has no actor argument at all.
     */
    async add(
      workspaceId: string,
      input: { name: string; url: string; kind: CompetitorKind },
    ): Promise<Competitor> {
      const registryKind = KIND_TO_REGISTRY[input.kind]
      if (registryKind === null) {
        throw new Error(
          'Radar cannot watch a Google Business listing yet — it tracks websites and Instagram.',
        )
      }

      const supabase = await createServerSupabase()
      const { data, error } = await supabase.rpc('radar_subscribe', {
        p_workspace_id: workspaceId,
        p_display_name: input.name,
        p_sources: [{ kind: registryKind, locator: input.url }],
        p_label: input.name,
      })

      if (error) {
        // The registry's own refusals are sentences a person can act on; anything
        // else is a failure and must not be dressed up as one of them.
        if (
          error.message.includes('RADAR_BAD_LOCATOR') ||
          error.message.includes('RADAR_NO_SOURCES')
        ) {
          throw new Error(`Sahoda could not read that address — check it and try again.`)
        }
        if (error.message.includes('FORBIDDEN_ROLE')) {
          throw new Error('Only an owner or an editor can add a competitor to watch.')
        }
        throw new Error(`Could not add that competitor: ${error.message}`)
      }

      const result = data as { competitor_id: string } | null
      return {
        id: result?.competitor_id ?? '',
        name: input.name,
        url: input.url,
        kind: input.kind,
        addedOn: new Date().toISOString(),
        lastObservedAt: null,
      }
    },

    /**
     * Stop watching. A plain DELETE, because `competitor_subscriptions` HAS a
     * delete policy — a member may remove a row they can already see, and doing
     * so reveals nothing about the registry.
     *
     * The competitor itself is deliberately not touched: it belongs to every
     * other subscriber too.
     */
    async remove(workspaceId: string, competitorId: string): Promise<void> {
      const supabase = await createServerSupabase()
      const { error } = await supabase
        .from('competitor_subscriptions')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('competitor_id', competitorId)
      if (error && error.code !== '42P01') {
        throw new Error(`Could not stop watching that competitor: ${error.message}`)
      }
    },
  }
}
