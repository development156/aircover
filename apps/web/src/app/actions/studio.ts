'use server'

import { revalidatePath } from 'next/cache'
import {
  DesignDocumentSchema,
  StudioDesignSchema,
  blankDocument,
  presetById,
  slotKeysOf,
  templateById,
} from '@sahoda/shared'
import { z } from 'zod'

import { reportServerError } from '@/lib/observability/report'
import type { DeleteDesignState, SaveDesignState } from '@/lib/studio/state'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * THE STUDIO'S WRITES.
 *
 * ── EVERY BOUNDARY IS PARSED, INCLUDING THE ONE FROM OUR OWN EDITOR ─────────
 * The document arrives as JSON from a client component, which is to say from
 * the network, which is to say from anywhere. `DesignDocumentSchema` runs on it
 * here before it reaches a column, so a stored design is one this application
 * can open again. A row written unparsed is a card that fails to open later and
 * nothing that says why.
 *
 * ── AND THE TEMPLATE AND PRESET HAVE TO EXIST ──────────────────────────────
 * A design naming a template nobody ships cannot be rendered, so it is refused
 * at the door rather than saved and discovered later. That refusal is cheap
 * here and expensive in a gallery.
 */

/** A design's name. Matches the column's own CHECK, which is the real limit. */
const TitleSchema = z.string().trim().min(1).max(80)

const SaveInputSchema = z.object({
  id: z.uuid().optional(),
  title: TitleSchema,
  presetId: z.string().min(1).max(40),
  doc: DesignDocumentSchema,
  isTemplate: z.boolean().optional(),
})

const REFUSALS = {
  unknownTemplate: 'That layout is not one Sahoda offers, so this design was not saved.',
  unknownPreset: 'That size is not one Sahoda offers, so this design was not saved.',
  malformed: 'This design could not be saved because part of it was not readable.',
  failed: 'This design could not be saved. Nothing was changed.',
  notFound: 'That design is not in this workspace.',
  deleteFailed: 'This design could not be deleted. Nothing was changed.',
} as const

/**
 * Create or update a design.
 *
 * One action for both, because the editor does not know which it is doing: a
 * design saved for the first time and one saved for the twentieth are the same
 * gesture to the person making it.
 */
export async function saveDesign(input: unknown): Promise<SaveDesignState> {
  const workspace = await workspaceForWrite()
  if (!workspace.ok) return { ok: false, message: workspace.message }

  const parsed = SaveInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: REFUSALS.malformed }
  const { id, title, presetId, doc, isTemplate } = parsed.data

  if (templateById(doc.templateId) === null) {
    return { ok: false, message: REFUSALS.unknownTemplate }
  }
  if (presetById(presetId) === null) {
    return { ok: false, message: REFUSALS.unknownPreset }
  }

  try {
    const supabase = createServerSupabase()
    const row = {
      workspace_id: workspace.workspace.id,
      title,
      preset_id: presetId,
      doc,
      is_template: isTemplate ?? false,
    }

    // `id` present means update. The workspace filter is here as well as in RLS
    // for the reason the read module gives: the policy admits every workspace
    // this person belongs to, and an unscoped update would reach into another.
    const query =
      id === undefined
        ? supabase.from('studio_designs').insert(row).select('*').single()
        : supabase
            .from('studio_designs')
            .update(row)
            .eq('id', id)
            .eq('workspace_id', workspace.workspace.id)
            .select('*')
            .single()

    const { data, error } = await query
    if (error || !data)
      return { ok: false, message: id === undefined ? REFUSALS.failed : REFUSALS.notFound }

    const saved = StudioDesignSchema.safeParse(data)
    // The row went in and came back unreadable. That is our defect, not the
    // customer's, so it is reported rather than shown to them as a refusal they
    // could act on.
    if (!saved.success) {
      reportServerError(new Error('studio: saved design did not parse on read-back'), {
        action: 'saveDesign',
      })
      return { ok: false, message: REFUSALS.failed }
    }

    revalidatePath('/studio')
    return { ok: true, design: saved.data }
  } catch (error) {
    reportServerError(error, { action: 'saveDesign' })
    return { ok: false, message: REFUSALS.failed }
  }
}

/**
 * Start a new design from one of the shipped layouts.
 *
 * Every declared slot is present and empty rather than absent, because "this
 * box exists and you have not filled it" is what the editor needs in order to
 * draw something to type into.
 */
export async function createDesign(templateId: unknown): Promise<SaveDesignState> {
  const id = z.string().safeParse(templateId)
  if (!id.success) return { ok: false, message: REFUSALS.unknownTemplate }

  const template = templateById(id.data)
  if (template === null) return { ok: false, message: REFUSALS.unknownTemplate }

  return saveDesign({
    title: template.label,
    presetId: template.presetId,
    doc: blankDocument(template.id, slotKeysOf(template)),
  })
}

/**
 * Delete a design.
 *
 * ── THIS CASCADES NOTHING, AND THAT IS WHY THERE IS NO GATE ─────────────────
 * A picture the design exported is a row in `assets` with its own bytes in the
 * bucket, and deleting the design does not touch it. `studio_exports` loses its
 * link, which is a record of where a file came from rather than the file.
 *
 * So there is no usage check to run and no confirmation to demand. A function
 * that warned here would be inventing a consequence, which `describeTrash` in
 * `@sahoda/shared` sets out at length as the thing not to do.
 */
export async function deleteDesign(designId: unknown): Promise<DeleteDesignState> {
  const workspace = await workspaceForWrite()
  if (!workspace.ok) return { ok: false, message: workspace.message }

  const id = z.uuid().safeParse(designId)
  if (!id.success) return { ok: false, message: REFUSALS.notFound }

  try {
    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('studio_designs')
      .delete()
      .eq('id', id.data)
      .eq('workspace_id', workspace.workspace.id)

    if (error) return { ok: false, message: REFUSALS.deleteFailed }
    revalidatePath('/studio')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'deleteDesign' })
    return { ok: false, message: REFUSALS.deleteFailed }
  }
}
