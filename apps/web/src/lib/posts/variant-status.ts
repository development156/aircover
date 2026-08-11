import type { ChannelSet, PostVariant, VariantPublishStatus } from '@sahoda/shared'

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
  /**
   * The PLATFORM's own post id — and the key every analytics read is made with
   * (`assertPlatformPostId` calls this column "the ANALYTICS key" by name).
   *
   * Null is common and legitimate: the platform may never issue one, and the write
   * guard stores null rather than substituting a provider id. Null here means no
   * analytics call is possible — which the metric state reports as such, not as zero.
   */
  platformPostId: string | null
  /**
   * The publish ran in fixture mode — nothing reached the platform.
   *
   * Carried SEPARATELY from `platformPostId` because erasing the id destroys the
   * reason. Downstream, a fixture and a live publish whose id never arrived are the
   * same null, and the metrics panel reported both as "the platform didn't return a
   * post id" — a sentence that blames a platform which, for a fixture, was never asked.
   *
   * Read off the `fixture://` permalink, which is the only field that still knows.
   */
  simulated: boolean
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
  // The one field that still distinguishes a simulated run from a live one. Computed
  // once, before the id is erased, because afterwards the difference is gone.
  const simulated = variant.permalink?.startsWith('fixture://') === true
  return {
    simulated,
    channel: variant.channel,
    status: variant.publish_status,
    // A fixture permalink is a simulation marker, not a destination — the same
    // rule LiveLink applies. Treated as absent so nothing renders it as a link.
    permalink:
      variant.permalink && !variant.permalink.startsWith('fixture://') ? variant.permalink : null,
    // Only a LIVE publish has a platform id worth asking analytics about. A fixture
    // run never touched the platform, so carrying its id forward would send a
    // simulated post to a real metrics endpoint.
    platformPostId: variant.permalink?.startsWith('fixture://')
      ? null
      : (variant.platform_post_id ?? null),
    errorMessage: message,
    errorCode: code,
    retryable: RETRYABLE.has(variant.publish_status),
  }
}

/**
 * Every selected channel's row, in the order the post declares its channels.
 *
 * Takes a `ChannelSet` rather than an array because the output is rendered as a
 * keyed list — the status list, the variant tab strip and the metric strip all
 * key by `row.channel`. A repeated channel here would emit two rows carrying the
 * SAME key and the same variant, which is both a React key collision and a lie:
 * one channel, drawn as two destinations. The row boundary is what makes that
 * unreachable.
 */
export function variantStatusRows(
  channels: ChannelSet,
  variants: readonly PostVariant[],
): VariantStatusRow[] {
  return selectStatusRows(channels, variants.map(variantStatusRow))
}

/**
 * The same selection, applied to rows that have ALREADY been built.
 *
 * ── WHY THIS IS EXTRACTED RATHER THAN REPEATED ───────────────────────────────
 * "Filter to the post's channels, in the post's order" is a CONTRACT, not an
 * implementation detail, and it now has two callers: the server render, which
 * starts from `PostVariant` rows, and the live poll, which arrives with
 * `VariantStatusRow`s already assembled by `listVariantStates`.
 *
 * The filter is load-bearing and easy to lose. `listVariants` returns rows for
 * channels the writer may have since DESELECTED — `posts-publish.ts:73-76` says
 * so and filters for exactly that reason: the variant row survives the deselect.
 * A path that skipped this would hand `PublishNow` a row for a channel the post
 * no longer targets, where `anyAttempted` (`publish-now.tsx:103`) flips on it and
 * `ChannelStatusList` renders a chip for a destination that is not part of this
 * post any more.
 *
 * Two copies of that rule would drift, and the drift would be invisible: the
 * server render would be right and the first poll would quietly widen the list.
 * One implementation, both callers.
 */
export function selectStatusRows(
  channels: ChannelSet,
  rows: readonly VariantStatusRow[],
): VariantStatusRow[] {
  const byChannel = new Map(rows.map((row) => [row.channel, row]))
  return channels
    .map((channel) => byChannel.get(channel))
    .filter((row): row is VariantStatusRow => row !== undefined)
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
