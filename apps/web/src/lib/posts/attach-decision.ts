import { CONSTRAINTS, validateMedia } from '@sahoda/shared'
import type { Channel, ConstraintViolation, MediaAttachment, PlatformSpec } from '@sahoda/shared'
import { mediaRuleFor, refuseFormatMedia, type PostFormat } from '@sahoda/publishing/format'

import { describeViolation } from './violation-copy'

/**
 * Attach-time decision for one sniffed file (FSD 3.1: validate at attach, not only
 * at publish).
 *
 * Two rules carry the design:
 *
 *  1. A file no selected channel accepts is a REJECTION. A file some channels
 *     accept and others do not is ACCEPTED WITH WARNINGS — a writer targeting x
 *     and linkedin may legitimately want a gif that only x takes, and the objecting
 *     channels are reported, never silently dropped from the post and never allowed
 *     to block the attach on the accepting channel's behalf.
 *
 *  2. Limits are read only through `CONSTRAINTS` / `validateMedia`. The one rule
 *     this module applies itself is the per-channel media COUNT, because
 *     `validateMedia` judges a single attachment and cannot know how many are
 *     already on the post. It is emitted as a `MAX_MEDIA_COUNT` violation quoting
 *     the resolved limit, i.e. the same shape `describeViolation` already renders.
 *
 *  3. THE FORMAT IS PART OF THE RULE, per channel. A version that says "One
 *     photo" takes one, a set takes two or more, and an Instagram story has to be
 *     upright — none of which the channel's own spec can express, because they are
 *     properties of the KIND of post, not of the platform. FSD §3.1 puts media
 *     validation at attach time and this is the only place the pixel dimensions
 *     exist: `PublishRequestMedia` carries `storagePath`, `mime` and `bytes` and
 *     no width, so an aspect rule written into the publish path would silently
 *     pass forever.
 *
 * Pure module: no I/O, no React, no clock.
 */

export interface AttachCandidate {
  mime: string
  bytes: number
  width: number
  height: number
}

export interface ChannelRejection {
  channel: Channel
  violations: ConstraintViolation[]
}

export type AttachDecision =
  | { ok: true; warnings: ChannelRejection[] }
  | { ok: false; rejections: ChannelRejection[]; message: string }

const ACCEPTED = 'Attached this file.'
const ACCEPTED_WITH_WARNINGS = 'Attached this file. Some channels will not use it.'
const REJECTED = 'Check this file. No channel on this post can use it.'

/**
 * A candidate whose size or dimensions are not real numbers cannot be judged: a
 * `NaN` byte count slides under every `bytes > cap` test and a 0×0 image clears
 * linkedin and instagram, which declare no `imageDims`. Both would read as valid.
 * Unverifiable must surface as "cannot check", never as accepted.
 */
const UNVERIFIABLE = 'Re-upload this file. It could not be checked against the channel limits.'

/** One sentence per channel; beyond this the rest are counted, so no summary can become a wall. */
const MAX_CLAUSES = 3

const KNOWN_CHANNELS: ReadonlySet<string> = new Set(Object.keys(CONSTRAINTS))

function isKnownChannel(channel: string): channel is Channel {
  return KNOWN_CHANNELS.has(channel)
}

/** A real, countable file: whole positive byte count and whole positive pixel dimensions. */
function isMeasured(candidate: AttachCandidate): boolean {
  return (
    Number.isSafeInteger(candidate.bytes) &&
    candidate.bytes > 0 &&
    Number.isSafeInteger(candidate.width) &&
    candidate.width > 0 &&
    Number.isSafeInteger(candidate.height) &&
    candidate.height > 0
  )
}

/** Anything but a whole non-negative count leaves the count rule unenforceable. */
function isCountable(existingCount: number): boolean {
  return Number.isSafeInteger(existingCount) && existingCount >= 0
}

/**
 * The count rule `validateMedia` cannot apply. The message quotes
 * `spec.maxMediaCount` verbatim so it matches the shape `violation-copy` allows
 * through; the limit is never restated here.
 */
function countViolation(
  spec: PlatformSpec,
  existingCount: number,
  format: PostFormat | null,
): ConstraintViolation | undefined {
  // The FORMAT's ceiling when the version declares one, the channel's otherwise.
  // `mediaRuleFor` folds the channel cap in, so this can never widen a platform
  // limit — only narrow it to what the writer said they were making.
  const limit = format === null ? spec.maxMediaCount : mediaRuleFor(spec, format).maxItems
  if (existingCount + 1 <= limit) return undefined
  return {
    code: 'MAX_MEDIA_COUNT',
    message: `${spec.channel} allows ${limit} media items.`,
    field: 'media',
  }
}

