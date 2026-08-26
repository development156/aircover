import { z } from 'zod'

/**
 * THE MARKETING BRAIN'S UNIT OF KNOWLEDGE — one observation.
 *
 * ── WHY THIS IS NOT PART OF THE BRAND BRAIN ──────────────────────────────────
 * docs/51 settled it: the Brand Brain's job is to keep the brand ORIGINAL, and
 * every one of its fifteen leaves is a thing a person wrote or approved about
 * who they are. The Marketing Brain's job is to notice what is TRUE about how
 * that brand is performing, which nobody wrote and nobody approves. Mixing them
 * would mean a computed fact could overwrite a founder's own sentence, and the
 * proposal queue exists precisely so that never happens without a click.
 *
 * So an observation is stored apart, is never user-editable, and reaches the
 * Brand Brain only as a PROPOSAL through the queue that already exists.
 *
 * ── EVERY OBSERVATION CARRIES THE NUMBERS IT WAS COMPUTED FROM ───────────────
 * `evidence` is not decoration and it is not a log line. It is the difference
 * between this product and an agency's assertion: a customer reading "you have
 * stopped using exclamation marks" can be shown the twelve in April and the zero
 * since June, from their own captions. A row that cannot show its arithmetic is
 * a row that should not have been written, which is why `evidence` is required
 * and why the schema below refuses an empty one.
 */

/**
 * The kinds of thing the Marketing Brain may notice.
 *
 * Deliberately a closed set, and deliberately short. Each kind is a separate
 * small function with its OWN evidence floor — there is no generic "insight"
 * computer, because a floor that fits a tone measurement does not fit a
 * performance comparison, and a shared one would be wrong for both.
 *
 * Adding a kind means writing its computer and its floor, in that order.
 */
export const OBSERVATION_KINDS = [
  /** A measurable drift in how the business writes. Arithmetic over published text. */
  'tone_drift',
  /**
   * How much the customer rewrites what Sahoda drafted, and whether that is
   * falling. Arithmetic over `posts.generated_body` against `posts.body`; needs
   * no model call. REQUESTS.md §22 names this the measure that keeps the
   * corrections moat honest rather than decorative.
   */
  'edit_distance',
  /**
   * Which channel returns more attention per person reached. Arithmetic over
   * `post_metric_snapshots`, which the platforms reported; no model call.
   *
   * The first kind that answers "did it work" rather than "how do you write".
   * docs/55 records why that matters: a measurement earns its place only by
   * naming the decision it changes, and this one names spending the next
   * evening on the channel that pays.
   */
  'channel_return',
] as const

export type ObservationKind = (typeof OBSERVATION_KINDS)[number]

/**
 * One number behind a claim, with the label the reader sees.
 *
 * `value` is a number and not a string on purpose: the screen formats it with
 * `tabular-nums` and decides its own precision. A computer that stored "12
 * times" here would have made a copy decision inside a maths function, in a
 * place no copy rule is watching.
 */
export const observationDatumSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.number().finite(),
  /** What `value` counts. Used by the screen to choose a unit, never printed raw. */
  unit: z.enum(['count', 'per_post', 'ratio', 'days']),
})

export type ObservationDatum = z.infer<typeof observationDatumSchema>

/**
 * The arithmetic behind one observation.
 *
 * At least two data points, always. A single number is not evidence of a change
 * — "you used twelve exclamation marks" is a fact about a period, and the claim
 * being made is always a comparison between periods. Requiring two here means a
 * computer physically cannot write a row whose claim outruns its arithmetic.
 */
export const observationEvidenceSchema = z.object({
  data: z.array(observationDatumSchema).min(2).max(8),
  /** Posts the numbers came from. The receipt a doubting customer can be shown. */
  postIds: z.array(z.string().uuid()).min(1),
  /** Days the comparison spans, end to end. A drift over 6 days is not a drift. */
  windowDays: z.number().int().positive(),
})

export type ObservationEvidence = z.infer<typeof observationEvidenceSchema>

/**
 * One row of `marketing_observations`, as the application sees it.
 *
 * `subject` is what the observation is ABOUT, in machine terms — here the name
 * of the measured trait. It exists so the store can be idempotent: recomputing
 * the same week must update one row rather than append a second copy of the same
 * finding, and (workspace, kind, subject, computed_on) is what makes that true.
 */
export const marketingObservationSchema = z.object({
  kind: z.enum(OBSERVATION_KINDS),
  subject: z.string().min(1).max(80),
  /**
   * The finding, as one sentence, computed — never phrased by a model.
   *
   * The bound is 240 rather than 500 because this is read on a report page
   * inside a paragraph, not in a feed row. A claim that needs more than two
   * lines is two claims.
   */
  claim: z.string().min(1).max(240),
  evidence: observationEvidenceSchema,
  computedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'computedOn must be YYYY-MM-DD'),
})

export type MarketingObservation = z.infer<typeof marketingObservationSchema>
