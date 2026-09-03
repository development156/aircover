import 'server-only'

import { cache } from 'react'
import sharp from 'sharp'

import { CHANNEL_MEDIA_CAP_BYTES, MEDIA_BUCKET } from '@/lib/posts/media-constants'
import { createServerSupabase } from '@/lib/supabase/server'

import { readBrandLogo, readBrandLogoDark } from './logo'
import { logoFactsFromRaw, type LogoFacts } from './logo-facts'

/**
 * The workspace's logo AS BYTES, plus everything Sahoda knows about those bytes.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * Stamping a logo onto a generated picture needs three things at once: which
 * asset is the logo, the file itself, and the five facts that decide where the
 * mark can sit and whether it needs a plate behind it. Those three answers live
 * in three different places (a pointer column, a private storage bucket, a pure
 * measurement over raw pixels), and every caller that wanted all three was going
 * to wire them together its own way. One function, one answer, one wiring.
 *
 * ── WHICH ASSET IS THE LOGO IS NOT DECIDED HERE ─────────────────────────────
 * `readBrandLogo` decides it, and it is the only thing allowed to: the pointer
 * over the title match, and a trashed asset is never the logo. This file calls
 * it and then reads the storage path of the id it named. A second way of finding
 * the logo is exactly the defect the pointer was added to end, so there is not
 * one here.
 *
 * ── THE OBJECT IS DOWNLOADED, NOT FETCHED ───────────────────────────────────
 * The `media` bucket is private, so its files have no public URL, and the signed
 * link `readBrandLogo` returns is for a browser rather than for this process.
 * The server already holds a Supabase client scoped to the caller, so it asks
 * storage for the object directly. Fetching our own signed URL from the server
 * would be a network round trip to get bytes we can ask for, and it would fail
 * whenever signing failed even though the object itself reads fine.
 *
 * ── NULL IS AN ANSWER, NEVER A THROW ────────────────────────────────────────
 * No logo, an asset row that will not load, a file over the cap, a download that
 * fails, bytes sharp cannot decode, a `RangeError` out of the measurement: every
 * one of them answers null. The rule this exists to keep is the caller's: a
 * missing logo loses the stamp and keeps the picture. A generation somebody paid
 * for must never fail because of this function, so nothing it can do escapes it.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 * It does not resize, re-encode, place or persist anything. `bytes` is the file
 * exactly as stored, so the caller composites from the original rather than from
 * something already thrown away once. It does not write `asset_logo_facts`
 * either: measuring is cheap next to the generation it rides on, and a reader
 * that writes is a reader that can fail.
 */

export interface BrandLogoBytes {
  assetId: string
  /** The logo file, as stored. */
  bytes: Uint8Array
  facts: LogoFacts
}

/**
 * Sharp's own ceiling on decoded pixels, the same figure `derive.ts` and
 * `raster.ts` use. It refuses a small file that would decode to gigabytes.
 */
const MAX_PIXELS = 100_000_000

/**
 * A logo over this is refused rather than decoded. It is
 * `CHANNEL_MEDIA_CAP_BYTES` and not a number invented here: a cap smaller than
 * what the library HOLDS would mean a file the library accepted and this reader
 * silently declines to stamp. If a stricter logo-only limit is ever wanted it
 * belongs next to the upload that would enforce it, where a person can be told
 * at the moment they choose the file.
 *
 * It followed the upload cap until 2026-09-02, when that cap dropped to 4 MB to
 * fit inside a Vercel function request body. This read happens server-side on a
 * STORED object, so no request limit applies to it, and following the new cap
 * would have quietly stopped stamping every logo already in a library above 4 MB.
 */
const LOGO_CAP_BYTES = CHANNEL_MEDIA_CAP_BYTES

interface AssetRow {
  id: string
  storage_path: string
  bytes: number | null
}

/**
 * The stored file, or null. Refuses an oversize file twice: once on the row's
 * recorded size, before anything is transferred, and once on what actually
 * arrived, because that column is nullable and a null is not a small file.
 */
