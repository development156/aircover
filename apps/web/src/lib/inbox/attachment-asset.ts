import 'server-only'

import type { AttachmentType } from '@sahoda/publishing'

import { signMediaPreviews } from '@/lib/posts/media-url'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Turning "the writer chose this library file" into something Zernio can fetch.
 *
 * ── THE CALLER NEVER SUPPLIES A URL ──────────────────────────────────────────
 * The browser sends an asset id and nothing else. If it could send a url, a reply
 * from this workspace could be made to carry any file on the internet, sent under
 * the customer's own name into somebody else's conversation. So the id is resolved
 * here, against the ACTIVE workspace, through the ordinary RLS-scoped client, and
 * the link that goes on the wire is one this server minted.
 *
 * ── ONE ROW, NOT A FILTER OVER THE LIBRARY LIST ──────────────────────────────
 * `readAssets` caps at 200. Finding the asset by scanning that list would make a
 * legitimate but older file indistinguishable from another tenant's — refused for
 * the wrong reason, and a "foreign id is refused" test would pass without proving
 * anything. This asks for the one row by id, scoped twice.
 *
 * ── "PUBLICLY ACCESSIBLE" IS A ONE-HOUR SIGNED URL ───────────────────────────
 * The `media` bucket is private, so there is no permanent public link to hand out.
 * `signMediaPreviews` mints the same short-lived signed url the composer previews
 * with: Zernio fetches it within seconds of the send, and after an hour it is dead,
 * which is the property we want from a link that leaves the building. It is the
 * same bargain the platforms make with us — every Meta attachment url we store
 * expires too (see `attachment-href.ts`).
 */

/** What a resolved attachment puts on the wire, and what gets filed on the row. */
export interface ResolvedAttachment {
  url: string
  type: AttachmentType
}

export type AttachmentResolution =
  { ok: true; attachment: ResolvedAttachment } | { ok: false; message: string }

/**
 * A mime to Zernio's four-value enum.
 *
 * Anything unrecognised is `file`, which is also Zernio's own default — the honest
 * answer for a mime we do not know, and never a guess at `image`, which would send
 * a PDF as a photo and have the platform reject the whole reply.
 */
export function attachmentTypeFor(mime: string | null): AttachmentType {
  if (mime === null) return 'file'
  const lower = mime.toLowerCase()
  if (lower.startsWith('image/')) return 'image'
  if (lower.startsWith('video/')) return 'video'
  if (lower.startsWith('audio/')) return 'audio'
  return 'file'
}

/** Every refusal is a sentence the writer can act on. None of them names another tenant. */
const REFUSALS = {
  /** Deliberately one sentence for "does not exist" and "is not yours": telling the
   * two apart would confirm another workspace's asset id exists. */
  notFound: 'Sahoda could not find that file in your library, so it sent nothing.',
  trashed: 'That file is in the trash. Restore it before sending it.',
  unsigned: 'Sahoda could not make a link the platform can fetch. Try sending it again.',
} as const

export async function resolveAttachment(
  workspaceId: string,
  assetId: string,
): Promise<AttachmentResolution> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('assets')
    // Scoped to the ACTIVE workspace as well as being RLS-scoped: the member policy
    // admits every workspace the person belongs to, so id alone is not the boundary.
    .select('id, storage_path, mime, deleted_at')
    .eq('id', assetId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error || !data) return { ok: false, message: REFUSALS.notFound }

  const storagePath = (data as { storage_path?: unknown }).storage_path
  if (typeof storagePath !== 'string' || storagePath === '') {
    return { ok: false, message: REFUSALS.notFound }
  }
  if ((data as { deleted_at?: unknown }).deleted_at !== null) {
    return { ok: false, message: REFUSALS.trashed }
  }

  const mime = (data as { mime?: unknown }).mime
  const signed = await signMediaPreviews([{ id: assetId, storage_path: storagePath }])
  const url = signed[0]?.url ?? null
  // A null url is signing having FAILED, and the reply must not go out without the
  // photo the writer attached. Sending the words alone would look like a success and
  // silently drop the thing they were replying with.
  if (url === null) return { ok: false, message: REFUSALS.unsigned }

  return {
    ok: true,
    attachment: { url, type: attachmentTypeFor(typeof mime === 'string' ? mime : null) },
  }
}
