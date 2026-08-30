import 'server-only'

import {
  StudioGenerationImageSchema,
  StudioGenerationSchema,
  type StudioGeneration,
} from '@sahoda/shared'

import { signMediaPreviews } from '@/lib/posts/media-url'
import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * READING WHAT THIS WORKSPACE HAS ASKED FOR, AND SHOWING IT.
 *
 * ── FOUR ANSWERS, KEPT APART ────────────────────────────────────────────────
 * `no-workspace`, `unreadable`, an EMPTY list and a full one are four different
 * situations and only one of them has "make your first picture" as a remedy. A
 * reader that collapses them tells somebody whose read just failed that they
 * have never made anything, which is both false and unfixable by following the
 * instruction it offers.
 *
 * ── PARSED PER ROW ──────────────────────────────────────────────────────────
 * One malformed row costs its own card, not the screen. The screen it would
 * otherwise take down is the one showing a person what they have already paid
 * for, which is the worst screen in the product to lose.
 *
 * ── AND A PICTURE THAT WILL NOT SIGN IS STILL A PICTURE ─────────────────────
 * `signMediaPreviews` hands back `url: null` for a row it could not sign rather
 * than dropping it. That distinction is kept all the way to the screen: the
 * image was made, it is in the library, and only the preview link failed. A
 * reader that dropped it would tell somebody their picture does not exist.
 */

/** One produced picture, with a link that expires. */
export type GenerationPicture = {
  imageId: string
  idx: number
  /** Null when the file was deleted from the library, which is a real state. */
  assetId: string | null
  /** Null when the file exists and its preview link could not be signed. */
  url: string | null
  width: number | null
  height: number | null
}

export type GenerationCard = {
  generation: StudioGeneration
  pictures: GenerationPicture[]
}

export type GenerationsRead =
  | { status: 'ok'; cards: GenerationCard[]; unreadable: number }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

/**
 * The most recent requests, newest first, each with the pictures it produced.
 *
 * Three round trips rather than one nested select, deliberately: PostgREST
 * embeds are resolved under the SAME policies but silently return an empty
 * array when a nested relationship cannot be traversed, so a policy mistake
 * would look exactly like "this generation produced nothing". Three explicit
 * reads make a failure a failure.
 */
export async function readGenerations(limit = 24): Promise<GenerationsRead> {
  const workspace = await activeWorkspaceRead()
  if (workspace.status !== 'ok') return { status: 'no-workspace' }
  const workspaceId = workspace.workspace.id

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('studio_generations')
    .select('*')
    // Scoped here as well as in RLS: the policy admits every workspace this
    // person belongs to, so an unscoped read would show another one's pictures.
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { status: 'unreadable' }

  const generations: StudioGeneration[] = []
  let unreadable = 0
  for (const row of data ?? []) {
    const parsed = StudioGenerationSchema.safeParse(row)
    if (parsed.success) generations.push(parsed.data)
    else unreadable += 1
  }

  const byGeneration = await picturesFor(
    workspaceId,
    generations.map((g) => g.id),
  )

  return {
    status: 'ok',
    cards: generations.map((generation) => ({
      generation,
      pictures: byGeneration.get(generation.id) ?? [],
    })),
    unreadable,
  }
}

/**
 * Every picture belonging to these generations, signed, grouped by generation.
 *
 * Returns an EMPTY map on a failed read rather than throwing. A generation whose
 * pictures could not be read still shows: its own row is the record of what was
 * asked and what it cost, and that is worth showing even when the file behind it
 * cannot be reached this second.
 */
async function picturesFor(
  workspaceId: string,
  generationIds: readonly string[],
): Promise<Map<string, GenerationPicture[]>> {
  const grouped = new Map<string, GenerationPicture[]>()
  if (generationIds.length === 0) return grouped

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('studio_generation_images')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('generation_id', [...generationIds])
    .order('idx', { ascending: true })

  if (error || !data) return grouped

  const images = data
    .map((row) => StudioGenerationImageSchema.safeParse(row))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)

  const assetIds = images
    .map((image) => image.asset_id)
    .filter((id): id is string => typeof id === 'string')

  // One round trip for the paths, one for the signatures.
  const paths = new Map<string, string>()
  if (assetIds.length > 0) {
    const assets = await supabase
      .from('assets')
      .select('id, storage_path')
      .eq('workspace_id', workspaceId)
      .in('id', assetIds)
    for (const row of assets.data ?? []) {
      if (typeof row.id === 'string' && typeof row.storage_path === 'string') {
        paths.set(row.id, row.storage_path)
      }
    }
  }

  const signed = await signMediaPreviews(
    [...paths.entries()].map(([id, storage_path]) => ({ id, storage_path })),
  )
  const urls = new Map(signed.map((one) => [one.id, one.url]))

  for (const image of images) {
    const list = grouped.get(image.generation_id) ?? []
    list.push({
      imageId: image.id,
      idx: image.idx,
      assetId: image.asset_id,
      // Three states, kept apart: no file at all, a file whose link failed, and
      // a working link.
      url: image.asset_id === null ? null : (urls.get(image.asset_id) ?? null),
      width: image.width,
      height: image.height,
    })
    grouped.set(image.generation_id, list)
  }

  return grouped
}
