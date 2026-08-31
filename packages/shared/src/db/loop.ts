import { z } from 'zod'

import { ChannelSchema } from '../enums'
import { ChannelSetSchema } from './channel-set'

/**
 * THE LOOP — the weekly cycle this product is named around (FSD M2, PRD M2).
 *
 * ── A NEW FILE, ON PURPOSE ───────────────────────────────────────────────────
 * Three other lanes are editing this package right now. Everything below is
 * ADDITIVE: a new module, re-exported from `db/index.ts` by one added line. No
 * existing export changes shape, no existing enum gains a member, and nothing
 * here is imported by any file that existed before this lane. A lane that never
 * pulls this branch is unaffected by every line of it.
 */

// ── the Autonomy Dial ────────────────────────────────────────────────────────

/**
 * How much Sahoda may do without asking, per channel (FSD §0.2).
 *
 * ── FOUR NAMES, THREE VALUES, AND THE GAP IS THE POINT ───────────────────────
 * The spec has four levels. This schema accepts three. `20260820000200`'s check
 * constraint is `level >= 0 and level <= 2`, so a 3 cannot be stored by any
 * route into the column — and a zod schema that accepted one would let a value
 * travel all the way from a form to a database round-trip before failing, with
 * the failure surfacing as a raw constraint violation rather than as a refusal
 * anyone wrote.
 *
 * ── L3 IS STORABLE NOW, AND THE PARAGRAPH ABOVE IS WHY THAT COST WORK ────────
 * `20260828120000_loop_autopilot_l3.sql` widened the column to 0-3 and put a
 * trigger in front of it that refuses three NAMED ways:
 * AUTOPILOT_NEEDS_SUPERVISED_CYCLE, AUTOPILOT_NEEDS_BRAIN and
 * AUTOPILOT_BRAIN_UNCONFIRMED. Opening this union without translating those
 * would have produced exactly the defect described above — a customer pressing
 * Autopilot and reading a Postgres error string. `setChannelAutonomy` names all
 * three and its tests assert the sentences, so the refusal a person meets is
 * one somebody wrote.
 *
 * The DEFAULT is still L1. Nothing moves to autopilot by upgrade, and the
 * database still refuses a workspace that has not earned it.
 */
export const AutonomyLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
export type AutonomyLevel = z.infer<typeof AutonomyLevelSchema>

/** FSD §0.2: "Default L1" — Sahoda writes, and nothing it writes reaches anyone. */
export const DEFAULT_AUTONOMY_LEVEL: AutonomyLevel = 1

/**
 * The ladder as the customer reads it, INCLUDING the rung that does not ship.
 *
 * `storable` is the one field a screen must branch on. It is not a styling hint:
 * it is the difference between a control and a description, and the Loop screen
 * renders an unstorable level as text rather than as a disabled button — a
 * disabled button is a dead end wearing the costume of a control.
 */
export const AUTONOMY_LEVELS = [
  {
    level: 0,
    code: 'L0',
    name: 'Suggest',
    storable: true,
    may: 'Sahoda brings you ideas and briefs. It writes nothing.',
    needs: 'Nothing. This is the quietest setting.',
  },
  {
    level: 1,
    code: 'L1',
    name: 'Draft',
    storable: true,
    may: 'Sahoda writes full drafts and leaves them in your Planner.',
    needs: 'Nothing. Everything still waits for you to open it.',
  },
  {
    level: 2,
    code: 'L2',
    name: 'Approve to publish',
    storable: true,
    may: 'Sahoda schedules the week and publishes each post once you approve it.',
    needs:
      'Your approval, before the slot passes. Anything you leave expires rather than going out.',
  },
  {
    level: 3,
    code: 'L3',
    name: 'Autopilot',
    storable: true,
    may: 'Sahoda publishes without asking, inside the limits you set. You get a few minutes to stop each post before it goes.',
    needs:
      'One week you have already run and reported yourself, and a Brand Brain with your promise, your customer, your voice and your red lines confirmed. Sahoda checks all four before it accepts this setting.',
  },
] as const

