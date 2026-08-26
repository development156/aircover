import type { ChangeKind, ObservedFigure, RadarChange, Snapshot } from './types'

/**
 * THE COLLECTOR'S VOCABULARY, TRANSLATED INTO THIS SCREEN'S.
 *
 * ── WHY A TRANSLATION EXISTS AT ALL ─────────────────────────────────────────
 * Two lanes wrote the two halves of Radar against two briefs, and they do not
 * agree about anything. MEASURED 2026-08-25:
 *
 *   the collector writes   new_posts | audience_moved | page_content
 *   this screen models     post_published | cadence_shift | price_changed |
 *                          offer_appeared | offer_ended | page_changed
 *
 * Not one name in common. This is the same seam `store.ts` already documents for
 * `CompetitorKind`, one level deeper, and it is the reason binding the feed was
 * never the small wiring job it looked like.
 *
 * ── AND THE COLLECTOR'S PROSE CARRIES DIGITS THIS SCREEN FORBIDS ────────────
 * `diffSnapshots` writes summaries like `Posted 4 times.` and
 * `Followers up 1.2k, to 8.4k.` — good sentences, and unusable here. This
 * screen's `Observation.summary` is held to NO digits by `auditChange`, because
 * every number must be an `ObservedFigure` naming the snapshot it came from.
 * `types.ts` states the rule and the reason: "a summary reading 'posted 4 times'
 * would be a figure that slipped past the mechanism by being spelled inside a
 * sentence".
 *
 * So the collector's summary is NOT rendered. This module writes digit-free prose
 * and lifts every number out of `detail` into a figure that cites
 * `to_snapshot_id`. That loses some of the collector's phrasing, and it is the
 * right trade: the alternative is unprovenanced numbers on the one screen in this
 * product whose entire design is about provenance.
 *
 * ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────
 * Parse a number out of a string. `page_content` carries price strings like
 * `₹499` in `detail.pricesAdded[].raw`, and turning those into figures would mean
 * guessing at currency, separators and locale — inventing a measurement out of a
 * label. Prices are therefore COUNTED (how many appeared, how many went) and
 * never valued. Only fields that arrive as real numbers become figures.
 *
 * A `reading` is never produced here either. That is the interpretation — what
 * the reader's own brand would answer with — and it needs the Brand Brain and a
 * model call. Nothing bound today generates one, so it is `null`, which the
 * screen draws as absent rather than as an empty inference.
 */

/** One `competitor_changes` row, as PostgREST returns it. */
export interface CollectorChangeRow {
  id: string
  source_id: string
  from_snapshot_id: string
  to_snapshot_id: string
  change_kind: string
  day_span: number
  summary: string
  detail: unknown
  detected_at: string
}

/** One `competitor_snapshots` row, reduced to what evidence needs. */
export interface CollectorSnapshotRow {
  id: string
  source_id: string
  captured_at: string
}