/**
 * One channel's objection as a sentence. Everything user-facing goes through
 * `describeViolation`, so a violation carrying DB or stack text degrades to safe
 * copy; a channel with no spec is dropped rather than printed. Only the first
 * violation is quoted — the full list travels on the decision itself.
 */
function clauseFor(rejection: ChannelRejection): string | undefined {
  const { channel } = rejection
  if (typeof channel !== 'string' || !isKnownChannel(channel)) return undefined

  const violations = Array.isArray(rejection.violations) ? rejection.violations : []
  const first = violations[0]
  if (first === undefined) return undefined

  const detail = describeViolation(first).message
  // Engine copy already opens with the channel name; safe fallbacks do not.
  return detail.startsWith(`${channel} `) ? detail : `${channel}: ${detail}`
}

function composeMessage(lead: string, objections: readonly ChannelRejection[]): string {
  const clauses = objections
    .map(clauseFor)
    .filter((clause): clause is string => clause !== undefined)

  if (clauses.length === 0) return lead

  const shown = clauses.slice(0, MAX_CLAUSES)
  const hidden = clauses.length - shown.length
  const overflow =
    hidden > 0 ? [hidden === 1 ? '1 more channel objects.' : `${hidden} more channels object.`] : []

  return [lead, ...shown, ...overflow].join(' ')
}

/**
 * Decide whether `candidate` may be attached to a post targeting `channels`,
 * given how many media items the post already carries.
 */
export function decideAttach(
  channels: readonly Channel[],
  candidate: AttachCandidate,
  existingCount: number,
  /**
   * What each channel's version says it is. REQUIRED, not optional: a caller that
   * omitted it would go on accepting a landscape photo onto a story and a second
   * photo onto a version that says "One photo", and would look exactly like a
   * caller that had checked. `{}` is the honest way to say "no version states an
   * intent", and it restores the pre-format behaviour precisely.
   */
  formats: Readonly<Partial<Record<Channel, PostFormat | null>>>,
): AttachDecision {
  if (!isMeasured(candidate) || !isCountable(existingCount)) {
    return { ok: false, rejections: [], message: UNVERIFIABLE }
  }

  // A channel with no spec is skipped: this module has no limits to judge it by
  // and will not invent any.
  const targets = [...new Set(channels)].filter(isKnownChannel)
  const specs = targets.map((channel) => CONSTRAINTS[channel])

  const media: MediaAttachment = {
    mime: candidate.mime,
    bytes: candidate.bytes,
    width: candidate.width,
    height: candidate.height,
  }

  const objections: ChannelRejection[] = []
  let acceptedBy = 0

  for (const { channel, violations } of validateMedia(specs, media)) {
    const spec = CONSTRAINTS[channel]
    const format = formats[channel] ?? null
    const count = countViolation(spec, existingCount, format)

    // The shape rule that belongs to the KIND of post rather than the platform.
    const shape = refuseFormatMedia(spec, format, {
      width: candidate.width,
      height: candidate.height,
    })

    // ── THE FORMAT'S ASPECT RULE REPLACES THE ENGINE'S, IT DOES NOT STACK ─────
    // MEASURED: `CONSTRAINTS.instagram.imageDims.aspectRange` is [0.8, 1.91],
    // which is the FEED range — and a story is 9:16, i.e. 0.56. Stacked, the
    // engine refuses the exact photo a story requires, and the writer is told
    // their upright picture is the wrong shape for an upright format.
    //
    // So the channel's range is not really a channel rule; it is the feed
    // format's rule, sitting on the channel because the frozen contract has
    // nowhere else to put it. When a format declares its own, the engine's is
    // dropped for THIS attachment only — never any of its other verdicts.
    const overridesAspect = format !== null && mediaRuleFor(spec, format).maxAspect !== undefined
    const engine = overridesAspect
      ? violations.filter((v) => v.code !== 'MEDIA_ASPECT')
      : violations

    const all = [
      ...engine,
      ...(count === undefined ? [] : [count]),
      ...(shape === null
        ? []
        : [{ code: shape.code, message: shape.message, field: 'dimensions' }]),
    ]
    if (all.length === 0) {
      acceptedBy += 1
      continue
    }
    objections.push({ channel, violations: all })
  }

  // Nothing selected: no spec to violate, and the post cannot publish until a
  // channel is picked, at which point the editor decides again.
  if (targets.length > 0 && acceptedBy === 0) {
    return { ok: false, rejections: objections, message: composeMessage(REJECTED, objections) }
  }

  return { ok: true, warnings: objections }
}
