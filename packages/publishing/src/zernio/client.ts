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

/**
 * One entry of `platforms[]`.
 *
 * ── THE THREE OPTIONAL FIELDS ARE THE PER-CHANNEL HALF OF THE API ────────────
 * This type was `{ platform, accountId }` and nothing else, which made three of
 * Zernio's five per-platform fields unreachable — not unused, UNREACHABLE, since
 * `platformSpecificData` has no root-level equivalent. Every channel-specific
 * format lives behind it (docs/31 §1.2, read out of their OpenAPI document).
 *
 * `platformSpecificData` is deliberately `Record<string, unknown>` rather than a
 * union of fifteen platform schemas. The union is Zernio's, it is large, and
 * restating it here would be a second copy of a vendor contract that changes
 * without telling us. `buildPlatformData` is the ONE place that decides what goes
 * in, and it is exhaustively tested; a wider type here does not widen who may
 * fill it.
 */
export interface ZernioPlatformEntry {
  platform: string
  accountId: string
  /** Per-platform text, overriding the root `content` for this platform only. */
  customContent?: string
  /** Per-platform media, overriding the root `mediaItems` for this platform only. */
  customMedia?: ZernioMediaItemInput[]
  /** Per-platform scheduled time, overriding the root `scheduledFor`. */
  scheduledFor?: string
  platformSpecificData?: Record<string, unknown>
}