/** What a source belongs to and where it reads from. */
export interface SourceFacts {
  competitorId: string
  locator: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/** A finite number, or null. `detail` is jsonb and can hold anything. */
function numberOr(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function lengthOr(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null
}

/**
 * The kind, and the prose that goes with it.
 *
 * `page_content` splits in two, and the split is a REFINEMENT rather than a
 * guess: the collector bundles a price move and a copy edit under one name, and
 * this screen has a `price_changed` that says the more useful thing. Money wins
 * when both happened in one diff, which is the order `diffSnapshots` itself
 * builds its sentence in.
 */
function classify(row: CollectorChangeRow): { kind: ChangeKind; summary: string } | null {
  const detail = asRecord(row.detail)

  if (row.change_kind === 'new_posts') {
    return { kind: 'post_published', summary: 'They posted since the previous read.' }
  }

  if (row.change_kind === 'audience_moved') {
    const delta = numberOr(detail.delta)
    // The DIRECTION is prose; the amount is a figure. Saying "moved" when we know
    // which way would be vaguer than the truth we hold.
    if (delta === null) return { kind: 'audience_moved', summary: 'Their follower count moved.' }
    return {
      kind: 'audience_moved',
      summary: delta > 0 ? 'Their follower count went up.' : 'Their follower count went down.',
    }
  }

  if (row.change_kind === 'page_content') {
    const added = lengthOr(detail.pricesAdded) ?? 0
    const removed = lengthOr(detail.pricesRemoved) ?? 0
    if (added > 0 || removed > 0) {
      return { kind: 'price_changed', summary: 'A price shown on their page changed.' }
    }
    const titleChanged = detail.titleFrom !== detail.titleTo
    return {
      kind: 'page_changed',
      summary: titleChanged ? 'They changed the page title.' : 'They edited the page.',
    }
  }

  // A kind this screen has never heard of. NOT coerced into `page_changed`: a
  // change rendered under the wrong name is a false statement about somebody's
  // business, and a silently dropped one is at least only a gap. Returning null
  // drops the row and `bindChanges` counts it, so the screen can say it is not
  // showing everything rather than implying it is.
  return null
}

/**
 * Every number this change is entitled to print, each citing `to_snapshot_id`.
 *
 * ── WHY EVERY FIGURE CITES THE *TO* SNAPSHOT ────────────────────────────────
 * Because that is the read the value was observed in. A follower count of 8,400
 * was seen in the later snapshot; the earlier one is what makes it a CHANGE, and
 * it is in `evidence` for exactly that reason. A delta is the odd one out — it
 * rests on both — and it cites the later read because that is when the
 * difference became observable. Both ids are in evidence either way, so
 * `auditChange` resolves them and `resolveFigure` renders them.
 */
function figuresFor(
  kind: ChangeKind,
  detail: Record<string, unknown>,
  at: string,
): ObservedFigure[] {
  const figures: ObservedFigure[] = []
  const add = (label: string, value: number | null, unit: string | null) => {
    if (value !== null) figures.push({ label, value, unit, snapshotId: at })
  }

  if (kind === 'post_published') {
    // `count` is what the collector wrote; the id list is the same fact and is
    // used only if the count is missing, never added to it.
    add('New posts', numberOr(detail.count) ?? lengthOr(detail.postIds), 'posts')
    return figures
  }

  if (kind === 'audience_moved') {
    const delta = numberOr(detail.delta)
    // The MAGNITUDE, because the direction is already in the sentence. A signed
    // figure beside "went down" would say the same thing twice and disagree with
    // itself the first time one of them was reworded.
    add('Change', delta === null ? null : Math.abs(delta), 'followers')
    add('Followers now', numberOr(detail.to), null)
    return figures
  }

  if (kind === 'price_changed') {
    // COUNTS, never values. `detail.pricesAdded[].raw` holds strings like `₹499`,
    // and parsing one into a number means guessing currency, separators and
    // locale — inventing a measurement out of a label.
    add('Prices added', lengthOr(detail.pricesAdded), null)
    add('Prices removed', lengthOr(detail.pricesRemoved), null)
    return figures
  }

  if (kind === 'page_changed') {
    const wordDelta = numberOr(detail.wordDelta)
    add('Words changed', wordDelta === null ? null : Math.abs(wordDelta), 'words')
    return figures
  }

  return figures
}

export interface BindResult {
  changes: RadarChange[]
  /**
   * Rows the collector stored that this screen could not render, and why.
   *
   * COUNTED RATHER THAN DISCARDED. A feed quietly missing a stored change is a
   * screen claiming to show everything while showing some of it, which is the
   * failure this whole module is careful about in the other direction.
   */
  dropped: { unknownKind: number; danglingEvidence: number }
}

/**
 * Collector rows into feed changes.
 *
 * A row is dropped rather than rendered when its evidence cannot be resolved.
 * `auditChange` would flag a figure citing a snapshot that is not in `evidence`,
 * and `resolveFigure` would draw it as an absence mark — but a change whose two
 * snapshots are missing entirely has no provenance at all, and rendering the
 * prose without it would be a claim about a competitor resting on nothing.
 */
export function bindChanges(
  rows: readonly CollectorChangeRow[],
  snapshots: ReadonlyMap<string, CollectorSnapshotRow>,
  sources: ReadonlyMap<string, SourceFacts>,
  competitorNames: ReadonlyMap<string, string>,
): BindResult {
  const changes: RadarChange[] = []
  let unknownKind = 0
  let danglingEvidence = 0

  for (const row of rows) {
    const classified = classify(row)
    if (classified === null) {
      unknownKind += 1
      continue
    }

    const source = sources.get(row.source_id)
    const from = snapshots.get(row.from_snapshot_id)
    const to = snapshots.get(row.to_snapshot_id)
    if (source === undefined || from === undefined || to === undefined) {
      danglingEvidence += 1
      continue
    }

    const toSnapshot = (snap: CollectorSnapshotRow): Snapshot => ({
      id: snap.id,
      // From the SOURCE, not from the change. A snapshot belongs to one
      // competitor and `auditChange` fails a change resting on another's
      // evidence, so the ownership has to come from the row that actually
      // records it.
      competitorId: sources.get(snap.source_id)?.competitorId ?? source.competitorId,
      observedAt: snap.captured_at,
      source: sources.get(snap.source_id)?.locator ?? source.locator,
    })

    changes.push({
      id: row.id,
      competitorId: source.competitorId,
      competitorName: competitorNames.get(source.competitorId) ?? 'Competitor',
      kind: classified.kind,
      // The DAY the change was detected. `detected_at` is when the diff ran,
      // which is the same pass that took the later snapshot.
      observedOn: row.detected_at.slice(0, 10),
      // In the order they were taken: the read that established the before, then
      // the one that found the after.
      evidence: [toSnapshot(from), toSnapshot(to)],
      observation: {
        summary: classified.summary,
        figures: figuresFor(classified.kind, asRecord(row.detail), row.to_snapshot_id),
      },
      // Nothing generates a reading yet — that needs the Brand Brain and a model
      // call. Null is "there is no interpretation", which the screen draws as
      // absent; an empty string would be an interpretation that said nothing.
      reading: null,
    })
  }

  return { changes, dropped: { unknownKind, danglingEvidence } }
}
