import 'server-only'

import { AssetSchema, PostStatusSchema, VariantPublishStatusSchema } from '@sahoda/shared'
import type { Asset, AssetUsageSite, PostStatus, VariantPublishStatus } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * The media library, read from `assets` and `asset_usages`.
 *
 * ── EVERY FIGURE ON THE SCREEN COMES FROM HERE ───────────────────────────────
 * The library shows counts — how many files, how many posts use one. Not one of
 * them is computed from anything but a row this module actually fetched. Where a
 * count cannot be established the shape says `unreadable` and the screen says so
 * in words; it never falls back to zero, because a zero is a claim about the
 * customer's business and "we could not read it" is a claim about us.
 *
 * ── WHY FOUR QUERIES AND NOT ONE EMBEDDED SELECT ─────────────────────────────
 * `asset_usages` reaches `posts` through a COMPOSITE foreign key
 * `(post_id, workspace_id)`. PostgREST's embedding picks a relationship by name
 * and is ambiguous when two keys could serve, and an ambiguous embed fails at
 * runtime rather than at build. Four explicit `in (…)` reads are longer to write
 * and impossible to misread.
 *
 * Every read is scoped to the ACTIVE workspace as well as being RLS-scoped, for
 * the reason `lib/posts/read.ts` sets out at length: the member policy admits
 * every workspace the person belongs to, so an unscoped list blends two tenants.
 */

/**
 * Hard cap on the library list. Exported because the screen must be able to SAY
 * it is capped — a truncated list rendered as the whole set is a lie about how
 * many files the workspace has.
 */
export const ASSET_LIST_LIMIT = 200

/** One library file, with every post that uses it. */
export interface LibraryAsset {
  asset: Asset
  /** MEASURED from `asset_usages`. An empty array means "nothing uses this". */
  usage: AssetUsageSite[]
}

export type AssetsRead =
  | { status: 'ok'; assets: LibraryAsset[]; capped: boolean }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

interface PostFacts {
  title: string | null
  status: PostStatus
  variantStatuses: VariantPublishStatus[]
}

/**
 * Load which posts use which files.
 *
 * Returns null — not an empty map — when the usage read fails. The difference is
 * the whole delete gate: an empty map says "nothing uses these files", which is
 * exactly the sentence that would let someone delete a photo out from under a
 * scheduled post.
 */
async function readUsage(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  assetIds: readonly string[],
): Promise<Map<string, AssetUsageSite[]> | null> {
  const byAsset = new Map<string, AssetUsageSite[]>()
  if (assetIds.length === 0) return byAsset

  const usages = await supabase
    .from('asset_usages')
    .select('asset_id, post_id')
    .eq('workspace_id', workspaceId)
    .in('asset_id', [...assetIds])

  if (usages.error || !usages.data) return null

  const rows = usages.data.flatMap((row) => {
    const assetId = (row as { asset_id?: unknown }).asset_id
    const postId = (row as { post_id?: unknown }).post_id
    if (typeof assetId !== 'string' || typeof postId !== 'string') return []
    return [{ assetId, postId }]
  })
  if (rows.length === 0) return byAsset

  const postIds = [...new Set(rows.map((row) => row.postId))]

  const posts = await supabase
    .from('posts')
    .select('id, title, status')
    .eq('workspace_id', workspaceId)
    .in('id', postIds)
  if (posts.error || !posts.data) return null

  const variants = await supabase
    .from('post_variants')
    .select('post_id, publish_status')
    .eq('workspace_id', workspaceId)
    .in('post_id', postIds)
  // A variant read that fails is NOT survivable here either: a variant is one of
  // the two things that lock a file, so treating a failed read as "no variants"
  // would open the gate on exactly the post that is mid-publish.
  if (variants.error || !variants.data) return null

  const variantsByPost = new Map<string, VariantPublishStatus[]>()
  for (const row of variants.data) {
    const postId = (row as { post_id?: unknown }).post_id
    const parsed = VariantPublishStatusSchema.safeParse(
      (row as { publish_status?: unknown }).publish_status,
    )
    if (typeof postId !== 'string' || !parsed.success) continue
    const list = variantsByPost.get(postId) ?? []
    list.push(parsed.data)
    variantsByPost.set(postId, list)
  }

  const factsByPost = new Map<string, PostFacts>()
  for (const row of posts.data) {
    const id = (row as { id?: unknown }).id
    if (typeof id !== 'string') continue
    const status = PostStatusSchema.safeParse((row as { status?: unknown }).status)
    const rawTitle = (row as { title?: unknown }).title
    factsByPost.set(id, {
      title: typeof rawTitle === 'string' ? rawTitle : null,
      // A status this build does not recognise is carried through as the literal
      // string rather than being replaced with 'draft'. `decideAssetDelete` does
      // not lock on it — but the SQL trigger, which is the real gate, reads the
      // column itself and is not fooled by this parse. Substituting 'draft' here
      // would make the SCREEN claim a file is free while the database refuses it.
      status: status.success ? status.data : ((row as { status?: string }).status as PostStatus),
      variantStatuses: variantsByPost.get(id) ?? [],
    })
  }

  for (const { assetId, postId } of rows) {
    const facts = factsByPost.get(postId)
    // A usage whose post could not be read is DROPPED from the screen's list but
    // is still in the database, where the trigger sees it. The screen therefore
    // under-reports rather than over-permits, and the delete still refuses.
    if (!facts) continue
    const list = byAsset.get(assetId) ?? []
    list.push({
      postId,
      postTitle: facts.title,
      postStatus: facts.status,
      variantStatuses: facts.variantStatuses,
    })
    byAsset.set(assetId, list)
  }

  return byAsset
}

