/**
 * RADAR'S VOCABULARY — what was SEEN, what was INFERRED, and what was MISSED.
 *
 * ── EVERY FIGURE ON THIS SCREEN IS A CLAIM ABOUT SOMEONE ELSE'S BUSINESS ─────
 * That is what makes Radar the most dangerous screen in this product to model
 * loosely. On `/analytics` a wrong number is the customer's own number, wrong;
 * here it is an assertion about a third party, derived from whatever a public
 * page happened to show on the day a scraper looked at it. The category is full
 * of tools that print "engagement rate" and "estimated spend" for businesses
 * they have never had a single data point about.
 *
 * So the shape below makes the honest thing the ONLY constructible thing:
 *
 *   · An `ObservedFigure` cannot exist without a `snapshotId`. There is no
 *     constructor for a bare number. A figure whose id does not resolve against
 *     the change's own evidence renders as an ABSENCE mark, not as a digit —
 *     see `resolveFigure` in ./evidence.
 *   · A `Reading` — the interpretation — has no numeric field at all. Not a
 *     nullable one, none. An inference that wants to carry a figure has nowhere
 *     to put it, which is the point: "they appear to be pushing weekends" is a
 *     reading, "they posted 4 weekend offers" is an observation, and the two may
 *     never be the same sentence.
 *
 * ── AND A GAP IS A FACT, NOT A ZERO ──────────────────────────────────────────
 * tokens.css's absence vocabulary already draws the distinction this screen
 * lives or dies on: NOT YET MEASURED (a quiet solid rule) is not the same as
 * UNREADABLE (the same rule, broken). A competitor whose page did not load on
 * Tuesday did not have a quiet Tuesday. `ScanAttempt` exists so the feed can say
 * which one happened rather than rendering both as silence.
 */

/** Where a watched business is read from. Each is a public address, nothing more. */
export type CompetitorKind = 'website' | 'instagram' | 'google_business'

export const COMPETITOR_KIND_LABELS: Record<CompetitorKind, string> = {
  website: 'Website',
  instagram: 'Instagram',
  google_business: 'Google Business Profile',
}

/**
 * Is this one of the three kinds Radar can actually read?
 *
 * Derived from `COMPETITOR_KIND_LABELS` rather than written out again, so a
 * fourth kind cannot be added to the labels and be silently rejected here. Added
 * for the onboarding lane, which rehydrates a saved competitor from
 * localStorage — anything on that origin can write it, so the kind arriving back
 * is untrusted input and not a value this code put there.
 */
export function isCompetitorKind(value: unknown): value is CompetitorKind {
  return typeof value === 'string' && value in COMPETITOR_KIND_LABELS
}

/**
 * A business being watched.
 *
 * OWNED BY THE `competitors` TABLE, which the wt-radar lane is building. This is
 * the read shape the screen needs, not the row.
 */
export interface Competitor {
  id: string
  /** What the page calls itself, or what the person typed. Never inferred. */
  name: string
  /** The public address that gets read. */
  url: string
  kind: CompetitorKind
  addedOn: string
  /** ISO timestamp of the last SUCCESSFUL read, or null if there has never been one. */
  lastObservedAt: string | null
}

/**
 * One successful read of one page at one moment — the unit of evidence.
 *
 * OWNED BY `competitor_snapshots` (wt-radar). Nothing in Radar may state a
 * figure that does not point at one of these.
 */
export interface Snapshot {
  id: string
  competitorId: string
  /** When the page was actually fetched. Not when the change was computed. */
  observedAt: string
  /** The exact address read, which may differ from the competitor's home URL. */
  source: string
}

/**
 * A scan that was ATTEMPTED, whatever came of it.
 *
 * FSD M9: "competitor page unavailable -> skip, no charge, notice shown". The
 * notice is only possible because a failed attempt is stored rather than
 * discarded — a scan that vanishes on failure is indistinguishable from a scan
 * that found nothing, and those are different sentences to the reader.
 */
export type ScanOutcome =
  /** The page was read. Snapshots exist for this day. */
  | 'observed'
  /** We asked and the answer did not come back. A GAP. */
  | 'unreachable'
  /** No scan was due or run. Not a failure — an absence of an attempt. */
  | 'not_attempted'

export interface ScanAttempt {
  competitorId: string
  /** The calendar day, workspace-local, that the attempt belongs to. */
  attemptedOn: string
  outcome: ScanOutcome
  /** Why it failed, in the words of whatever failed. Null when it did not. */
  note: string | null
}

/**
 * WHAT KIND OF MOVE THIS IS.
 *
 * Every one of these is a DIFF. There is deliberately no `post_exists` or
 * `page_exists` kind: a list of a competitor's posts is the thing this feature
 * is not. The brief's own sentence for it — "they have posted about weekend
 * offers four times this month and never did before" — is a cadence claim, and
 * it needs a BEFORE to be sayable at all.
 */
