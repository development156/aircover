import type { Channel } from '../enums'
import type { ActionType } from '../ledger/pricing'

/**
 * Constraint Engine v0. Declarative per-platform specs + pure validation/formatting,
 * living in @sahoda/shared so the editor (apps/web) AND the adapters
 * (packages/publishing) consume ONE source. Adapters add network I/O on top; they
 * never redefine limits. Surcharges reference a pricing key, never a raw number (D12).
 */
export interface PlatformSpec {
  channel: Channel
  publishable: boolean
  maxChars: number
  linkPolicy: 'counted_fixed' | 'plain' | 'discouraged'
  maxHashtags?: number
  mediaTypes: string[]
  maxMediaMB: number
  maxMediaCount: number
  /**
   * Media is MANDATORY on this channel — there is no text-only post (doc 13 §6:
   * Instagram). Previously the engine only ever capped media with an upper bound,
   * so a caption-only Instagram variant returned `violations: []` and the editor
   * showed green on a post that cannot exist.
   */
  requiresMedia?: boolean
  imageDims?: { minW: number; minH: number; aspectRange?: [number, number] }
  gbp?: { ctaTypes: string[]; supportsOffer: boolean }
  surchargeAction?: ActionType
  perDayCap: number
  scheduleMinLeadMinutes: number
}

/** A media item as the adapter will send it — a public URL plus what the platform needs. */
export interface MediaRef {
  url: string
  mime: string
  bytes?: number
  altText?: string
}

/**
 * `media` is on EVERY arm, not just instagram.
 *
 * It began instagram-only because instagram was the only channel that could not
 * accept text alone (doc 13 §6). Once x, gbp and linkedin also publish through
 * Zernio they receive media the same way — as a public URL the platform fetches —
 * so the field belongs to the shape rather than to one channel. It is `[]` for a
 * text-only post, which is a legal state everywhere except instagram, and that
 * one difference is expressed by `requiresMedia` on the spec rather than by the
 * type.
 */
export type FormattedContent =
  | { channel: 'x'; text: string; media: MediaRef[]; mediaIds?: string[] }
  | {
      channel: 'gbp'
      summary: string
      media: MediaRef[]
      ctaType?: string
      ctaUrl?: string
      offer?: { title: string; terms?: string }
    }
  | { channel: 'linkedin'; text: string; media: MediaRef[] }
  | { channel: 'instagram'; caption: string; media: MediaRef[] }

export interface ConstraintViolation {
  code: string
  message: string
  field?: string
}

export interface VariantDraft {
  body: string
  hashtags?: string[]
  hasLink?: boolean
  mediaCount?: number
}

export interface MediaAttachment {
  mime: string
  bytes: number
  width?: number
  height?: number
}

const GBP_CTA_TYPES = ['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL']
const MB = 1024 * 1024
/** A t.co-wrapped link counts as a fixed 23 chars on X regardless of real length. */
const X_LINK_WEIGHT = 23
const SCHEDULE_MIN_LEAD_MINUTES = 5

