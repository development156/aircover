'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'

import { readAsset } from '@/lib/assets/read'
import { normaliseFocal } from '@/lib/media/crop-geometry'
import type { AcceptCropState } from '@/lib/media/crop-state'
import { mintCroppedAttachment } from '@/lib/media/mint'
import { reportServerError } from '@/lib/observability/report'
import { getPost, listMedia, readVariantFormats } from '@/lib/posts/read'
import { workspaceForWrite } from '@/lib/workspaces'

import { uploadAsset } from './assets'

/**
 * ACCEPTING A CROP. The only thing in this lane that writes.
 *
 * ── THIS IS A SECOND, EXPLICIT CALL ─────────────────────────────────────────
 * Nothing reaches it by falling through a refusal. `attachMedia` and
 * `attachAssetToPost` refuse exactly as they always did and hand back a
 * DESCRIPTION of a crop; a person has to look at it and press Accept before any
 * of this runs. Declining calls nothing at all, which is why the decline path
 * needs no code: it is the absence of this one.
 *
 * ── THE BROWSER SENDS A FOCAL POINT, NOT A RECTANGLE ────────────────────────
 * Two numbers between 0 and 1, clamped on arrival. The crop's SIZE is recomputed
 * from the original's own dimensions and the channels' declared bands, and the
 * cropped file is re-judged by the Constraint Engine before it is stored. A
 * client cannot ask for a region nobody validated.
 */

/**
 * Accept a crop of a file that is NOT yet in the library — the direct-upload path.
 *
 * ── THE ORIGINAL IS KEPT, AND THAT IS WHY IT GOES TO THE LIBRARY ────────────
 * The founder's rule is that the original is never modified or deleted, so that
 * a wrong crop is always recoverable. A cropped copy therefore has to hang off
 * something durable, and `assets` is that thing — it is also what makes the
 * delete gate work, because the gate can only see an attachment that names an
 * asset.
 *
 * So accepting a crop on a freshly picked file adds the ORIGINAL to the library
 * and puts the CROP on the post. That is said plainly in the success message
 * rather than happening quietly. It happens on ACCEPT and never on the refusal
 * that offered it: declining leaves the library exactly as it was.
 */
export async function acceptCropForUpload(
  postId: string,
  formData: FormData,
  focalX: number,
  focalY: number,
): Promise<AcceptCropState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to add media.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const post = await getPost(postId)
    if (!post) return { ok: false, message: "You don't have access to this post." }

    // The proven upload path, unchanged: it sniffs the bytes, refuses anything it
    // cannot identify, mints the object key and writes the row. Reusing it means
    // there is one way a file enters the library, not two.
    const stored = await uploadAsset(formData)
    if (!stored.ok) return { ok: false, message: stored.message }

    const existing = await listMedia(postId)
    const result = await mintCroppedAttachment({
      workspaceId: ws.workspace.id,
      userId,
      postId,
      asset: stored.asset,
      channels: post.channels,
      formats: await readVariantFormats(postId),
      focal: normaliseFocal({ x: focalX, y: focalY }),
      existingCount: existing.length,
      alt: stored.asset.alt,
    })
    if (!result.ok) return { ok: false, message: result.message }

    revalidatePath('/posts')
    revalidatePath('/assets')
    return {
      ok: true,
      warnings: result.warnings,
      message: 'Cropped this photo for the post. The original is in your library, uncropped.',
    }
  } catch (error) {
    reportServerError(error, { action: 'acceptCropForUpload', workspaceId })
    return { ok: false, message: 'Could not crop that photo. Try again.' }
  }
}

/** Accept a crop of a file already in the library. The original stays exactly as it is. */
export async function acceptCropForAsset(
  postId: string,
  assetId: string,
  focalX: number,
  focalY: number,
): Promise<AcceptCropState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to add media.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const post = await getPost(postId)
    if (!post) return { ok: false, message: "You don't have access to this post." }

    const read = await readAsset(assetId)
    if (read.status === 'missing') {
      return { ok: false, message: 'That file is not in your library.' }
    }
    if (read.status !== 'ok') {
      return { ok: false, message: 'Sahoda could not read that file. Reload and try again.' }
    }

    const existing = await listMedia(postId)
    const result = await mintCroppedAttachment({
      workspaceId: ws.workspace.id,
      userId,
      postId,
      asset: read.asset.asset,
      channels: post.channels,
      formats: await readVariantFormats(postId),
      focal: normaliseFocal({ x: focalX, y: focalY }),
      existingCount: existing.length,
      alt: read.asset.asset.alt,
    })
    if (!result.ok) return { ok: false, message: result.message }

    revalidatePath('/posts')
    revalidatePath('/assets')
    return {
      ok: true,
      warnings: result.warnings,
      message: 'Cropped this photo for the post. The library still holds the original.',
    }
  } catch (error) {
    reportServerError(error, { action: 'acceptCropForAsset', workspaceId })
    return { ok: false, message: 'Could not crop that photo. Try again.' }
  }
}