export type ChangeKind =
  /** A post appeared that was not there at the previous read. */
  | 'post_published'
  /** How often they post moved between two windows. */
  | 'cadence_shift'
  /** A price visible on a page differs from the price at the previous read. */
  | 'price_changed'
  /** An offer or promotion block appeared that was not there before. */
  | 'offer_appeared'
  /** An offer or promotion block that was there is gone. */
  | 'offer_ended'
  /** Page copy changed in a way that is not covered above. */
  | 'page_changed'

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
  post_published: 'Posted',
  cadence_shift: 'Posting rhythm',
  price_changed: 'Price',
  offer_appeared: 'New offer',
  offer_ended: 'Offer ended',
  page_changed: 'Page edited',
}

/**
 * A number Radar is willing to print, and the evidence it rests on.
 *
 * `snapshotId` IS NOT OPTIONAL AND HAS NO DEFAULT. Making it required is the
 * whole mechanism: the compiler refuses a figure with no provenance, and
 * `resolveFigure` refuses one whose provenance does not resolve. A test can be
 * deleted; a required field has to be actively lied to.
 */
export interface ObservedFigure {
  /** What the number counts, in words. "Weekend offer posts", "Listed price". */
  label: string
  value: number
  /** "posts", "a week", or a currency symbol. Null when the label carries it. */
  unit: string | null
  /** MUST appear in the owning change's `evidence`. */
  snapshotId: string
}

/**
 * What was SEEN. Rendered solid.
 *
 * `summary` is prose and is held to carrying NO digits (see `hasDigit`): every
 * number belongs in `figures`, where it has a snapshot behind it. A summary
 * reading "posted 4 times" would be a figure that slipped past the mechanism by
 * being spelled inside a sentence.
 */
export interface Observation {
  summary: string
  figures: readonly ObservedFigure[]
}

/**
 * What was INFERRED. Rendered hatched, and never without a label.
 *
 * ── WHY THERE IS NO NUMBER HERE, AND WHY THERE IS A `brandBasis` ─────────────
 * P4: "Never tell a customer what a competitor is thinking. Tell them what
 * changed, and what their own brand would say about it." `text` is therefore
 * written from the READER'S side — what their positioning answers with — not as
 * a theory of a stranger's strategy.
 *
 * `brandBasis` names the Brand Brain field the response is grounded in. Without
 * it this is a generic marketing platitude that any tool could print; with it,
 * it is a sentence only a product that holds this workspace's brain can say.
 */
export interface Reading {
  /** The inference. Held to no-digits by the same rule as `Observation.summary`. */
  text: string
  /** The Brand Brain field this is grounded in, or null when nothing grounds it. */
  brandBasis: { field: string; value: string } | null
}

/** One thing that moved. */
export interface RadarChange {
  id: string
  competitorId: string
  competitorName: string
  kind: ChangeKind
  /** The day the change was observed, as the feed groups by. */
  observedOn: string
  /**
   * Every snapshot this change rests on, in the order they were taken.
   *
   * A diff needs two: the read that established the before and the read that
   * found the after. A `post_published` needs only the one that saw the post.
   */
  evidence: readonly Snapshot[]
  observation: Observation
  /** Absent when nothing about this move is worth interpreting. */
  reading: Reading | null
}

/** One day of the feed — the grouping the change list renders under. */
export interface RadarDay {
  /** YYYY-MM-DD. */
  date: string
  changes: readonly RadarChange[]
  /** What happened to each competitor's scan that day. Drives the gap notice. */
  attempts: readonly ScanAttempt[]
}

/**
 * HOW MUCH OF RADAR IS ACTUALLY RUNNING BEHIND THIS SCREEN.
 *
 * THREE STATES, NOT A BOOLEAN, and the third one is why. Ingestion is being
 * built in a parallel lane (wt-radar) and lands in pieces: the watch-list table
 * can exist before the change records this screen renders do. A boolean would
 * force that middle state to pick a side, and both sides are a lie — `true`
 * makes an empty feed read as "nothing has happened to your competitors", and
 * `false` hides a watch list the customer really did enter.
 *
 * "Nothing happened" and "I cannot see whether anything happened" are the exact
 * pair this entire screen exists to keep apart. It would be a poor screen that
 * got it right about a competitor's Tuesday and wrong about itself.
 */
export type CollectorState =
  /** The tables do not exist. Radar is not collecting anything for anyone yet. */
  | 'absent'
  /** The watch list is real and readable; its readings are not wired in yet. */
  | 'watch-list-only'
  /** Fully bound. An empty feed genuinely means nothing changed. */
  | 'reading'

/** EVERYTHING THE RADAR SCREEN READS. */
export interface RadarSnapshot {
  collector: CollectorState
  competitors: readonly Competitor[]
  days: readonly RadarDay[]
}
