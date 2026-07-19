import {
  AdapterError,
  CONSTRAINTS,
  type FormattedContent,
  type PublishAdapter,
  type PublishRequest,
  type PublishRequestMedia,
  type PublishSuccess,
} from '@sahoda/shared'
import type { Transport, TransportResponse } from '../transport'

/**
 * The Google Business Profile publish adapter — creates a localPost via the v4 API.
 * The endpoint is derived from `auth.externalAccountId` (`accounts/{a}/locations/{l}`),
 * so that id is strictly validated BEFORE it can reach a URL (injection guard). CTA and
 * media rules come from the shared Constraint Engine spec — never redefined here.
 * Classifies and never retries; the durable job owns retries.
 */
const GBP_API_HOST = 'https://mybusiness.googleapis.com/v4'
/** Alpha is English-only (Hindi is post-Alpha backlog). */
const LANGUAGE_CODE = 'en'

const EXTERNAL_ACCOUNT_RE = /^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+$/
const LOCAL_POST_NAME_RE =
  /^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+\/localPosts\/[A-Za-z0-9_-]+$/

export interface GbpAdapterDeps {
  transport: Transport
  /** Injectable clock — deterministic in tests, real wall-clock in production. */
  now?: () => Date
  /** Resolves a storage path to a public image URL. Media without this is rejected, never dropped. */
  publicMediaUrl?: (storagePath: string) => string
}

interface LocalPostPayload {
  languageCode: string
  summary: string
  topicType: 'STANDARD' | 'OFFER'
  callToAction?: { actionType: string; url?: string }
  event?: { title: string }
  offer?: { termsConditions?: string }
  media?: { mediaFormat: 'PHOTO'; sourceUrl: string }[]
}

export function createGbpAdapter(deps: GbpAdapterDeps): PublishAdapter {
  const now = deps.now ?? (() => new Date())
  const spec = CONSTRAINTS.gbp

  return {
    channel: 'gbp',
    async publish(req: PublishRequest): Promise<PublishSuccess> {
      if (req.content.channel !== 'gbp') {
        throw permanent('WRONG_CHANNEL', `GBP adapter received ${req.content.channel} content`)
      }
      if (!EXTERNAL_ACCOUNT_RE.test(req.auth.externalAccountId)) {
        // The id builds the request URL — a malformed one must never leave this function.
        throw permanent('BAD_ACCOUNT', 'Connection has a malformed GBP location id — reconnect.')
      }

      const payload = buildPayload(
        req.content,
        req.media,
        spec.gbp?.ctaTypes ?? [],
        spec.maxMediaCount,
        deps,
      )
      const body = JSON.stringify(payload)

      let res: TransportResponse
      try {
        res = await deps.transport({
          method: 'POST',
          url: `${GBP_API_HOST}/${req.auth.externalAccountId}/localPosts`,
          headers: {
            Authorization: `Bearer ${req.auth.accessToken}`,
            'content-type': 'application/json',
          },
          body,
        })
      } catch (err) {
        // Persist ONLY the error name — free-form transport text never reaches logs (token risk).
        throw new AdapterError({
          message: 'GBP request failed before a response was received',
          code: 'NETWORK_ERROR',
          classification: 'transient',
          channel: 'gbp',
          raw: { name: err instanceof Error ? err.name : 'unknown' },
        })
      }

      if (res.status === 200 || res.status === 201) {
        const post = parseLocalPost(res.body)
        if (!post) {
          throw new AdapterError({
            message: 'GBP returned success without a valid localPost name',
            code: 'BAD_RESPONSE',
            classification: 'permanent',
            channel: 'gbp',
            raw: { status: res.status, bodySample: res.body.slice(0, 300) },
          })
        }
        return {
          platformPostId: post.name,
          permalink: post.searchUrl ?? dashboardPermalink(req.auth.externalAccountId),
          publishedAt: now().toISOString(),
          mode: 'live',
        }
      }

      throw classifyHttpError(res)
    },
  }
}

