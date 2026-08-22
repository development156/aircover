import { z } from 'zod'

import { ChannelSetSchema } from '../db/channel-set'
import type { ActionType } from '../ledger/pricing'

/**
 * THE RECIPE CATALOGUE — curated by us, parameterised by the customer.
 *
 * ── THE ONE SENTENCE THAT SEPARATES THIS FROM A WORKFLOW BUILDER ─────────────
 * A customer cannot author a recipe. They can switch one on, fill in two or
 * three blanks, and turn it off again. Everything a playbook is able to do is
 * decided in this file, reviewed here, and priced here.
 *
 * PRD §5.3 removed the node-based canvas from v1 and replaced it with this. The
 * reasoning is worth keeping next to the code because "automation" makes every
 * reader reach for a graph: people running one shop do not build directed
 * graphs, a canvas competes with Zapier and n8n at high build cost, and the
 * projected Starter-tier usage was near zero.
 *
 * ── THE CATALOGUE IS CODE; THE DATABASE HOLDS ENROLMENTS ────────────────────
 * A `playbooks` row is "this recipe, on, with these parameters" and its
 * `recipe_key` column carries a CHECK constraint listing exactly the keys below.
 * So the fence is not a convention: a row naming a recipe that does not exist
 * cannot be stored, by any route, including psql. Adding a recipe therefore
 * takes a migration, which is deliberate — a new standing instruction that can
 * spend a customer's credits should be reviewed, not configured.
 *
 * ── `blocker` IS A PRODUCT STATE, NOT A FEATURE FLAG ────────────────────────
 * A recipe with a non-null `blocker` names the ONE capability it waits on, in
 * the customer's language, and cannot be enabled. It is rendered as a sentence
 * rather than as a disabled switch: a disabled switch is a dead end wearing the
 * costume of a control.
 */

export const PLAYBOOK_RECIPE_KEYS = [
  'festival_calendar',
  'rss_to_post',
  'review_reply',
  'product_drop',
  'quiet_post_remix',
] as const

export const PlaybookRecipeKeySchema = z.enum(PLAYBOOK_RECIPE_KEYS)
export type PlaybookRecipeKey = z.infer<typeof PlaybookRecipeKeySchema>

/**
 * What sets a playbook off.
 *
 *   manual    a person presses Run
 *   schedule  a cadence, on the cron that demonstrably works
 *   event     something arrives from outside — NOT BUILT, see `EVENT_BLOCKER`
 */
export const PlaybookTriggerKindSchema = z.enum(['manual', 'schedule', 'event'])
export type PlaybookTriggerKind = z.infer<typeof PlaybookTriggerKindSchema>

/**
 * WHY NO RECIPE CAN BE ENROLLED ON AN EVENT TRIGGER YET, in one sentence,
 * verbatim on the screen.
 *
 * Named precisely rather than as "coming soon": the receiver is real work being
 * done on another branch, and this lane deliberately does not reference its
 * tables or import from it.
 */
export const EVENT_BLOCKER =
  'a receiver that can hear a review or a comment arriving from a platform, which is being built separately'

export const PlaybookCadenceSchema = z.enum(['daily', 'weekly'])
export type PlaybookCadence = z.infer<typeof PlaybookCadenceSchema>

/** One blank on the enrolment form. Rendered from this, never hand-written twice. */
export interface PlaybookField {
  name: string
  label: string
  kind: 'channels' | 'number' | 'multi' | 'text'
  help: string
  /** For `multi`: the choices, as value/label pairs. */
  options?: readonly { value: string; label: string }[]
  /** For `number`: the bounds the parameter schema also enforces. */
  min?: number
  max?: number
}

export interface PlaybookRecipe {
  key: PlaybookRecipeKey
  name: string
  group: 'Content' | 'Reviews' | 'Calendar' | 'Commerce'
  /** The three things a recipe is, in the customer's language. */
  when: string
  makes: string
  lands: string
  /** Which triggers this recipe can be enrolled on. */
  triggers: readonly PlaybookTriggerKind[]
  /** null means built and runnable. A sentence names the ONE thing it waits on. */
  blocker: string | null
  /**
   * The paid action a single OUTPUT charges, on top of the per-run charge.
   *
   * Charged per included item and ONLY when the Autonomy Dial has the run write
   * a draft — at L0 a run produces suggestions, makes no model call, and this
   * action is not charged. See `lib/playbooks/cost.ts`.
   */
  outputAction: ActionType
  fields: readonly PlaybookField[]
  /** Parses `playbooks.params`. A recipe with no parameters uses an empty object. */
  paramsSchema: z.ZodType
}

const CHANNEL_FIELD: PlaybookField = {
  name: 'channels',
  label: 'Which channels',
  kind: 'channels',
  help: 'Where the drafts are written for. Your Autonomy Dial still decides what happens to them.',
}

/** Every recipe's parameters carry the channels its outputs are written for. */
const BaseParamsSchema = z.object({ channels: ChannelSetSchema })

export const FestivalParamsSchema = BaseParamsSchema.extend({
  calendars: z.array(z.enum(['india', 'global'])).min(1),
  /** How many days of warning. Bounded so a run cannot sweep a whole year at once. */
  lead_days: z.number().int().min(1).max(30),
})
export type FestivalParams = z.infer<typeof FestivalParamsSchema>

