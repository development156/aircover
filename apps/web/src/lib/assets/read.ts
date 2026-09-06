import 'server-only'

import { AssetSchema, PostStatusSchema, VariantPublishStatusSchema } from '@sahoda/shared'
import type { Asset, AssetUsageSite, PostStatus, VariantPublishStatus } from '@sahoda/shared'

import type { TrashCursor } from '@/lib/assets/state'
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
  /**
   * Storage path of the 480 px thumbnail (`asset_derivatives`, recipe `thumb`),
   * or null when none was minted. Null is ordinary: the thumbnail is best
   * effort at upload time and the tile falls back to the original.
   */
  thumbPath: string | null
}

/** The recipe `lib/media/thumb.ts` writes. Read here so the two cannot drift. */
export const THUMB_RECIPE = 'thumb'

/** How many rows one `emptyTrash` pass deletes before it reports back. */
export const TRASH_BATCH = 20

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

/**
 * Which files have a thumbnail, and where it is.
 *
 * BEST EFFORT, and that is the one read in this module allowed to be: a failed
 * thumbnail read costs the grid its small copies and it loads the originals
 * instead, which is what it did before thumbnails existed. Nothing a person
 * reads as a fact about their library comes from this map.
 */
async function readThumbPaths(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  assetIds: readonly string[],
): Promise<Map<string, string>> {
  const byAsset = new Map<string, string>()
  if (assetIds.length === 0) return byAsset
  try {
    const { data, error } = await supabase
      .from('asset_derivatives')
      .select('asset_id, storage_path')
      .eq('workspace_id', workspaceId)
      .eq('recipe', THUMB_RECIPE)
      .in('asset_id', [...assetIds])
    if (error || !data) return byAsset
    for (const row of data) {
      const assetId = (row as { asset_id?: unknown }).asset_id
      const path = (row as { storage_path?: unknown }).storage_path
      if (typeof assetId === 'string' && typeof path === 'string' && path !== '') {
        byAsset.set(assetId, path)
      }
    }
    return byAsset
  } catch {
    return byAsset
  }
}

/**
 * Parse a page of rows, read their usage and their thumbnails, and say whether
 * the page hit `limit`. Shared by every list read below so the four of them
 * cannot disagree about what a `LibraryAsset` carries.
 */
async function finishRead(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  rows: unknown[],
  limit: number,
): Promise<AssetsRead> {
  // Per row, so one malformed row costs one tile rather than the whole screen.
  const parsed = rows.flatMap((row) => {
    const asset = AssetSchema.safeParse(row)
    return asset.success ? [asset.data] : []
  })
  const ids = parsed.map((asset) => asset.id)

  // Independent of each other, so they go together. The usage read is strict
  // (null fails the page); the thumbnail read is not, and says so above.
  const [usage, thumbs] = await Promise.all([
    readUsage(supabase, workspaceId, ids),
    readThumbPaths(supabase, workspaceId, ids),
  ])
  if (usage === null) return { status: 'unreadable' }

  return {
    status: 'ok',
    assets: parsed.map((asset) => ({
      asset,
      usage: usage.get(asset.id) ?? [],
      thumbPath: thumbs.get(asset.id) ?? null,
    })),
    capped: rows.length >= limit,
  }
}

/**
 * The whole LIVE library for the active workspace, newest first.
 *
 * ── `deleted_at is null` IS THE TRASH, AND IT IS ENFORCED HERE IN SQL ────────
 * Not by filtering the rows after they arrive. Two reasons, and the second is
 * the one that matters. First, the partial index `assets_live_idx` carries this
 * exact predicate, so the filter is free. Second, the cap: `ASSET_LIST_LIMIT` is
 * applied by Postgres, so a workspace with 200 trashed files and 40 live ones
 * would fetch 200 rows, throw most away, and report a library of 40 as CAPPED.
 * The count under the list would then be wrong in the one direction a person
 * cannot detect.
 *
 * If the migration adding the column is not applied, PostgREST answers `42703`
 * and this returns `unreadable`, so the screen says it could not read the
 * library. That is the right failure: the alternative is a trash that silently
 * holds nothing while appearing to work.
 */
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
      .is('deleted_at', null)
      // `id` breaks ties. Two files added in one batch can share a timestamp,
      // and a cursor over `created_at` alone would then skip or repeat one of
      // them at the page boundary. Same pair `readOlderAssets` seeks on.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(ASSET_LIST_LIMIT)

    if (error || !data) return { status: 'unreadable' }
    return finishRead(supabase, workspaceId, data, ASSET_LIST_LIMIT)
  } catch {
    return { status: 'unreadable' }
  }
}

/**
 * The next `ASSET_LIST_LIMIT` live files OLDER than a cursor, newest first.
 *
 * A keyset, not an offset: an offset shifts under a person the moment a file
 * is added or trashed above it, and the page they asked for then repeats or
 * skips a row. `(created_at, id)` is the exact order `readAssets` draws, so
 * the page after the cap is the page a person would have seen had there been
 * no cap.
 */
export async function readOlderAssets(before: {
  createdAt: string
  id: string
}): Promise<AssetsRead> {
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
      .is('deleted_at', null)
      .or(
        `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`,
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(ASSET_LIST_LIMIT)

    if (error || !data) return { status: 'unreadable' }
    return finishRead(supabase, workspaceId, data, ASSET_LIST_LIMIT)
  } catch {
    return { status: 'unreadable' }
  }
}