export interface ZernioCreatePostInput {
  content: string
  mediaItems?: ZernioMediaItemInput[]
  platforms: ZernioPlatformEntry[]
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

/**
 * ── THE STEP THAT HAPPENS AFTER OAUTH AND BEFORE AN ACCOUNT EXISTS ──────────
 * Facebook and Google Business do not resolve to one account when the customer
 * approves. Facebook hands back every Page they administer; Google Business hands
 * back every location. Somebody has to PICK, and until they do **Zernio creates no
 * account at all**.
 *
 * MEASURED 2026-08-27, and it is the whole explanation for "facebook is not
 * connecting": `GET /v1/accounts` returned ZERO facebook accounts across every
 * profile on this key, while `GET /v1/connect/facebook` returned a perfectly good
 * authUrl. Nothing had failed. The flow simply stops one step short of an account.
 *
 * Zernio's default is to host that picker on its own domain. That is what the
 * founder saw and reported as "it opens a popup and it opens another new website
 * ... change from social media connector to Sahodalabs" — a third-party screen,
 * third-party branding, inside a 620px popup. `headless=true` turns it off and
 * sends the browser back to US carrying the OAuth state, so the picker is ours.
 *
 * The endpoints below are the two halves of that step. Both were read from
 * `https://zernio.com/openapi.json`, not from the prose docs — `llms-full.txt`
 * has been measurably wrong about this integration in both directions.
 */
/**
 * Zernio's wire shapes for the two list endpoints. Every field optional: these are
 * read straight off a third-party response, and a missing one is a fact to handle,
 * not a crash. Kept private — the flattened `ZernioConnectChoice` is what leaves.
 */
interface RawFacebookPage {
  id?: string
  name?: string
  username?: string
  category?: string
}

interface RawGbpLocation {
  id?: string
  name?: string
  accountId?: string
  address?: string
  category?: string
}

/**
 * TELEGRAM DOES NOT HAVE A CONSENT SCREEN, AND THAT IS THE WHOLE PROBLEM.
 *
 * Every other platform on this screen is OAuth: send the customer to a consent
 * page, they approve, the browser comes back. MEASURED against the live API,
 * `GET /v1/connect/telegram` returns no `authUrl` at all. It returns a PAIRING
 * CODE valid fifteen minutes, and the customer completes the link inside
 * Telegram itself — add Zernio's bot as an administrator of the channel, message
 * the bot the code, and the account appears.
 *
 * So there is no popup, no redirect and no return trip. The app issues a code,
 * shows it, and POLLS. `packages/.../catalogue.ts` has carried the note "what
 * building it needs: a code-and-poll surface of its own" since the platform was
 * first refused; this is that surface.
 */
export interface ZernioTelegramCode {
  /** What the customer types to the bot. Short-lived, and not a credential. */
  code: string
  /** The bot they must add as an admin, without the leading @. */
  botUsername: string
  /** ISO instant the code stops working. */
  expiresAt: string
  /** Seconds remaining when it was issued. */
  expiresIn: number
  /** Zernio's own step list. Passed through, never rewritten — see the route. */
  instructions: string[]
}

/** Where a pairing attempt has got to. `expired` needs a NEW code, not a retry. */
export type ZernioTelegramStatus =
  { status: 'pending'; expiresAt: string | null } | { status: 'connected' } | { status: 'expired' }

export type ZernioSelectionPlatform = 'facebook' | 'googlebusiness'

/** One thing the customer can pick. Flattened, so the picker renders one shape. */
export interface ZernioConnectChoice {
  /** Posted back as `pageId` or `locationId`. */
  id: string
  /** What the customer reads and recognises. */
  name: string
  /** A second line — a Page's category, a location's address. Null when absent. */
  detail: string | null
  /**
   * Google Business only: the `accounts/123` resource that owns the location.
   * Optional in Zernio's schema and recommended by it — without it a customer
   * whose account owns many locations has the selection resolved by enumerating
   * the whole account, which is what times out for exactly those customers.
   */
  ownerId: string | null
}

/** What the OAuth redirect handed us. Carried opaquely; never interpreted here. */
export interface ZernioSelectionState {
  profileId: string
  /** Facebook: the `EAA…` user access token from the redirect. */
  tempToken?: string | undefined
  /** Google Business: a server-side handle. Preferred over a raw token. */
  pendingDataToken?: string | undefined
  /** Facebook: the decoded profile object from the redirect. Required by POST. */
  userProfile?: unknown
}

export interface ZernioClient {
  listProfiles(name?: string): Promise<ZernioProfile[]>
  createProfile(name: string, idempotencyKey?: string): Promise<ZernioProfile>
  /** `GET /connect/{platform}` → the URL to send the user to. */
  connectUrl(
    platform: string,
    profileId: string,
    redirectUrl: string,
    /**
     * `headless` suppresses Zernio's OWN selection screen for the platforms that
     * have one, and returns the browser to `redirectUrl` with the OAuth state
     * instead. Absent means false, which is the behaviour every platform without
     * a selection step already has and must keep.
     */
    options?: { headless?: boolean | undefined },
  ): Promise<string>
  listAccounts(profileId: string): Promise<ZernioAccount[]>
  /**
   * `GET /connect/telegram` — issue a pairing code. No authUrl exists for this
   * platform; see ZernioTelegramCode.
   */
  telegramCode(profileId: string): Promise<ZernioTelegramCode>
  /**
   * `PATCH /connect/telegram?code=` — has the customer finished in Telegram yet.
   *
   * Returns the STATUS and nothing else. The response also carries an `account`
   * object once it lands, and that is deliberately dropped: doc 13 §3 records
   * that Zernio validates an accountId against the whole TEAM, so an id obtained
   * by polling a code is an id we have no business trusting. The caller
   * re-derives the account the way every other path does, by asking for the
   * accounts under a profile read from our own table.
   */
  telegramStatus(code: string): Promise<ZernioTelegramStatus>
  /**
   * The choices behind a half-finished connect — Facebook Pages, GBP locations.
   *
   * `hasMore` is Zernio's own flag and is returned rather than swallowed: the GBP
   * list is BOUNDED, so a customer with hundreds of locations gets a truncated
   * list and no error. Dropping the flag would render that truncation as "these
   * are your locations", which is a claim we would have no basis for.
   */
  listConnectChoices(
    platform: ZernioSelectionPlatform,
    state: ZernioSelectionState,
  ): Promise<{ choices: ZernioConnectChoice[]; hasMore: boolean }>
  /**
   * Commit the pick. THIS is the call that creates the account at Zernio; until it
   * returns 200 there is nothing for `listAccounts` to find.
   *
   * Deliberately returns void. The response carries an `account` object, and
   * reading the id out of it would make this route trust an id that arrived
   * alongside a token the browser also held. doc 13 §3: Zernio validates an
   * accountId against the whole TEAM, so a wrong one does not error. The caller
   * re-derives the account the same way every other path does — by asking for the
   * accounts under a profile we looked up from our own table.
   */
  selectConnectChoice(
    platform: ZernioSelectionPlatform,
    state: ZernioSelectionState,
    choice: { id: string; ownerId?: string | null },
  ): Promise<void>
  /**
   * Disconnect a connected social account AT ZERNIO.
   *
   * ── THIS ENDPOINT WAS BELIEVED NOT TO EXIST ────────────────────────────────
   * Five places in this repository stated, in the strongest terms, that Zernio
   * offered no way to remove an account: `REQUESTS.md` §29 finding 7 called it
   * "NOT FIXABLE HERE", `docs/38_Data_Handling.md` recorded that a customer's
   * data survives erasure at Zernio because of it, and a permanent test in
   * `apps/web/src/app/api/oauth/zernio/return/route.test.ts` carried it as a
   * header comment. Every one of those was reasoning from THIS FILE's surface
   * rather than from Zernio's spec.
   *
   * MEASURED 2026-08-26 against `https://docs.zernio.com/api/openapi`
   * (2,379,342 bytes, 411 top-level paths, 64 of them under `/v1/accounts`):
   *
   *   /v1/accounts/{accountId}  →  PUT, PATCH, DELETE
   *   operationId: deleteAccount
   *   summary: "Disconnect account"
   *   description: "Disconnects and removes a connected social account."
   *   responses: 200 { message }, 401, 404
   *
   * Nobody had ever scanned the spec for it. The lesson is recorded in
   * `docs/13` §11 rather than here: an absence in our client is not an absence
   * in their API, and the difference cost this product a real privacy gap.
   *
   * ── THE ACCOUNT ID MUST BE SCOPED BEFORE IT REACHES HERE ───────────────────
   * doc 13 §3: Zernio validates an accountId against your whole TEAM, not
   * against the profile in the request. So a mis-scoped id here does not error
   * — it disconnects ANOTHER CUSTOMER'S account and returns 200. Callers must
   * pass an id that came from a query already scoped to their workspace.
   */
  disconnectAccount(accountId: string): Promise<void>
  presignMedia(input: {
    filename: string
    contentType: string
    size?: number
  }): Promise<ZernioPresign>
  uploadMedia(uploadUrl: string, bytes: Uint8Array, contentType: string): Promise<void>
  headMedia(publicUrl: string): Promise<ZernioHeadResult>
  createPost(input: ZernioCreatePostInput, requestId?: string): Promise<ZernioCreatePostResponse>
  getPost(postId: string): Promise<ZernioPost>
  /**
   * Rewrite a post that is already live, on one platform.
   *
   * ── `platform` IS A THIRD VOCABULARY AND IT IS SHORT ────────────────────────
   * MEASURED 2026-08-20: this endpoint's own 400 names its whole enum —
   * *"expected one of \"twitter\"|\"discord\"|\"facebook\"|\"reddit\""*. Of
   * this product's four channels only X is in it, and `x` is NOT the accepted
   * spelling even though `POST /v1/posts` takes it. Callers must go through
   * `recoveryPlatform`, never `ZERNIO_PLATFORM_NAME`.
   */
  editPost(postId: string, platform: string, content: string): Promise<ZernioPost>
  /**
   * Take a live post down, on one platform.
   *
   * A DIFFERENT list again, also read out of its own 400: facebook, youtube,
   * linkedin, twitter, threads, pinterest, reddit, bluesky, googlebusiness,
   * telegram, whatsapp, discord, slack. Note `googlebusiness` — the publish
   * endpoint's `google` is refused here by name — and note that Instagram is
   * absent from it entirely.
   */
  unpublishPost(postId: string, platform: string): Promise<ZernioPost>
  /**
   * Ask Zernio to attempt a failed post again.
   *
   * Post-level: it takes NO platform and no body (MEASURED — a nonexistent id
   * 404s before any body is read). So it retries whatever legs failed, which is
   * why the caller must be the publish path and not a button that fires blind.
   */
  retryPost(postId: string): Promise<ZernioPost>
}

export type ZernioJsonCaller = <T>(
  method: string,
  path: string,
  what: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
) => Promise<ZernioResult<T>>

/**
 * One authenticated JSON call against the Zernio base URL.
 *
 * Exported so the read surface (`./reads`) sits on the SAME `parse()` — the
 * content-type-and-named-field assertion is the only thing standing between us and an
 * HTML page that returns 200 (doc 13 §2.1, and now also true of `zernio.com/api/v1`
 * itself for unknown paths — observed 2026-08-08). A second caller that re-derived
 * that check would eventually drift from it, and the drift would be invisible.
 */
export function createJsonCaller(deps: ZernioClientDeps): ZernioJsonCaller {
  const base = (deps.baseUrl ?? ZERNIO_BASE_URL).replace(/\/+$/, '')

  const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
    Authorization: `Bearer ${deps.apiKey}`,
    'User-Agent': BROWSER_UA,
    ...extra,
  })

  return async <T>(
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
}