/** The single declarative source consumed by editor validation AND adapter formatting. */
export const CONSTRAINTS: Record<Channel, PlatformSpec> = {
  x: {
    channel: 'x',
    publishable: true,
    maxChars: 280,
    linkPolicy: 'counted_fixed',
    mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxMediaMB: 5,
    maxMediaCount: 4,
    imageDims: { minW: 4, minH: 4 },
    perDayCap: 100,
    scheduleMinLeadMinutes: SCHEDULE_MIN_LEAD_MINUTES,
  },
  gbp: {
    channel: 'gbp',
    publishable: true,
    maxChars: 1500,
    linkPolicy: 'plain',
    mediaTypes: ['image/jpeg', 'image/png'],
    maxMediaMB: 5,
    maxMediaCount: 1,
    imageDims: { minW: 250, minH: 250 },
    gbp: { ctaTypes: GBP_CTA_TYPES, supportsOffer: true },
    perDayCap: 10,
    scheduleMinLeadMinutes: SCHEDULE_MIN_LEAD_MINUTES,
  },
  linkedin: {
    channel: 'linkedin',
    publishable: true,
    maxChars: 3000,
    linkPolicy: 'plain',
    mediaTypes: ['image/jpeg', 'image/png'],
    maxMediaMB: 5,
    maxMediaCount: 9,
    perDayCap: 10,
    scheduleMinLeadMinutes: SCHEDULE_MIN_LEAD_MINUTES,
  },
  instagram: {
    channel: 'instagram',
    // Publishable via the Zernio rail — our app holds no Meta credential and files
    // no Meta app review; Zernio owns both (doc 13 §7, confirmed [LIVE]).
    publishable: true,
    maxChars: 2200,
    linkPolicy: 'discouraged',
    maxHashtags: 30,
    mediaTypes: ['image/jpeg', 'image/png'],
    maxMediaMB: 8,
    maxMediaCount: 10,
    // There is no text-only Instagram post. Without this the editor showed green
    // on a caption-only variant that Meta rejects at publish time.
    requiresMedia: true,
    // Instagram was the ONLY channel with no imageDims, so `validateMedia`'s
    // `if (spec.imageDims && …)` guard skipped it entirely and `aspectRange` — a
    // field PlatformSpec already declared — was never read for the one channel
    // that needs it. A 1080×1920 phone photo (0.56) used to pass.
    imageDims: { minW: 320, minH: 320, aspectRange: [0.8, 1.91] },
    perDayCap: 25,
    scheduleMinLeadMinutes: SCHEDULE_MIN_LEAD_MINUTES,
  },
}

/**
 * Normalise the hashtag list into the exact tokens that will be published.
 *
 * Empty and whitespace-only entries are dropped, a missing `#` is added, and
 * duplicates are removed — a platform counts `#chai` once however many times it
 * appears, so counting it twice here would block a post that is actually fine.
 * Order is preserved because the writer chose it.
 *
 * Exported because the character meter, the validator and the formatter must all
 * be looking at the SAME tokens. That was the defect: the meter counted the raw
 * list, the formatter emitted nothing at all, and the two never had to agree.
 */
export function normalizeHashtags(hashtags: readonly string[] | undefined): string[] {
  if (hashtags === undefined) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of hashtags) {
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed === '#') continue
    const tag = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

/**
 * The tail appended to a body when hashtags are published: a blank line, then the
 * tags separated by single spaces. One definition, used by both the counter and
 * the formatter, so the number on screen describes the string that goes out.
 */
export function hashtagTail(hashtags: readonly string[] | undefined): string {
  const tags = normalizeHashtags(hashtags)
  return tags.length === 0 ? '' : `\n\n${tags.join(' ')}`
}

/**
 * Effective character count (code points; an X link is weighted at 23).
 *
 * ── WHY HASHTAGS ARE COUNTED HERE ────────────────────────────────────────────
 * They are published as part of the caption, so they cost characters. Before this
 * they were validated for COUNT (`maxHashtags`) and then silently discarded by
 * `formatForPlatform`, which meant the composer offered a hashtag box whose
 * contents never reached any platform — and, had they reached it, a caption at
 * exactly 2200 characters plus thirty tags would have been rejected by Instagram
 * while the meter showed green.
 *
 * Counting the normalised tail rather than the raw list is deliberate: it is the
 * string that will actually be sent, including the separating blank line.
 */
export function charCountFor(spec: PlatformSpec, draft: VariantDraft): number {
  const base = Array.from(draft.body).length + Array.from(hashtagTail(draft.hashtags)).length
  if (spec.linkPolicy === 'counted_fixed' && draft.hasLink) {
    return base + X_LINK_WEIGHT
  }
  return base
}

