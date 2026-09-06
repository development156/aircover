import 'server-only'

import { AssetLogoFactsSchema, type AssetLogoFacts } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'

import type { LogoFacts } from './logo-facts'

/**
 * The stored answer to "what is this logo file", in `asset_logo_facts`.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `logo-bytes.ts` decoded the logo with sharp on every call and measured it
 * again. A React `cache()` deduped that inside one request, so a generation that
 * makes four pictures decoded once; the next generation decoded again from
 * nothing. The table to hold the answer has existed since
 * `20260831120000_asset_logo_facts.sql` and no application code had ever written
 * a row to it, which also meant the GDPR export named a table that was empty for
 * every customer. This is the write, and the read that makes the write worth
 * having.
 *
 * ── WHAT KEYS THE ROW TO THE BYTES IT DESCRIBES ─────────────────────────────
 * The primary key is the asset id, and the table carries no content hash, so it
 * cannot state "these facts are for THESE bytes" on its own. What it can state
 * is `computed_at`, and `assets` carries `updated_at` kept by a trigger. So a
 * stored row is served only when it was computed AT OR AFTER the asset row last
 * changed. Two things then have to be true for a stale answer to be served, and
 * neither is: the file behind an existing `assets` row would have to change
 * without the row being touched, and MEASURED in `app/actions/assets.ts`, an
 * upload mints a fresh uuid, builds the object key from it, and uploads with
 * `upsert: false` — no path in this codebase overwrites the object under a live
 * asset. Replacing a logo writes a NEW row with a NEW id, which is a different
 * key here and so a different cached answer.
 *
 * The comparison errs one way only. A row touched for an unrelated reason (a
 * retitle, a trip through the trash) reads as stale and the facts are measured
 * again: a wasted decode, never a wrong mark.
 *
 * ── THE THREE FIELDS THE SCHEMA CANNOT HOLD ─────────────────────────────────
 * `LogoFacts` gained `meanInkLuminance`, `darkInkShare` and `lightInkShare`
 * after this migration landed, and there is no column for any of them. They are
 * read by exactly one caller, `plateDecisionFor`, and only for a `mixed` mark;
 * `needsPlate` ignores them for `dark` and `light` ink, and `pickLogoVariant`
 * never passes them at all.
 *
 * So a stored row is served ONLY when its ink polarity is `dark` or `light`,
 * where it answers every question any caller asks. A `mixed` row is written but
 * never served: it would arrive with those three fields absent, and
 * `plateDecisionFor` reads an absent measurement as "plate unconditionally",
 * which is a different picture from the one today's code draws. A `mixed` logo
 * therefore keeps costing a decode, and gets a real measurement rather than a
 * defaulted one.
 *
 * ── NOTHING HERE THROWS ─────────────────────────────────────────────────────
 * A miss, a read that fails, a row that will not parse and a write that is
 * refused all end the same way: the caller measures the file, exactly as it did
 * before this file existed. The table is a cache, and a cache is never the
 * reason a paid generation fails.
 */

/** The columns of one `asset_logo_facts` row, as the row schema states them. */
const FACTS_COLUMNS = '*'

/**
 * The five facts the columns hold, or null when this row cannot answer every
 * question a caller may ask of it.
 *
 * `mixed` is the null case, and it is a completeness rule rather than a taste:
 * see the header. `trim` is all four or none, which the database CHECK enforces,
 * so a present `trim_x` is enough to know the other three are present too.
 */
export function logoFactsFromRow(row: AssetLogoFacts): LogoFacts | null {
  if (row.ink_polarity === 'mixed') return null

  const trim =
    row.trim_x === null || row.trim_y === null || row.trim_width === null || row.trim_height === null
      ? null
      : { x: row.trim_x, y: row.trim_y, width: row.trim_width, height: row.trim_height }

  return {
    hasAlpha: row.has_alpha,
    transparentBackground: row.transparent_background,
    trim,
    inkPolarity: row.ink_polarity,
    shapeClass: row.shape_class,
  }
}

/** True when these facts were computed no earlier than the asset row last changed. */
function describesCurrentAsset(computedAt: string, assetUpdatedAt: unknown): boolean {
  if (typeof assetUpdatedAt !== 'string') return false
  const computed = Date.parse(computedAt)
  const updated = Date.parse(assetUpdatedAt)
  if (Number.isNaN(computed) || Number.isNaN(updated)) return false
  return computed >= updated
}

export interface CachedFactsQuery {
  workspaceId: string
  assetId: string
  /** `assets.updated_at` for the row being read, as it came back from PostgREST. */
  assetUpdatedAt: unknown
}

/**
 * The stored facts for this asset, or null. Null means "measure it": no row, a
 * row computed before the asset last changed, a row this deploy cannot read, a
 * row that will not parse, or a `mixed` row that cannot answer in full.
 */
export async function readCachedLogoFacts(query: CachedFactsQuery): Promise<LogoFacts | null> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('asset_logo_facts')
      .select(FACTS_COLUMNS)
      // Scoped by workspace as well as by asset. RLS is the boundary and it
      // filters on `workspace_id`, but a reader that names only the id would be
      // asking a question whose answer depends entirely on the policy holding.
      .eq('asset_id', query.assetId)
      .eq('workspace_id', query.workspaceId)
      .maybeSingle()

    // Every failure is the same answer. `42703` (a column this deploy's schema
    // does not have) and `42P01` (no such table, the migration not applied) are
    // the two an unapplied migration gives, and neither is worth telling apart
    // from a transport failure here: all three mean there is no cached answer.
    if (error || !data) return null

    const parsed = AssetLogoFactsSchema.safeParse(data)
    if (!parsed.success) return null
    if (!describesCurrentAsset(parsed.data.computed_at, query.assetUpdatedAt)) return null

    return logoFactsFromRow(parsed.data)
  } catch {
    return null
  }
}

export interface CachedFactsWrite {
  workspaceId: string
  assetId: string
  facts: LogoFacts
}

/**
 * Store what was just measured, so the next request does not decode the file.
 *
 * Best effort by design, and the void return is the point: nothing a caller
 * could do about a refused write is better than stamping the logo it already
 * measured. An upsert rather than an insert because a recomputation (a stale
 * row, or a `mixed` row that is never served) must replace what is there, and
 * `computed_at` is set here rather than left to the column default, which only
 * fires on insert.
 */
export async function writeLogoFacts(write: CachedFactsWrite): Promise<void> {
  const { facts } = write
  try {
    const supabase = createServerSupabase()
    const { error } = await supabase.from('asset_logo_facts').upsert(
      {
        asset_id: write.assetId,
        workspace_id: write.workspaceId,
        has_alpha: facts.hasAlpha,
        transparent_background: facts.transparentBackground,
        // All four or none. The database CHECK refuses a half-present box, and
        // zeros would be a lie the render code would trust.
        trim_x: facts.trim?.x ?? null,
        trim_y: facts.trim?.y ?? null,
        trim_width: facts.trim?.width ?? null,
        trim_height: facts.trim?.height ?? null,
        ink_polarity: facts.inkPolarity,
        shape_class: facts.shapeClass,
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'asset_id' },
    )

    if (error) {
      console.warn('[brand] could not cache logo facts', error.code ?? error.message)
    }
  } catch {
    // A thrown transport failure. Same answer as a refused write: nothing.
  }
}
