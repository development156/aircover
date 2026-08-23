'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { isRunnable, playbookRecipe, type PlaybookCadence } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import * as store from '@/lib/playbooks/store'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * ENROLLING A RECIPE — filling in the blanks, and switching it on.
 *
 * ── THREE REFUSALS, AND ONLY ONE OF THEM IS THIS FILE'S ─────────────────────
 * The recipe must exist, it must be runnable, and its parameters must parse.
 * Each is checked here so the customer gets a sentence, and each is ALSO refused
 * by the database — the `recipe_key` CHECK, the
 * `playbooks_enabled_recipe_is_runnable` CHECK, and (for the parameters) nothing,
 * which is why the parse below is not optional.
 *
 * The duplication is deliberate. A form is a request and a constraint is a
 * refusal, and the two failures read very differently to a person: one is "pick
 * something else", the other is a raw constraint violation nobody wrote.
 */

export interface SavePlaybookState {
  ok: boolean
  playbookId?: string
  message?: string
}

export async function savePlaybook(input: {
  recipeKey: string
  enabled: boolean
  params: Record<string, unknown>
  cadence: PlaybookCadence | null
}): Promise<SavePlaybookState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in first.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const recipe = playbookRecipe(input.recipeKey)
    if (!recipe) return { ok: false, message: 'Sahoda does not offer that playbook.' }

    // A blocked recipe names the one thing it waits on, and that sentence is what
    // the customer sees rather than a generic refusal.
    if (input.enabled && !isRunnable(recipe)) {
      return { ok: false, message: `Not yet — this one still needs ${recipe.blocker}.` }
    }

    const parsed = recipe.paramsSchema.safeParse(input.params)
    if (!parsed.success) {
      return { ok: false, message: 'Check the fields — something there is not filled in yet.' }
    }

    const triggerKind = input.cadence ? 'schedule' : 'manual'
    const playbookId = await store.upsertPlaybook({
      workspaceId,
      recipeKey: recipe.key,
      enabled: input.enabled,
      params: parsed.data as Record<string, unknown>,
      triggerKind,
      cadence: input.cadence,
      userId,
    })

    revalidatePath('/playbooks')
    return { ok: true, playbookId }
  } catch (error) {
    reportServerError(error, { action: 'savePlaybook', workspaceId })
    return { ok: false, message: 'Could not save that playbook. Try again.' }
  }
}

/** Switch one on or off. The only lifecycle a playbook has; there is no delete. */
export async function togglePlaybook(
  playbookId: string,
  enabled: boolean,
): Promise<SavePlaybookState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in first.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const row = await store.readPlaybook(playbookId, workspaceId)
    if (!row) return { ok: false, message: 'That playbook no longer exists.' }

    const recipe = playbookRecipe(row.recipe_key)
    if (enabled && (!recipe || !isRunnable(recipe))) {
      return {
        ok: false,
        message: recipe ? `Not yet — this one still needs ${recipe.blocker}.` : 'Not offered.',
      }
    }

    await store.setEnabled(playbookId, workspaceId, enabled)
    revalidatePath('/playbooks')
    return { ok: true, playbookId }
  } catch (error) {
    reportServerError(error, { action: 'togglePlaybook', workspaceId })
    return { ok: false, message: 'Could not change that. Try again.' }
  }
}