/** Validate a per-channel variant against its spec (used by the editor and adapter formatting). */
export function validateVariant(
  spec: PlatformSpec,
  draft: VariantDraft,
): { violations: ConstraintViolation[]; charCount: number } {
  const violations: ConstraintViolation[] = []
  const charCount = charCountFor(spec, draft)
  if (charCount > spec.maxChars) {
    violations.push({
      code: 'MAX_CHARS',
      message: `${spec.channel} allows ${spec.maxChars} characters; this has ${charCount}.`,
      field: 'body',
    })
  }
  if (spec.maxHashtags !== undefined && (draft.hashtags?.length ?? 0) > spec.maxHashtags) {
    violations.push({
      code: 'MAX_HASHTAGS',
      message: `${spec.channel} allows ${spec.maxHashtags} hashtags.`,
      field: 'hashtags',
    })
  }
  if ((draft.mediaCount ?? 0) > spec.maxMediaCount) {
    violations.push({
      code: 'MAX_MEDIA_COUNT',
      message: `${spec.channel} allows ${spec.maxMediaCount} media items.`,
      field: 'media',
    })
  }
  // The lower bound. Until this existed the only media check was a CAP, so zero
  // media passed on a channel where zero media is unpublishable.
  if (spec.requiresMedia === true && (draft.mediaCount ?? 0) < 1) {
    violations.push({
      code: 'MEDIA_REQUIRED',
      message: `${spec.channel} needs at least one photo — there is no text-only post.`,
      field: 'media',
    })
  }
  return { violations, charCount }
}

/** Validate a single attachment against every selected channel's spec, AT ATTACH TIME (FSD 3.1). */
export function validateMedia(
  specs: PlatformSpec[],
  media: MediaAttachment,
): { channel: Channel; violations: ConstraintViolation[] }[] {
  return specs.map((spec) => {
    const violations: ConstraintViolation[] = []
    if (!spec.mediaTypes.includes(media.mime)) {
      violations.push({
        code: 'MEDIA_TYPE',
        message: `${spec.channel} does not accept ${media.mime}.`,
        field: 'mime',
      })
    }
    if (media.bytes > spec.maxMediaMB * MB) {
      violations.push({
        code: 'MEDIA_SIZE',
        message: `${spec.channel} media must be ≤ ${spec.maxMediaMB} MB.`,
        field: 'bytes',
      })
    }
    if (spec.imageDims && media.width !== undefined && media.height !== undefined) {
      if (media.width < spec.imageDims.minW || media.height < spec.imageDims.minH) {
        violations.push({
          code: 'MEDIA_DIMS',
          message: `${spec.channel} images must be ≥ ${spec.imageDims.minW}×${spec.imageDims.minH}.`,
          field: 'dimensions',
        })
      }
      // Aspect ratio. `aspectRange` was declared on PlatformSpec from the start and
      // read by nothing — the check that would have caught a portrait phone photo
      // on the one channel that rejects them.
      const range = spec.imageDims.aspectRange
      if (range && media.height > 0) {
        const aspect = media.width / media.height
        if (aspect < range[0] || aspect > range[1]) {
          violations.push({
            code: 'MEDIA_ASPECT',
            message: `${spec.channel} feed photos must be between ${range[0]}:1 and ${range[1]}:1 — this one is ${aspect.toFixed(2)}:1.`,
            field: 'dimensions',
          })
        }
      }
    }
    return { channel: spec.channel, violations }
  })
}

/**
 * Format a validated variant into the exact per-platform payload the adapter sends.
 *
 * `media` is threaded through because `formatForPlatform` previously returned
 * `{ channel:'instagram', caption }` — one field, no media — so even a variant WITH
 * photos lost them here. The formatter structurally could not express a legal
 * Instagram post; that is why this takes media rather than the adapter re-fetching it.
 */
export function formatForPlatform(
  spec: PlatformSpec,
  variant: VariantDraft,
  media: MediaRef[] = [],
): FormattedContent {
  // The hashtags the writer typed, appended to the text that goes out.
  //
  // They used to be dropped here for every channel while `validateVariant` went on
  // policing `maxHashtags` — a field that was counted, limited, and then thrown
  // away. GBP is the one exception: `linkPolicy: 'plain'` aside, a Google Business
  // post is a local business update and hashtags do nothing there, so the box is
  // simply not part of that channel's output.
  const body = spec.channel === 'gbp' ? variant.body : variant.body + hashtagTail(variant.hashtags)

  switch (spec.channel) {
    case 'x':
      return { channel: 'x', text: body, media }
    case 'gbp':
      return { channel: 'gbp', summary: body, media }
    case 'linkedin':
      return { channel: 'linkedin', text: body, media }
    case 'instagram':
      return { channel: 'instagram', caption: body, media }
  }
}
