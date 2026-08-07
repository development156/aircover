import type { Transport, TransportResponse } from '../transport'

/**
 * The Zernio HTTP client — one place that knows the base URL, the auth header, the
 * error envelope and the rate-limit headers. Adapters and the OAuth mount sit on top.
 *
 * Every constant here is [LIVE]-verified against the real API (doc 13 §1, and the
 * 2026-07-31 smoke run that published the first real post). Do not re-derive them.
 *
 * ── THE BASE URL IS LOAD-BEARING ──────────────────────────────────────────────
 * `https://zernio.com/api/v1`, exactly. NOT `api.zernio.com`, which answers
 * **HTTP 200 with text/html on every path**, including nonsense ones like
 * `/v1/v1/profiles`. A health check that asserts only on the status line passes
 * against a Next.js shell that is not the API. So every response here is checked
 * for `application/json` AND a named body field before it is believed.
 */
export const ZERNIO_BASE_URL = 'https://zernio.com/api/v1'

/**
 * media.zernio.com sits behind Cloudflare with the browser-integrity check on. A
 * non-browser User-Agent gets **403 with `error code: 1010`** — which reads exactly
 * like "the upload failed" and is not. Doc 13 §9 requires a HEAD pre-flight before
 * publish; that pre-flight MUST send this or it refuses perfectly good images.
 */
export const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/** Zernio ids are 24-char Mongo ObjectIds — NOT uuids (doc 13 §1). */
export const ZERNIO_ID_RE = /^[0-9a-f]{24}$/

export interface ZernioRateLimit {
  limit: number | null
  remaining: number | null
  reset: number | null
}

export class ZernioError extends Error {
  readonly status: number
  readonly code: string
  readonly type: string
  readonly rateLimit: ZernioRateLimit

  constructor(args: {
    message: string
    status: number
    code: string
    type: string
    rateLimit: ZernioRateLimit
  }) {
    super(args.message)
    this.name = 'ZernioError'
    this.status = args.status
    this.code = args.code
    this.type = args.type
    this.rateLimit = args.rateLimit
  }

  /** 429 and 5xx are worth retrying; 4xx means the request itself is wrong. */
  get classification(): 'transient' | 'permanent' {
    if (this.status === 429 || this.status >= 500) return 'transient'
    return 'permanent'
  }
}

function readRateLimit(headers: Record<string, string>): ZernioRateLimit {
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v
  const num = (key: string): number | null => {
    const raw = lower[key]
    if (raw === undefined) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return {
    limit: num('x-ratelimit-limit'),
    remaining: num('x-ratelimit-remaining'),
    reset: num('x-ratelimit-reset'),
  }
}

function contentType(headers: Record<string, string>): string {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'content-type') return v
  }
  return ''
}

export interface ZernioResult<T> {
  status: number
  data: T
  rateLimit: ZernioRateLimit
}

export interface ZernioClientDeps {
  transport: Transport
  /** `sk_` + 64 hex, 67 chars. Never logged, never returned, never in an error. */
  apiKey: string
  baseUrl?: string
}

/**
 * Parse a Zernio response into JSON, or throw a ZernioError carrying their
 * documented `{ error, type, code }` envelope.
 *
 * A non-JSON content-type is ALWAYS an error here, whatever the status — that is
 * the api.zernio.com catch-all defence.
 */
function parse<T>(res: TransportResponse, what: string): ZernioResult<T> {
  const rateLimit = readRateLimit(res.headers)
  const ct = contentType(res.headers).toLowerCase()

  if (!ct.includes('application/json')) {
    throw new ZernioError({
      message: `${what}: expected JSON, got ${ct || '<none>'} (status ${res.status}). This is not the Zernio API.`,
      status: res.status,
      code: 'NON_JSON_RESPONSE',
      type: 'transport_error',
      rateLimit,
    })
  }

  let body: unknown
  try {
    body = JSON.parse(res.body)
  } catch {
    throw new ZernioError({
      message: `${what}: response was not parseable JSON (status ${res.status}).`,
      status: res.status,
      code: 'BAD_JSON',
      type: 'transport_error',
      rateLimit,
    })
  }

  if (res.status >= 400) {
    const env = body as { error?: string; type?: string; code?: string }
    throw new ZernioError({
      message: `${what}: ${env.error ?? `HTTP ${res.status}`}`,
      status: res.status,
      code: env.code ?? 'UNKNOWN',
      type: env.type ?? 'unknown_error',
      rateLimit,
    })
  }

  return { status: res.status, data: body as T, rateLimit }
}

