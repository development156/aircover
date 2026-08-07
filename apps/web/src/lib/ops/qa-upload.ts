import { checkArtifact, type ArtifactMime } from './qa-draft'

/**
 * PUT one screenshot to a Supabase signed upload URL, from the browser.
 *
 * Hand-written rather than pulled in with a browser Supabase client, because
 * that client exists to carry auth and this request carries none: the token in
 * the URL is the entire authorisation, minted server-side by `signQaUpload`
 * after it checked the run is the caller's own and still open. Adding a
 * second Supabase client to apps/web to make one authless PUT would widen the
 * surface `lib/supabase/server.ts` deliberately keeps at one.
 *
 * The wire format is not guesswork — it mirrors
 * `@supabase/storage-js@2.110.7` `StorageFileApi.uploadToSignedUrl` exactly:
 * multipart FormData with `cacheControl` and the blob under the EMPTY field
 * name, method PUT, `x-upsert` explicit. The empty field name is the part no
 * one would guess; getting it wrong yields a 400 the storage API does not
 * explain.
 */

export const UPLOAD_CACHE_CONTROL = '3600'

export type UploadOutcome = { ok: true } | { ok: false; message: string }

export async function putSignedUpload(signedUrl: string, file: Blob): Promise<UploadOutcome> {
  const body = new FormData()
  body.append('cacheControl', UPLOAD_CACHE_CONTROL)
  // Not a placeholder. storage-js appends the blob under '' and the API expects it.
  body.append('', file)

  try {
    const response = await fetch(signedUrl, {
      method: 'PUT',
      // No content-type: the browser must set the multipart boundary itself.
      headers: { 'x-upsert': 'false' },
      body,
    })

    if (!response.ok) {
      // The status is ours to log, not theirs to read — a storage error body can
      // name buckets and paths.
      return { ok: false, message: 'That screenshot did not upload. Try it again.' }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: 'That screenshot did not upload — check your connection.' }
  }
}

export interface UploadDeps {
  /** Mint a one-shot URL. Re-checks size, type and run ownership server-side. */
  sign: (input: {
    runId: string
    mime: ArtifactMime
    bytes: number
  }) => Promise<
    { ok: true; path: string; signedUrl: string; token: string } | { ok: false; message: string }
  >
  put: (signedUrl: string, file: Blob) => Promise<UploadOutcome>
  /** Write the artifact row only AFTER the bytes are in the bucket. */
  record: (input: {
    runId: string
    path: string
    bytes: number
    mime: ArtifactMime
    caption: string | null
  }) => Promise<{ ok: true } | { ok: false; message: string }>
}

/**
 * Attach one screenshot: check → sign → upload → record.
 *
 * The order is the point. Recording before the upload lands would put a row in
 * `ops_qa_artifacts` pointing at an object that does not exist — a thumbnail
 * that 404s forever, in a table whose whole job is to be evidence. So the row is
 * written last, and a failed upload leaves nothing behind but an unused signed
 * URL that expires on its own.
 *
 * Dependencies are injected so the sequence can be tested without a browser,
 * a bucket, or a server action.
 */
export async function uploadQaArtifact(
  runId: string,
  file: { size: number; type: string },
  blob: Blob,
  deps: UploadDeps,
  caption: string | null = null,
): Promise<UploadOutcome> {
  const check = checkArtifact(file)
  if (!check.ok) return { ok: false, message: check.message }

  const signed = await deps.sign({ runId, mime: check.mime, bytes: file.size })
  if (!signed.ok) return { ok: false, message: signed.message }

  const put = await deps.put(signed.signedUrl, blob)
  if (!put.ok) return put

  const recorded = await deps.record({
    runId,
    path: signed.path,
    bytes: file.size,
    mime: check.mime,
    caption,
  })
  if (!recorded.ok) return { ok: false, message: recorded.message }

  return { ok: true }
}
