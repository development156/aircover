import { CONSTRAINTS, validateMedia } from '@sahoda/shared'
import type { Channel, ConstraintViolation, MediaAttachment, PlatformSpec } from '@sahoda/shared'

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
 *     `spec.maxMediaCount`, i.e. the same shape `describeViolation` already renders.
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
const ACCEPTED_WITH_WARNINGS = 'Attached this file — some channels will not use it.'
const REJECTED = 'Check this file — no channel on this post can use it.'

/**
 * A candidate whose size or dimensions are not real numbers cannot be judged: a
 * `NaN` byte count slides under every `bytes > cap` test and a 0×0 image clears
 * linkedin and instagram, which declare no `imageDims`. Both would read as valid.
 * Unverifiable must surface as "cannot check", never as accepted.
 */
const UNVERIFIABLE = 'Re-upload this file — it could not be checked against the channel limits.'

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
): ConstraintViolation | undefined {
  if (existingCount + 1 <= spec.maxMediaCount) return undefined
  return {
    code: 'MAX_MEDIA_COUNT',
    message: `${spec.channel} allows ${spec.maxMediaCount} media items.`,
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
    const count = countViolation(CONSTRAINTS[channel], existingCount)
    const all = count === undefined ? [...violations] : [...violations, count]
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
