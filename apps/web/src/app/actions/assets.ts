'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { AssetSchema, AssetUpdateSchema, ChannelSchema, decideAssetDelete } from '@sahoda/shared'

import { kindForProvenMime } from '@/lib/assets/kind'
import { readAsset } from '@/lib/assets/read'
import type {
  AttachAssetState,
  DeleteAssetState,
  UpdateAssetState,
  UploadAssetState,
} from '@/lib/assets/state'
import { reportServerError } from '@/lib/observability/report'
import { decideAttach, type ChannelRejection } from '@/lib/posts/attach-decision'
import { MEDIA_BUCKET, MEDIA_UPLOAD_CAP_BYTES } from '@/lib/posts/media-constants'
import { assetObjectPath } from '@/lib/posts/media-path'
import { mapPostError } from '@/lib/posts/post-error'
import { getPost, listMedia } from '@/lib/posts/read'
import { sniffImage } from '@/lib/posts/sniff-image'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * The media library's writes.
 *
 * Everything that establishes a fact about a file — its type, its size, its
 * pixel dimensions — is derived HERE from the bytes themselves, exactly as
 * `posts-media.ts` does and for exactly the same reason: `File.type` is whatever
 * the browser was told to say, so a 40 MB video called `photo.jpg` clears every
 * check that trusts it. A library that stored a claimed type would then hand
 * that claim to the composer, which would hand it to the Constraint Engine, and
 * the engine would clear a file nobody ever looked at.
 */

/** Free text a person types about a file. Long enough for a real sentence, bounded. */
const MAX_TITLE = 120
const MAX_ALT = 300

/** Which channels cannot use this file, given what its bytes proved. */
function unusableChannels(candidate: {
  mime: string
  bytes: number
  width: number
  height: number
}): ChannelRejection[] {
  // Judged against EVERY channel, because a library file has no post and
  // therefore no channel set. `decideAttach` with the full list returns the
  // objections per channel; the count rule is passed 0 because this is not an
  // attach and nothing is on a post yet.
  const decision = decideAttach([...ChannelSchema.options], candidate, 0)
  return decision.ok ? decision.warnings : decision.rejections
}

/**
 * Add a file to the library.
 *
 * ── WHAT IS REFUSED AND WHAT IS MERELY REPORTED ──────────────────────────────
 * Refused: a file whose bytes do not describe one of the image types every
 * channel's spec draws from. There is nothing useful to do with it — it cannot
 * be published anywhere and cannot be checked.
 *
 * Reported, not refused: a file some channels will not take. A library is not a
 * post. A 400×400 photo is useless to Google Business Profile and perfectly good
 * for X, and refusing it would make the library narrower than the product. The
 * objecting channels come back on the success arm so the tile can say so.
 */
