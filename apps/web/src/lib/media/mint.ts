import 'server-only'

import { randomUUID } from 'node:crypto'
import { AssetDerivativeSchema } from '@sahoda/shared'
import type { Asset, Channel } from '@sahoda/shared'
import type { PostFormat } from '@sahoda/publishing/format'

import { decideAttach, type ChannelRejection } from '../posts/attach-decision'
import { MEDIA_BUCKET } from '../posts/media-constants'
import { derivativeObjectPath } from '../posts/media-path'
import { createServerSupabase } from '../supabase/server'
import { buildOffer } from './crop-offer'
import { normaliseFocal, placeCrop, type FocalPoint } from './crop-geometry'
import { orientedSize, renderDerivative } from './derive'
import { extensionForMime } from '../posts/media-path'

/**
 * MINT A CROPPED COPY AND PUT IT ON THE POST. The only write path this lane adds.
 *
 * ── THE ORIGINAL IS READ AND NOTHING ELSE ───────────────────────────────────
 * Its object is downloaded, its bytes go into sharp, and neither the object nor
 * the `assets` row is touched. The derivative is a new object under a different
 * folder and a new row in a child table. A wrong crop costs the customer nothing:
 * the file they uploaded is exactly where it was.
 *
 * ── AND THE DERIVATIVE IS RE-JUDGED BEFORE IT IS STORED ─────────────────────
 * `decideAttach` runs a SECOND time, on the cropped file's own sniffed facts,
 * before a single byte is uploaded. A crop that did not actually fix the problem
 * is refused here rather than stored and discovered at publish time. That is the
 * rail under the whole offer: a fix has to genuinely be one.
 *
 * ── THE DELETE GATE KEEPS WORKING BECAUSE OF WHAT IS WRITTEN, NOT CHECKED ───
 * The `post_media` row names the ORIGINAL in `asset_id` and the crop in
 * `derivative_id`. So the trigger that derives `asset_usages`, and the gate that
 * reads it, see exactly what they saw before: this post uses this asset. Nothing
 * about the refusal-to-delete had to be taught about derivatives, because from
 * its point of view nothing changed.
 */

export interface MintInput {
  workspaceId: string
  userId: string
  postId: string
  /** The ORIGINAL library row. Never modified. */
  asset: Asset
  channels: readonly Channel[]
  formats: Readonly<Partial<Record<Channel, PostFormat | null>>>
  focal: FocalPoint
  /** How many files are already on this post, for the count rule. */
  existingCount: number
  alt: string | null
}

export type MintResult = { ok: true; warnings: ChannelRejection[] } | { ok: false; message: string }

const CANNOT_READ = 'Sahoda could not read that photo well enough to crop it — try again.'
const CROP_FAILED = 'That crop did not produce a file the channels accept, so nothing was saved.'

/**
 * Everything that determines the BYTES, and nothing that does not.
 *
 * The channel set is deliberately absent: two channel sets that resolve to the
 * same rectangle produce the same file, and minting a second identical object to
 * record a second audience is storage spent on nothing. The byte cap IS present,
 * because it is what the quality ladder answers to — the same rectangle under a
 * 5 MB cap and an 8 MB cap can legitimately be two different files.
 */
function recipeFor(
  rect: { x: number; y: number; width: number; height: number },
  mime: string,
  maxBytes: number,
): string {
  const ext = extensionForMime(mime) ?? 'bin'
  return `${rect.x}-${rect.y}-${rect.width}-${rect.height}-${ext}-${maxBytes}`
}

/** The channel -> format map this crop was cut for. Absent means "nobody said". */
function formatMapFor(
  targets: readonly { channel: Channel; format: PostFormat | null }[],
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const target of targets) {
    if (target.format !== null) map[target.channel] = target.format
  }
  return map
}

/** The widened record when a reused crop is serving channels it did not record, else null. */
function mergeChannels(
  recorded: readonly Channel[],
  targets: readonly { channel: Channel; format: PostFormat | null }[],
): { channels: Channel[]; formats: Record<string, string> } | null {
  const known = new Set<Channel>(recorded)
  const fresh = targets.filter((target) => !known.has(target.channel))
  if (fresh.length === 0) return null
  return {
    channels: [...recorded, ...fresh.map((target) => target.channel)],
    formats: formatMapFor(fresh),
  }
}

