import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { UNWIRED, type RadarStore } from './port'
import type { Competitor, CompetitorKind, RadarSnapshot } from './types'

/**
 * RADAR OVER SUPABASE — as much of it as this lane can honestly bind.
 *
 * ── WHAT IS BOUND AND WHAT IS OWED ───────────────────────────────────────────
 * `competitors` and `competitor_snapshots` are named in TSD §Radar/Playbooks, so
 * the watch list below queries the documented shape. The CHANGE RECORDS are not
 * bound: the wt-radar lane is modelling them right now and this lane must not
 * guess at a table name, must not duplicate that lane's migrations, and must not
 * depend on its branch.
 *
 * That is exactly why `collector` has three states. When `competitors` exists
 * but the readings are not wired through, this returns `'watch-list-only'` and
 * the screen SAYS SO rather than rendering an empty feed — because an empty feed
 * is a claim ("nothing changed") and this binding has not earned it.
 *
 * Flipping to `'reading'` is one line here plus a change query, and it belongs
 * to the reconcile with wt-radar, not to a guess made today.
 *
 * ── A MISSING TABLE IS NOT AN ERROR HERE ─────────────────────────────────────
 * Before that lane lands, `competitors` genuinely does not exist and PostgREST
 * answers `42P01` / `PGRST205`. Rendering a crash for the expected state of an
 * unshipped feature would make "not built yet" indistinguishable from "broken",
 * so those two codes resolve to `'absent'` and every OTHER error still throws.
 * Swallowing all errors is how a permissions failure starts reading as an empty
 * watch list — an RLS denial would look exactly like a workspace watching
 * nobody, which is the failure most worth not hiding.
 */

/** PostgREST's two ways of saying "there is no such table". */
const NO_SUCH_TABLE = new Set(['42P01', 'PGRST205'])

function isMissingTable(error: { code?: string | null } | null): boolean {
  return error !== null && typeof error.code === 'string' && NO_SUCH_TABLE.has(error.code)
}

interface CompetitorRow {
  id: string
  name: string
  url: string
  kind: string
  added_on: string
  last_observed_at: string | null
}

/** Only the kinds this screen knows how to label. Anything else is dropped, loudly. */
function toKind(raw: string): CompetitorKind | null {
  return raw === 'website' || raw === 'instagram' || raw === 'google_business' ? raw : null
}

function toCompetitor(row: CompetitorRow): Competitor | null {
  const kind = toKind(row.kind)
  if (!kind) return null
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    kind,
    addedOn: row.added_on,
    lastObservedAt: row.last_observed_at,
  }
}

export function supabaseRadarStore(): RadarStore {
  return {
    async read(workspaceId: string): Promise<RadarSnapshot> {
      const supabase = createServerSupabase()
      const { data, error } = await supabase
        .from('competitors')
        .select('id, name, url, kind, added_on, last_observed_at')
        .eq('workspace_id', workspaceId)
        .order('added_on', { ascending: true })

      if (isMissingTable(error)) return UNWIRED
      if (error) throw new Error(`Could not read the watch list: ${error.message}`)

      return {
        // NOT 'reading'. The change records are not queried by this lane, so an
        // empty `days` here means "not wired", never "nothing changed".
        collector: 'watch-list-only',
        competitors: ((data ?? []) as CompetitorRow[])
          .map(toCompetitor)
          .filter((c): c is Competitor => c !== null),
        days: [],
      }
    },

    async add(workspaceId, input): Promise<Competitor> {
      const supabase = createServerSupabase()
      const { data, error } = await supabase
        .from('competitors')
        .insert({
          workspace_id: workspaceId,
          name: input.name,
          url: input.url,
          kind: input.kind,
        })
        .select('id, name, url, kind, added_on, last_observed_at')
        .single()

      if (isMissingTable(error)) {
        throw new Error('Radar is not collecting yet, so there is nowhere to store a watch list.')
      }
      if (error) throw new Error(error.message)

      const competitor = toCompetitor(data as CompetitorRow)
      if (!competitor) throw new Error('That address was stored in a form Radar cannot read back.')
      return competitor
    },

    async remove(workspaceId, competitorId): Promise<void> {
      const supabase = createServerSupabase()
      const { error } = await supabase
        .from('competitors')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('id', competitorId)

      if (isMissingTable(error)) return
      if (error) throw new Error(error.message)
    },
  }
}
