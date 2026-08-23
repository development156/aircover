import type { Channel, ConstraintViolation, MediaAttachment, PostMedia } from '@sahoda/shared'
import { CONSTRAINTS, validateMedia } from '@sahoda/shared'

/**
 * A `post_media` row stores mime and bytes as nullable, and the column is a plain
 * `int` with no CHECK — so a row can carry no type, no size, or a size that is not
 * a real byte count. The Constraint Engine cannot judge such a file, so the row
 * converts to an explicit failure rather than to an attachment. Callers must treat
 * that failure as "unknown", never as "valid" — see `unverifiableRows`.
 */
export type AttachmentResult =
  | { ok: true; attachment: MediaAttachment }
  | { ok: false; reason: 'missing_mime' | 'missing_bytes' | 'invalid_bytes'; message: string }

/** One channel's verdict. `violations` alone is never the whole answer — see `unverifiable`. */
export interface ChannelMediaVerdict {
  channel: Channel
  violations: ConstraintViolation[]
  /** Rows the engine was never able to judge. Non-empty means "not cleared", whatever `violations` says. */
  unverifiable: PostMedia[]
}

const MISSING_MIME_MESSAGE =
  'Re-upload this file to check it. Its file type is missing, so it cannot be checked against the channel limits.'

const MISSING_BYTES_MESSAGE =
  'Re-upload this file to check it. Its file size is missing, so it cannot be checked against the channel limits.'

const INVALID_BYTES_MESSAGE =
  'Re-upload this file to check it. Its file size could not be read, so it cannot be checked against the channel limits.'

/** Convert one `post_media` row into an attachment the Constraint Engine can validate. */
export function toAttachment(row: PostMedia): AttachmentResult {
  if (row.mime === null) {
    return { ok: false, reason: 'missing_mime', message: MISSING_MIME_MESSAGE }
  }
  if (row.bytes === null) {
    return { ok: false, reason: 'missing_bytes', message: MISSING_BYTES_MESSAGE }
  }
  // A negative or non-finite size is not a small file — it is a size we do not have.
  // Left alone it would slide under every `bytes > maxMediaMB` cap and read as valid.
  if (!Number.isFinite(row.bytes) || row.bytes < 0) {
    return { ok: false, reason: 'invalid_bytes', message: INVALID_BYTES_MESSAGE }
  }

  // The engine only checks dimensions when both are known, so a half-known
  // pair is dropped rather than validated against a guessed counterpart.
  const hasDims = row.width !== null && row.height !== null

  return {
    ok: true,
    attachment: hasDims
      ? {
          mime: row.mime,
          bytes: row.bytes,
          width: row.width ?? undefined,
          height: row.height ?? undefined,
        }
      : { mime: row.mime, bytes: row.bytes },
  }
}

/** The rows that cannot be validated at all, and so must be surfaced to the user as unchecked. */
export function unverifiableRows(rows: readonly PostMedia[]): PostMedia[] {
  return rows.filter((row) => !toAttachment(row).ok)
}

function violationKey(violation: ConstraintViolation): string {
  return `${violation.code}|${violation.field ?? ''}|${violation.message}`
}

/**
 * Validate every checkable attachment against every requested channel and union
 * the results per channel.
 *
 * Rows that cannot be converted raise nothing — the engine was handed nothing to
 * judge — so each verdict carries those rows in `unverifiable`. A channel is only
 * cleared when `violations` AND `unverifiable` are both empty; reading an empty
 * `violations` alone would ship an unchecked file.
 */
export function validateAttachments(
  channels: readonly Channel[],
  rows: readonly PostMedia[],
): ChannelMediaVerdict[] {
  const uniqueChannels = [...new Set(channels)]
  const specs = uniqueChannels.map((channel) => CONSTRAINTS[channel])
  const unverifiable = unverifiableRows(rows)

  const perChannel = new Map<Channel, Map<string, ConstraintViolation>>(
    uniqueChannels.map((channel) => [channel, new Map<string, ConstraintViolation>()]),
  )

  for (const row of rows) {
    const result = toAttachment(row)
    if (!result.ok) continue

    for (const { channel, violations } of validateMedia(specs, result.attachment)) {
      const collected = perChannel.get(channel)
      if (!collected) continue
      for (const violation of violations) {
        // Violations carry no row reference, so two rows failing the same rule
        // would read as the same sentence twice. Keep the first occurrence.
        const key = violationKey(violation)
        if (!collected.has(key)) collected.set(key, violation)
      }
    }
  }

  return uniqueChannels.map((channel) => ({
    channel,
    violations: [...(perChannel.get(channel)?.values() ?? [])],
    // Each verdict owns its array so a caller mutating one cannot reach the others.
    unverifiable: [...unverifiable],
  }))
}