export interface ZernioAccount {
  _id: string
  platform: string
  /** Populated on list responses; a bare string id on nested reads. */
  profileId: string | { _id: string; name?: string }
  username?: string
  displayName?: string
  needsReconnection?: boolean
  platformStatus?: string
  tokenExpiresAt?: string
  permissions?: string[]
}

export interface ZernioPresign {
  uploadUrl: string
  publicUrl: string
  key: string
  expiresIn: number
}

export interface ZernioPlatformResult {
  platform: string
  status: string
  platformPostId?: string | null
  platformPostUrl?: string | null
  accountId?: string | { _id: string }
  error?: string
  errorMessage?: string
}

export interface ZernioPost {
  _id: string
  status: string
  content?: string
  platforms?: ZernioPlatformResult[]
  mediaItems?: { url: string; type: string }[]
}

/** `existingPost` appears when their 5-minute x-request-id window collapses a retry. */
export interface ZernioCreatePostResponse {
  post?: ZernioPost
  existingPost?: ZernioPost
  existingPostId?: string
  message?: string
}

export interface ZernioMediaItemInput {
  type: 'image' | 'video' | 'gif' | 'document'
  url: string
  mimeType?: string
  filename?: string
  size?: number
  altText?: string
}

export interface ZernioCreatePostInput {
  content: string
  mediaItems?: ZernioMediaItemInput[]
  platforms: { platform: string; accountId: string }[]
  publishNow?: boolean
  scheduledFor?: string
  timezone?: string
}

export interface ZernioHeadResult {
  status: number
  contentType: string
  /** A 3xx or a Location header. Doc 13 §2.4: media URLs must not redirect. */
  redirected: boolean
}

export interface ZernioProfile {
  _id: string
  name: string
  isDefault?: boolean
}

export interface ZernioClient {
  listProfiles(name?: string): Promise<ZernioProfile[]>
  createProfile(name: string, idempotencyKey?: string): Promise<ZernioProfile>
  /** `GET /connect/{platform}` → the URL to send the user to. */
  connectUrl(platform: string, profileId: string, redirectUrl: string): Promise<string>
  listAccounts(profileId: string): Promise<ZernioAccount[]>
  presignMedia(input: {
    filename: string
    contentType: string
    size?: number
  }): Promise<ZernioPresign>
  uploadMedia(uploadUrl: string, bytes: Uint8Array, contentType: string): Promise<void>
  headMedia(publicUrl: string): Promise<ZernioHeadResult>
  createPost(input: ZernioCreatePostInput, requestId?: string): Promise<ZernioCreatePostResponse>
  getPost(postId: string): Promise<ZernioPost>
}