export async function mintCroppedAttachment(input: MintInput): Promise<MintResult> {
  const supabase = createServerSupabase()

  // ── THE SAME PHOTO IS NOT PUT ON ONE POST TWICE ──────────────────────────
  // `attachAssetToPost` compares STORAGE PATHS, which is exactly right for the
  // original and exactly wrong here: a crop has a different path, so the original
  // and a crop of it would both attach and the post would show one photograph
  // twice, counting twice against every channel's media cap. The comparison that
  // holds for both is the ASSET.
  const already = await supabase
    .from('post_media')
    .select('id')
    .eq('post_id', input.postId)
    .eq('workspace_id', input.workspaceId)
    .eq('asset_id', input.asset.id)
    .limit(1)
  if (already.error) return { ok: false, message: CANNOT_READ }
  if ((already.data?.length ?? 0) > 0) {
    return { ok: false, message: 'That photo is already on this post.' }
  }

  const { mime, bytes, width, height } = input.asset
  if (mime === null || bytes === null || width === null || height === null) {
    return { ok: false, message: CANNOT_READ }
  }

  // The original's bytes. Downloaded, never opened for writing.
  const download = await supabase.storage.from(MEDIA_BUCKET).download(input.asset.storage_path)
  if (download.error || !download.data) return { ok: false, message: CANNOT_READ }
  const originalBytes = new Uint8Array(await download.data.arrayBuffer())

  const oriented = await orientedSize(originalBytes)
  if (oriented === null) return { ok: false, message: CANNOT_READ }
  if (oriented.animated) {
    return { ok: false, message: 'Sahoda does not crop moving images — it would freeze them.' }
  }

  // The plan is rebuilt SERVER-SIDE from the original's own dimensions. The
  // browser sent a focal point and nothing else, so there is no rectangle here
  // that a client chose.
  const focal = normaliseFocal(input.focal)
  const candidate = { mime, bytes, width: oriented.width, height: oriented.height }
  const first = decideAttach(input.channels, candidate, input.existingCount, input.formats)
  const rejections = first.ok ? first.warnings : first.rejections

  const decision = buildOffer(input.channels, input.formats, candidate, rejections, focal)
  if (!decision.offered) return { ok: false, message: CROP_FAILED }

  const rect = placeCrop(
    oriented.width,
    oriented.height,
    { width: decision.offer.rect.width, height: decision.offer.rect.height },
    focal,
  )
  const outputMime = decision.offer.outputMime
  // The tightest cap among the channels this crop is cut for. Cutting to the
  // most generous one would mint a file a stricter channel then refuses.
  const maxBytes = Math.min(...decision.offer.targets.map((target) => target.maxBytes))
  const recipe = recipeFor(rect, outputMime, maxBytes)

  // ── IDEMPOTENT: the same crop of the same photo is one object ─────────────
  // Opening the crop screen twice, or two people cropping the same photo the same
  // way, finds this row and mints nothing. Checked before any rendering, so a
  // repeat costs neither CPU nor storage.
  const existing = await supabase
    .from('asset_derivatives')
    .select('*')
    .eq('asset_id', input.asset.id)
    .eq('recipe', recipe)
    .maybeSingle()

  let row = existing.data === null ? null : AssetDerivativeSchema.safeParse(existing.data)

  // ── A REUSED CROP RECORDS THE CHANNELS IT IS NOW SERVING TOO ─────────────
  // The bytes are identical, so the OBJECT is rightly shared — but the record of
  // what this crop was cut for is not a property of the bytes. A derivative first
  // made for [instagram] and then reused on an [instagram, x] post that only said
  // [instagram] would be a row that understates its own audience.
  if (row !== null && row.success) {
    const merged = mergeChannels(row.data.channels, decision.offer.targets)
    if (merged !== null) {
      const widened = await supabase
        .from('asset_derivatives')
        .update({ channels: merged.channels, formats: { ...row.data.formats, ...merged.formats } })
        .eq('id', row.data.id)
        .select('*')
        .single()
      // A failure to widen the RECORD is not a failure to attach: the file is
      // correct either way. Kept quiet rather than turned into a refusal.
      if (!widened.error) {
        const reparsed = AssetDerivativeSchema.safeParse(widened.data)
        if (reparsed.success) row = reparsed
      }
    }
  }

  if (row === null || !row.success) {
    const rendered = await renderDerivative(originalBytes, rect, outputMime, maxBytes)
    if (!rendered.ok) return { ok: false, message: CROP_FAILED }
    const derivative = rendered.derivative

    // THE SECOND JUDGEMENT. On the cropped file's own sniffed facts, against every
    // channel on the post. A crop that did not fix the problem never reaches
    // storage.
    const verdict = decideAttach(
      input.channels,
      {
        mime: derivative.mime,
        bytes: derivative.bytes.byteLength,
        width: derivative.width,
        height: derivative.height,
      },
      input.existingCount,
      input.formats,
    )
    if (!verdict.ok) return { ok: false, message: CROP_FAILED }

    const derivativeId = randomUUID()
    const objectPath = derivativeObjectPath({
      workspaceId: input.workspaceId,
      assetId: input.asset.id,
      derivativeId,
      mime: derivative.mime,
    })

    const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, derivative.bytes, {
      contentType: derivative.mime,
      upsert: false,
    })
    if (upload.error) return { ok: false, message: 'Could not store the cropped copy — try again.' }

    const inserted = await supabase
      .from('asset_derivatives')
      .insert({
        id: derivativeId,
        workspace_id: input.workspaceId,
        asset_id: input.asset.id,
        storage_path: objectPath,
        recipe,
        channels: decision.offer.targets.map((target) => target.channel),
        formats: formatMapFor(decision.offer.targets),
        crop_x: rect.x,
        crop_y: rect.y,
        crop_w: rect.width,
        crop_h: rect.height,
        focal_x: focal.x,
        focal_y: focal.y,
        mime: derivative.mime,
        bytes: derivative.bytes.byteLength,
        width: derivative.width,
        height: derivative.height,
        created_by: input.userId,
      })
      .select('*')
      .single()

    if (inserted.error) {
      // 23505 is the unique on (asset_id, recipe): someone else minted the same
      // crop between the read above and this insert. Theirs is as good as ours —
      // identical bytes by definition — so ours is removed rather than left as an
      // object nothing points at, and theirs is used.
      await removeObject(supabase, objectPath)
      if (inserted.error.code !== '23505') return { ok: false, message: CROP_FAILED }
      const raced = await supabase
        .from('asset_derivatives')
        .select('*')
        .eq('asset_id', input.asset.id)
        .eq('recipe', recipe)
        .maybeSingle()
      if (raced.data === null) return { ok: false, message: CROP_FAILED }
      row = AssetDerivativeSchema.safeParse(raced.data)
    } else {
      row = AssetDerivativeSchema.safeParse(inserted.data)
    }
  }

  if (row === null || !row.success) return { ok: false, message: CROP_FAILED }
  const derivativeRow = row.data

  // The attachment. `asset_id` is the ORIGINAL — that is what keeps the delete
  // gate whole — and `storage_path` is the CROP, which is what the publisher
  // reads and therefore what actually goes to the platform.
  const attach = await supabase.from('post_media').insert({
    workspace_id: input.workspaceId,
    post_id: input.postId,
    asset_id: input.asset.id,
    derivative_id: derivativeRow.id,
    storage_path: derivativeRow.storage_path,
    mime: derivativeRow.mime,
    bytes: derivativeRow.bytes,
    width: derivativeRow.width,
    height: derivativeRow.height,
    alt: input.alt,
  })

  if (attach.error) {
    // The derivative row and its object are deliberately LEFT. They are a cache
    // keyed to the asset and the crop, not to this post: the next attempt finds
    // the row by recipe and reuses it rather than rendering and uploading again.
    // Removing them here would also break any OTHER post already using this same
    // crop. `uploadedPath` is not cleaned up for exactly that reason.
    return { ok: false, message: 'Could not put the cropped copy on this post — try again.' }
  }

  const final = decideAttach(
    input.channels,
    {
      mime: derivativeRow.mime,
      bytes: derivativeRow.bytes,
      width: derivativeRow.width,
      height: derivativeRow.height,
    },
    input.existingCount,
    input.formats,
  )
  return { ok: true, warnings: final.ok ? final.warnings : final.rejections }
}

/** Best-effort object removal. A failure here is waste, never a user-facing error. */
async function removeObject(
  supabase: ReturnType<typeof createServerSupabase>,
  objectPath: string,
): Promise<void> {
  try {
    const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([objectPath])
    if (error) console.error('[media] orphan derivative left behind', error.message)
  } catch {
    console.error('[media] orphan derivative left behind')
  }
}
