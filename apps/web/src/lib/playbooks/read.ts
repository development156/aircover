import 'server-only'

import {
  DEFAULT_AUTONOMY_LEVEL,
  PLAYBOOK_RECIPES,
  playbookRecipe,
  type AutonomyLevel,
  type Channel,
  type PlaybookRecipe,
} from '@sahoda/shared'

import { governingLevel } from '@/lib/loop/governing-level'
import { itemCost } from './cost'
import * as store from './store'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * WHAT THE SCREEN NEEDS, IN ONE READ.
 *
 * ── THE CATALOGUE IS JOINED TO THE ENROLMENTS, NOT REPLACED BY THEM ─────────
 * Every recipe appears, always, whether or not this workspace has switched it
 * on. A library that only showed what you had already chosen would be a settings
 * page; the point of a library is that the things you have not chosen are
 * visible next to the things you have.
 */

export interface RecipeView {
  recipe: PlaybookRecipe
  /** The enrolment, when this workspace has one. */
  playbook: store.PlaybookRow | null
  /**
   * What one output would cost at the dial's current setting, or null when the
   * recipe is blocked and therefore has no run to price.
   *
   * Derived from the SAME `itemCost` the proposal uses, so the figure on the card
   * and the figure in the preview cannot disagree.
   */
  itemCredits: number | null
}

export interface PlaybooksSnapshot {
  recipes: RecipeView[]
  /** The run waiting on a person's approval, if there is one. */
  liveRun: store.RunWithItems | null
  history: store.RunWithItems[]
  availableCredits: number | null
  /** The governing autonomy level across the channels the enrolments target. */
  level: AutonomyLevel
}

async function readDial(workspaceId: string): Promise<Map<Channel, AutonomyLevel>> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('loop_channel_autonomy')
    .select('channel, level')
    .eq('workspace_id', workspaceId)
  const dial = new Map<Channel, AutonomyLevel>()
  for (const row of data ?? []) dial.set(row.channel as Channel, row.level as AutonomyLevel)
  return dial
}

export async function readPlaybooksSnapshot(workspaceId: string): Promise<PlaybooksSnapshot> {
  const [rows, liveRun, history, available, dial] = await Promise.all([
    store.readPlaybooks(workspaceId),
    store.readLiveRun(workspaceId),
    store.readRecentRuns(workspaceId),
    store.availableCredits(workspaceId),
    readDial(workspaceId),
  ])

  const byKey = new Map(rows.map((r) => [r.recipe_key, r]))

  const recipes: RecipeView[] = PLAYBOOK_RECIPES.map((recipe) => {
    const playbook = byKey.get(recipe.key) ?? null
    if (recipe.blocker !== null) return { recipe, playbook, itemCredits: null }
    const channels = (playbook?.params.channels as Channel[] | undefined) ?? []
    const level = governingLevel(channels, dial, DEFAULT_AUTONOMY_LEVEL)
    return { recipe, playbook, itemCredits: itemCost(recipe.outputAction, level) }
  })

  // The whole-screen level: the most cautious setting on any channel any
  // enrolment targets. Used only to explain what will happen to the drafts, and
  // deliberately falls back to L1 — the default the column carries — rather than
  // to the most permissive reading.
  const targeted = [
    ...new Set(rows.flatMap((r) => (r.params.channels as Channel[] | undefined) ?? [])),
  ]
  const level = governingLevel(targeted, dial, DEFAULT_AUTONOMY_LEVEL)

  return { recipes, liveRun, history, availableCredits: available, level }
}

/** The recipe a run came from, for the history rows. Undefined when retired. */
export function recipeNameFor(recipeKey: string): string {
  return playbookRecipe(recipeKey)?.name ?? recipeKey
}