/** The most characters a server search reads. Longer than any name a person types. */
const SEARCH_MAX = 80

/**
 * Live files whose name or description contains `text`, newest first.
 *
 * Exists for the file OLDER than the cap: the screen filters the 200 it holds
 * and cannot find what it never loaded. Only the plain words are sent, because
 * `type:`/`used:`/`size:` tokens are answered by the client over whatever rows
 * it has; this fetches rows, and the client then asks its own question of them.
 *
 * The pattern is quoted for PostgREST's `or()` grammar, so a comma or a
 * bracket in a name is a character and not a separator. `%` and `_` keep
 * their LIKE meaning: a person typing `menu_board` still finds `menu_board`.
 */
export async function searchAssetsByText(text: string): Promise<AssetsRead> {
  try {
    const needle = text.trim().slice(0, SEARCH_MAX)
    if (needle === '') return { status: 'ok', assets: [], capped: false }

    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'none') return { status: 'no-workspace' }
    if (workspace.status !== 'ok') return { status: 'unreadable' }
    const workspaceId = workspace.workspace.id

    const quoted = `"%${needle.replace(/["\\]/g, '\\$&')}%"`
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .or(`title.ilike.${quoted},alt.ilike.${quoted}`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(ASSET_LIST_LIMIT)

    if (error || !data) return { status: 'unreadable' }
    return finishRead(supabase, workspaceId, data, ASSET_LIST_LIMIT)
  } catch {
    return { status: 'unreadable' }
  }
}

/**
 * The trash: files a person deleted, which are still whole.
 *
 * Ordered by WHEN THEY WERE TRASHED rather than when they were made, because
 * "what did I just delete" is the only question this view is opened to answer.
 * A photo taken in January and deleted a minute ago belongs at the top.
 *
 * Usage is read for these too, and that is deliberate rather than wasteful: the
 * confirmation before "Delete for good" needs the same gate the live library's
 * delete uses, and a trashed file's posts can change while it sits here.
 */
export async function readTrashedAssets(): Promise<AssetsRead> {
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
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(ASSET_LIST_LIMIT)

    if (error || !data) return { status: 'unreadable' }
    return finishRead(supabase, workspaceId, data, ASSET_LIST_LIMIT)
  } catch {
    return { status: 'unreadable' }
  }
}

export type TrashCountRead =
  { status: 'ok'; count: number } | { status: 'no-workspace' } | { status: 'unreadable' }

/**
 * How many files are in the trash. A COUNT, not the rows.
 *
 * The page needs this number for the sidebar and for the one guard that keeps
 * the trash reachable from an empty library; it does not need two hundred rows,
 * their usage and their signed links for a view most visits never open. Those
 * are read when the trash is opened (`loadTrash`).
 */
export async function readTrashedCount(): Promise<TrashCountRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'none') return { status: 'no-workspace' }
    if (workspace.status !== 'ok') return { status: 'unreadable' }

    const supabase = createServerSupabase()
    const { count, error } = await supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.workspace.id)
      .not('deleted_at', 'is', null)

    if (error || typeof count !== 'number') return { status: 'unreadable' }
    return { status: 'ok', count }
  } catch {
    return { status: 'unreadable' }
  }
}

export type TrashBatchRead =
  | { status: 'ok'; rows: TrashCursor[]; more: boolean }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

/**
 * One batch of the trash, `TRASH_BATCH` rows at a time, newest deletion first.
 *
 * Only the id and the deletion time: `deleteAsset` re-reads each row and its
 * usage itself, inside the gate, so reading it here would be the same work
 * twice. The cursor is `(deleted_at, id)` because a bulk trash stamps every
 * row with ONE timestamp, and a cursor over the time alone would skip the rest
 * of that batch. A file the gate keeps stays in the trash and stays BEFORE the
 * cursor, so the next pass does not meet it again.
 */
export async function readTrashedBatch(after: TrashCursor | null): Promise<TrashBatchRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'none') return { status: 'no-workspace' }
    if (workspace.status !== 'ok') return { status: 'unreadable' }

    const supabase = createServerSupabase()
    let query = supabase
      .from('assets')
      .select('id, deleted_at')
      .eq('workspace_id', workspace.workspace.id)
      .not('deleted_at', 'is', null)
    if (after !== null) {
      query = query.or(
        `deleted_at.lt.${after.deletedAt},and(deleted_at.eq.${after.deletedAt},id.lt.${after.id})`,
      )
    }
    const { data, error } = await query
      .order('deleted_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(TRASH_BATCH)

    if (error || !data) return { status: 'unreadable' }
    const rows = data.flatMap((row) => {
      const id = (row as { id?: unknown }).id
      const deletedAt = (row as { deleted_at?: unknown }).deleted_at
      return typeof id === 'string' && typeof deletedAt === 'string' ? [{ id, deletedAt }] : []
    })
    return { status: 'ok', rows, more: data.length >= TRASH_BATCH }
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

    return {
      status: 'ok',
      // No thumbnail read here: nothing that takes ONE file draws a tile.
      asset: { asset: asset.data, usage: usage.get(asset.data.id) ?? [], thumbPath: null },
    }
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
