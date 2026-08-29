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

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('assets')
      .select('id, storage_path, deleted_at')
      .eq('workspace_id', workspaceId)
      .in('id', [...wanted.keys()])
      .is('deleted_at', null)

    if (error || !data) return { images: {}, missing: [...wanted.keys()] }

    const paths = new Map<string, string>()
    for (const row of data) {
      const id = typeof row.id === 'string' ? row.id : null
      const path = typeof row.storage_path === 'string' ? row.storage_path : null
      if (id !== null && path !== null) paths.set(id, path)
    }

    for (const [assetId, slotKeys] of wanted) {
      const path = paths.get(assetId)
      if (path === undefined) {
        missing.push(assetId)
        continue
      }

      const download = await supabase.storage.from(MEDIA_BUCKET).download(path)
      if (download.error || !download.data) {
        missing.push(assetId)
        continue
      }

      const bytes = new Uint8Array(await download.data.arrayBuffer())
      // The type comes from the BYTES, never from the `mime` column. A row can
      // say anything; this is what the rasteriser is actually about to read.
      const sniffed = sniffImage(bytes)
      if (!sniffed.ok || !RENDERABLE.has(sniffed.image.mime)) {
        missing.push(assetId)
        continue
      }

      const href = `data:${sniffed.image.mime};base64,${Buffer.from(bytes).toString('base64')}`
      for (const key of slotKeys) images[key] = href
    }
  } catch {
    return { images: {}, missing: [...wanted.keys()] }
  }

  return { images, missing }
}
