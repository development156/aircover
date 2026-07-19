'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { PostMediaSchema } from '@sahoda/shared'

import { decideAttach } from '@/lib/posts/attach-decision'
import { MEDIA_BUCKET, MEDIA_UPLOAD_CAP_BYTES } from '@/lib/posts/media-constants'
import { mediaObjectPath } from '@/lib/posts/media-path'
import { mapPostError } from '@/lib/posts/post-error'
import { getPost, listMedia } from '@/lib/posts/read'
import { sniffImage } from '@/lib/posts/sniff-image'
import type { AttachMediaState, DetachMediaState } from '@/lib/posts/media-state'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * Attach a file to a post.
 *
 * The file travels THROUGH this action rather than going straight to storage from
 * the browser, and that is the whole point: `validateMedia` checks mime, byte
 * length and pixel dimensions, and every one of those is attacker-controlled in a
 * direct upload. `File.type` is whatever the browser was told to say. So the
 * bytes are read here, `sniffImage` derives the real format and dimensions from
 * them, and the decision is made on facts. A file we cannot identify is refused —
 * never attached with a shrug, because a row with an unverifiable mime is
 * precisely the one the media pane has to render as "can't verify this file".
 *
 * Nothing is written to storage until the decision passes, so a rejected file
 * leaves no orphan object behind.
 */
export async function attachMedia(postId: string, formData: FormData): Promise<AttachMediaState> {
  let uploadedPath: string | null = null
  const supabase = createServerSupabase()

  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to attach media.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, message: 'Create a workspace first.' }

    const post = await getPost(postId)
    if (!post) return { ok: false, message: "You don't have access to this post." }

    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Pick an image to attach.' }
    }

    // Cheap guard before reading the whole thing into memory. The body limit in
    // next.config.ts is the outer wall; this is the honest, specific message.
    if (file.size > MEDIA_UPLOAD_CAP_BYTES) {
      return {
        ok: false,
        message: `That file is larger than ${Math.floor(MEDIA_UPLOAD_CAP_BYTES / 1_000_000)} MB, which no channel accepts.`,
      }
    }

    const bytes = new Uint8Array(await file.arrayBuffer())

    // Facts, not claims: `file.type` is deliberately never read.
    const sniffed = sniffImage(bytes)
    if (!sniffed.ok) return { ok: false, message: sniffed.message }

    const existing = await listMedia(postId)
    const decision = decideAttach(
      post.channels,
      {
        mime: sniffed.image.mime,
        bytes: bytes.byteLength,
        width: sniffed.image.width,
        height: sniffed.image.height,
      },
      existing.length,
    )
    if (!decision.ok) {
      return { ok: false, message: decision.message, rejections: decision.rejections }
    }

    // Path is built from server-held ids only. `mediaObjectPath` throws on
    // anything that is not a plain uuid, so the workspace prefix the storage
    // policy checks cannot be escaped from here.
    const objectPath = mediaObjectPath({
      workspaceId: workspace.id,
      postId,
      objectId: randomUUID(),
      mime: sniffed.image.mime,
    })

    const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, bytes, {
      contentType: sniffed.image.mime,
      upsert: false,
    })
    if (upload.error) {
      console.error('[media] upload failed', upload.error.message)
      return { ok: false, message: 'Could not store that file — try again.' }
    }
    uploadedPath = objectPath

    const { data, error } = await supabase
      .from('post_media')
      .insert({
        workspace_id: workspace.id,
        post_id: postId,
        storage_path: objectPath,
        mime: sniffed.image.mime,
        bytes: bytes.byteLength,
        width: sniffed.image.width,
        height: sniffed.image.height,
      })
      .select('*')
      .single()

    if (error || !data) {
      // The object is already in the bucket but no row points at it. Remove it
      // rather than leaving a file nobody can see, delete or account for.
      await removeObject(supabase, uploadedPath)
      uploadedPath = null
      return { ok: false, message: mapPostError(error) }
    }

    const parsed = PostMediaSchema.safeParse(data)
    if (!parsed.success) {
      return {
        ok: false,
        message: 'Attached, but the response was unreadable — reload to confirm.',
      }
    }

    revalidatePath('/posts')
    return { ok: true, media: parsed.data, warnings: decision.warnings }
  } catch (error) {
    console.error('[media] attach threw', error instanceof Error ? error.message : 'unknown')
    // A throw after the upload would otherwise strand the object.
    if (uploadedPath !== null) await removeObject(supabase, uploadedPath)
    return { ok: false, message: 'Could not attach that file — try again.' }
  }
}

/**
 * Detach a file: the row first, then the object. That order is deliberate — if
 * the object delete fails we are left with an unreferenced file, which is waste;
 * the reverse order leaves a row pointing at nothing, which renders as a broken
 * image the user cannot remove.
 */
export async function detachMedia(mediaId: string): Promise<DetachMediaState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to remove media.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, message: 'Create a workspace first.' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_media')
      .delete()
      .eq('id', mediaId)
      .select('storage_path')
      .maybeSingle()

    if (error) return { ok: false, message: mapPostError(error) }
    // A delete matching zero rows is not an error in PostgREST. Routed through
    // the PGRST116 branch so "already gone" and "not yours" read identically.
    if (!data) return { ok: false, message: mapPostError({ code: 'PGRST116' }) }

    const storagePath = (data as { storage_path?: unknown }).storage_path
    if (typeof storagePath === 'string') await removeObject(supabase, storagePath)

    revalidatePath('/posts')
    return { ok: true }
  } catch {
    return { ok: false, message: 'Could not remove that file — try again.' }
  }
}

/** Best-effort object removal. A failure here is waste, never a user-facing error. */
async function removeObject(
  supabase: ReturnType<typeof createServerSupabase>,
  objectPath: string,
): Promise<void> {
  try {
    const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([objectPath])
    if (error) console.error('[media] orphan object left behind', error.message)
  } catch {
    console.error('[media] orphan object left behind')
  }
}
