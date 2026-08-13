import 'server-only'

import {
  PostMediaSchema,
  PostSchema,
  PostStatusSchema,
  PostVariantSchema,
  type Post,
  type PostMedia,
  type PostStatus,
  type PostVariant,
} from '@sahoda/shared'

import { cache } from 'react'

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
 * The lifecycle columns of a page of posts, and NOTHING ELSE.
 *
 * ── WHY THE COLUMN LIST IS THE POINT ─────────────────────────────────────────
 * This read exists to be polled while the writer has the screen open, so what it
 * CANNOT return matters more than what it can. `select` names four columns:
 * `id, status, scheduled_at, updated_at`. It does not name `title`, `body` or
 * `channels`, so a live update is structurally incapable of carrying the
 * writer's own draft back at them mid-sentence — `use-autosave.ts` owns that
 * text and this read cannot reach it even by mistake.
 *
 * `updated_at` is returned for ordering and diagnosis only. It is deliberately
 * NOT fed to `detectConflict`: a publisher bumping the row is not another person
 * editing it, and reporting it as divergence would fire that notice on a loop
 * for the whole duration of a publish.
 *
 * Bounded by the same `LIST_LIMIT` the list itself uses, and degrades to an
 * empty array on any failure — a poll that cannot read must leave the last
 * server-rendered state standing, never blank it.
 */
export interface PostLifecycleRow {
  id: string
  status: PostStatus
  scheduledAt: string | null
  updatedAt: string
}

export async function listPostLifecycles(postIds: string[]): Promise<PostLifecycleRow[]> {
  if (postIds.length === 0) return []

  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return []

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .select('id, status, scheduled_at, updated_at')
      .eq('workspace_id', workspaceId)
      .in('id', postIds)
      .limit(LIST_LIMIT)

    if (error || !data) {
      if (error) console.error('[posts] lifecycle read failed', error.code, error.message)
      return []
    }

    return data.flatMap((row) => {
      const record = row as Record<string, unknown>
      const status = PostStatusSchema.safeParse(record.status)
      // A status outside the enum is not one this app has a chip, a certainty
      // level or a word for. Dropping the row leaves the server-rendered state
      // in place, which is the honest fallback; inventing a status is not.
      if (!status.success) return []
      if (typeof record.id !== 'string') return []
      return [
        {
          id: record.id,
          status: status.data,
          scheduledAt: typeof record.scheduled_at === 'string' ? record.scheduled_at : null,
          updatedAt: typeof record.updated_at === 'string' ? record.updated_at : '',
        },
      ]
    })
  } catch (error) {
    console.error(
      '[posts] lifecycle read threw',
      error instanceof Error ? error.message : 'unknown',
    )
    return []
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
