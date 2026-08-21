import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { PLAYBOOK_RECIPES, PLAYBOOK_RECIPE_KEYS, isRunnable, playbookRecipe } from './recipes'

/**
 * THE CATALOGUE AND THE DATABASE REFUSE THE SAME SET.
 *
 * ── WHY THIS IS READ OFF THE MIGRATION AND NOT WRITTEN OUT TWICE ────────────
 * `playbooks.recipe_key` carries a CHECK constraint listing the recipes this
 * product offers, and that constraint is the fence that makes Playbooks a
 * library rather than a workflow builder. The list here is the same list, in
 * TypeScript, and the two are in different files in different languages — so
 * nothing but this test can notice when one gains a member and the other does
 * not.
 *
 * The failure it prevents is quiet in the worst direction: a recipe added here
 * and not there is a card the customer can fill in and cannot save, and the
 * error they get is a raw constraint violation nobody wrote.
 */

const MIGRATION = readFileSync(
  resolve(import.meta.dirname, '../../../db/supabase/migrations/20260822030000_playbooks.sql'),
  'utf8',
)

/** The keys inside the `recipe_key` CHECK, in the order the constraint lists them. */
function keysInConstraint(): string[] {
  const block = /recipe_key text not null check \(recipe_key in \(([\s\S]*?)\)\)/.exec(MIGRATION)
  if (!block) throw new Error('the recipe_key CHECK constraint has moved or been removed')
  return [...block[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
}

describe('the recipe catalogue', () => {
  it('holds exactly the keys the database will store', () => {
    expect([...PLAYBOOK_RECIPE_KEYS].sort()).toEqual(keysInConstraint().sort())
  })

  it('defines one recipe per key, with no duplicates', () => {
    expect(PLAYBOOK_RECIPES.map((r) => r.key).sort()).toEqual([...PLAYBOOK_RECIPE_KEYS].sort())
  })

  it('names the ONE thing every blocked recipe waits on', () => {
    for (const recipe of PLAYBOOK_RECIPES) {
      if (isRunnable(recipe)) continue
      // A sentence, not a slug and not "coming soon". The screen renders it
      // verbatim after "It needs", so it has to read as the rest of a sentence.
      expect(recipe.blocker, recipe.key).toBeTruthy()
      expect(recipe.blocker!.length, recipe.key).toBeGreaterThan(20)
      expect(recipe.blocker!, recipe.key).not.toMatch(/coming soon|TODO|not implemented/i)
    }
  })

  it('agrees with the database about WHICH recipe is runnable', () => {
    // The constraint allows exactly one recipe to be enabled today. If this
    // catalogue ever calls a second one runnable without the migration being
    // widened, the customer meets a constraint violation instead of a feature.
    const runnable = PLAYBOOK_RECIPES.filter(isRunnable).map((r) => r.key)
    const allowed = [
      ...MIGRATION.matchAll(/or \(recipe_key = '([a-z_]+)' and trigger_kind in \(([^)]*)\)\)/g),
    ].map((m) => m[1]!)
    expect(runnable.sort()).toEqual(allowed.sort())
  })

  it('only lets a runnable recipe declare a trigger the database will accept', () => {
    const allowed = /or \(recipe_key = 'festival_calendar' and trigger_kind in \(([^)]*)\)\)/.exec(
      MIGRATION,
    )
    const kinds = [...allowed![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!)
    const festival = playbookRecipe('festival_calendar')!
    expect([...festival.triggers].sort()).toEqual(kinds.sort())
  })

  it('returns undefined for a key nobody offers, rather than throwing', () => {
    // The one caller that can be handed an unknown key is a reader of a STORED
    // row, and a run of a retired recipe must still render beside four healthy
    // ones rather than break the screen that lists them.
    expect(playbookRecipe('when_x_then_scrape_y')).toBeUndefined()
  })

  it('parses a complete festival parameter set and refuses an incomplete one', () => {
    const festival = playbookRecipe('festival_calendar')!
    expect(
      festival.paramsSchema.safeParse({
        channels: ['instagram'],
        calendars: ['india'],
        lead_days: 7,
      }).success,
    ).toBe(true)
    // The bound the column's own form has to respect: a run cannot sweep a year.
    expect(
      festival.paramsSchema.safeParse({
        channels: ['instagram'],
        calendars: ['india'],
        lead_days: 400,
      }).success,
    ).toBe(false)
  })

  it('DE-DUPLICATES a repeated channel rather than refusing it', () => {
    // MEASURED: `ChannelSetSchema` deduplicates at the boundary, it does not
    // reject — and that is the stronger design, for the reason its own header
    // gives. Three defects shipped in this product from a `text[]` read as a set
    // by every consumer and deduped by none of them, and each fix closed one
    // consumer while a sibling kept reading the raw array.
    //
    // So the guarantee this test pins is not "a duplicate is refused" but "a
    // duplicate never reaches the database", which is what the run item's own
    // CHECK constraint then also refuses from the other side.
    const festival = playbookRecipe('festival_calendar')!
    const parsed = festival.paramsSchema.safeParse({
      channels: ['instagram', 'instagram', 'x'],
      calendars: ['india'],
      lead_days: 7,
    })
    expect(parsed.success).toBe(true)
    expect((parsed.data as { channels: string[] }).channels).toEqual(['instagram', 'x'])
  })
})
