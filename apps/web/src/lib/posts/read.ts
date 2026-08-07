import 'server-only'

import {
  PostMediaSchema,
  PostSchema,
  PostVariantSchema,
  PublishModeSchema,
  type Post,
  type PostMedia,
  type PostVariant,
} from '@sahoda/shared'

import { cache } from 'react'

import { collapseModes, type PostPublishMode } from '@/lib/posts/certainty'
import { createServerSupabase } from '@/lib/supabase/server'
import { variantStatusRow, type VariantStatusRow } from '@/lib/posts/variant-status'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * Post reads, RLS-scoped via the Clerk session JWT. `posts` / `post_variants` /
 * `post_media` all carry full member CRUD policies, so these are plain PostgREST
 * selects — no RPC needed.
 *
 * Every read degrades to empty/null rather than throwing: the app shell must
 * survive a read hiccup, exactly as `listWorkspaces` does. Rows are parsed
 * per-row so one malformed row cannot take down a list.
 *
 * Every read is also filtered to the ACTIVE workspace. RLS remains the security
 * boundary and this filter is NOT an authorization check — the cookie behind the
 * active workspace is not a grant (see `lib/workspaces.ts`). It is a CORRECTNESS
 * filter: the member policy is
 * `workspace_id in (select app.member_workspace_ids())`, which admits EVERY
 * workspace the user belongs to. Unscoped, `listPosts` would blend two tenants
 * into one list while `createPost` / `generateVariants` charge the active one —
 * so opening another workspace's post from that list and generating would debit
 * the wrong wallet and then fail the `(post_id, workspace_id)` composite FK on
 * save, billing the user for variants they cannot keep.
 */

/** Memoised per request so a post page's three reads share one workspace lookup. */
const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const workspace = await getActiveWorkspace()
  return workspace?.id ?? null
})

/**
 * Hard cap on `listPosts`. Exported because the list screen must be able to SAY
 * it is capped — a truncated list rendered as if it were the whole set is a lie
 * about the workspace's contents.
 */
export const LIST_LIMIT = 100

export async function listPosts(): Promise<Post[]> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return []

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT)

    if (error || !data) {
      if (error) console.error('[posts] list failed', error.code, error.message)
      return []
    }
    return data.flatMap((row) => {
      const parsed = PostSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })
  } catch (error) {
    console.error('[posts] list threw', error instanceof Error ? error.message : 'unknown')
    return []
  }
}

export async function getPost(postId: string): Promise<Post | null> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return null

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (error || !data) return null
    const parsed = PostSchema.safeParse(data)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function listVariants(postId: string): Promise<PostVariant[]> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return []

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_variants')
      .select('*')
      .eq('post_id', postId)
      .eq('workspace_id', workspaceId)
      .order('channel', { ascending: true })

    if (error || !data) return []
    return data.flatMap((row) => {
      const parsed = PostVariantSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return []
  }
}

/**
 * Cap on the publish-log read. A post publishes to at most a handful of channels
 * and retries are bounded, so this is far above any real post's log count; it
 * exists so a pathological row explosion cannot stall a list render.
 */
const PUBLISH_LOG_LIMIT = 500

/** A row shape loose enough to survive an unexpected column, strict where it counts. */
interface PublishLogRow {
  post_id: unknown
  mode: unknown
  status: unknown
}

/**
 * What the publish logs say about each of these posts: 'live', 'fixture',
 * 'mixed', or absent (unknown).
 *
 * This is the evidence behind `.is-real`. `post_publish_logs` is member-readable
 * (`apply_tenant_read_policy`) but is written only by the publisher with a
 * service-role client, so apps/web reads it and never writes it.
 *
 * EVERY failure path resolves to unknown, never to a mode:
 *   - no active workspace, or an empty id list → no query at all
 *   - a PostgREST error, or a thrown/timed-out fetch → an empty map
 *   - a row whose mode is not in `PublishModeSchema` → that row is dropped
 *
 * The direction matters. A missing log is not evidence of a live publish, so the
 * caller must fall back to the weaker claim (`certaintyFor` does). Returning an
 * optimistic or partial answer here would paint a solid "it happened" chip on a
 * post that nothing ever published — the exact fabricated success state the
 * publish action refuses to write in the first place.
 *
 * Only `status = 'succeeded'` rows count: a failed attempt against the live
 * adapter is not a publish.
 */
export async function listPublishModes(postIds: string[]): Promise<Map<string, PostPublishMode>> {
  const modes = new Map<string, PostPublishMode>()
  if (postIds.length === 0) return modes

  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return modes

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_publish_logs')
      .select('post_id, mode, status')
      .eq('workspace_id', workspaceId)
      .in('post_id', postIds)
      .limit(PUBLISH_LOG_LIMIT)

    if (error || !data) {
      if (error) console.error('[posts] publish-log read failed', error.code, error.message)
      return modes
    }

    const byPost = new Map<string, Array<'live' | 'fixture'>>()
    for (const row of data as PublishLogRow[]) {
      if (row.status !== 'succeeded') continue
      if (typeof row.post_id !== 'string') continue
      const mode = PublishModeSchema.safeParse(row.mode)
      if (!mode.success) continue
      byPost.set(row.post_id, [...(byPost.get(row.post_id) ?? []), mode.data])
    }

    for (const [postId, found] of byPost) {
      const collapsed = collapseModes(found)
      if (collapsed !== null) modes.set(postId, collapsed)
    }
    return modes
  } catch (error) {
    console.error(
      '[posts] publish-log read threw',
      error instanceof Error ? error.message : 'unknown',
    )
    return modes
  }
}

/**
 * Media attached to THIS post. There is no workspace-level asset library —
 * `post_media.post_id` is `not null` and no `media_library` table exists — so a
 * library picker would have nothing to read. Ordered by `created_at` because the
 * table has no position column (see REQUESTS.md).
 */
export async function listMedia(postId: string): Promise<PostMedia[]> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return []

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_media')
      .select('*')
      .eq('post_id', postId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })

    if (error || !data) return []
    return data.flatMap((row) => {
      const parsed = PostMediaSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return []
  }
}

/**
 * Per-channel publish state for a page of posts, in one query.
 *
 * ── WHY THE LIST NEEDS THIS ──────────────────────────────────────────────────
 * The posts list showed which channels a post TARGETS and one badge for the post
 * as a whole. Neither answers the question a shop owner actually has, which is
 * "did it go out?" — and for a `partial` post the single badge cannot answer it
 * even in principle, because the honest answer is different per channel.
 *
 * One query for the whole page rather than one per card: a 50-post list would
 * otherwise be 50 round-trips, and the list is the screen people leave open.
 */
export async function listVariantStates(
  postIds: string[],
): Promise<Map<string, VariantStatusRow[]>> {
  const byPost = new Map<string, VariantStatusRow[]>()
  if (postIds.length === 0) return byPost

  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return byPost

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_variants')
      .select('*')
      .eq('workspace_id', workspaceId)
      .in('post_id', postIds)
      .order('channel', { ascending: true })

    if (error || !data) return byPost

    for (const row of data) {
      const parsed = PostVariantSchema.safeParse(row)
      if (!parsed.success) continue
      const list = byPost.get(parsed.data.post_id) ?? []
      list.push(variantStatusRow(parsed.data))
      byPost.set(parsed.data.post_id, list)
    }
    return byPost
  } catch {
    return byPost
  }
}
