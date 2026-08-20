import type { Channel, FormattedContent } from '@sahoda/shared'

import type { PostFormat } from '../format-vocabulary'
import type { FormatRefusal } from '../format-refusal'
import { isValidGbpCtaType } from './gbp-cta'

/**
 * `platforms[].platformSpecificData` — the per-channel half of a Zernio publish,
 * which this product has never sent.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
 * Zernio's `POST /v1/posts` carries `customContent`, `customMedia` and
 * `platformSpecificData` on EACH ENTRY of `platforms[]` (docs/31 §1.2, read out
 * of their OpenAPI document rather than a summary of it). The root of the request
 * has no equivalent for the third one. So a control that lives in
 * `platformSpecificData` and nowhere else is unreachable unless a platform entry
 * carries it — and every channel-specific format is in exactly that position.
 *
 * ── WHY IT IS ONE PURE FUNCTION AND NOT FOUR ADAPTER BRANCHES ────────────────
 * Because it must be testable without a network, and because the same shape is
 * about to be needed by the dry-run validator (`POST /v1/tools/validate/post`
 * takes the identical body). A branch inside `publish()` could only ever be
 * exercised by mocking a transport.
 *
 * ── AND WHY IT CAN REFUSE ────────────────────────────────────────────────────
 * `googlebusiness.callToAction` declares `required: ['type', 'url']`. A button
 * with no destination is not a partial feature — it is a payload Zernio rejects.
 * Dropping it silently would put us back where we started: a control the writer
 * fills in that changes nothing. So the builder refuses, and the refusal reaches
 * the writer as words about their post.
 *
 * Pure: no I/O, no clock, only type imports from outside this package.
 */

export type PlatformData = Record<string, unknown>

export type PlatformDataResult =
  { ok: true; data: PlatformData | undefined } | { ok: false; refusal: FormatRefusal }

export interface PlatformDataInput {
  channel: Channel
  format: PostFormat | null | undefined
  content: FormattedContent
}

/**
 * Build the `platformSpecificData` object for one platform entry, or explain why
 * this version cannot be published as described.
 *
 * `undefined` data is the normal case and means exactly what it says: this
 * version needs no per-channel field, so the entry carries none. It is NOT the
 * same as `{}`, which would be a claim that we considered and chose nothing.
 */
export function buildPlatformData(input: PlatformDataInput): PlatformDataResult {
  const { channel, format, content } = input

  if (channel === 'gbp') {
    // `content.ctaType` / `ctaUrl` are fields the frozen `FormattedContent` gbp
    // arm has always declared and that nothing has ever filled. See
    // `runPublishPost`, which now spreads them in from the variant's extras.
    if (content.channel !== 'gbp') return { ok: true, data: undefined }
    const type = content.ctaType
    const url = content.ctaUrl

    if (type === undefined || type === '') {
      // A URL with no button is not an error — it is a link in the body, which
      // is the normal way to put one on a Google post.
      return { ok: true, data: undefined }
    }
    if (!isValidGbpCtaType(type)) {
      return {
        ok: false,
        refusal: {
          code: 'GBP_CTA_UNKNOWN',
          message: `Google has no “${type}” button. Pick one from the list, or leave it off.`,
        },
      }
    }
    if (url === undefined || url.trim() === '') {
      return {
        ok: false,
        refusal: {
          code: 'GBP_CTA_NEEDS_URL',
          message: 'A Google button needs somewhere to go — add the web address it opens.',
        },
      }
    }
    return { ok: true, data: { callToAction: { type, url: url.trim() } } }
  }

  if (channel === 'instagram' && format === 'story') {
    // The single documented value of `InstagramPlatformData.contentType`
    // (docs/31 §2.1). Without it a Story publishes as a feed post, silently.
    return { ok: true, data: { contentType: 'story' } }
  }

  return { ok: true, data: undefined }
}

/**
 * The Zernio `MediaItem.type` for a stored file, from its own mime.
 *
 * Every attachment used to be sent as `type: 'image'` — a literal at
 * `adapters/zernio.ts:222` that migration 20260819000200's header named as the
 * first thing that had to change before a format picker could exist. The enum is
 * `image | video | gif | document`, and a GIF sent as an image is the smallest
 * case where the literal is already wrong today: X accepts `image/gif` and the
 * Constraint Engine allows it, so this path is reachable now.
 *
 * `image` remains the fallback rather than a throw, because a mime this function
 * does not recognise has already passed the Constraint Engine's `mediaTypes`
 * check — which is the thing entitled to refuse a file.
 */
export function zernioMediaType(mime: string): 'image' | 'video' | 'gif' | 'document' {
  const lower = mime.toLowerCase()
  if (lower === 'image/gif') return 'gif'
  if (lower.startsWith('video/')) return 'video'
  if (lower === 'application/pdf') return 'document'
  return 'image'
}
