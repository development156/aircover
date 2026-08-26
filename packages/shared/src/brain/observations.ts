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
  /**
   * Whether the audience is growing, shrinking or flat. Arithmetic over the
   * `total` series in `audience_snapshots`; no model call.
   *
   * ── IT DIFFS THE TOTAL, IT DOES NOT READ `gained` AND `lost` ────────────────
   * Those two buckets exist and are the obvious source. MEASURED in production
   * 2026-08-26: every one of the 14 `gained` rows and all 14 `lost` rows holds
   * ZERO, while `total` moves. Reading them would have produced a computer that
   * declines forever for a reason no one could see.
   *
   * The only kind so far whose receipt is not a list of posts. See
   * `OBSERVATION_BASIS`.
   */
  'audience_growth',
  /**
   * Which shape of caption earns more attention. Arithmetic over caption length
   * against `post_metric_snapshots`; no model call.
   *
   * The pair to `channel_return`: that one says WHERE to spend the next hour,
   * this says what to write when you get there. Split at the customer's own
   * median rather than a fixed character count, because "short" differs between
   * a bakery and a law firm and any constant would be wrong for one of them.
   */
  'format_effect',
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
  /**
   * Posts the numbers came from. The receipt a doubting customer can be shown.
   *
   * EMPTY IS LEGAL, AND ONLY FOR A KIND WHOSE BASIS IS NOT POSTS. See
   * `OBSERVATION_BASIS` below: the length rule moved off this field and onto the
   * row, because whether a post list is required depends on what was measured.
   */
  postIds: z.array(z.string().uuid()),
  /** Days the comparison spans, end to end. A drift over 6 days is not a drift. */
  windowDays: z.number().int().positive(),
})

export type ObservationEvidence = z.infer<typeof observationEvidenceSchema>

/**
 * What a claim was computed FROM, which decides what its receipt has to be.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `postIds` used to be `.min(1)` on every row, which encoded a true rule for the
 * only kinds that existed: every one of them counted something inside posts, so
 * a claim with no posts behind it was a claim with no arithmetic behind it.
 *
 * `audience_growth` broke that. It counts followers, which are not posts, and it
 * would have had two ways to satisfy a post-shaped receipt and both are lies.
 * Ship an empty list and the guarantee is gone for every kind at once. Cite the
 * posts published during the window and the row now IMPLIES THOSE POSTS CAUSED
 * THE GROWTH — a causal claim from a correlation this product never measured,
 * and exactly the fabricated confidence `tone-drift.ts` refuses at the top.
 *
 * So the rule became conditional rather than looser. A posts-basis kind must
 * still name at least one post. An audience-basis kind must name NONE, which is
 * the stronger half: it is not permission to omit the receipt, it is a
 * prohibition on borrowing a receipt that belongs to a different claim.
 *
 * ── IT CANNOT DRIFT ──────────────────────────────────────────────────────────
 * `satisfies Record<ObservationKind, ObservationBasis>` makes a new kind a
 * COMPILE ERROR until it declares what it measured. That is deliberate: this
 * file's own header says adding a kind means writing its computer and its floor,
 * and this adds a third thing that cannot be forgotten.
 */
export const OBSERVATION_BASIS = {
  tone_drift: 'posts',
  edit_distance: 'posts',
  channel_return: 'posts',
  audience_growth: 'audience',
  format_effect: 'posts',
} as const satisfies Record<ObservationKind, 'posts' | 'audience'>

export type ObservationBasis = (typeof OBSERVATION_BASIS)[ObservationKind]

/** What the customer can be shown to check a claim of this kind. */
export function basisOf(kind: ObservationKind): ObservationBasis {
  return OBSERVATION_BASIS[kind]
}

/**
 * One row of `marketing_observations`, as the application sees it.
 *
 * `subject` is what the observation is ABOUT, in machine terms — here the name
 * of the measured trait. It exists so the store can be idempotent: recomputing
 * the same week must update one row rather than append a second copy of the same
 * finding, and (workspace, kind, subject, computed_on) is what makes that true.
 */
export const marketingObservationSchema = z
  .object({
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
  .superRefine((row, ctx) => {
    /**
     * The receipt rule, enforced on the ROW because it needs the kind to decide.
     * Both directions are failures and the messages say which, because "wrong
     * receipt" and "no receipt" send a developer to different places.
     */
    const basis = OBSERVATION_BASIS[row.kind]
    if (basis === 'posts' && row.evidence.postIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['evidence', 'postIds'],
        message: `${row.kind} is computed from posts and must name at least one`,
      })
    }
    if (basis === 'audience' && row.evidence.postIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['evidence', 'postIds'],
        message:
          `${row.kind} is not computed from posts; citing them would imply ` +
          'they caused the change, which was never measured',
      })
    }
  })

export type MarketingObservation = z.infer<typeof marketingObservationSchema>
