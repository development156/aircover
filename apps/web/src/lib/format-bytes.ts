const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * 1024

/**
 * A byte count a person can read.
 *
 * Returns null — never "0 B", never an em dash — for anything that is not a real
 * count. `post_media.bytes` and `assets.bytes` are both nullable and neither
 * carries a CHECK, so a row can legitimately arrive with no size or with a
 * corrupt one. "0 B" would be a claim about the file; null lets the caller reach
 * for the absence vocabulary (docs/26 §4) and say which kind of nothing it is.
 *
 * Pure. Shared by the composer's media pane and the library, because the same
 * number rendered two ways in two places is how a size becomes untrustworthy.
 */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`
  if (bytes >= BYTES_PER_KB) return `${Math.round(bytes / BYTES_PER_KB)} KB`
  return `${bytes} B`
}
