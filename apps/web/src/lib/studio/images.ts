import 'server-only'

import type { DesignPage } from '@sahoda/shared'

import { MEDIA_BUCKET } from '@/lib/posts/media-constants'
import { sniffImage } from '@/lib/posts/sniff-image'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * THE PICTURES IN A DESIGN, AS BYTES.
 *
 * A design stores an asset ID and never a URL. `document.ts` argues why at
 * length: a stored URL goes stale when a signed link expires, survives the file
 * being deleted, and can point outside the workspace. So the address is resolved
 * HERE, by code that holds the credentials and knows which workspace is asking,
 * and the renderer is handed bytes.
 *
 * ── AND THE RENDERER TAKES ONLY A DATA URI, WHICH IS THE POINT ──────────────
 * `svg.ts` refuses any `href` that is not a data URI. That is what stops an
 * exported design from making a request when it is rasterised: an `<image>` with
 * a remote address is a server-side fetch performed by the rasteriser, at an
 * address that reached us through a database column. Base64 is not an
 * optimisation here, it is the boundary.
 *
 * ── A MISSING PICTURE IS A REFUSAL, NEVER A GAP ─────────────────────────────
 * If a design points at an asset this resolver cannot produce bytes for, it
 * returns nothing for that slot, and `composeScene` then REFUSES the whole
 * design rather than drawing it without the photo. A design that exports
 * silently missing the customer's picture is the failure this arrangement
 * exists to make impossible: nothing downstream looks at what a picture
 * contains.
 */

/** The MIME types this product will put in front of the rasteriser, proven from bytes. */
const RENDERABLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/**
 * One picture, as a data URI, or null when this workspace cannot produce it.
 *
 * Null covers every reason on purpose: not in this workspace, in the trash,
 * bytes unreadable, or not an image type the rasteriser takes. The caller says
 * what that means for what it was doing, and no caller may render a slot it did
 * not get bytes for.
 */
export async function imageDataUri(assetId: string, workspaceId: string): Promise<string | null> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('assets')
      .select('storage_path')
      .eq('workspace_id', workspaceId)
      .eq('id', assetId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !data) return null
    const path = typeof data.storage_path === 'string' ? data.storage_path : null
    if (path === null) return null

    const download = await supabase.storage.from(MEDIA_BUCKET).download(path)
    if (download.error || !download.data) return null

    const bytes = new Uint8Array(await download.data.arrayBuffer())
    // The type comes from the BYTES, never from the `mime` column. A row can
    // say anything; this is what the rasteriser is actually about to read.
    const sniffed = sniffImage(bytes)
    if (!sniffed.ok || !RENDERABLE.has(sniffed.image.mime)) return null

    return `data:${sniffed.image.mime};base64,${Buffer.from(bytes).toString('base64')}`
  } catch {
    return null
  }
}

export type ResolvedImages = {
  /** Slot key to data URI, for every slot whose bytes were read. */
  images: Record<string, string>
  /** Asset IDs a slot asked for and this could not produce. The caller decides what to say. */
  missing: string[]
}

/**
 * Read every picture a page references, scoped to one workspace.
 *
 * The workspace filter sits here as well as in RLS for the reason the read
 * module gives: the membership policy admits every workspace this person
 * belongs to, so an unscoped read would let a design in one workspace pull a
 * photo out of another.
 *
 * Trashed files are excluded. A trashed photo is not a photo this design may
 * draw with, and rendering one would make the trash a place files still work
 * from.
 */
export async function resolvePageImages(
  page: DesignPage,
  workspaceId: string,
): Promise<ResolvedImages> {
  const wanted = new Map<string, string[]>()
  for (const [key, slot] of Object.entries(page.slots)) {
    if (slot.kind !== 'image') continue
    const keys = wanted.get(slot.assetId) ?? []
    keys.push(key)
    wanted.set(slot.assetId, keys)
  }
  if (wanted.size === 0) return { images: {}, missing: [] }

  const images: Record<string, string> = {}
  const missing: string[] = []

  // One read per DISTINCT asset, not per slot: two slots pointing at the same
  // photo are one download. A template with more than a couple of pictures does
  // not exist yet, so a batched read would be an optimisation of nothing.
  for (const [assetId, slotKeys] of wanted) {
    const href = await imageDataUri(assetId, workspaceId)
    if (href === null) {
      missing.push(assetId)
      continue
    }
    for (const key of slotKeys) images[key] = href
  }

  return { images, missing }
}