export const LoopSettingsSchema = z.object({
  workspace_id: z.uuid(),
  paused: z.boolean(),
  weekly_budget_credits: z.number().int(),
  plan_at_minute: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type LoopSettings = z.infer<typeof LoopSettingsSchema>

/** FSD M2 Controls: "weekly budget slider (default 150 cr)". */
export const DEFAULT_WEEKLY_BUDGET_CREDITS = 150
/** Matches the column's own ceiling; the largest monthly grant any plan carries. */
export const MAX_WEEKLY_BUDGET_CREDITS = 5000

/**
 * THE TWO PROMISES AUTOPILOT MAKES, AND THEIR LIMITS.
 *
 * Every number here mirrors a CHECK in `20260828120000_loop_autopilot_l3.sql`.
 * They are declared once, in the source of truth, so a form and a column cannot
 * disagree about what is allowed — the disagreement being the case where a
 * customer reads a constraint violation instead of a sentence somebody wrote.
 *
 * The DEFAULTS are the column defaults, not a second opinion. A workspace that
 * has never touched these is running at three a day and thirty minutes, and the
 * screen must show those figures rather than an empty field, because an empty
 * field reads as "no limit".
 */
export const DEFAULT_AUTOPILOT_DAILY_CAP = 3
export const MIN_AUTOPILOT_DAILY_CAP = 0
export const MAX_AUTOPILOT_DAILY_CAP = 20

export const DEFAULT_AUTOPILOT_CANCEL_MINUTES = 30
/**
 * Five, and the reason it is not lower is not the column.
 *
 * `AUTOPILOT_CANCEL_FLOOR_MINUTES` clamps to the same number for a different
 * reason — a zero reaching the decision code would announce and dispatch in the
 * same instant, autopilot with no cancel wearing the costume of one.
 *
 * A window this short is a promise the SCHEDULE cannot keep tightly: the tick
 * runs every ten minutes, so a five-minute window closes between ticks and the
 * post goes out on the next one. That is later than promised, never earlier,
 * which is the safe direction — but copy near this control must not claim a
 * post goes out the moment the window closes.
 */
export const MIN_AUTOPILOT_CANCEL_MINUTES = 5
/** One day. Beyond this a "cancel window" is just a delay. */
export const MAX_AUTOPILOT_CANCEL_MINUTES = 1440

export const LoopChannelAutonomySchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  channel: ChannelSchema,
  level: AutonomyLevelSchema,
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type LoopChannelAutonomy = z.infer<typeof LoopChannelAutonomySchema>

// ── the cycle ────────────────────────────────────────────────────────────────

/**
 * Where the machine is. Character-identical to the check constraint in
 * `20260820000300_loop_cycles.sql`.
 *
 * `awaiting_cost_approval` is the halt, and it is the reason this is a stored
 * status rather than something derived from which columns are filled. A cycle
 * sits here with its briefs priced and nothing spent, for as long as it takes
 * someone to look.
 */
export const LoopCycleStatusSchema = z.enum([
  'collecting',
  'reflecting',
  'planning',
  'awaiting_cost_approval',
  'creating',
  'testing',
  'staging',
  'reported',
  'cancelled',
  'failed',
])
export type LoopCycleStatus = z.infer<typeof LoopCycleStatusSchema>

/** A cycle that is over. Nothing advances one of these, and the kill switch skips them. */
export const TERMINAL_CYCLE_STATUSES = ['reported', 'cancelled', 'failed'] as const

export const LoopCycleSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  iso_year: z.number().int(),
  iso_week: z.number().int(),
  status: LoopCycleStatusSchema,
  trigger_source: z.enum(['schedule', 'manual']),
  estimated_credits: z.number().int().nullable(),
  cost_approved_at: z.string().nullable(),
  cost_approved_by: z.string().nullable(),
  approved_credits: z.number().int().nullable(),
  spent_credits: z.number().int(),
  budget_credits: z.number().int().nullable(),
  failure_reason: z.string().nullable(),
  /**
   * TRUE means the Reflect stage found no metric history for the window and
   * therefore ran NO insight pass and called NO model.
   *
   * This is a fact the CMO Report has to state, because "there were no
   * learnings" and "there was nothing to learn from" are different sentences and
   * only one of them is an admission that the product has nothing yet. Storing
   * it makes the report's wording a lookup rather than an inference.
   */
  reflect_skipped_no_history: z.boolean(),
  started_at: z.string(),
  reported_at: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type LoopCycle = z.infer<typeof LoopCycleSchema>

/** What happened to a brief at the staging step, per the Autonomy Dial. */
export const LoopBriefOutcomeSchema = z.enum([
  'planned',
  'suggested',
  'drafted',
  'awaiting_approval',
  'skipped',
  'failed',
])
export type LoopBriefOutcome = z.infer<typeof LoopBriefOutcomeSchema>

export const LoopBriefSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  cycle_id: z.uuid(),
  priority: z.number().int(),
  title: z.string(),
  body: z.string(),
  /**
   * Parsed through `ChannelSetSchema`, so what a reader receives is a
   * `ChannelSet` — a deduplicated branded array — and never a raw `string[]`.
   *
   * The database refuses a duplicate in this column too
   * (`loop_briefs_channels_is_set`), so this is the second of two guards rather
   * than the only one. Both are here because they fail in different directions:
   * the constraint stops a bad row being WRITTEN, and this stops a consumer
   * treating a good row as a list when it is a set. Three shipped defects in
   * this product came from the second kind.
   */
  channels: ChannelSetSchema,
  suggested_slot: z.string().nullable(),
  rationale: z.string().nullable(),
  estimated_credits: z.number().int(),
  included: z.boolean(),
  post_id: z.uuid().nullable(),
  stage_outcome: LoopBriefOutcomeSchema,
  created_at: z.string(),
  updated_at: z.string(),
})
export type LoopBrief = z.infer<typeof LoopBriefSchema>

