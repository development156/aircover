import { z } from 'zod'

import { ChannelSetSchema } from './channel-set'
import {
  PlaybookCadenceSchema,
  PlaybookRecipeKeySchema,
  PlaybookTriggerKindSchema,
} from '../playbooks/recipes'

/**
 * M10 · PLAYBOOKS — the stored side of the recipe library.
 *
 * ── THREE TABLES, AND WHY THE THIRD EXISTS ───────────────────────────────────
 * `playbooks` is an ENROLMENT — one recipe, switched on for one workspace, with
 * its blanks filled. `playbook_runs` is one firing of it. `playbook_run_items`
 * is one thing that firing proposed to make.
 *
 * The third table is what makes two other things possible and is not a
 * decomposition for its own sake. The cost preview needs a PRICE PER LINE,
 * because a total a person cannot decompose is a total they cannot trim; and the
 * kill switch needs a POST LINK it can scope by, because scoping by
 * `posts.origin` would sweep up work the customer did by hand. Neither survives
 * being folded into a jsonb array on the run.
 *
 * ── EVERYTHING HERE IS ADDITIVE ──────────────────────────────────────────────
 * A new module, one added line in `db/index.ts`, and one member added to
 * `PostOriginSchema`. No existing export changes shape.
 */

// ── the enrolment ────────────────────────────────────────────────────────────

export const PlaybookSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  /**
   * Which curated recipe this is. The column carries a CHECK constraint holding
   * exactly `PLAYBOOK_RECIPE_KEYS`, so this schema and the database refuse the
   * same set — and `recipes.test.ts` asserts the two lists are identical rather
   * than trusting that they were kept in step by hand.
   */
  recipe_key: PlaybookRecipeKeySchema,
  enabled: z.boolean(),
  /**
   * The blanks, as the recipe's own `paramsSchema` defines them.
   *
   * Deliberately UNPARSED here. A row schema cannot know which recipe's shape to
   * apply until it has read `recipe_key` from the same row, so the second parse
   * happens at the point of use, through `playbookRecipe(key).paramsSchema`. A
   * discriminated union would work and was rejected: it would put the parameter
   * shapes in two files and make adding a recipe a two-file edit.
   */
  params: z.record(z.string(), z.unknown()),
  trigger_kind: PlaybookTriggerKindSchema,
  /** Set exactly when `trigger_kind` is 'schedule'; the database checks the pair. */
  cadence: PlaybookCadenceSchema.nullable(),
  last_run_at: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Playbook = z.infer<typeof PlaybookSchema>

// ── one firing ───────────────────────────────────────────────────────────────

/**
 * Where a run is. Character-identical to the check constraint in
 * `20260822030000_playbooks.sql`.
 *
 * `awaiting_cost_approval` IS THE HALT, and it is the reason this is a stored
 * status rather than something derived. A run sits there with its items priced
 * and NOTHING SPENT, for as long as it takes someone to look. A preview a person
 * never saw and a preview they approved have to be distinguishable by a query,
 * days later, by a different process — which a React state cannot be.
 *
 * `nothing_to_do` is an ENDING, not a failure. A scheduled run that finds no
 * festival in its window did its job; charging for it, or filing it beside the
 * failures, would both be lies of a different kind.
 */
export const PlaybookRunStatusSchema = z.enum([
  'proposing',
  'awaiting_cost_approval',
  'running',
  'completed',
  'nothing_to_do',
  'cancelled',
  'failed',
])
export type PlaybookRunStatus = z.infer<typeof PlaybookRunStatusSchema>

/** A run that is over. Nothing advances one of these. */
export const TERMINAL_RUN_STATUSES = ['completed', 'nothing_to_do', 'cancelled', 'failed'] as const

