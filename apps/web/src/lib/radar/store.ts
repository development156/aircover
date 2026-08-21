import 'server-only'

import { UNWIRED, type RadarStore } from './port'
import type { Competitor, RadarSnapshot } from './types'

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

/** Nothing is read, so nothing can be mis-read. */
function notCollecting(): never {
  throw new Error(
    'Radar is not collecting yet, so there is nowhere to store a watch list. ' +
      'The collector is the wt-radar lane; see lib/radar/port.ts for the contract.',
  )
}

export function supabaseRadarStore(): RadarStore {
  return {
    async read(_workspaceId: string): Promise<RadarSnapshot> {
      return UNWIRED
    },

    async add(): Promise<Competitor> {
      // `addCompetitor` maps this message onto its `not-collecting` arm, which
      // is a different sentence from a generic failure: retrying cannot help.
      return notCollecting()
    },

    async remove(): Promise<void> {
      // Removing from a list that is not stored is a no-op, not an error. There
      // is nothing to fail at, and a refusal here would be theatre.
    },
  }
}
