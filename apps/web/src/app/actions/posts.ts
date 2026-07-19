'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import {
  ChannelSchema,
  PostSchema,
  PostUpdateSchema,
  PostVariantUpdateSchema,
  charCountFor,
  CONSTRAINTS,
} from '@sahoda/shared'

import { mapPostError } from '@/lib/posts/post-error'
import { hasLink } from '@/lib/posts/detect-link'
import { parseExtras } from '@/lib/posts/variant-extras'
import type { DeleteState, SaveState } from '@/lib/posts/state'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * Post CRUD. `posts` / `post_variants` carry full member CRUD policies, so these
 * are plain PostgREST writes under the caller's JWT — RLS is the boundary.
 *
 * `workspace_id` is passed explicitly on every insert (the composite FKs require
 * it and there is no column default) but is always taken from the SERVER-derived
 * active workspace, never from the request. We do not add `.eq('workspace_id')`
 * as a security measure — that would be redundant to RLS and imply the cookie is
 * an authorization grant, which it is not.
 */

export async function createPost(title: string): Promise<SaveState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to create a post.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, message: 'Create a workspace first.' }

    const trimmed = title.trim()

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .insert({
        workspace_id: workspace.id,
        title: trimmed || null,
        body: '',
        status: 'draft',
        channels: [],
        origin: 'manual',
        created_by: userId,
      })
      .select('*')
      .single()

    if (error || !data) return { ok: false, message: mapPostError(error) }

    const parsed = PostSchema.safeParse(data)
    if (!parsed.success) {
      return { ok: false, message: 'Created, but the response was unreadable — reload to confirm.' }
    }

    revalidatePath('/posts')
    return { ok: true, postId: parsed.data.id, updatedAt: parsed.data.updated_at }
  } catch {
    return { ok: false, message: 'Could not create this post — try again.' }
  }
}

/**
 * Save the canonical post. Returns the server's `updated_at` so the caller can
 * detect a concurrent edit (`detectConflict`) — `posts` has no version column,
 * so last-write-wins plus this timestamp is the whole concurrency story.
 */
export async function savePost(postId: string, patch: unknown): Promise<SaveState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to save this post.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, message: 'Create a workspace first.' }

    // PostUpdateSchema is a deliberate allowlist — title/body/status/channels/
    // scheduled_at only. Anything else in the payload is dropped, not trusted.
    const parsedPatch = PostUpdateSchema.safeParse(patch)
    if (!parsedPatch.success) {
      return { ok: false, message: 'Those changes are not valid — reload and try again.' }
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .update(parsedPatch.data)
      .eq('id', postId)
      .select('*')
      .maybeSingle()

    if (error || !data) return { ok: false, message: mapPostError(error) }

    const parsed = PostSchema.safeParse(data)
    if (!parsed.success) {
      return { ok: false, message: 'Saved, but the response was unreadable — reload to confirm.' }
    }

    revalidatePath('/posts')
    return { ok: true, postId: parsed.data.id, updatedAt: parsed.data.updated_at }
  } catch {
    return { ok: false, message: 'Could not save this post — try again.' }
  }
}

/**
 * Upsert one channel variant on the `(post_id, channel)` unique key. Char count
 * is recomputed server-side from the frozen engine — never trusted from the
 * client, and never `body.length` (the engine counts code points, and weights an
 * X link at a fixed 23).
 */
export async function saveVariant(
  postId: string,
  channel: string,
  body: string,
  extras: unknown,
): Promise<SaveState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to save this variant.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, message: 'Create a workspace first.' }

    const parsedChannel = ChannelSchema.safeParse(channel)
    if (!parsedChannel.success) {
      return { ok: false, message: 'That channel is not supported.' }
    }

    const spec = CONSTRAINTS[parsedChannel.data]
    const cleanExtras = parseExtras(extras)
    const charCount = charCountFor(spec, {
      body,
      hashtags: cleanExtras.hashtags,
      hasLink: hasLink(body),
    })

    const patch = PostVariantUpdateSchema.parse({
      body,
      extras: cleanExtras,
      char_count: charCount,
      // Editing a channel variant deliberately unlinks it from the canonical
      // body — otherwise the next canonical edit would silently overwrite it.
      is_linked: false,
    })

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_variants')
      .upsert(
        { workspace_id: workspace.id, post_id: postId, channel: parsedChannel.data, ...patch },
        { onConflict: 'post_id,channel' },
      )
      .select('id, updated_at')
      .single()

    if (error || !data) return { ok: false, message: mapPostError(error) }

    revalidatePath('/posts')
    const updatedAt = (data as { updated_at?: unknown }).updated_at
    return {
      ok: true,
      postId,
      updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
    }
  } catch {
    return { ok: false, message: 'Could not save this variant — try again.' }
  }
}

export async function deletePost(postId: string): Promise<DeleteState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to delete this post.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, message: 'Create a workspace first.' }

    const supabase = createServerSupabase()
    // post_variants / post_media cascade from posts (on delete cascade).
    // `.select()` is not cosmetic: a delete matching ZERO rows is NOT an error in
    // PostgREST, so without the returned row this reports a successful deletion
    // for a post that is still on screen (already deleted in another tab, or RLS
    // filtered it out after a membership change).
    const { data, error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .select('id')
      .maybeSingle()

    if (error) return { ok: false, message: mapPostError(error) }

    // Nothing was deleted. Routed through mapPostError's PGRST116 branch so this
    // reads IDENTICALLY to an RLS refusal — distinguishing "gone" from "not
    // yours" would turn this action into an existence oracle for post ids.
    if (!data) return { ok: false, message: mapPostError({ code: 'PGRST116' }) }

    revalidatePath('/posts')
    return { ok: true }
  } catch {
    return { ok: false, message: 'Could not delete this post — try again.' }
  }
}