export async function uploadAsset(formData: FormData): Promise<UploadAssetState> {
  let workspaceId: string | undefined
  let uploadedPath: string | null = null
  const supabase = createServerSupabase()

  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to add a file.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Pick a photo to add.' }
    }

    if (file.size > MEDIA_UPLOAD_CAP_BYTES) {
      return {
        ok: false,
        message: `That file is larger than ${Math.floor(MEDIA_UPLOAD_CAP_BYTES / 1_000_000)} MB, which no channel accepts.`,
      }
    }

    const bytes = new Uint8Array(await file.arrayBuffer())

    const sniffed = sniffImage(bytes)
    if (!sniffed.ok) return { ok: false, message: sniffed.message }

    const kind = kindForProvenMime(sniffed.image.mime)
    if (kind === null) {
      // Unreachable while `sniffImage` and the engine's `mediaTypes` agree —
      // `media-path.test.ts` asserts that set equality in both directions. Kept
      // because the alternative to an explicit refusal is writing a `kind` this
      // module guessed.
      return { ok: false, message: 'Sahoda cannot tell what kind of file that is.' }
    }

    const candidate = {
      mime: sniffed.image.mime,
      bytes: bytes.byteLength,
      width: sniffed.image.width,
      height: sniffed.image.height,
    }

    // The row id is minted first so the object key and the row agree. A key
    // built from a second random value would leave the two impossible to
    // reconcile after a partial failure.
    const assetId = randomUUID()
    const objectPath = assetObjectPath({
      workspaceId: workspace.id,
      assetId,
      mime: sniffed.image.mime,
    })

    const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, bytes, {
      contentType: sniffed.image.mime,
      upsert: false,
    })
    if (upload.error) {
      console.error('[assets] upload failed', upload.error.message)
      return { ok: false, message: 'Could not store that file — try again.' }
    }
    uploadedPath = objectPath

    // A file name is the one thing the browser sends that is worth keeping: it
    // is what the person calls the photo. It is stored as a TITLE and never as a
    // path — nothing downstream builds a key from it.
    const rawName = typeof file.name === 'string' ? file.name.trim() : ''
    const title = rawName === '' ? null : rawName.slice(0, MAX_TITLE)

    const { data, error } = await supabase
      .from('assets')
      .insert({
        id: assetId,
        workspace_id: workspace.id,
        storage_path: objectPath,
        kind,
        mime: candidate.mime,
        bytes: candidate.bytes,
        width: candidate.width,
        height: candidate.height,
        title,
        created_by: userId,
      })
      .select('*')
      .single()

    if (error || !data) {
      await removeObject(supabase, uploadedPath)
      uploadedPath = null
      return { ok: false, message: mapPostError(error) }
    }

    const parsed = AssetSchema.safeParse(data)
    if (!parsed.success) {
      return { ok: false, message: 'Added, but the response was unreadable — reload to confirm.' }
    }

    revalidatePath('/assets')
    return { ok: true, asset: parsed.data, unusable: unusableChannels(candidate) }
  } catch (error) {
    console.error('[assets] upload threw', error instanceof Error ? error.message : 'unknown')
    reportServerError(error, { action: 'uploadAsset', workspaceId })
    if (uploadedPath !== null) await removeObject(supabase, uploadedPath)
    return { ok: false, message: 'Could not add that file — try again.' }
  }
}

/**
 * Delete a file from the library.
 *
 * ── THE GATE ─────────────────────────────────────────────────────────────────
 * Three outcomes, and the middle one is the point of the whole feature:
 *
 *  refused      — a scheduled, publishing, published or partial post depends on
 *                 this file. Named, by title. Nothing is touched.
 *  needs-confirm — only unpublished posts use it. They are named, and the person
 *                 has to press again knowing which posts lose the photo.
 *  ok            — nothing uses it, or the person confirmed.
 *
 * ── THE READ HERE DECIDES WHAT TO ASK. THE DATABASE DECIDES WHAT HAPPENS ─────
 * The `readAsset` below exists to compose a SENTENCE — which posts, by name, and
 * why. It is not the guard, and it must not be: between reading and deleting, a
 * post can be scheduled by someone else in the workspace or by the same person
 * in another tab.
 *
 * So the deletion itself is one call to `public.delete_asset`, which re-checks
 * the rule inside a single transaction with the posts row-locked. If the answer
 * changed since the read, the trigger refuses and its message — naming the post
 * that changed — is surfaced rather than replaced.
 *
 * An earlier version of this function did the detach from apps/web, using the
 * answer from the read. That deleted a scheduled post's photo BEFORE asking
 * whether it was allowed to; the trigger then found nothing locking the file and
 * let the delete through. See 20260820000100 for the whole account.
 */