export function createZernioClient(deps: ZernioClientDeps): ZernioClient {
  const json = createJsonCaller(deps)

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

    async editPost(postId, platform, content) {
      const { data } = await json<{ post?: ZernioPost } & ZernioPost>(
        'POST',
        `/posts/${encodeURIComponent(postId)}/edit`,
        'editPost',
        { platform, content },
      )
      return data.post ?? (data as ZernioPost)
    },

    async unpublishPost(postId, platform) {
      const { data } = await json<{ post?: ZernioPost } & ZernioPost>(
        'POST',
        `/posts/${encodeURIComponent(postId)}/unpublish`,
        'unpublishPost',
        { platform },
      )
      return data.post ?? (data as ZernioPost)
    },

    async retryPost(postId) {
      const { data } = await json<{ post?: ZernioPost } & ZernioPost>(
        'POST',
        `/posts/${encodeURIComponent(postId)}/retry`,
        'retryPost',
        // No body. The endpoint takes none, and sending `{}` would be a claim
        // that we considered a platform and chose none.
      )
      return data.post ?? (data as ZernioPost)
    },

    async telegramCode(profileId) {
      const { data } = await json<Partial<ZernioTelegramCode>>(
        'GET',
        `/connect/telegram?profileId=${encodeURIComponent(profileId)}`,
        'telegramCode',
      )
      // Checked for the two fields the screen cannot work without, in the same
      // shape every other method here uses: a 200 that carries the wrong body is
      // not a success, and this API has been measured answering 200 with HTML.
      if (!data.code || !data.botUsername) {
        throw new ZernioError({
          message: 'telegramCode: response carried no code or bot username.',
          status: 200,
          code: 'MISSING_FIELDS',
          type: 'contract_error',
          rateLimit: { limit: null, remaining: null, reset: null },
        })
      }
      return {
        code: data.code,
        botUsername: data.botUsername.replace(/^@/, ''),
        expiresAt: data.expiresAt ?? '',
        expiresIn: typeof data.expiresIn === 'number' ? data.expiresIn : 0,
        instructions: Array.isArray(data.instructions) ? data.instructions : [],
      }
    },

    async telegramStatus(code) {
      const { data } = await json<{ status?: string; expiresAt?: string }>(
        'PATCH',
        `/connect/telegram?code=${encodeURIComponent(code)}`,
        'telegramStatus',
      )
      // An unrecognised status is `pending`, not `connected`. Fail-closed in the
      // direction that costs a customer a few more seconds of waiting rather
      // than the direction that reports a link nobody made.
      if (data.status === 'connected') return { status: 'connected' }
      if (data.status === 'expired') return { status: 'expired' }
      return { status: 'pending', expiresAt: data.expiresAt ?? null }
    },

    async listConnectChoices(platform, state) {
      const qs = new URLSearchParams({ profileId: state.profileId })
      // `pendingDataToken` FIRST where both exist. Zernio's own note: it "preserves
      // server-side token storage", i.e. listing with it does not spend the token,
      // so the same handle is still valid for the select call that follows.
      if (state.pendingDataToken) qs.set('pendingDataToken', state.pendingDataToken)
      else if (state.tempToken) qs.set('tempToken', state.tempToken)

      if (platform === 'facebook') {
        const { data } = await json<{ pages?: RawFacebookPage[] }>(
          'GET',
          `/connect/facebook/select-page?${qs.toString()}`,
          'listConnectChoices',
        )
        // `access_token` is on every page in this response and is deliberately NOT
        // carried across. It is a live Page credential; nothing downstream needs
        // it, and a shape that holds one is a shape that can leak one.
        const choices = (data.pages ?? []).flatMap<ZernioConnectChoice>((page) => {
          const id = page?.id?.trim()
          // A page with no id cannot be posted back, so it is dropped rather than
          // rendered as an option that would fail on submit.
          if (!id) return []
          return [
            {
              id,
              name: page.name?.trim() || page.username?.trim() || id,
              detail: page.category?.trim() || null,
              ownerId: null,
            },
          ]
        })
        // Facebook's endpoint has no bound and no flag, so `false` is the measured
        // answer here rather than a default standing in for one.
        return { choices, hasMore: false }
      }

      const { data } = await json<{ locations?: RawGbpLocation[]; hasMore?: boolean }>(
        'GET',
        `/connect/googlebusiness/locations?${qs.toString()}`,
        'listConnectChoices',
      )
      const choices = (data.locations ?? []).flatMap<ZernioConnectChoice>((loc) => {
        const id = loc?.id?.trim()
        if (!id) return []
        return [
          {
            id,
            name: loc.name?.trim() || id,
            detail: loc.address?.trim() || loc.category?.trim() || null,
            ownerId: loc.accountId?.trim() || null,
          },
        ]
      })
      return { choices, hasMore: data.hasMore === true }
    },

    async selectConnectChoice(platform, state, choice) {
      if (platform === 'facebook') {
        await json<unknown>('POST', '/connect/facebook/select-page', 'selectConnectChoice', {
          profileId: state.profileId,
          pageId: choice.id,
          tempToken: state.tempToken,
          // Required by the schema and passed straight back as it arrived. Zernio
          // decoded it, Zernio reads it; nothing here has any business parsing it.
          userProfile: state.userProfile,
        })
        return
      }

      await json<unknown>(
        'POST',
        '/connect/googlebusiness/select-location',
        'selectConnectChoice',
        {
          profileId: state.profileId,
          locationId: choice.id,
          ...(choice.ownerId ? { accountId: choice.ownerId } : {}),
          pendingDataToken: state.pendingDataToken,
        },
      )
    },

    async connectUrl(platform, profileId, redirectUrl, options) {
      const headless = options?.headless === true ? '&headless=true' : ''
      const qs =
        `?profileId=${encodeURIComponent(profileId)}` +
        `&redirect_url=${encodeURIComponent(redirectUrl)}${headless}`
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

    async disconnectAccount(accountId) {
      // Same shape guard `listAccounts` puts on a profileId, and for a sharper
      // reason: this call DESTROYS a connection. A malformed id that reached
      // Zernio would be a DELETE against an unvalidated path segment.
      if (!ZERNIO_ID_RE.test(accountId)) {
        throw new ZernioError({
          message: 'disconnectAccount: accountId must be a 24-char hex Zernio id.',
          status: 0,
          code: 'INVALID_ACCOUNT_ID',
          type: 'client_error',
          rateLimit: { limit: null, remaining: null, reset: null },
        })
      }
      try {
        await json<{ message?: string }>(
          'DELETE',
          `/accounts/${encodeURIComponent(accountId)}`,
          'disconnectAccount',
        )
      } catch (err) {
        // 404 IS SUCCESS HERE, and that is a deliberate reading. The caller's
        // intent is "this account must not be connected"; an account Zernio has
        // already forgotten satisfies it. Treating it as a failure would make a
        // retry after a half-completed disconnect permanently red, and would
        // block our own row from being deleted on the second attempt.
        if (err instanceof ZernioError && err.status === 404) return
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
