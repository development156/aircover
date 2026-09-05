import 'server-only'

import {
  StudioGenerationImageSchema,
  StudioGenerationRowSchema,
  type StudioGeneration,
} from '@sahoda/shared'
import { z } from 'zod'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'
import { canvasPictures, type CanvasPicture } from '@/lib/studio/canvas'
import { picturesFor } from '@/lib/studio/read'
import { remixLineageFromRow, type RemixLineage } from '@/lib/studio/remix-lineage'

/**
 * ONE PICTURE, AND EVERYTHING ITS OWN SCREEN NEEDS TO SAY ABOUT IT.
 *
 * ── KEYED BY IMAGE, NOT BY GENERATION ────────────────────────────────────────
 * `/studio/<id>` names a `studio_generation_images.id` — the wall's own links
 * are built from `CanvasPicture.imageId`, which comes from exactly that column
 * — never a generation id. A press that made four pictures produced four
 * distinct viewer URLs, one per image, because "this picture" is what somebody
 * followed a link to see.
 *
 * ── NOT FOUND COVERS "DOES NOT EXIST" AND "BELONGS TO SOMEONE ELSE" ──────────
 * Both reads below are scoped by `workspace_id` as well as by RLS. A row from
 * another workspace and a row that was never written return the identical
 * `not-found`, on purpose: telling the two apart would confirm to somebody
 * that an id they guessed belongs to a real picture, just not theirs.
 */
export type ViewerRead =
  | {
      status: 'ok'
      picture: CanvasPicture
      generation: StudioGeneration
      lineage: RemixLineage
      versions: ViewerVersions
    }
  | { status: 'not-found' }
  | { status: 'unreadable' }

/** One version in the strip, and whether it is the one currently open. */
export type VersionEntry = { picture: CanvasPicture; current: boolean }

/** Null when there is no lineage to group by: never a strip showing one. */
export type ViewerVersions = { total: number; index: number; entries: VersionEntry[] } | null

export async function readPictureForViewer(id: string): Promise<ViewerRead> {
  const parsedId = z.uuid().safeParse(id)
  if (!parsedId.success) return { status: 'not-found' }

  const workspace = await activeWorkspaceRead()
  if (workspace.status === 'unreadable') return { status: 'unreadable' }
  if (workspace.status !== 'ok') return { status: 'not-found' }
  const workspaceId = workspace.workspace.id

  const supabase = createServerSupabase()

  const imageRow = await supabase
    .from('studio_generation_images')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', parsedId.data)
    .maybeSingle()
  if (imageRow.error) return { status: 'unreadable' }
  if (!imageRow.data) return { status: 'not-found' }

  const parsedImage = StudioGenerationImageSchema.safeParse(imageRow.data)
  if (!parsedImage.success) return { status: 'unreadable' }
  const generationId = parsedImage.data.generation_id

  // ── PROBE THE LINEAGE COLUMNS THE SAME WAY `queueGeneration` PROBES ON WRITE
  // Named explicitly rather than through `select('*')`, because `*` silently
  // omits a column that does not exist and this needs to KNOW that happened,
  // not just receive a row one field short. `42703` (undefined column) means
  // the migration is not applied; anything else is a real read failure.
  let genRow = await supabase
    .from('studio_generations')
    .select('*, remixed_from, stamp_enabled, stamp_anchor, stamp_size_step')
    .eq('workspace_id', workspaceId)
    .eq('id', generationId)
    .maybeSingle()

  let columnsApplied = true
  if (genRow.error?.code === '42703') {
    columnsApplied = false
    genRow = await supabase
      .from('studio_generations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('id', generationId)
      .maybeSingle()
  }
  if (genRow.error) return { status: 'unreadable' }
  if (!genRow.data) return { status: 'not-found' }

  const parsedGeneration = StudioGenerationRowSchema.safeParse(genRow.data)
  if (!parsedGeneration.success) return { status: 'unreadable' }

  const lineage = remixLineageFromRow(genRow.data, columnsApplied)

  const byGeneration = await picturesFor(workspaceId, [generationId])
  const [picture] = canvasPictures([
    { generation: parsedGeneration.data, pictures: byGeneration.get(generationId) ?? [] },
  ]).filter((one) => one.imageId === parsedId.data)
  if (picture === undefined) return { status: 'not-found' }

  const versions =
    lineage.columnsApplied === true
      ? await readVersions(supabase, workspaceId, parsedGeneration.data.id, lineage.remixedFrom)
      : null

  return { status: 'ok', picture, generation: parsedGeneration.data, lineage, versions }
}

/**
 * Every generation in this picture's lineage GROUP, oldest first, each reduced
 * to its own first showable picture.
 *
 * The group is "the root and everything remixed from it": when this generation
 * IS a remix, the root is the one it was remixed from; otherwise this
 * generation is the root itself. Either way the same query finds every sibling
 * in one round trip.
 *
 * Never called unless the caller already confirmed the lineage columns exist
 * — a generation belonging to no group (never remixed, never a parent) simply
 * comes back as one row, and one row is `null` versions, not a strip of one.
 */
async function readVersions(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  generationId: string,
  remixedFrom: string | null,
): Promise<ViewerVersions> {
  const root = remixedFrom ?? generationId

  const rows = await supabase
    .from('studio_generations')
    .select('*, remixed_from, stamp_enabled, stamp_anchor, stamp_size_step')
    .eq('workspace_id', workspaceId)
    .or(`id.eq.${root},remixed_from.eq.${root}`)
    .order('created_at', { ascending: true })

  if (rows.error || !rows.data) return null

  const generations = rows.data
    .map((row) => StudioGenerationRowSchema.safeParse(row))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
  if (generations.length <= 1) return null

  const byGeneration = await picturesFor(
    workspaceId,
    generations.map((one) => one.id),
  )

  // One thumbnail per generation: its first showable picture, in the order the
  // generations themselves were made. Built per-generation (never off the
  // flattened `canvasPictures(cards)` list) because `CanvasPicture` does not
  // carry the generation id back, and a card's OWN pictures are the only
  // reliable way to keep a thumbnail attached to the version it belongs to.
  // A generation with nothing showable (failed, still running) drops out of
  // both the strip and the count, rather than reserving an empty slot for it.
  const entries: VersionEntry[] = []
  for (const generation of generations) {
    const ownPictures = byGeneration.get(generation.id) ?? []
    const [built] = canvasPictures([{ generation, pictures: ownPictures }])
    if (built === undefined) continue
    entries.push({ picture: built, current: generation.id === generationId })
  }

  if (entries.length <= 1) return null
  const index = entries.findIndex((entry) => entry.current)
  return { total: entries.length, index: index === -1 ? 1 : index + 1, entries }
}