/** The whole library for the active workspace, newest first. */
export async function readAssets(): Promise<AssetsRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'none') return { status: 'no-workspace' }
    if (workspace.status !== 'ok') return { status: 'unreadable' }
    const workspaceId = workspace.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(ASSET_LIST_LIMIT)

    if (error || !data) return { status: 'unreadable' }

    // Per row, so one malformed row costs one tile rather than the whole screen.
    const parsed = data.flatMap((row) => {
      const asset = AssetSchema.safeParse(row)
      return asset.success ? [asset.data] : []
    })

    const usage = await readUsage(
      supabase,
      workspaceId,
      parsed.map((asset) => asset.id),
    )
    if (usage === null) return { status: 'unreadable' }

    return {
      status: 'ok',
      assets: parsed.map((asset) => ({ asset, usage: usage.get(asset.id) ?? [] })),
      capped: data.length >= ASSET_LIST_LIMIT,
    }
  } catch {
    return { status: 'unreadable' }
  }
}

export type AssetRead =
  { status: 'ok'; asset: LibraryAsset } | { status: 'missing' } | { status: 'unreadable' }

/** One library file and everywhere it is used. The delete gate's input. */
export async function readAsset(assetId: string): Promise<AssetRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status !== 'ok') {
      return { status: workspace.status === 'none' ? 'missing' : 'unreadable' }
    }
    const workspaceId = workspace.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('id', assetId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (error) return { status: 'unreadable' }
    if (!data) return { status: 'missing' }

    const asset = AssetSchema.safeParse(data)
    if (!asset.success) return { status: 'unreadable' }

    const usage = await readUsage(supabase, workspaceId, [asset.data.id])
    if (usage === null) return { status: 'unreadable' }

    return { status: 'ok', asset: { asset: asset.data, usage: usage.get(asset.data.id) ?? [] } }
  } catch {
    return { status: 'unreadable' }
  }
}

/**
 * The library NAME for each attachment that came from the library.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `post_media` has no name column. The composer derives one from the storage
 * path's last segment, which for a direct upload is a uuid and for a LIBRARY
 * file is the same uuid — so a photo the person carefully called "shopfront.png"
 * appeared on their post as `4f3ac1b2-….png`. Naming a thing and then not being
 * shown that name is the shape of a feature that is only half built.
 *
 * ── WHY IT KEYS ON storage_path AND NOT asset_id ─────────────────────────────
 * `assets` carries `unique (workspace_id, storage_path)` and a library
 * attachment reuses the library's own object, so the path is an exact key. Using
 * it means the frozen `PostMediaSchema` does not have to grow a column to make
 * the composer readable — and the name is read LIVE, so renaming a photo in the
 * library renames it on every post that uses it rather than leaving stale copies.
 *
 * A failed read returns an empty map: the composer then falls back to the path,
 * which is what it always did. Missing a nicer name is not worth an error state.
 */
export async function readLibraryNames(
  storagePaths: readonly string[],
): Promise<Map<string, string>> {
  const byPath = new Map<string, string>()
  const paths = [...new Set(storagePaths.filter((p) => typeof p === 'string' && p !== ''))]
  if (paths.length === 0) return byPath

  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status !== 'ok') return byPath

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('assets')
      .select('storage_path, title')
      .eq('workspace_id', workspace.workspace.id)
      .in('storage_path', paths)

    if (error || !data) return byPath
    for (const row of data) {
      const path = (row as { storage_path?: unknown }).storage_path
      const title = (row as { title?: unknown }).title
      if (typeof path !== 'string') continue
      if (typeof title !== 'string' || title.trim() === '') continue
      byPath.set(path, title.trim())
    }
    return byPath
  } catch {
    return byPath
  }
}
