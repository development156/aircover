'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { AssetSchema, AssetUpdateSchema, ChannelSchema, decideAssetDelete } from '@sahoda/shared'

import { kindForProvenMime } from '@/lib/assets/kind'
import { readAsset } from '@/lib/assets/read'
import { offerForAsset } from '@/lib/media/offer-asset'
import type {
  AttachAssetState,
  DeleteAssetState,
  UpdateAssetState,
  UploadAssetState,
} from '@/lib/assets/state'
import { reportServerError } from '@/lib/observability/report'
import { decideAttach, type ChannelRejection } from '@/lib/posts/attach-decision'
import { MEDIA_BUCKET, MEDIA_UPLOAD_CAP_BYTES } from '@/lib/posts/media-constants'
import { assetObjectPath, derivativePrefix } from '@/lib/posts/media-path'
import { mapPostError } from '@/lib/posts/post-error'
import { getPost, readMedia, readVariantFormatsStrict } from '@/lib/posts/read'
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
  // `{}` for formats, and that is the honest answer rather than a convenient
  // one: this judges a file in the LIBRARY, which is on no post, so no version
  // has said what it is. attach-decision.ts documents `{}` as exactly this —
  // "no version states an intent" — and it restores the pre-format behaviour
  // precisely. The real formats are read at the ATTACH, below.
  const decision = decideAttach([...ChannelSchema.options], candidate, 0, {})
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

    // ── AND THE CROPPED COPIES, WHICH POSTGRES CANNOT REACH ─────────────────
    // `asset_derivatives` cascades, so the ROWS went with the asset inside that
    // transaction. The OBJECTS did not: no database can delete a file in a
    // bucket. Without this every crop ever made of this photo stays in storage
    // forever, invisible — nothing points at it, nothing lists it, and it is
    // still being paid for every month.
    //
    // Swept by PREFIX rather than from a list read before the delete, and that
    // is the difference between complete and nearly complete: a crop minted
    // between the read and the commit is not in a list taken beforehand, and is
    // in the folder. `derivativeObjectPath` puts every crop of one photo under
    // `<workspace>/derivatives/<asset>/`, which is what makes one call enough.
    await removeDerivativeObjects(supabase, workspace.id, assetId)

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

    // ── BOTH READS ARE STRICT, BECAUSE BOTH DECIDE WHAT MAY BE WRITTEN ───────
    // `listMedia` and `readVariantFormats` answer `[]` / `{}` for a read that
    // FAILED as readily as for a post with nothing on it. Every gate below is
    // measured against those values, so an unreadable read used to switch all
    // three off at once and let the write through:
    //
    //   the duplicate check         the same photo attached twice, counting
    //                               twice against every channel's cap
    //   `existing.length`           an eleventh file admitted to a channel that
    //                               allows ten
    //   the per-format rule         a Story accepting a landscape photo — the
    //                               exact case the comment below was written for
    //
    // The refusal already exists a few lines up, for a file whose dimensions are
    // missing; this is the same sentence for the same reason.
    const existing = await readMedia(postId)
    const formats = await readVariantFormatsStrict(postId)
    if (existing === null || formats === null) {
      return {
        ok: false,
        message: 'Sahoda could not check that file against the channel limits — try again.',
      }
    }

    // Already on this post: say so rather than writing a second row that would
    // show the same photo twice and count twice against every channel's cap.
    if (existing.some((row) => row.storage_path === asset.storage_path)) {
      return { ok: false, message: 'That file is already on this post.' }
    }

    // NO SECOND READ. `formats` is read strictly above and the function has
    // already refused when it was null; wt-media added a lenient re-read here
    // that would have SHADOWED it in the same block and coerced a failed read to
    // `{}` — the exact value the comment below says must not reach `decideAttach`.
    // Git merged both sides without a conflict; only the rename made it visible.
    const decision = decideAttach(
      post.channels,
      { mime: asset.mime, bytes: asset.bytes, width: asset.width, height: asset.height },
      existing.length,
      // Per-channel, from `post_variants.format` — the same read the upload path
      // makes. Attaching FROM THE LIBRARY is still an attach, so a story must
      // refuse a landscape photo here exactly as it does there. `{}` would have
      // compiled and looked identical while accepting both.
      formats,
    )
    if (!decision.ok) {
      // The refusal stands exactly as it did. See `AttachMediaState` for why the
      // offer is an addition to this shape rather than a replacement of it.
      const offer = await offerForAsset({
        asset,
        channels: post.channels,
        formats,
        rejections: decision.rejections,
      })
      return {
        ok: false,
        message: decision.message,
        rejections: decision.rejections,
        ...(offer === null
          ? {}
          : offer.offered
            ? { offer: offer.offer }
            : { noOffer: offer.reason }),
      }
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

/** One page of a storage listing, and the most passes the sweep will make. */
const SWEEP_PAGE = 100
const MAX_SWEEP_PASSES = 100

/**
 * Remove every cropped copy of one library file.
 *
 * Best effort, like `removeObject`: the asset row is already gone and the person
 * has been told the file was deleted, so a storage failure here is waste to be
 * reported rather than an error to be shown. It is reported, because nothing else
 * in the system will ever mention these objects again.
 */
async function removeDerivativeObjects(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  assetId: string,
): Promise<void> {
  try {
    const prefix = derivativePrefix({ workspaceId, assetId })

    // PAGED. `list()` returns at most 100 entries by default, and a loop that
    // took the first page would leave every crop after the hundredth in the
    // bucket forever while reporting nothing wrong — the same silent-partial
    // shape this whole lane is about. One photo reaching 100 distinct crops is
    // unlikely and it is not impossible: every move of the focal point that is
    // accepted is a new recipe.
    // Always reads from the START of the folder, never from an advancing
    // offset: each pass DELETES what it listed, so the remainder shifts down and
    // an offset would step straight over it. The bound is therefore a count of
    // passes, not a cursor — and it is a real bound, because a loop that only
    // stops on a short page would spin forever the day `remove` starts
    // succeeding without removing.
    for (let pass = 0; pass < MAX_SWEEP_PASSES; pass += 1) {
      const listed = await supabase.storage
        .from(MEDIA_BUCKET)
        .list(prefix, { limit: SWEEP_PAGE, offset: 0 })
      if (listed.error) {
        console.error('[assets] could not list crops to remove', listed.error.message)
        return
      }
      const entries = listed.data ?? []
      const paths = entries
        .map((entry) => entry.name)
        .filter((name): name is string => typeof name === 'string' && name !== '')
        .map((name) => `${prefix}/${name}`)
      // Nothing left, or nothing removable: either way there is no next pass
      // that would do anything a previous one did not.
      if (paths.length === 0) return
      const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(paths)
      if (error) {
        console.error('[assets] orphan crops left behind', error.message)
        return
      }
      // A short page was the last page.
      if (entries.length < SWEEP_PAGE) return
    }
    console.error('[assets] crop sweep hit its pass ceiling; some crops may remain')
  } catch (error) {
    console.error('[assets] orphan crops left behind')
    reportServerError(error, { action: 'removeDerivativeObjects', workspaceId })
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