export const PLAYBOOK_RECIPES: readonly PlaybookRecipe[] = [
  {
    key: 'festival_calendar',
    name: 'The festival calendar',
    group: 'Calendar',
    when: 'A festival or holiday your customers keep is coming up.',
    makes: 'A draft tied to what you actually sell, not a stock greeting.',
    lands: 'Your Planner, early enough to change your mind.',
    triggers: ['manual', 'schedule'],
    blocker: null,
    outputAction: 'post_variants',
    fields: [
      {
        name: 'calendars',
        label: 'Which calendars',
        kind: 'multi',
        help: 'Fixed-date observances only. The moving festivals are named below and are not covered.',
        options: [
          { value: 'india', label: 'India' },
          { value: 'global', label: 'Global' },
        ],
      },
      {
        name: 'lead_days',
        label: 'Days of warning',
        kind: 'number',
        help: 'How far ahead to draft. Longer means more notice and more drafts per run.',
        min: 1,
        max: 30,
      },
      CHANNEL_FIELD,
    ],
    paramsSchema: FestivalParamsSchema,
  },
  {
    key: 'rss_to_post',
    name: 'New article, new post',
    group: 'Content',
    when: 'Something new appears on a feed you follow — your own blog, an industry site.',
    makes: 'A short post in your voice, with your take rather than a summary.',
    lands: 'Your Planner as a draft.',
    triggers: ['manual', 'schedule'],
    blocker:
      'a feed reader that is safe to point at any address you type, which is a piece of security work rather than a piece of drafting work',
    outputAction: 'post_variants',
    fields: [
      { name: 'feed_url', label: 'Feed address', kind: 'text', help: 'The feed to watch.' },
      CHANNEL_FIELD,
    ],
    paramsSchema: BaseParamsSchema.extend({ feed_url: z.url() }),
  },
  {
    key: 'review_reply',
    name: 'New review, reply ready',
    group: 'Reviews',
    when: 'A review arrives on Google Business Profile.',
    makes: 'A reply written for that review, in your voice, never sent on its own.',
    lands: 'Your Inbox, as a draft reply you approve.',
    triggers: ['event'],
    blocker: EVENT_BLOCKER,
    outputAction: 'inbox_reply',
    fields: [
      {
        name: 'ratings',
        label: 'Which ratings to draft for',
        kind: 'multi',
        help: 'A one-star review and a five-star review want different replies.',
      },
    ],
    paramsSchema: BaseParamsSchema.extend({ ratings: z.array(z.number().int().min(1).max(5)) }),
  },
  {
    key: 'product_drop',
    name: 'New product, small campaign',
    group: 'Commerce',
    when: 'You add a product, or a form on your site tells Sahoda one has landed.',
    makes: 'A three-post run: the tease, the launch, the reminder.',
    lands: 'A campaign, with the three posts grouped under it.',
    triggers: ['event', 'manual'],
    blocker:
      'somewhere for Sahoda to learn that a product exists — a catalogue connection or a form on your site',
    outputAction: 'post_variants',
    fields: [
      {
        name: 'spread_days',
        label: 'How many days to spread it over',
        kind: 'number',
        help: 'The tease, the launch and the reminder are placed across this many days.',
        min: 2,
        max: 30,
      },
      CHANNEL_FIELD,
    ],
    paramsSchema: BaseParamsSchema.extend({ spread_days: z.number().int().min(2).max(30) }),
  },
  {
    key: 'quiet_post_remix',
    name: 'A quiet post, remade',
    group: 'Content',
    when: 'A post does clearly worse than your own recent average.',
    makes: 'A handful of different angles on the same idea, through Remix.',
    lands: 'Your Planner as drafts, for you to pick from.',
    triggers: ['schedule'],
    blocker: 'the Remix engine, which turns one piece into many and is not merged yet',
    outputAction: 'remix_pack',
    fields: [
      {
        name: 'below_pct',
        label: 'How far below average counts',
        kind: 'number',
        help: 'A post this far under your own recent average is the one it remakes.',
        min: 10,
        max: 90,
      },
      CHANNEL_FIELD,
    ],
    paramsSchema: BaseParamsSchema.extend({ below_pct: z.number().int().min(10).max(90) }),
  },
] as const

const BY_KEY = new Map(PLAYBOOK_RECIPES.map((r) => [r.key, r]))

/**
 * The recipe for a key, or undefined.
 *
 * Returns undefined rather than throwing, because the one caller that can be
 * handed an unknown key is a reader of a stored row — and a row naming a retired
 * recipe should render as "this recipe is no longer offered", not crash the
 * screen that lists it beside four healthy ones.
 */
export function playbookRecipe(key: string): PlaybookRecipe | undefined {
  return BY_KEY.get(key as PlaybookRecipeKey)
}

/** Recipes that can actually run today. The catalogue minus everything blocked. */
export function runnableRecipes(): PlaybookRecipe[] {
  return PLAYBOOK_RECIPES.filter((r) => r.blocker === null)
}

/**
 * Whether a recipe may be enrolled at all.
 *
 * A single function rather than `recipe.blocker === null` written at each call
 * site, so the rule has one home. The database enforces the same thing from the
 * other side (`playbooks_enabled_recipe_is_runnable`), and the two are checked
 * against each other in `recipes.test.ts`.
 */
export function isRunnable(recipe: PlaybookRecipe): boolean {
  return recipe.blocker === null
}
