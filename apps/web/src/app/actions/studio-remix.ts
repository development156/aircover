'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * LINK A FRESH PRESS TO THE PICTURE IT WAS A VERSION OF.
 *
 * ── WHY THIS IS ITS OWN ACTION, RATHER THAN A FIELD ON `queueGeneration` ─────
 * `queueGeneration` writes the new row before it spends anything, and by the
 * time a person can say "keep this as a version of that one" the new row
 * already exists with its own id. Recording the link is therefore an UPDATE
 * of one column on a row that is already there, never an input the generate
 * call needs to carry — `composer.tsx`'s own `onGenerated` hook exists so a
 * caller can do exactly this after a successful press, without the composer
 * or the generate action needing to know linking exists at all.
 *
 * ── HONEST ABOUT THE COLUMN THAT MAY NOT EXIST ───────────────────────────────
 * `remixed_from` ships in migration `20260904140000`, unapplied as of this
 * file. The viewer only offers a LIVE remix control once it has confirmed the
 * column is reachable (see `lib/studio/remix-lineage.ts`), so this action
 * should never be called against a deploy where it is not — but it checks for
 * `42703` anyway rather than trusting the caller, because a locked control
 * that somehow fired would otherwise report success for a write that did not
 * happen.
 */
export type RecordRemixLineageState = { ok: true } | { ok: false; message: string }

export async function recordRemixLineage(
  childGenerationId: unknown,
  parentGenerationId: unknown,
): Promise<RecordRemixLineageState> {
  let workspaceId: string | undefined
  try {
    const child = z.uuid().safeParse(childGenerationId)
    const parent = z.uuid().safeParse(parentGenerationId)
    if (!child.success || !parent.success) {
      return { ok: false, message: 'Sahoda could not tell which pictures to link.' }
    }

    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to link a version.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    // Scoped to the workspace on the row being WRITTEN. The trigger added by
    // the same migration additionally refuses a `parentGenerationId` from a
    // different workspace, so a mismatched pair is refused twice over rather
    // than trusted once.
    const { error } = await supabase
      .from('studio_generations')
      .update({ remixed_from: parent.data })
      .eq('id', child.data)
      .eq('workspace_id', ws.workspace.id)

    if (error?.code === '42703') {
      return {
        ok: false,
        message:
          'Sahoda made the picture, but cannot yet record it as a version of the one you started from.',
      }
    }
    if (error) {
      return {
        ok: false,
        message: 'Sahoda made the picture, but could not link it as a version just now.',
      }
    }

    revalidatePath('/studio')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'recordRemixLineage', workspaceId })
    return {
      ok: false,
      message: 'Sahoda made the picture, but could not link it as a version just now.',
    }
  }
}