// ── the learning a cycle proposes ────────────────────────────────────────────

/**
 * The `diff` a Reflect learning carries, stored in `memory_events.diff`.
 *
 * ── EVERY FIELD IS EVIDENCE, AND THAT IS THE CONTRACT ────────────────────────
 * A learning is a claim about the customer's own business — "your Tuesday posts
 * reach more people than your Friday ones" — and that is the one class of
 * statement this product may never invent. So the envelope cannot be assembled
 * from a model's prose alone: `evidence` is required, it names the rows the
 * claim was computed from, and a learning whose evidence is empty is refused
 * before it is ever offered to anyone.
 *
 * `patch` is what would change in the Brand Brain if the person accepts. It is
 * deep-merged by `public.resolve_memory_event`, so it may name one field of one
 * section without disturbing its siblings.
 */
export const LoopLearningEvidenceSchema = z.object({
  /** How many measurements the claim was computed from. Never zero. */
  sample_size: z.number().int().min(1),
  /** The days the measurements span, so the report can say how thin the base is. */
  window_days: z.number().int().min(1),
  /** The posts involved, so a reader can go and look at them. */
  post_ids: z.array(z.uuid()),
  /** The metric that was compared, e.g. 'impressions'. */
  metric: z.string().min(1),
})
export type LoopLearningEvidence = z.infer<typeof LoopLearningEvidenceSchema>

export const LoopLearningDiffSchema = z.object({
  kind: z.literal('brand_memory_patch'),
  /** One sentence, in the customer's language, of what was noticed. */
  summary: z.string().min(1),
  /** The cycle that proposed it — the link the CMO Report follows back. */
  loop_cycle_id: z.uuid(),
  evidence: LoopLearningEvidenceSchema,
  /** Non-empty: a patch that changes nothing is not a learning worth asking about. */
  patch: z.record(z.string(), z.unknown()).refine((p) => Object.keys(p).length > 0, {
    message: 'a learning must propose a change',
  }),
})
export type LoopLearningDiff = z.infer<typeof LoopLearningDiffSchema>
