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
  imageDims?: { minW: number; minH: number; aspectRange?: [number, number] }
  gbp?: { ctaTypes: string[]; supportsOffer: boolean }
  surchargeAction?: ActionType
  perDayCap: number
  scheduleMinLeadMinutes: number
}

export type FormattedContent =
  | { channel: 'x'; text: string; mediaIds?: string[] }
  | {
      channel: 'gbp'
      summary: string
      ctaType?: string
      ctaUrl?: string
      offer?: { title: string; terms?: string }
    }
  | { channel: 'linkedin'; text: string }
  | { channel: 'instagram'; caption: string }

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
    publishable: false, // Alpha: text/caption rules only, no real publish
    maxChars: 2200,
    linkPolicy: 'discouraged',
    maxHashtags: 30,
    mediaTypes: ['image/jpeg', 'image/png'],
    maxMediaMB: 8,
    maxMediaCount: 10,
    perDayCap: 25,
    scheduleMinLeadMinutes: SCHEDULE_MIN_LEAD_MINUTES,
  },
}

/** Effective character count (code points; an X link is weighted at 23). */
export function charCountFor(spec: PlatformSpec, draft: VariantDraft): number {
  const base = Array.from(draft.body).length
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
    }
    return { channel: spec.channel, violations }
  })
}

/** Format a validated variant into the exact per-platform payload the adapter sends. */
export function formatForPlatform(spec: PlatformSpec, variant: VariantDraft): FormattedContent {
  switch (spec.channel) {
    case 'x':
      return { channel: 'x', text: variant.body }
    case 'gbp':
      return { channel: 'gbp', summary: variant.body }
    case 'linkedin':
      return { channel: 'linkedin', text: variant.body }
    case 'instagram':
      return { channel: 'instagram', caption: variant.body }
  }
}
