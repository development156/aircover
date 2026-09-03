import 'server-only'

import {
  StudioGenerationImageSchema,
  StudioGenerationRowSchema,
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
  /**
   * The mime we PROVED by sniffing the stored bytes, never the model's claim
   * about them. Null when the file is gone or the asset row could not be read,
   * and a download then carries no extension rather than a wrong one.
   */
  mime: string | null
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
  // ── TWO ANSWERS, NOT ONE ────────────────────────────────────────────────
  // `status !== 'ok'` collapsed `unreadable` into `no-workspace`, and this
  // union carries both on purpose. `RecentGenerations` renders NOTHING for
  // `no-workspace`, so a member whose workspace read failed lost the entire
  // "What you have made" section with no picture, no error and no explanation.
  // `read-brain.ts:117` fixed exactly this for the Brand Brain and states why.
  const workspace = await activeWorkspaceRead()
  if (workspace.status === 'unreadable') return { status: 'unreadable' }
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
    // The REFINED schema, which is the whole reason it exists: it also asserts
    // the migration's own CHECK that a settled row carries a finish time. It was
    // exported with a comment saying the shape is "refused once, here" and then
    // called by nothing, so a `ready` row with no finish time — from a restored
    // backup or a hand-written fix — parsed cleanly and every screen downstream
    // had to defend against it.
    const parsed = StudioGenerationRowSchema.safeParse(row)
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
  const mimes = new Map<string, string>()
  if (assetIds.length > 0) {
    const assets = await supabase
      .from('assets')
      .select('id, storage_path, mime')
      .eq('workspace_id', workspaceId)
      .in('id', assetIds)
    for (const row of assets.data ?? []) {
      if (typeof row.id === 'string' && typeof row.storage_path === 'string') {
        paths.set(row.id, row.storage_path)
      }
      if (typeof row.id === 'string' && typeof row.mime === 'string') {
        mimes.set(row.id, row.mime)
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
      mime: image.asset_id === null ? null : (mimes.get(image.asset_id) ?? null),
    })
    grouped.set(image.generation_id, list)
  }

  return grouped
}

/** One picture already in the library, offered as something to match. */
export type LibraryPicture = {
  assetId: string
  url: string | null
  title: string | null
}

/**
 * Recent pictures from this workspace, newest first, for the reference picker.
 *
 * Images only, and live only: a trashed file is not something to build a look
 * from, and offering one would let somebody condition a paid generation on a
 * picture they had already decided to throw away.
 *
 * Returns an EMPTY list on a failed read. The picker then says there is nothing
 * to match, which is wrong in a harmless direction: the person can still make a
 * picture. Failing the screen over a picker would be worse.
 */
export async function readLibraryPictures(limit = 12): Promise<LibraryPicture[]> {
  const workspace = await activeWorkspaceRead()
  if (workspace.status !== 'ok') return []

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('assets')
    .select('id, storage_path, title')
    .eq('workspace_id', workspace.workspace.id)
    .eq('kind', 'image')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  const rows = data
    .filter((row) => typeof row.id === 'string' && typeof row.storage_path === 'string')
    .map((row) => ({
      id: row.id as string,
      storage_path: row.storage_path as string,
      title: typeof row.title === 'string' ? row.title : null,
    }))
  const signed = await signMediaPreviews(rows)
  const urls = new Map(signed.map((one) => [one.id, one.url]))

  return rows.map((row) => ({
    assetId: row.id,
    // Null when the link would not sign. The picker shows the card anyway,
    // because the picture exists and can still be picked.
    url: urls.get(row.id) ?? null,
    title: row.title !== null && row.title !== '' ? row.title : null,
  }))
}
