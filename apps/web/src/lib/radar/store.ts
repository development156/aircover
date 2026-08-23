import 'server-only'

import { UNWIRED, type RadarStore } from './port'
import { createServerSupabase } from '@/lib/supabase/server'

import type { Competitor, CompetitorKind, RadarSnapshot } from './types'

/**
 * RADAR OVER SUPABASE — DELIBERATELY NOT BOUND, AND THIS IS THE SECOND VERSION.
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
 * ── WHAT WT-RADAR OWES, AND WHERE IT GOES ───────────────────────────────────
 * `port.ts` holds the full contract. Binding it is this one file:
 *
 *   · `read()` — the watch list AND the change records, returning
 *     `collector: 'reading'` once BOTH are queried. Return
 *     `'watch-list-only'` if the changes are not available yet, so an empty feed
 *     is never rendered as the claim "nothing changed".
 *   · `add()` / `remove()` — against that lane's real columns.
 *   · Scan attempts MUST be stored on FAILURE too, or "we could not check
 *     today" cannot be rendered, and that state is the point of the screen.
 *
 * Until then every workspace sees `collector: 'absent'`, which the screen draws
 * as "the weekly scan is not built yet" — true of this branch, and the sentence
 * `roadmap-honesty` holds `/radar` to.
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
        .select('competitor_id, label, created_at, competitors(id, display_name, created_at)')
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
        } | null
        return {
          id: c?.id ?? String(row.competitor_id),
          // `display_name`, NOT `name`. The column the first binding guessed at
          // does not exist, and the guess cost every /radar request a 500.
          name: row.label ?? c?.display_name ?? 'Competitor',
          // The registry stores a normalised LOCATOR per source, not one url on
          // the competitor. Sources are a separate read this binding does not do
          // yet, so the honest answer is an empty string rather than a fabricated
          // address.
          url: '',
          kind: kindFromRegistry('website'),
          addedOn: String(row.created_at ?? c?.created_at ?? ''),
          // NEVER inferred. No successful read has been recorded for anyone —
          // competitor_snapshots is empty — and inventing a timestamp here is
          // exactly the fabrication the screen's provenance guard exists to stop.
          lastObservedAt: null,
        }
      })

      return { collector: 'watch-list-only', competitors, days: [] }
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
