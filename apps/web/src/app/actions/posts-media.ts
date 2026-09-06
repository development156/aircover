'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { PostMediaSchema } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { planAutoConvert, autoConvertNote } from '@/lib/media/auto-convert'
import { orientedSize, renderDerivative } from '@/lib/media/derive'
import { offerFor } from '@/lib/media/offer'
import { targetsFor } from '@/lib/media/targets'
import { decideAttach } from '@/lib/posts/attach-decision'
import {
  MEDIA_BUCKET,
  MEDIA_UPLOAD_CAP_BYTES,
  MEDIA_UPLOAD_TOO_LARGE,
} from '@/lib/posts/media-constants'
import { mediaObjectPath } from '@/lib/posts/media-path'
import { mapPostError } from '@/lib/posts/post-error'
import { getPost, readMedia, readVariantFormatsStrict } from '@/lib/posts/read'
import { sniffImage } from '@/lib/posts/sniff-image'
import type { AttachMediaState, DetachMediaState } from '@/lib/posts/media-state'
import { readStorageUsage, storageRefusal } from '@/lib/storage/usage'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

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
        message: MEDIA_UPLOAD_TOO_LARGE,
      }
    }

    // The per-WORKSPACE allowance, asked before the bytes are read. The ceiling
    // above is per file; this one is the 1 GB the whole workspace shares, and a
    // full workspace is refused here rather than after we have paid to move the
    // file. Fails CLOSED on an unreadable figure (DB-20) — `storageRefusal` says why.
    const overAllowance = storageRefusal(await readStorageUsage(ws.workspace.id), file.size)
    if (overAllowance) return { ok: false, message: overAllowance }

    const bytes = new Uint8Array(await file.arrayBuffer())

    // Facts, not claims: `file.type` is deliberately never read.
    const sniffed = sniffImage(bytes)
    if (!sniffed.ok) return { ok: false, message: sniffed.message }

    // Strict, for the same reason the library attach in `assets.ts` is: both
    // numbers below are gates, and a read that returned `[]` / `{}` because it
    // FAILED switches them off rather than tightening them. Nothing is uploaded
    // against limits we could not check.
    // Both take only `postId` and neither reads the other, so they go together.
    // Serially this cost the customer two database round trips before the first
    // byte of their photo was judged.
    const [existing, formats] = await Promise.all([
      readMedia(postId),
      readVariantFormatsStrict(postId),
    ])
    if (existing === null || formats === null) {
      return {
        ok: false,
        message: 'Sahoda could not check that photo against the channel limits. Try again.',
      }
    }

    // `let`, because a pure change of container may replace them below. Every
    // read after this point — the decision, the path, the row — must see the bytes
    // that are actually going to be stored, never the ones that arrived.
    let attachBytes: Uint8Array<ArrayBufferLike> = bytes
    let attachImage = sniffed.image
    let convertedFrom: string | null = null

    const candidateFor = (image: typeof sniffed.image, size: number) => ({
      mime: image.mime,
      bytes: size,
      width: image.width,
      height: image.height,
    })

    let decision = decideAttach(
      post.channels,
      candidateFor(attachImage, attachBytes.byteLength),
      existing.length,
      // Per-channel, from `post_variants.format`. A story will not take a
      // landscape photo and a version that says one photo will not take a second.
      formats,
    )

    // ── IS A CHANGE OF CONTAINER THE WHOLE PROBLEM? ────────────────────────────
    //
    // A WebP bound for Instagram is refused for its FORMAT and nothing else, and
    // this product ships the encoder that fixes it. Sending somebody away to
    // convert a file is a question with one sensible answer, which is a chore
    // rather than a choice.
    //
    // Only when the geometry is fine: `planAutoConvert` is told that through the
    // engine's OWN rejection codes rather than measuring anything again, so it
    // cannot disagree with the refusal it is reacting to. A crop still needs a
    // person — which part of a photo survives a story is their judgement.
    //
    // Converting in memory here is right for THIS path specifically. A direct
    // attach has no library copy, so there is no original to preserve; the library
    // path keeps the original and mints a derivative instead.
    if (!decision.ok) {
      // Every objection that is NOT about the container. If any exists, the file
      // needs a crop or a smaller encode and re-encoding alone would leave it just
      // as refused — the work done, the answer unchanged.
      const hasNonFormatObjection = decision.rejections.some((rejection) =>
        rejection.violations.some((violation) => violation.code !== 'MEDIA_TYPE'),
      )

      const plan = planAutoConvert({
        originalMime: attachImage.mime,
        targets: targetsFor(post.channels, formats),
        hasNonFormatObjection,
      })

      if (plan.kind === 'transcode') {
        const oriented = await orientedSize(attachBytes)
        const rendered = oriented
          ? await renderDerivative(
              attachBytes,
              // The WHOLE oriented image. A rect covering everything makes
              // `renderDerivative` a pure re-encode: same pixels, new container,
              // and the quality ladder still keeps it under the byte ceiling.
              { x: 0, y: 0, width: oriented.width, height: oriented.height },
              plan.mime,
              MEDIA_UPLOAD_CAP_BYTES,
            )
          : null

        if (rendered?.ok) {
          // Sniff the OUTPUT. `renderDerivative` already does, and this reads its
          // verified result rather than the encoder's claim — the same discipline
          // the upload path applies to the customer's own file.
          convertedFrom = attachImage.mime
          attachBytes = rendered.derivative.bytes
          attachImage = {
            ...attachImage,
            mime: rendered.derivative.mime,
            width: rendered.derivative.width,
            height: rendered.derivative.height,
          }
          decision = decideAttach(
            post.channels,
            candidateFor(attachImage, attachBytes.byteLength),
            existing.length,
            formats,
          )
        }
        // A failed or unreadable render falls through to the refusal below with
        // the ORIGINAL bytes. Nothing was stored, nothing was charged, and the
        // person gets the same offer they would have got before this existed.
      }
    }
    if (!decision.ok) {
      // ── THE REFUSAL IS UNCHANGED. AN OFFER TRAVELS WITH IT ─────────────────
      // Same `ok: false`, same sentence, and still nothing written to storage or
      // to any table. `offerFor` reads the bytes already in memory and describes
      // a crop that does not exist yet; accepting it is a SECOND, explicit call.
      const offer = await offerFor({
        bytes,
        candidate: {
          mime: sniffed.image.mime,
          bytes: bytes.byteLength,
          width: sniffed.image.width,
          height: sniffed.image.height,
        },
        channels: post.channels,
        // The formats ALREADY READ above, not a second query.
        //
        // wt-media wrote `await readVariantFormats(postId)` here, which does not
        // exist under that name any more — a sibling lane split it into a strict
        // reader and a `?? {}` wrapper, because `{}` is the documented value for
        // "no version states an intent" and handing it back for a FAILED read
        // makes the per-format rule vanish and a Story accept a landscape photo.
        //
        // Git merged the two sides without a conflict and the call simply did not
        // compile. Had the lenient name survived, it would have compiled and the
        // offer would have proposed a crop against constraints nobody read. The
        // value is in scope, the function has already refused when it was null,
        // and one read cannot disagree with itself.
        formats,
        rejections: decision.rejections,
        // Not in the library yet, and it must not be put there on a refusal the
        // person may simply accept. The browser already holds the File, so it
        // needs no URL from us to draw the preview.
        assetId: null,
        previewUrl: null,
      })
      return {
        ok: false,
        message: decision.message,
        rejections: decision.rejections,
        ...(offer.offered ? { offer: offer.offer } : { noOffer: offer.reason }),
      }
    }

    // Path is built from server-held ids only. `mediaObjectPath` throws on
    // anything that is not a plain uuid, so the workspace prefix the storage
    // policy checks cannot be escaped from here.
    const objectPath = mediaObjectPath({
      workspaceId: workspace.id,
      postId,
      objectId: randomUUID(),
      // `attachImage`, not `sniffed.image`: after a container change these differ,
      // and a `.webp` key holding JPEG bytes is a file whose own name lies.
      mime: attachImage.mime,
    })

    const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, attachBytes, {
      contentType: attachImage.mime,
      upsert: false,
    })
    if (upload.error) {
      console.error('[media] upload failed', upload.error.message)
      return { ok: false, message: 'Could not store that file. Try again.' }
    }
    uploadedPath = objectPath

    const { data, error } = await supabase
      .from('post_media')
      .insert({
        workspace_id: workspace.id,
        post_id: postId,
        storage_path: objectPath,
        // The row describes the STORED file. The publish job reads `mime` and
        // `bytes` from here and hands them to the platform gate, so a row that
        // described the upload rather than the object would refuse a file that is
        // perfectly good — or pass one that is not.
        mime: attachImage.mime,
        bytes: attachBytes.byteLength,
        width: attachImage.width,
        height: attachImage.height,
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
        message: 'Attached, but the response was unreadable. Reload to confirm.',
      }
    }

    revalidatePath('/posts')
    return {
      ok: true,
      media: parsed.data,
      warnings: decision.warnings,
      // Said, never hidden. A photo that arrives as one format and publishes as
      // another is a fact about the customer's own picture, and learning it later
      // from a platform is worse than being told now.
      ...(convertedFrom ? { converted: autoConvertNote(convertedFrom, attachImage.mime) } : {}),
    }
  } catch (error) {
    console.error('[media] attach threw', error instanceof Error ? error.message : 'unknown')
    reportServerError(error, { action: 'attachMedia', workspaceId })
    // A throw after the upload would otherwise strand the object.
    if (uploadedPath !== null) await removeObject(supabase, uploadedPath)
    return { ok: false, message: 'Could not attach that file. Try again.' }
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
    return { ok: false, message: 'Could not remove that file. Try again.' }
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
