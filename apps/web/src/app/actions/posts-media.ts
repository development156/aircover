'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { PostMediaSchema } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { decideAttach } from '@/lib/posts/attach-decision'
import { MEDIA_BUCKET, MEDIA_UPLOAD_CAP_BYTES } from '@/lib/posts/media-constants'
import { mediaObjectPath } from '@/lib/posts/media-path'
import { mapPostError } from '@/lib/posts/post-error'
import { getPost, listMedia, readVariantFormats } from '@/lib/posts/read'
import { sniffImage } from '@/lib/posts/sniff-image'
import type { AttachMediaState, DetachMediaState } from '@/lib/posts/media-state'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace, workspaceForWrite } from '@/lib/workspaces'

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
  // Hoisted so the catch can tag the tenant — see lib/observability/report.ts.
  let workspaceId: string | undefined
  let uploadedPath: string | null = null
  const supabase = createServerSupabase()

  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to attach media.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

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
      // Per-channel, from `post_variants.format`. A story will not take a
      // landscape photo and a version that says one photo will not take a second.
      await readVariantFormats(postId),
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
    reportServerError(error, { action: 'attachMedia', workspaceId })
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
 *
 * ── THE OBJECT IS ONLY REMOVED WHEN THIS ROW OWNS IT ─────────────────────────
 * A row with an `asset_id` came from the LIBRARY. Its `storage_path` is the
 * library's own object — the attach does not copy the bytes, precisely so that
 * one upload can serve five posts — so deleting it here would remove the file
 * from the library and from every other post using it, while the person believes
 * they took one photo off one draft. That is the same silent data loss the
 * delete gate exists to stop, arriving through the other door.
 *
 * So the object is removed only for a direct upload, where this row is the one
 * and only thing pointing at it. A library file's bytes are removed by
 * `deleteAsset`, which is the action that has the "used in" read in front of it.
 */
export async function detachMedia(mediaId: string): Promise<DetachMediaState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to remove media.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    // Assigned so a throw below is reported against the tenant it happened in;
    // it was declared for that and never set.
    workspaceId = workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_media')
      .delete()
      .eq('id', mediaId)
      .eq('workspace_id', workspace.id)
      .select('storage_path, asset_id')
      .maybeSingle()

    if (error) return { ok: false, message: mapPostError(error) }
    // A delete matching zero rows is not an error in PostgREST. Routed through
    // the PGRST116 branch so "already gone" and "not yours" read identically.
    if (!data) return { ok: false, message: mapPostError({ code: 'PGRST116' }) }

    const storagePath = (data as { storage_path?: unknown }).storage_path
    const fromLibrary = (data as { asset_id?: unknown }).asset_id !== null
    if (typeof storagePath === 'string' && !fromLibrary) {
      await removeObject(supabase, storagePath)
    }

    revalidatePath('/posts')
    // The LIBRARY changed too: the trigger removed the usage record, so this
    // file's tile goes from "In 1 post" and a padlock back to "Not used yet".
    // Without this, someone who detaches and then taps Assets in the rail gets
    // the client router's cached payload and is told the photo is still in use —
    // which is exactly the sentence the delete gate then contradicts.
    // `attachAssetToPost` revalidates it for the same reason in the other
    // direction; a detach that did not was the asymmetry.
    revalidatePath('/assets')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'detachMedia', workspaceId })
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
  } catch (error) {
    // No workspaceId: this helper is handed a path, not a workspace, and the
    // rule is that reporting never costs a lookup. An orphaned object is waste
    // rather than a user-facing failure — which is exactly why it needs to be
    // reported: nothing else in the system will ever mention it again.
    console.error('[media] orphan object left behind')
    reportServerError(error, { action: 'removeObject' })
  }
}