async function downloadLogo(workspaceId: string, assetId: string): Promise<Uint8Array | null> {
  const supabase = createServerSupabase()

  const asset = await supabase
    .from('assets')
    .select('id, storage_path, bytes')
    .eq('id', assetId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (asset.error || !asset.data) return null
  const row = asset.data as AssetRow
  if (typeof row.storage_path !== 'string' || row.storage_path === '') return null
  if (typeof row.bytes === 'number' && row.bytes > LOGO_CAP_BYTES) return null

  const download = await supabase.storage.from(MEDIA_BUCKET).download(row.storage_path)
  if (download.error || !download.data) return null

  const bytes = new Uint8Array(await download.data.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > LOGO_CAP_BYTES) return null
  return bytes
}

/**
 * Decode and measure. The channel count comes from sharp's own report of what it
 * wrote and is never assumed: a JPEG logo decodes to three channels and a PNG
 * with alpha to four, and `logoFactsFromRaw` reads the buffer at a stride of
 * exactly that many bytes. Passing the wrong count does not throw, it walks the
 * pixels at the wrong offset and returns confident nonsense.
 */
async function measure(bytes: Uint8Array): Promise<LogoFacts | null> {
  const decoded = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = decoded.info
  // Sharp can also report 1 (greyscale) or 2 (greyscale with alpha), which the
  // measurement does not read. Null rather than a guess.
  if (channels !== 3 && channels !== 4) return null

  return logoFactsFromRaw(new Uint8Array(decoded.data), width, height, channels)
}

/**
 * Null when there is no logo, or it could not be read, or it could not be
 * measured.
 *
 * Wrapped in `cache()` so one request downloads and decodes the file once. A
 * generation that produces four pictures asks four times, and without this it
 * would pull the same object over the network and re-decode it four times for
 * one identical answer.
 */
export const readBrandLogoBytes = cache(async function readBrandLogoBytes(
  workspaceId: string,
): Promise<BrandLogoBytes | null> {
  try {
    const logo = await readBrandLogo(workspaceId)
    if (logo === null) return null

    const bytes = await downloadLogo(workspaceId, logo.assetId)
    if (bytes === null) return null

    const facts = await measure(bytes)
    if (facts === null) return null

    return { assetId: logo.assetId, bytes, facts }
  } catch {
    // Undecodable bytes, a RangeError out of the measurement, a storage client
    // that threw. See the header: this function is never the reason a paid
    // generation fails.
    return null
  }
})

/**
 * The workspace's DARK-background logo variant, as bytes plus facts. Null for
 * every reason `readBrandLogoBytes` above can be null, plus the ordinary case:
 * no dark variant has been chosen.
 *
 * Deliberately not built by generalising `readBrandLogoBytes` to take a reader
 * function as a parameter: the two are already this short, and a shared helper
 * would need to thread `cache()` through a parameter, which `react`'s `cache()`
 * cannot do without becoming a different cache key per call, per React's own
 * dedup-by-function-identity rule. Duplicating five lines is cheaper than
 * getting that wrong.
 */
export const readBrandLogoBytesDark = cache(async function readBrandLogoBytesDark(
  workspaceId: string,
): Promise<BrandLogoBytes | null> {
  try {
    const logo = await readBrandLogoDark(workspaceId)
    if (logo === null) return null

    const bytes = await downloadLogo(workspaceId, logo.assetId)
    if (bytes === null) return null

    const facts = await measure(bytes)
    if (facts === null) return null

    return { assetId: logo.assetId, bytes, facts }
  } catch {
    return null
  }
})

export interface BrandLogoBytesVariants {
  light: BrandLogoBytes | null
  dark: BrandLogoBytes | null
}

/**
 * Both logo variants a workspace may hold, as bytes plus facts, read together.
 * Added alongside `readBrandLogoBytes` for the same reason `readBrandLogoVariants`
 * sits alongside `readBrandLogo`: every existing caller wants exactly one file,
 * and this is for the caller (the stamping pipeline) that wants both so it can
 * choose which fits the picture it is stamping.
 */
export const readBrandLogoBytesVariants = cache(async function readBrandLogoBytesVariants(
  workspaceId: string,
): Promise<BrandLogoBytesVariants> {
  const [light, dark] = await Promise.all([
    readBrandLogoBytes(workspaceId),
    readBrandLogoBytesDark(workspaceId),
  ])
  return { light, dark }
})
