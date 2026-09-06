import 'server-only'

import { randomUUID } from 'node:crypto'
import sharp from 'sharp'

import { MEDIA_BUCKET } from '../posts/media-constants'
import { derivativePrefix } from '../posts/media-path'
import { sniffImage } from '../posts/sniff-image'
import type { createServerSupabase } from '../supabase/server'

/**
 * THE GRID'S SMALL COPY. A 480 px WebP minted once, at upload.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────
 * The library tile is 300 px wide on a laptop and it was loading the original
 * to draw itself: two hundred tiles at up to 4 MB each is the heaviest page in
 * the product, for a grid whose whole job is to be glanced at. A thumbnail is
 * the difference between a screen that opens and one that downloads.
 *
 * ── WHY IT IS AN `asset_derivatives` ROW ────────────────────────────────────
 * The table already exists for cropped copies, it cascades from the asset, its
 * path CHECK covers `<workspace>/derivatives/…`, and `deleteAsset` sweeps that
 * prefix. So a thumbnail is deleted when its photo is, with no new sweep and no
 * new policy. The recipe `thumb` is a fixed word rather than a rectangle-and-
 * encoding string, which is what keeps it from ever colliding with a crop.
 *
 * ── BEST EFFORT, AND WHY THAT IS RIGHT HERE ─────────────────────────────────
 * By the time this runs the file is stored and its row is written. A failure
 * to mint costs the tile a small copy — it loads the original instead, which is
 * what it always did — and is reported so the waste is seen. It never fails the
 * upload: a person who could not add a photo because a thumbnail did not encode
 * would have lost the thing for the sake of a convenience.
 */

export const THUMB_RECIPE = 'thumb'
export const THUMB_WIDTH = 480
const THUMB_QUALITY = 78
/** Sharp's own ceiling on how many pixels it will decode. Guards a decompression bomb. */
const MAX_PIXELS = 100_000_000

/** `<workspace>/derivatives/<asset>/thumb.webp`. One per photo, hence a fixed name. */
export function thumbObjectPath(input: { workspaceId: string; assetId: string }): string {
  return `${derivativePrefix(input)}/${THUMB_RECIPE}.webp`
}

export interface RenderedThumb {
  bytes: Uint8Array
  mime: string
  width: number
  height: number
}

/**
 * Scale the original down to `THUMB_WIDTH`, keeping its shape, as WebP.
 *
 * `.rotate()` bakes the EXIF orientation in, for the reason `derive.ts` gives:
 * a browser shows the oriented photo, so a thumbnail of the unoriented pixels
 * would be a different picture from the one on screen. `withoutEnlargement`
 * refuses to blow a small photo up, and the facts about the output are sniffed
 * from the bytes rather than taken from the encoder's report.
 */
export async function renderThumb(input: Uint8Array): Promise<RenderedThumb | null> {
  try {
    const out = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer()
    const bytes = new Uint8Array(out)
    const sniffed = sniffImage(bytes)
    if (!sniffed.ok) return null
    return {
      bytes,
      mime: sniffed.image.mime,
      width: sniffed.image.width,
      height: sniffed.image.height,
    }
  } catch {
    return null
  }
}

export interface MintThumbInput {
  workspaceId: string
  assetId: string
  userId: string
  /** The original's bytes, already in memory from the upload. */
  bytes: Uint8Array
  /** The original's sniffed size, for the "crop" record of the whole frame. */
  width: number
  height: number
}

export type MintThumbResult = { ok: true; minted: boolean } | { ok: false; message: string }

/**
 * Store a thumbnail for one library file.
 *
 * `minted: false` covers the two ordinary non-events: an original already no
 * wider than a thumbnail (it IS its own small copy), and a row that was there
 * already (`23505`, the unique on `(asset_id, recipe)`). Neither is a failure
 * and neither is reported as one.
 */
export async function mintThumbnail(
  supabase: ReturnType<typeof createServerSupabase>,
  input: MintThumbInput,
): Promise<MintThumbResult> {
  if (input.width <= THUMB_WIDTH) return { ok: true, minted: false }

  const rendered = await renderThumb(input.bytes)
  if (rendered === null) return { ok: false, message: 'The thumbnail did not encode.' }

  const objectPath = thumbObjectPath({ workspaceId: input.workspaceId, assetId: input.assetId })
  // `upsert: true`, unlike a crop: the path is fixed per photo, so a thumbnail
  // re-minted after a failed row insert replaces the orphan rather than being
  // refused by it.
  const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, rendered.bytes, {
    contentType: rendered.mime,
    upsert: true,
  })
  if (upload.error) return { ok: false, message: upload.error.message }

  const { error } = await supabase.from('asset_derivatives').insert({
    id: randomUUID(),
    workspace_id: input.workspaceId,
    asset_id: input.assetId,
    storage_path: objectPath,
    recipe: THUMB_RECIPE,
    // Cut for nobody: a thumbnail is never attached to a post, so no channel
    // verified it and the record says so rather than naming one.
    channels: [],
    formats: {},
    // The whole frame. Nothing was cut, only scaled, and the columns are
    // `not null`, so the honest rectangle is the original itself.
    crop_x: 0,
    crop_y: 0,
    crop_w: input.width,
    crop_h: input.height,
    focal_x: 0.5,
    focal_y: 0.5,
    mime: rendered.mime,
    bytes: rendered.bytes.byteLength,
    width: rendered.width,
    height: rendered.height,
    created_by: input.userId,
  })
  if (error) {
    if (error.code === '23505') return { ok: true, minted: false }
    return { ok: false, message: error.message }
  }
  return { ok: true, minted: true }
}
