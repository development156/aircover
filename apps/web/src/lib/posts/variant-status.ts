import type { PostVariant, VariantPublishStatus } from '@sahoda/shared'

/**
 * What one channel of a post is actually doing, and why.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The dispatcher used to hold a partly-published post forever, and its own
 * comment said why: "until apps/web can say 'went out on X, did not go out on
 * Google' there is no honest badge for it". This is that sentence, made into
 * data. One post, several truths — never collapsed into a single tick.
 *
 * Pure: no React, no I/O, no clock.
 */

export interface VariantStatusRow {
  channel: PostVariant['channel']
  status: VariantPublishStatus
  /** Present only when the platform gave us one. Its presence is what makes it real. */
  permalink: string | null
  /** The adapter's own message, when the last attempt failed. */
  errorMessage: string | null
  errorCode: string | null
  /** True when a fresh attempt is worth offering. */
  retryable: boolean
}

/** `post_variants.last_error` is untyped jsonb; read it defensively, never throw. */
function readError(raw: unknown): { code: string | null; message: string | null } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { code: null, message: null }
  }
  const record = raw as Record<string, unknown>
  const code = typeof record.code === 'string' ? record.code : null
  const message = typeof record.message === 'string' ? record.message : null
  return { code, message }
}

/**
 * Statuses from which another attempt makes sense.
 *
 * `published` is excluded because retrying it would be a SECOND post, not a
 * retry — the content is already on the platform. `publishing` is excluded
 * because someone holds the claim right now; the claim would refuse anyway, but
 * offering a button that cannot work is its own small lie.
 */
const RETRYABLE: ReadonlySet<VariantPublishStatus> = new Set<VariantPublishStatus>([
  'failed',
  'pending',
  'scheduled',
])

export function variantStatusRow(variant: PostVariant): VariantStatusRow {
  const { code, message } = readError(variant.last_error)
  return {
    channel: variant.channel,
    status: variant.publish_status,
    // A fixture permalink is a simulation marker, not a destination — the same
    // rule LiveLink applies. Treated as absent so nothing renders it as a link.
    permalink:
      variant.permalink && !variant.permalink.startsWith('fixture://') ? variant.permalink : null,
    errorMessage: message,
    errorCode: code,
    retryable: RETRYABLE.has(variant.publish_status),
  }
}

/** Every selected channel's row, in the order the post declares its channels. */
export function variantStatusRows(
  channels: readonly PostVariant['channel'][],
  variants: readonly PostVariant[],
): VariantStatusRow[] {
  const byChannel = new Map(variants.map((v) => [v.channel, v]))
  return channels
    .map((channel) => byChannel.get(channel))
    .filter((v): v is PostVariant => v !== undefined)
    .map(variantStatusRow)
}

/**
 * Whether this post is partly out — live somewhere, definitively not somewhere else.
 *
 * Mirrors the dispatcher's own reading so the badge and the sweep agree. `skipped`
 * counts as neither: the post went out everywhere it was meant to.
 */
export function isPartial(rows: readonly VariantStatusRow[]): boolean {
  const published = rows.filter((r) => r.status === 'published').length
  const failed = rows.filter((r) => r.status === 'failed').length
  return published > 0 && failed > 0
}
