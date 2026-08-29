'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import {
  AssetSchema,
  DesignDocumentSchema,
  StudioDesignSchema,
  blankDocument,
  composeScene,
  describeComposeFailure,
  presetById,
  renderSvg,
  slotKeysOf,
  slotLabelOf,
  templateById,
} from '@sahoda/shared'
import { z } from 'zod'

import { activeThemeTokens } from '@/lib/brand/read-theme'
import { kindForProvenMime } from '@/lib/assets/kind'
import { reportServerError } from '@/lib/observability/report'
import { MEDIA_BUCKET } from '@/lib/posts/media-constants'
import { assetObjectPath } from '@/lib/posts/media-path'
import { sniffImage } from '@/lib/posts/sniff-image'
import {
  EXPORT_REFUSALS,
  EXPORT_STORED,
  planExport,
  type ExistingCopy,
} from '@/lib/studio/export-copy'
import { imageDataUri, resolvePageImages } from '@/lib/studio/images'
import { studioPalette } from '@/lib/studio/palette'
import { rasterisePng } from '@/lib/studio/raster'
import type {
  DeleteDesignState,
  DesignPhotoState,
  ExportDesignState,
  SaveDesignState,
} from '@/lib/studio/state'
import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead, workspaceForWrite } from '@/lib/workspaces'

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
 * One sentence for every reason a picture cannot be shown, and that is
 * deliberate rather than lazy: the reasons are "not in this workspace", "in the
 * trash", "bytes unreadable" and "not an image type", and telling a person
 * which would describe our storage to them. What they can act on is the same in
 * all four, and it is what this says.
 */
const PHOTO_REFUSAL =
  'That picture could not be opened, so it was not added to this design. It may have been deleted from your library.'

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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPORTING A DESIGN INTO THE ASSETS LIBRARY.
 *
 * The studio's whole purpose is a picture a person can publish, and until this
 * existed the picture lived only on the screen. The export is the point where a
 * design stops being ours and becomes a file of theirs: a row in `assets`, with
 * bytes in the bucket, judged by the Constraint Engine exactly as an uploaded
 * photo is. Nothing about it is special-cased downstream, which is deliberate.
 *
 * ── IT COSTS NO CREDITS, AND THE PAGE SAYS SO TRUTHFULLY ────────────────────
 * There is no model call anywhere in this path. Drawing is our own arithmetic.
 * `apply_ledger_entry` is not reached and no price is read.
 *
 * ── THE DETERMINISM TRAP ────────────────────────────────────────────────────
 * The same design exported twice produces byte-identical PNGs, so the second
 * press would collide with the library's duplicate refusal. `export-copy.ts`
 * turns that collision into an answer. See its header.
 */