export async function deleteAsset(assetId: string, confirmed = false): Promise<DeleteAssetState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, reason: 'failed', message: 'Sign in to delete a file.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, reason: 'failed', message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const read = await readAsset(assetId)
    if (read.status === 'missing') {
      return { ok: false, reason: 'failed', message: 'That file is not in your library.' }
    }
    if (read.status !== 'ok') {
      // NOT a delete. A usage read that failed cannot tell us whether a
      // scheduled post depends on this file, and deleting on "we could not
      // check" is the data-loss path this whole feature exists to close.
      return {
        ok: false,
        reason: 'failed',
        message: 'Sahoda could not check where this file is used, so it was not deleted. Reload.',
      }
    }

    const decision = decideAssetDelete(read.asset.usage)
    if (!decision.ok) {
      return { ok: false, reason: 'refused', message: decision.message, locked: decision.locked }
    }
    if (decision.detach.length > 0 && !confirmed) {
      return {
        ok: false,
        reason: 'needs-confirm',
        message: decision.message ?? '',
        detach: decision.detach,
      }
    }

    const supabase = createServerSupabase()

    // ONE call. The lock check, the detach and the delete happen inside a single
    // transaction with the posts row-locked, so nothing can be scheduled between
    // the decision and the act. `p_detach` carries the answer to the question
    // the screen already asked; with it false, a file any post uses is refused.
    const { data, error } = await supabase.rpc('delete_asset', {
      p_asset_id: assetId,
      p_detach: decision.detach.length > 0,
    })

    if (error) {
      // 23001 is `restrict_violation`, raised by the guard trigger, and its
      // message names the posts. 23503 is the foreign key — an attachment the
      // caller did not consent to detach. Both mean the DATABASE refused, and
      // its own sentence is more specific than anything composed here.
      //
      // `locked` is empty on these arms because this path never re-read the
      // usage: "refused, here is why" is the honest shape, not an invented list.
      const raised = typeof error.message === 'string' ? error.message : ''
      if (error.code === '23001' && raised !== '') {
        return { ok: false, reason: 'refused', message: raised, locked: [] }
      }
      if (error.code === '23503') {
        return {
          ok: false,
          reason: 'refused',
          message:
            'This file is still on a post, so it was not deleted. Open the post and remove it there first.',
          locked: [],
        }
      }
      if (error.code === '02000') {
        return { ok: false, reason: 'failed', message: 'That file is not in your library.' }
      }
      return { ok: false, reason: 'failed', message: mapPostError(error) }
    }

    // The row is gone once this returns. The OBJECT is removed after, never
    // before: a transaction cannot roll back a deleted file, so the only safe
    // order is row first, bytes second — the same order `detachMedia` uses.
    const storagePath = typeof data === 'string' ? data : null
    if (storagePath !== null) await removeObject(supabase, storagePath)

    revalidatePath('/assets')
    revalidatePath('/posts')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'deleteAsset', workspaceId })
    return { ok: false, reason: 'failed', message: 'Could not delete that file — try again.' }
  }
}

/** Rename a file, or describe it for a screen reader. The only two editable fields. */
export async function updateAsset(
  assetId: string,
  patch: { title?: string | null; alt?: string | null },
): Promise<UpdateAssetState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to edit a file.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const trim = (value: string | null | undefined, max: number): string | null | undefined => {
      if (value === undefined) return undefined
      if (value === null) return null
      const clean = value.trim().slice(0, max)
      return clean === '' ? null : clean
    }

    const parsed = AssetUpdateSchema.safeParse({
      ...(patch.title !== undefined ? { title: trim(patch.title, MAX_TITLE) ?? null } : {}),
      ...(patch.alt !== undefined ? { alt: trim(patch.alt, MAX_ALT) ?? null } : {}),
    })
    if (!parsed.success) return { ok: false, message: 'Could not read those details.' }
    if (Object.keys(parsed.data).length === 0) {
      return { ok: false, message: 'Nothing to change.' }
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('assets')
      .update(parsed.data)
      .eq('id', assetId)
      .eq('workspace_id', ws.workspace.id)
      .select('*')
      .maybeSingle()

    if (error) return { ok: false, message: mapPostError(error) }
    if (!data) return { ok: false, message: mapPostError({ code: 'PGRST116' }) }

    const row = AssetSchema.safeParse(data)
    if (!row.success) return { ok: false, message: 'Saved, but the response was unreadable.' }

    revalidatePath('/assets')
    return { ok: true, asset: row.data }
  } catch (error) {
    reportServerError(error, { action: 'updateAsset', workspaceId })
    return { ok: false, message: 'Could not save that — try again.' }
  }
}

