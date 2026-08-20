import type { Channel, FormattedContent } from '@sahoda/shared'

import type { PostFormat } from '../format-vocabulary'
import type { FormatRefusal } from '../format-refusal'
import { isValidGbpCtaType } from './gbp-cta'
import { refusePoll, type VariantOptions } from './variant-options'
import { withGbpTopic } from './gbp-topic'

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
  /**
   * The posts an X thread publishes as, planned by `planThread` upstream.
   *
   * ── PLANNED THERE AND NOT HERE, DELIBERATELY ────────────────────────────────
   * The split needs the channel's `maxChars` and whether the variant carries a
   * link — a `PlatformSpec` and a `VariantDraft`, neither of which reaches an
   * adapter. `runPublishPost` holds both, and it must plan the thread ANYWAY to
   * refuse an unpublishable one before a token is decrypted. Planning twice
   * would be two chances to disagree about how many posts go out.
   */
  thread?: { segments: readonly string[] } | undefined
  /**
   * The per-channel controls this version carries, from `post_variants.extras`.
   *
   * Parsed and rule-checked by `variant-options.ts` before it gets here; this
   * function's job is to place them on the wire and to refuse the COMBINATIONS
   * that no single option is wrong on its own for.
   */
  options?: VariantOptions | undefined
  /** How many files are attached. Only the poll rules care, and they care a lot. */
  mediaCount?: number
}

/**
 * Build the `platformSpecificData` object for one platform entry, or explain why
 * this version cannot be published as described.
 *
 * `undefined` data is the normal case and means exactly what it says: this
 * version needs no per-channel field, so the entry carries none. It is NOT the
 * same as `{}`, which would be a claim that we considered and chose nothing.
 */
/**
 * `platformSpecificData` for an X thread, merged with whatever else X is carrying.
 *
 * ── AN ABSENT PLAN IS A REFUSAL, NEVER A SINGLE POST ────────────────────────
 * If a caller declares `format: 'thread'` and hands over no segments, the
 * tempting behaviour is to fall through and publish `content.text` as one tweet:
 * it succeeds, it looks fine in the log, and the writer's five-part thread went
 * out as a truncated single post. That is the exact shape of defect this repo has
 * shipped twice from an optional parameter quietly taking its default.
 *
 * So the field is optional to the TYPE and mandatory to the FORMAT.
 *
 * `threadItems[0]` IS the first tweet — Zernio's spec is explicit that the root
 * `content` "is NOT published" when this is present (docs/31 §2.3). The adapter
 * fills the root with that same segment, because Zernio still measures it against
 * 280 even while refusing to publish it (MEASURED, docs/32 §4.1).
 */
function buildThread(input: PlatformDataInput, base: PlatformData): PlatformDataResult {
  const segments = input.thread?.segments
  if (segments === undefined || segments.length === 0) {
    return {
      ok: false,
      refusal: {
        code: 'THREAD_NOT_PLANNED',
        message: 'This was written as a thread but arrived with no parts to post.',
      },
    }
  }
  return {
    ok: true,
    data: { ...base, threadItems: segments.map((content) => ({ content })) },
  }
}

export function buildPlatformData(input: PlatformDataInput): PlatformDataResult {
  const { channel, format, content, options } = input

  // ── THE COMBINATIONS, CHECKED BEFORE ANY SINGLE FIELD ──────────────────────
  // These are Zernio's own refusals, quoted from their dry-run validator on
  // 2026-08-20 and reproduced here so the writer meets them in the composer
  // rather than at publish time (docs/32 §4.2). They are cross-cutting: no single
  // option is wrong on its own, which is why they cannot live in `refusePoll`.
  if (options?.poll !== undefined) {
    const pollRefusal = refusePoll(channel, options.poll)
    if (pollRefusal !== null) return { ok: false, refusal: pollRefusal }

    if ((input.mediaCount ?? 0) > 0) {
      // *"Cannot create a poll with media attachments. X/Twitter polls are
      // mutually exclusive with images and videos."* — and LinkedIn the same.
      return {
        ok: false,
        refusal: {
          code: 'POLL_WITH_MEDIA',
          message: 'A poll cannot carry a photo. Remove the photo, or drop the poll.',
        },
      }
    }
    if (format === 'thread') {
      // *"Polls cannot be added to threads"*.
      return {
        ok: false,
        refusal: {
          code: 'POLL_WITH_THREAD',
          message: 'A poll cannot be part of a thread. Pick one.',
        },
      }
    }
  }

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
      return withGbpTopic({}, options)
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
    return withGbpTopic({ callToAction: { type, url: url.trim() } }, options)
  }

  if (channel === 'x') {
    const data: PlatformData = {}
    if (options?.poll !== undefined) {
      // Shape from Zernio's own error text: `options` and `duration_minutes`
      // (snake_case, unlike everything around it — MEASURED, not guessed).
      data.poll = {
        options: options.poll.options.map((o) => o.trim()).filter((o) => o !== ''),
        duration_minutes: options.poll.durationMinutes,
      }
    }
    // X's self-disclosure flag. This product GENERATES images and attaches them
    // to posts; not setting this on one is a policy gap, not a format gap
    // (docs/31 §3, last row).
    if (options?.aiGenerated === true) data.madeWithAi = true
    if (format !== 'thread') {
      return { ok: true, data: Object.keys(data).length === 0 ? undefined : data }
    }
    return buildThread(input, data)
  }

  if (channel === 'linkedin') {
    const data: PlatformData = {}
    if (options?.poll !== undefined) {
      data.poll = {
        question: options.poll.question?.trim(),
        options: options.poll.options.map((o) => o.trim()).filter((o) => o !== ''),
        duration: options.poll.durationCode,
      }
    }
    const first = options?.firstComment?.trim()
    if (first !== undefined && first !== '') data.firstComment = first
    return { ok: true, data: Object.keys(data).length === 0 ? undefined : data }
  }

  if (channel === 'instagram') {
    const data: PlatformData = {}
    // The single documented value of `InstagramPlatformData.contentType`
    // (docs/31 §2.1). Without it a Story publishes as a feed post, silently.
    if (format === 'story') data.contentType = 'story'

    const first = options?.firstComment?.trim()
    if (first !== undefined && first !== '') data.firstComment = first

    const collaborators = (options?.collaborators ?? [])
      .map((name) => name.trim().replace(/^@/, ''))
      .filter((name) => name !== '')
    if (collaborators.length > 0) {
      if (format === 'story') {
        // Collaborators are a feed and Reel feature; a Story has no co-author.
        // Zernio checks nothing here, so sending them would be a control the
        // writer filled in that changes nothing — the defect the CTA already was.
        return {
          ok: false,
          refusal: {
            code: 'IG_COLLAB_NOT_ON_STORY',
            message: 'A story has no co-authors. Post it to the feed to invite one.',
          },
        }
      }
      data.collaborators = collaborators
    }

    if (options?.aiGenerated === true) data.isAiGenerated = true

    return { ok: true, data: Object.keys(data).length === 0 ? undefined : data }
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
