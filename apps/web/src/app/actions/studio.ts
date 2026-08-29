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
  type Palette,
  type StudioDesign,
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
  describeBatchExport,
  planExport,
  titleForPage,
  type ExistingCopy,
  type PageExport,
} from '@/lib/studio/export-copy'
import { imageDataUri, resolvePageImages } from '@/lib/studio/images'
import { TEMPLATE_KEPT, TEMPLATE_REFUSALS, TEMPLATE_RELEASED } from '@/lib/studio/template-copy'
import { studioPalette } from '@/lib/studio/palette'
import { rasterisePng } from '@/lib/studio/raster'
import type {
  DeleteDesignState,
  DesignPhotoState,
  ExportDesignState,
  ExportPagesState,
  SaveDesignState,
  TemplateFlagState,
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

/**
 * One page of one design, drawn and stored.
 *
 * Split out of the action because a carousel exports every slide through this
 * same body. Two copies of it would drift on the day one of them learned
 * something about duplicates, and the duplicate rule is the whole reason this
 * path is more than an upload.
 */
async function exportOnePage(
  supabase: ReturnType<typeof createServerSupabase>,
  input: {
    workspaceId: string
    userId: string
    design: StudioDesign
    pageIndex: number
    palette: Palette
  },
): Promise<ExportDesignState> {
  const { workspaceId, userId, design, pageIndex, palette } = input
  let uploadedPath: string | null = null

  const template = templateById(design.doc.templateId)
  const preset = presetById(design.preset_id)
  const page = design.doc.pages[pageIndex]
  if (template === null || preset === null || page === undefined) {
    return { ok: false, message: EXPORT_REFUSALS.unreadable }
  }

  try {
    // A picture the design points at and we cannot read is a REFUSAL, never a
    // gap. `composeScene` would refuse anyway once the slot is absent; naming
    // the file here is the difference between "one of your pictures could not
    // be read" and a compose failure a person cannot act on.
    const resolved = await resolvePageImages(page, workspaceId)
    if (resolved.missing.length > 0) return { ok: false, message: EXPORT_REFUSALS.missingPhoto }

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

    const existing = await existingCopyOf(supabase, workspaceId, design.id, raster.sha256)
    const plan = planExport(existing)

    if (plan.kind !== 'store') {
      // Nothing is uploaded and nothing is written. A design already in the
      // library costs no storage to press again, which is half the reason the
      // check happens before the upload rather than after it.
      if (plan.kind === 'linked') {
        // The bytes are live but this design may never have been recorded
        // against them, which is how an interrupted export heals.
        await recordExport(supabase, {
          workspace_id: workspaceId,
          design_id: design.id,
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
    const objectPath = assetObjectPath({ workspaceId, assetId, mime: sniffed.image.mime })

    const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, raster.bytes, {
      contentType: sniffed.image.mime,
      upsert: false,
    })
    if (upload.error) return { ok: false, message: EXPORT_REFUSALS.failed }
    uploadedPath = objectPath

    const row = {
      id: assetId,
      workspace_id: workspaceId,
      storage_path: objectPath,
      kind,
      mime: sniffed.image.mime,
      bytes: raster.bytes.byteLength,
      width: sniffed.image.width,
      height: sniffed.image.height,
      // A slide is named for the design and its position, because a library of
      // ten files all called "Diwali offer" is a library nobody can use.
      title: titleForPage(design.title, pageIndex, design.doc.pages.length),
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
      return { ok: false, message: EXPORT_REFUSALS.failed }
    }

    const asset = AssetSchema.safeParse(data)
    await recordExport(supabase, {
      workspace_id: workspaceId,
      design_id: design.id,
      asset_id: assetId,
      content_sha256: raster.sha256,
    })

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

/** Load a design and everything drawing it needs, scoped to the workspace writing. */
async function designForExport(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  designId: string,
): Promise<{ ok: true; design: StudioDesign; palette: Palette } | { ok: false; message: string }> {
  const read = await supabase
    .from('studio_designs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', designId)
    .maybeSingle()

  if (read.error) return { ok: false, message: EXPORT_REFUSALS.unreadable }
  if (!read.data) return { ok: false, message: EXPORT_REFUSALS.notFound }

  const design = StudioDesignSchema.safeParse(read.data)
  if (!design.success) return { ok: false, message: EXPORT_REFUSALS.unreadable }

  const tokens = await activeThemeTokens(workspaceId)
  return { ok: true, design: design.data, palette: studioPalette(tokens).palette }
}

export async function exportDesign(input: unknown): Promise<ExportDesignState> {
  const { userId } = await auth()
  if (!userId) return { ok: false, message: 'Sign in to export a design.' }

  const ws = await workspaceForWrite()
  if (!ws.ok) return { ok: false, message: ws.message }

  const parsed = ExportInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: EXPORT_REFUSALS.notFound }

  const supabase = createServerSupabase()
  const loaded = await designForExport(supabase, ws.workspace.id, parsed.data.designId)
  if (!loaded.ok) return loaded

  const result = await exportOnePage(supabase, {
    workspaceId: ws.workspace.id,
    userId,
    design: loaded.design,
    pageIndex: parsed.data.pageIndex ?? 0,
    palette: loaded.palette,
  })

  if (result.ok && result.outcome === 'stored') {
    revalidatePath('/assets')
    revalidatePath('/studio')
  }
  return result
}

/**
 * Every slide of a carousel, in one press.
 *
 * ── A SLIDE THAT FAILS DOES NOT UNDO THE ONES THAT WORKED ───────────────────
 * Each page is its own file and its own row, so there is nothing to roll back
 * and rolling back would be the wrong act anyway: deleting four good pictures
 * because the fifth would not draw destroys work over a problem the person can
 * fix. What matters is that the sentence afterwards is exact about which
 * slides are in the library and which are not, and `describeBatchExport` is
 * where that is argued and tested.
 *
 * Sequential rather than parallel, deliberately. Each page rasterises a full
 * canvas through sharp and uploads it; ten at once on a small server instance
 * is a memory spike for a person who would not notice the difference in speed.
 */
export async function exportDesignPages(designId: unknown): Promise<ExportPagesState> {
  const { userId } = await auth()
  if (!userId) return { ok: false, message: 'Sign in to export a design.' }

  const ws = await workspaceForWrite()
  if (!ws.ok) return { ok: false, message: ws.message }

  const id = z.uuid().safeParse(designId)
  if (!id.success) return { ok: false, message: EXPORT_REFUSALS.notFound }

  const supabase = createServerSupabase()
  const loaded = await designForExport(supabase, ws.workspace.id, id.data)
  if (!loaded.ok) return loaded

  const pages: PageExport[] = []
  for (let pageIndex = 0; pageIndex < loaded.design.doc.pages.length; pageIndex += 1) {
    const result = await exportOnePage(supabase, {
      workspaceId: ws.workspace.id,
      userId,
      design: loaded.design,
      pageIndex,
      palette: loaded.palette,
    })
    pages.push(
      result.ok
        ? { pageIndex, ok: true, outcome: result.outcome, assetId: result.assetId }
        : { pageIndex, ok: false, message: result.message },
    )
  }

  if (pages.some((page) => page.ok && page.outcome === 'stored')) {
    revalidatePath('/assets')
    revalidatePath('/studio')
  }

  return { ok: true, pages, message: describeBatchExport(pages) }
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A CUSTOMER'S OWN STARTING POINTS.
 *
 * `template-copy.ts` carries the product argument. What matters here is that
 * these are two DIFFERENT acts and neither pretends to be the other: keeping a
 * design as a starting point MOVES it between shelves and copies nothing;
 * starting from one COPIES it and leaves the original alone.
 */

/**
 * Keep this design as a starting point, or stop.
 *
 * A one-column update rather than a `saveDesign` round trip, and that is not
 * tidiness: `saveDesign` writes the whole row from what the browser holds, so
 * using it here would push the editor's in-memory document back over the stored
 * one as a side effect of ticking a box. Someone with an older tab open would
 * silently overwrite a newer save.
 */
export async function setDesignTemplate(input: unknown): Promise<TemplateFlagState> {
  const parsed = z.object({ designId: z.uuid(), isTemplate: z.boolean() }).safeParse(input)
  if (!parsed.success) return { ok: false, message: TEMPLATE_REFUSALS.notFound }

  const workspace = await workspaceForWrite()
  if (!workspace.ok) return { ok: false, message: workspace.message }

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('studio_designs')
      .update({ is_template: parsed.data.isTemplate })
      .eq('id', parsed.data.designId)
      .eq('workspace_id', workspace.workspace.id)
      .select('is_template')
      .single()

    if (error || !data) return { ok: false, message: TEMPLATE_REFUSALS.flagFailed }

    // The value that LANDED, read back, rather than the one that was asked for.
    // A toggle that shows what it requested is a toggle that lies on the day the
    // write is refused.
    const isTemplate = data.is_template === true

    revalidatePath('/studio')
    return {
      ok: true,
      isTemplate,
      message: isTemplate ? TEMPLATE_KEPT : TEMPLATE_RELEASED,
    }
  } catch (error) {
    reportServerError(error, { action: 'setDesignTemplate' })
    return { ok: false, message: TEMPLATE_REFUSALS.flagFailed }
  }
}

/**
 * Start a new design from one of this workspace's own starting points.
 *
 * ── A COPY, AND THE ORIGINAL IS NOT TOUCHED ────────────────────────────────
 * The whole document is carried over: the words, and the asset ids of the
 * pictures. The two rows are independent from this moment, so editing the copy
 * never changes the starting point. Nothing is charged and no model is called.
 *
 * The pictures are referenced rather than duplicated, which is deliberate: two
 * designs pointing at one photograph is what the library is for, and copying
 * bytes would bill a person twice for the same file. It also means trashing
 * that photograph affects both, which is the same thing that was already true
 * of any two designs using one picture.
 */
export async function startFromTemplate(designId: unknown): Promise<SaveDesignState> {
  const id = z.uuid().safeParse(designId)
  if (!id.success) return { ok: false, message: TEMPLATE_REFUSALS.notFound }

  const workspace = await workspaceForWrite()
  if (!workspace.ok) return { ok: false, message: workspace.message }

  try {
    const supabase = createServerSupabase()
    const read = await supabase
      .from('studio_designs')
      .select('*')
      .eq('workspace_id', workspace.workspace.id)
      .eq('id', id.data)
      .maybeSingle()

    if (read.error) return { ok: false, message: TEMPLATE_REFUSALS.unreadable }
    if (!read.data) return { ok: false, message: TEMPLATE_REFUSALS.notFound }

    const source = StudioDesignSchema.safeParse(read.data)
    if (!source.success) return { ok: false, message: TEMPLATE_REFUSALS.unreadable }

    // Written through `saveDesign` rather than a second insert, so the copy
    // passes the same template and preset checks a new design does. A starting
    // point saved before a layout was retired must not produce a design nobody
    // can open.
    return saveDesign({
      title: source.data.title,
      presetId: source.data.preset_id,
      doc: source.data.doc,
      isTemplate: false,
    })
  } catch (error) {
    reportServerError(error, { action: 'startFromTemplate' })
    return { ok: false, message: TEMPLATE_REFUSALS.copyFailed }
  }
}
