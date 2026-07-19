import 'server-only'

import {
  PostMediaSchema,
  PostSchema,
  PostVariantSchema,
  type Post,
  type PostMedia,
  type PostVariant,
} from '@sahoda/shared'

import { cache } from 'react'

import { createServerSupabase } from '@/lib/supabase/server'
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