export function createZernioClient(deps: ZernioClientDeps): ZernioClient {
  const base = (deps.baseUrl ?? ZERNIO_BASE_URL).replace(/\/+$/, '')

  const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
    Authorization: `Bearer ${deps.apiKey}`,
    'User-Agent': BROWSER_UA,
    ...extra,
  })

  const json = async <T>(
    method: string,
    path: string,
    what: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<ZernioResult<T>> => {
    const res = await deps.transport({
      method,
      url: `${base}${path}`,
      headers: authHeaders({
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...extraHeaders,
      }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return parse<T>(res, what)
  }

  return {
    async listProfiles(name) {
      const qs = name === undefined ? '' : `?name=${encodeURIComponent(name)}`
      const { data } = await json<{ profiles?: ZernioProfile[] }>(
        'GET',
        `/profiles${qs}`,
        'listProfiles',
      )
      return data.profiles ?? []
    },

    async createProfile(name, idempotencyKey) {
      const { data } = await json<{ profile?: ZernioProfile } & ZernioProfile>(
        'POST',
        '/profiles',
        'createProfile',
        { name },
        idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      )
      const profile = data.profile ?? (data as ZernioProfile)
      if (!profile?._id) {
        throw new ZernioError({
          message: 'createProfile: response carried no profile id.',
          status: 200,
          code: 'MISSING_FIELDS',
          type: 'contract_error',
          rateLimit: { limit: null, remaining: null, reset: null },
        })
      }
      return profile
    },

    async connectUrl(platform, profileId, redirectUrl) {
      const qs = `?profileId=${encodeURIComponent(profileId)}&redirect_url=${encodeURIComponent(redirectUrl)}`
      const { data } = await json<{ authUrl?: string }>(
        'GET',
        `/connect/${encodeURIComponent(platform)}${qs}`,
        'connectUrl',
      )
      if (!data.authUrl) {
        throw new ZernioError({
          message: 'connectUrl: response carried no authUrl.',
          status: 200,
          code: 'MISSING_FIELDS',
          type: 'contract_error',
          rateLimit: { limit: null, remaining: null, reset: null },
        })
      }
      return data.authUrl
    },

    /**
     * ALWAYS scoped by profileId. `GET /accounts` unfiltered is not profile-scoped and
     * has already returned an account belonging to a DIFFERENT profile [LIVE] — the
     * naive "first account where platform is instagram" picker publishes to the wrong
     * customer. An unknown profile answers 404, which is "no accounts", not an error.
     */
    async listAccounts(profileId) {
      if (!ZERNIO_ID_RE.test(profileId)) {
        throw new ZernioError({
          message: 'listAccounts: profileId must be a 24-char hex Zernio id.',
          status: 0,
          code: 'INVALID_PROFILE_ID',
          type: 'client_error',
          rateLimit: { limit: null, remaining: null, reset: null },
        })
      }
      try {
        const { data } = await json<{ accounts?: ZernioAccount[] }>(
          'GET',
          `/accounts?profileId=${encodeURIComponent(profileId)}`,
          'listAccounts',
        )
        return data.accounts ?? []
      } catch (err) {
        if (err instanceof ZernioError && err.status === 404) return []
        throw err
      }
    },

    async presignMedia({ filename, contentType: ct, size }) {
      const { data } = await json<ZernioPresign>('POST', '/media/presign', 'presignMedia', {
        filename,
        contentType: ct,
        ...(size === undefined ? {} : { size }),
      })
      if (!data.uploadUrl || !data.publicUrl) {
        throw new ZernioError({
          message: 'presignMedia: response carried no uploadUrl/publicUrl.',
          status: 200,
          code: 'MISSING_FIELDS',
          type: 'contract_error',
          rateLimit: { limit: null, remaining: null, reset: null },
        })
      }
      return data
    },

    /** PUT straight to the presigned storage URL — no Zernio auth header on this one. */
    async uploadMedia(uploadUrl, bytes, ct) {
      const res = await deps.transport({
        method: 'PUT',
        url: uploadUrl,
        headers: { 'Content-Type': ct },
        body: bytes,
      })
      if (res.status < 200 || res.status >= 300) {
        throw new ZernioError({
          message: `uploadMedia: storage rejected the upload (HTTP ${res.status}).`,
          status: res.status,
          code: 'UPLOAD_FAILED',
          type: 'transport_error',
          rateLimit: readRateLimit(res.headers),
        })
      }
    },

    /**
     * Doc 13 §9's pre-flight. Asserts three things SEPARATELY — status, an image
     * content-type, and no redirect — because a 302 is a hard failure for Zernio
     * media (Drive/Dropbox/OneDrive all serve an HTML interstitial) and a status-only
     * check would wave it through.
     */
    async headMedia(publicUrl) {
      const res = await deps.transport({
        method: 'HEAD',
        url: publicUrl,
        headers: { 'User-Agent': BROWSER_UA },
      })
      const loc = Object.entries(res.headers).find(([k]) => k.toLowerCase() === 'location')
      return {
        status: res.status,
        contentType: contentType(res.headers),
        redirected: (res.status >= 300 && res.status < 400) || loc !== undefined,
      }
    },

    /**
     * `x-request-id` is their 5-minute idempotency window. Derive it deterministically
     * upstream (doc 13 §5) so two racing workers mint the SAME id and Zernio collapses
     * them rather than double-posting.
     */
    async createPost(input, requestId) {
      const { data } = await json<ZernioCreatePostResponse>(
        'POST',
        '/posts',
        'createPost',
        input,
        requestId ? { 'x-request-id': requestId } : {},
      )
      return data
    },

    async getPost(postId) {
      const { data } = await json<{ post?: ZernioPost } & ZernioPost>(
        'GET',
        `/posts/${encodeURIComponent(postId)}`,
        'getPost',
      )
      return data.post ?? (data as ZernioPost)
    },
  }
}