/**
 * A run that is still going, and therefore holds the one-live-run slot.
 *
 * ── A KNOWN STATE, WRITTEN DOWN RATHER THAN LEFT TO BE DISCOVERED ───────────
 * `awaiting_cost_approval` is in this list, and a run APPROVED BUT NEVER RUN
 * stays there. So a person who approves a preview and then never presses "Write
 * the drafts" holds their playbook's only slot indefinitely, and its schedule
 * quietly stops opening new runs.
 *
 * That is the correct behaviour of the two rules that produce it — a preview
 * waiting on somebody is live work, and one live run per playbook is what stops
 * a customer being charged twice for one festival — and the scheduled runner
 * counts it as `alreadyRunning` rather than hiding it. It is still a state
 * somebody will meet in November and read as a bug, so it is named here. The fix
 * when it is wanted is an expiry on an un-run approval, not a wider slot.
 */
export const LIVE_RUN_STATUSES = ['proposing', 'awaiting_cost_approval', 'running'] as const

export const PlaybookRunSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  playbook_id: z.uuid(),
  /**
   * Copied from the playbook at run time rather than joined.
   *
   * A recipe can be retired from the catalogue, and the record of what ran and
   * what it charged has to keep making sense afterwards. Not validated against
   * `PlaybookRecipeKeySchema` here for that same reason — a run of a retired
   * recipe must still parse, or the history screen breaks the day a key is
   * dropped.
   */
  recipe_key: z.string(),
  trigger_source: PlaybookTriggerKindSchema,
  /**
   * What set it off, in the recipe's own vocabulary — for the festival calendar,
   * which festival and on what date. This is the answer to "why did this run",
   * which is the first question anyone asks about a charge.
   */
  trigger_detail: z.record(z.string(), z.unknown()),
  status: PlaybookRunStatusSchema,
  estimated_credits: z.number().int().nullable(),
  cost_approved_at: z.string().nullable(),
  cost_approved_by: z.string().nullable(),
  /**
   * What the estimate had become by the time it was approved. Stored separately
   * from `estimated_credits` so the difference between "we proposed 11" and
   * "they approved 8" is a record that the trim happened and was theirs.
   */
  approved_credits: z.number().int().nullable(),
  /**
   * A convenience mirror for the history screen, accumulated as the run charges.
   * `credit_ledger` remains the only truth about money and this decides nothing.
   */
  spent_credits: z.number().int(),
  failure_reason: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type PlaybookRun = z.infer<typeof PlaybookRunSchema>

// ── one thing a run proposed to make ─────────────────────────────────────────

/**
 * What became of an item.
 *
 *   proposed           priced, waiting on the preview
 *   suggested          L0 — the item IS the suggestion; no draft, no charge
 *   drafted            L1 — a draft in the Planner, unscheduled
 *   awaiting_approval  L2 — scheduled, waiting on the customer's approval
 *   skipped            trimmed out of the preview, or the run was cancelled
 *   failed             the draft could not be written; nothing was charged
 */
export const PlaybookItemOutcomeSchema = z.enum([
  'proposed',
  'suggested',
  'drafted',
  'awaiting_approval',
  'skipped',
  'failed',
])
export type PlaybookItemOutcome = z.infer<typeof PlaybookItemOutcomeSchema>

export const PlaybookRunItemSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  run_id: z.uuid(),
  /** Position in the run's order, and the order a budget trim would work down. */
  position: z.number().int(),
  title: z.string(),
  body: z.string(),
  /**
   * Read as a SET, never a list. The database refuses duplicates in the column
   * too, so this is the second of two guards — the constraint stops a bad row
   * being written, this stops a consumer treating a good row as a list.
   */
  channels: ChannelSetSchema,
  suggested_slot: z.string().nullable(),
  /**
   * What turning THIS item into a draft will cost. Zero is legitimate and
   * meaningful: at L0 the item is a suggestion, no model is called, and a
   * preview that quoted a price for it would be quoting for work nobody does.
   */
  estimated_credits: z.number().int(),
  included: z.boolean(),
  post_id: z.uuid().nullable(),
  outcome: PlaybookItemOutcomeSchema,
  created_at: z.string(),
  updated_at: z.string(),
})
export type PlaybookRunItem = z.infer<typeof PlaybookRunItemSchema>