/** Where these exact bytes already live in this workspace, if anywhere. */
async function existingCopyOf(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  designId: string,
  sha256: string,
): Promise<ExistingCopy | null> {
  // A read FAILURE returns null, which means "store it", and that is the same
  // trade `uploadAsset` makes for the same reason: the cost of being wrong here
  // is one redundant file a person can delete, and the cost the other way is a
  // design they cannot export.
  try {
    const priorExport = await supabase
      .from('studio_exports')
      .select('asset_id')
      .eq('workspace_id', workspaceId)
      .eq('design_id', designId)
      .eq('content_sha256', sha256)
      .maybeSingle()

    const linkedId =
      priorExport.error || !priorExport.data ? null : (priorExport.data.asset_id as string)

    if (linkedId !== null) {
      const asset = await supabase
        .from('assets')
        .select('id, title, deleted_at')
        .eq('workspace_id', workspaceId)
        .eq('id', linkedId)
        .maybeSingle()

      if (!asset.error && asset.data) {
        return {
          assetId: asset.data.id as string,
          title: typeof asset.data.title === 'string' ? asset.data.title : null,
          trashedAt: typeof asset.data.deleted_at === 'string' ? asset.data.deleted_at : null,
        }
      }
      // The export record points at a row that is gone. The cascade should make
      // that unreachable; if it happens, the bytes are not in the library and
      // storing them again is the correct answer rather than a dead link.
    }

    // Not exported before, or the link is gone. The bytes may still be here:
    // another design can produce the same picture, and a person can upload one
    // they downloaded earlier. A live row wins over a trashed one.
    const byHash = await supabase
      .from('assets')
      .select('id, title, deleted_at')
      .eq('workspace_id', workspaceId)
      .eq('content_sha256', sha256)
      .order('deleted_at', { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle()

    if (byHash.error || !byHash.data) return null
    return {
      assetId: byHash.data.id as string,
      title: typeof byHash.data.title === 'string' ? byHash.data.title : null,
      trashedAt: typeof byHash.data.deleted_at === 'string' ? byHash.data.deleted_at : null,
    }
  } catch {
    return null
  }
}

/** Record which file a design exported to. Never the reason an export fails; see the caller. */
async function recordExport(
  supabase: ReturnType<typeof createServerSupabase>,
  row: { workspace_id: string; design_id: string; asset_id: string; content_sha256: string },
): Promise<void> {
  const { error } = await supabase.from('studio_exports').insert(row)
  if (error) {
    // The FILE is in the library and the LINK is not. That is worth knowing
    // about and is not worth failing the export over: the next press finds the
    // same bytes by content hash and answers correctly anyway, so this heals
    // itself. Telling the person their export failed would be false.
    reportServerError(new Error(`studio: export record not written (${error.code ?? 'unknown'})`), {
      action: 'exportDesign',
    })
  }
}

const ExportInputSchema = z.object({
  designId: z.uuid(),
  /** Which page of a carousel. One design, one picture per press. */
  pageIndex: z.number().int().min(0).optional(),
})

export async function exportDesign(input: unknown): Promise<ExportDesignState> {
  let workspaceId: string | undefined
  let uploadedPath: string | null = null
  const supabase = createServerSupabase()

  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to export a design.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const parsed = ExportInputSchema.safeParse(input)
    if (!parsed.success) return { ok: false, message: EXPORT_REFUSALS.notFound }
    const { designId } = parsed.data
    const pageIndex = parsed.data.pageIndex ?? 0

    const read = await supabase
      .from('studio_designs')
      .select('*')
      .eq('workspace_id', workspace.id)
      .eq('id', designId)
      .maybeSingle()

    if (read.error) return { ok: false, message: EXPORT_REFUSALS.unreadable }
    if (!read.data) return { ok: false, message: EXPORT_REFUSALS.notFound }

    const design = StudioDesignSchema.safeParse(read.data)
    if (!design.success) return { ok: false, message: EXPORT_REFUSALS.unreadable }

    const template = templateById(design.data.doc.templateId)
    const preset = presetById(design.data.preset_id)
    const page = design.data.doc.pages[pageIndex]
    if (template === null || preset === null || page === undefined) {
      return { ok: false, message: EXPORT_REFUSALS.unreadable }
    }

    const tokens = await activeThemeTokens(workspace.id)
    const palette = studioPalette(tokens).palette

    // A picture the design points at and we cannot read is a REFUSAL, never a
    // gap. `composeScene` would refuse anyway once the slot is absent; naming
    // the file here is the difference between "one of your pictures could not
    // be read" and a compose failure a person cannot act on.
    const resolved = await resolvePageImages(page, workspace.id)
    if (resolved.missing.length > 0) {
      return {
        ok: false,
        message:
          'One of the pictures in this design could not be read, so nothing was exported. It may have been deleted from your library.',
      }
    }

    const composed = composeScene(template, page, {
      width: preset.width,
      height: preset.height,
      palette,
      images: resolved.images,
    })
    if (!composed.ok) {
      return {
        ok: false,
        message: describeComposeFailure(composed.failure, (key) => slotLabelOf(template, key)),
      }
    }

    const markup = renderSvg(composed.scene)
    if (markup === null) return { ok: false, message: EXPORT_REFUSALS.unrenderable }

    const raster = await rasterisePng(markup, { width: preset.width, height: preset.height })
    if (!raster.ok) return { ok: false, message: EXPORT_REFUSALS.unrenderable }

    const existing = await existingCopyOf(supabase, workspace.id, designId, raster.sha256)
    const plan = planExport(existing)

    if (plan.kind !== 'store') {
      // Nothing is uploaded and nothing is written. A design already in the
      // library costs no storage to press again, which is half the reason the
      // check happens before the upload rather than after it.
      if (plan.kind === 'linked' && existing !== null) {
        // The bytes are live but this design may never have been recorded
        // against them, which is how an interrupted export heals.
        await recordExport(supabase, {
          workspace_id: workspace.id,
          design_id: designId,
          asset_id: plan.assetId,
          content_sha256: raster.sha256,
        })
      }
      return {
        ok: true,
        outcome: plan.kind === 'linked' ? 'already' : 'in-trash',
        assetId: plan.assetId,
        message: plan.message,
      }
    }

    // Every fact about the file comes from the BYTES, not from the pipeline
    // that produced them. Same discipline the upload path applies to a browser's
    // claims, and it is what makes an exported picture indistinguishable from an
    // uploaded one everywhere downstream.
    const sniffed = sniffImage(raster.bytes)
    if (!sniffed.ok) return { ok: false, message: EXPORT_REFUSALS.unrenderable }
    const kind = kindForProvenMime(sniffed.image.mime)
    if (kind === null) return { ok: false, message: EXPORT_REFUSALS.unrenderable }

    const assetId = randomUUID()
    const objectPath = assetObjectPath({
      workspaceId: workspace.id,
      assetId,
      mime: sniffed.image.mime,
    })

    const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, raster.bytes, {
      contentType: sniffed.image.mime,
      upsert: false,
    })
    if (upload.error) return { ok: false, message: EXPORT_REFUSALS.failed }
    uploadedPath = objectPath

    const row = {
      id: assetId,
      workspace_id: workspace.id,
      storage_path: objectPath,
      kind,
      mime: sniffed.image.mime,
      bytes: raster.bytes.byteLength,
      width: sniffed.image.width,
      height: sniffed.image.height,
      title: design.data.title,
      created_by: userId,
    }

    // The `42703` retry is the same deploy-safety `uploadAsset` carries: the
    // hash column arrives with a migration a human applies, and this code can
    // ship before that happens. Without it every export would break until the
    // migration lands, which is strictly worse than losing duplicate detection.
    let { data, error } = await supabase
      .from('assets')
      .insert({ ...row, content_sha256: raster.sha256 })
      .select('*')
      .single()

    if (error?.code === '42703') {
      const retry = await supabase.from('assets').insert(row).select('*').single()
      data = retry.data
      error = retry.error
    }

    if (error || !data) {
      await removeExportObject(supabase, uploadedPath)
      uploadedPath = null
      return { ok: false, message: EXPORT_REFUSALS.failed }
    }

    const asset = AssetSchema.safeParse(data)
    await recordExport(supabase, {
      workspace_id: workspace.id,
      design_id: designId,
      asset_id: assetId,
      content_sha256: raster.sha256,
    })

    revalidatePath('/assets')
    revalidatePath('/studio')
    return {
      ok: true,
      outcome: 'stored',
      assetId: asset.success ? asset.data.id : assetId,
      message: EXPORT_STORED,
    }
  } catch (error) {
    reportServerError(error, { action: 'exportDesign', workspaceId })
    if (uploadedPath !== null) await removeExportObject(supabase, uploadedPath)
    return { ok: false, message: EXPORT_REFUSALS.failed }
  }
}