function permanent(code: string, message: string): AdapterError {
  return new AdapterError({ message, code, classification: 'permanent', channel: 'gbp' })
}

function buildPayload(
  content: Extract<FormattedContent, { channel: 'gbp' }>,
  media: PublishRequestMedia[],
  allowedCtaTypes: string[],
  maxMediaCount: number,
  deps: GbpAdapterDeps,
): LocalPostPayload {
  const payload: LocalPostPayload = {
    languageCode: LANGUAGE_CODE,
    summary: content.summary,
    topicType: content.offer ? 'OFFER' : 'STANDARD',
  }

  if (content.ctaType !== undefined) {
    if (!allowedCtaTypes.includes(content.ctaType)) {
      throw permanent('INVALID_CONTENT', `GBP does not support the "${content.ctaType}" CTA.`)
    }
    payload.callToAction = {
      actionType: content.ctaType,
      ...(content.ctaUrl !== undefined ? { url: content.ctaUrl } : {}),
    }
  }

  if (content.offer) {
    payload.event = { title: content.offer.title }
    payload.offer = {
      ...(content.offer.terms !== undefined ? { termsConditions: content.offer.terms } : {}),
    }
  }

  if (media.length > 0) {
    if (media.length > maxMediaCount) {
      throw permanent('INVALID_CONTENT', `GBP allows ${maxMediaCount} media item(s).`)
    }
    const resolve = deps.publicMediaUrl
    if (!resolve) {
      // Honesty rule: dropping attached media would present a partial publish as full success.
      throw permanent('MEDIA_UNSUPPORTED', 'GBP media publishing is not wired on this path yet.')
    }
    payload.media = media.map((m) => ({
      mediaFormat: 'PHOTO' as const,
      sourceUrl: resolve(m.storagePath),
    }))
  }

  return payload
}

/** Accept only a well-formed localPost resource name + a Google-hosted https searchUrl. */
function parseLocalPost(body: string): { name: string; searchUrl?: string } | undefined {
  let parsed: { name?: unknown; searchUrl?: unknown }
  try {
    parsed = JSON.parse(body) as { name?: unknown; searchUrl?: unknown }
  } catch {
    return undefined
  }
  if (typeof parsed.name !== 'string' || !LOCAL_POST_NAME_RE.test(parsed.name)) {
    return undefined
  }
  const searchUrl =
    typeof parsed.searchUrl === 'string' && isGoogleHttpsUrl(parsed.searchUrl)
      ? parsed.searchUrl
      : undefined
  return { name: parsed.name, ...(searchUrl !== undefined ? { searchUrl } : {}) }
}

function isGoogleHttpsUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'google.com' || url.hostname.endsWith('.google.com'))
    )
  } catch {
    return false
  }
}

/** The merchant's posts dashboard — an honest fallback when Google omits searchUrl. */
function dashboardPermalink(externalAccountId: string): string {
  const locationId = externalAccountId.split('/').at(-1) ?? ''
  return `https://business.google.com/posts/l/${locationId}`
}

function classifyHttpError(res: TransportResponse): AdapterError {
  const isTransient = res.status === 408 || res.status === 429 || res.status >= 500
  return new AdapterError({
    message: `GBP publish failed with HTTP ${res.status}`,
    code: httpErrorCode(res.status),
    classification: isTransient ? 'transient' : 'permanent',
    channel: 'gbp',
    raw: { status: res.status, detail: safeDetail(res.body) },
  })
}

function httpErrorCode(status: number): string {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 408) return 'TIMEOUT'
  if (status === 429) return 'RATE_LIMITED'
  if (status >= 500) return 'SERVER_ERROR'
  return 'HTTP_ERROR'
}

/** Google's own error message/status for the reconnect CTA — never our request/token. */
function safeDetail(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown; status?: unknown } }
    const message =
      typeof parsed.error?.message === 'string'
        ? parsed.error.message
        : typeof parsed.error?.status === 'string'
          ? parsed.error.status
          : undefined
    return message?.slice(0, 300)
  } catch {
    return undefined
  }
}