/**
 * Put a library file on a post.
 *
 * ── THE BYTES ARE NOT COPIED ─────────────────────────────────────────────────
 * The `post_media` row points at the LIBRARY's storage object. That is the whole
 * economy of a library: one upload, many posts. It is also why `detachMedia`
 * checks `asset_id` before removing an object — see the note there.
 *
 * ── THE CHANNEL RULES STILL APPLY, AT ATTACH TIME ────────────────────────────
 * The same `decideAttach` the direct-upload path uses, over the same facts,
 * against THIS post's channels and THIS post's existing media count. A file that
 * was fine in the library can be wrong for the post it is being put on, and the
 * count rule in particular can only be judged here.
 */
export async function attachAssetToPost(
  postId: string,
  assetId: string,
): Promise<AttachAssetState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to add media.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const post = await getPost(postId)
    if (!post) return { ok: false, message: "You don't have access to this post." }

    const read = await readAsset(assetId)
    if (read.status === 'missing')
      return { ok: false, message: 'That file is not in your library.' }
    if (read.status !== 'ok') {
      return { ok: false, message: 'Sahoda could not read that file — reload and try again.' }
    }
    const asset = read.asset.asset

    // A row whose facts were never established cannot be judged, and attaching
    // it would hand the engine nulls that slide under every limit.
    if (
      asset.mime === null ||
      asset.bytes === null ||
      asset.width === null ||
      asset.height === null
    ) {
      return {
        ok: false,
        message: 'Sahoda could not check that file against the channel limits — add it again.',
      }
    }

    const existing = await listMedia(postId)
    // Already on this post: say so rather than writing a second row that would
    // show the same photo twice and count twice against every channel's cap.
    if (existing.some((row) => row.storage_path === asset.storage_path)) {
      return { ok: false, message: 'That file is already on this post.' }
    }

    const decision = decideAttach(
      post.channels,
      { mime: asset.mime, bytes: asset.bytes, width: asset.width, height: asset.height },
      existing.length,
    )
    if (!decision.ok) {
      return { ok: false, message: decision.message, rejections: decision.rejections }
    }

    const supabase = createServerSupabase()
    // `asset_usages` is NOT written here. The database trigger
    // `post_media_sync_asset_usage_ins` derives it from this row, so the "used
    // in" record cannot drift from the attachment it describes.
    const { error } = await supabase.from('post_media').insert({
      workspace_id: workspace.id,
      post_id: postId,
      asset_id: asset.id,
      storage_path: asset.storage_path,
      mime: asset.mime,
      bytes: asset.bytes,
      width: asset.width,
      height: asset.height,
      alt: asset.alt,
    })

    if (error) return { ok: false, message: mapPostError(error) }

    revalidatePath('/posts')
    revalidatePath('/assets')
    return { ok: true, warnings: decision.warnings }
  } catch (error) {
    reportServerError(error, { action: 'attachAssetToPost', workspaceId })
    return { ok: false, message: 'Could not add that file to the post — try again.' }
  }
}

/** Best-effort object removal. A failure here is waste, never a user-facing error. */
async function removeObject(
  supabase: ReturnType<typeof createServerSupabase>,
  objectPath: string,
): Promise<void> {
  try {
    const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([objectPath])
    if (error) console.error('[assets] orphan object left behind', error.message)
  } catch (error) {
    console.error('[assets] orphan object left behind')
    reportServerError(error, { action: 'removeAssetObject' })
  }
}