/** Undo a partial export. A stored object with no row is a file nobody can reach or delete. */
async function removeExportObject(
  supabase: ReturnType<typeof createServerSupabase>,
  path: string,
): Promise<void> {
  try {
    await supabase.storage.from(MEDIA_BUCKET).remove([path])
  } catch {
    // The row was never written, so the object is unreachable rather than
    // dangling in front of anybody. Reporting a cleanup failure over the
    // original one would bury the reason the export failed.
  }
}

/**
 * The bytes of one picture, for the editor's preview.
 *
 * ── WHY THE EDITOR CANNOT JUST USE THE PICKER'S URL ─────────────────────────
 * The preview is the SAME SVG string the export rasterises, and the renderer
 * refuses any href that is not a data URI. A signed URL in the preview would
 * make the picture appear on screen and vanish from the exported file, which is
 * the exact class of failure the studio is built to make impossible.
 *
 * Fetched on demand rather than embedded in the page: a design with a 5 MB
 * photo would otherwise put 7 MB of base64 into the HTML of every visit.
 */
export async function designPhoto(assetId: unknown): Promise<DesignPhotoState> {
  const id = z.uuid().safeParse(assetId)
  if (!id.success) return { ok: false, message: PHOTO_REFUSAL }

  const workspace = await activeWorkspaceRead()
  if (workspace.status !== 'ok') return { ok: false, message: PHOTO_REFUSAL }

  const dataUri = await imageDataUri(id.data, workspace.workspace.id)
  if (dataUri === null) return { ok: false, message: PHOTO_REFUSAL }
  return { ok: true, dataUri }
}
