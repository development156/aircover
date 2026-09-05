import { createHash } from 'node:crypto'

import { ZernioError, ZERNIO_ID_RE, type ZernioAccount, type ZernioClient } from './client'

/**
 * The connect flow, framework-agnostic. apps/web mounts these as two thin routes.
 *
 * ── ZERNIO OWNS THE OAUTH CALLBACK, NOT US ────────────────────────────────────
 * The Instagram authUrl carries `client_id=1387147079198980` and
 * `redirect_uri=https://zernio.com/api/v1/connect/instagram/callback` — both
 * Zernio's, confirmed [LIVE]. The user consents to ZERNIO; Zernio holds the Meta
 * token; our app never sees one. Meta app review is off our critical path.
 *
 * So what we mount is not an OAuth callback. It is a RETURN URL that Zernio sends
 * the browser back to once it has already stored the account. Nothing sensitive
 * arrives on it — which is exactly why nothing on it is trusted.
 */

/**
 * Zernio auto-creates a profile named "Default" per team. Every workspace that ever
 * "falls back to Default" collides on ONE profile, which is the cross-tenant
 * condition the whole mapping exists to prevent — and it would look like success,
 * because Zernio publishes to it happily. Observed [LIVE] twice.
 */
export const ZERNIO_DEFAULT_PROFILE_ID = '6a69d2ac81d9920d149afc18'

/** The first eight characters of the workspace id: the token that names its profile. */
function workspaceToken(workspaceId: string): string {
  return workspaceId.slice(0, 8)
}

/**
 * One Zernio profile per workspace, named so a human can find it in their UI.
 *
 * The display name is the workspace name; the `(<id8>)` suffix is the part that
 * MATCHES. See `profileBelongsToWorkspace`.
 */
export function profileNameForWorkspace(workspaceId: string, workspaceName: string): string {
  return `sahoda:${workspaceName} (${workspaceToken(workspaceId)})`
}

/**
 * Is this Zernio profile the one for this workspace?
 *
 * ── MATCHED ON THE ID TOKEN, NEVER ON THE NAME ───────────────────────────────
 * The lookup used to compare the whole string, and the string embeds the
 * workspace NAME. A rename changed the name, the lookup missed, and the create
 * that followed went out under the old Idempotency-Key with a new body. Zernio
 * refuses that (MEASURED, Sentry JAVASCRIPT-NEXTJS-1M, 2026-08-25), so the start
 * route failed for every channel and the customer could not connect anything.
 *
 * The `(<id8>)` suffix cannot be moved by a rename, so it is what identifies the
 * profile. Anchored to the END of the name: a workspace literally called
 * "(a1b2c3d4)" must not claim another workspace's profile.
 */
export function profileBelongsToWorkspace(profileName: string, workspaceId: string): boolean {
  return profileName.endsWith(` (${workspaceToken(workspaceId)})`)
}

/**
 * The Idempotency-Key for a create: a pure function of the BODY.
 *
 * Zernio remembers a key together with the body it was sent with and refuses
 * the same key under a different body. So the key has to change when the body
 * does, or a renamed workspace can never be created. The workspace id keeps a
 * double-submit of ONE body to one profile; the name hash makes a different
 * body a different request.
 *
 * Safe ONLY together with `profileBelongsToWorkspace` above and the stored
 * mapping the routes read first: on its own this would mint a fresh profile per
 * rename, and `ensure_zernio_profile` would then refuse it as
 * PROFILE_ALREADY_BOUND for good.
 */
function idempotencyKeyFor(workspaceId: string, name: string): string {
  const body = createHash('sha256').update(name, 'utf8').digest('hex').slice(0, 8)
  return `sahoda-profile:${workspaceId}:${body}`
}

/**
 * Find-or-create the Zernio profile for a workspace, idempotently.
 *
 * Lists the team's profiles and matches on the workspace's id token, so the
 * profile is found whatever the workspace is called today. Only creates when
 * there is genuinely none. The list is unfiltered on purpose: `?name=` needs
 * the exact string, and the exact string is the thing a rename changes.
 */
export async function ensureZernioProfile(
  client: ZernioClient,
  args: { workspaceId: string; workspaceName: string },
): Promise<string> {
  const existing = await client.listProfiles()
  const match = existing.find((p) => profileBelongsToWorkspace(p.name, args.workspaceId))
  if (match) return assertUsableProfile(match._id)

  const name = profileNameForWorkspace(args.workspaceId, args.workspaceName)
  const created = await client.createProfile(name, idempotencyKeyFor(args.workspaceId, name))
  return assertUsableProfile(created._id)
}

function assertUsableProfile(profileId: string): string {
  if (!ZERNIO_ID_RE.test(profileId)) {
    throw new ZernioError({
      message: 'Zernio returned a profile id that is not a 24-char hex object id.',
      status: 0,
      code: 'INVALID_PROFILE_ID',
      type: 'contract_error',
      rateLimit: { limit: null, remaining: null, reset: null },
    })
  }
  if (profileId === ZERNIO_DEFAULT_PROFILE_ID) {
    throw new ZernioError({
      message:
        'Refusing to bind a workspace to Zernio’s shared Default profile — every workspace would collide on it.',
      status: 0,
      code: 'DEFAULT_PROFILE_REFUSED',
      type: 'client_error',
      rateLimit: { limit: null, remaining: null, reset: null },
    })
  }
  return profileId
}

export interface ReconciledAccount {
  accountId: string
  profileId: string
  username: string | null
  needsReconnection: boolean
  platformStatus: string | null
  tokenExpiresAt: string | null
}

/**
 * Read back the accounts Zernio holds for THIS profile, ready to persist.
 *
 * The profileId is the caller's, derived from the session — never from the return
 * URL's query string. `listAccounts` refuses to run unfiltered, so there is no path
 * here that could observe another tenant's account.
 *
 * Every row is re-checked against the profile we asked for anyway: doc 13 §3 records
 * that Zernio validates an accountId against the whole TEAM, so "it came back from a
 * scoped query" is a weaker guarantee than it sounds.
 *
 * ── `platform` IS ZERNIO'S NAME, NOT OURS, AND THAT IS THE WHOLE BUG ─────────
 * It is compared with `===` against `account.platform`, which is a string ZERNIO
 * writes. Callers were passing OUR channel id, so the filter matched only where
 * the two vocabularies happen to agree.
 *
 * MEASURED 2026-08-26 against the live API. A real account created minutes
 * earlier by a customer pressing Connect on X:
 *
 *   { "_id": "6a8f392d…", "platform": "twitter", "displayName": "DIVAS MAHAPATRA" }
 *
 * Asked for `'x'`, that account is filtered out. The connect had SUCCEEDED — the
 * grant was given, the account existed at Zernio, `GET /v1/accounts` returned it
 * — and this line made it invisible, so no row was ever written and the screen
 * said "Not connected". Google Business was the same, `gbp` against
 * `googlebusiness`. Instagram and LinkedIn worked throughout for one reason
 * only: for those two the strings happen to be identical.
 *
 * The parameter is named for what it is now, so a caller passing a channel id is
 * a thing somebody has to type past rather than the natural mistake it was.
 */
export async function reconcileAccounts(
  client: ZernioClient,
  args: { profileId: string; zernioPlatform: string },
): Promise<ReconciledAccount[]> {
  return reconcileFromAccounts(await client.listAccounts(args.profileId), args)
}

/**
 * The same reconcile, over accounts the caller ALREADY fetched.
 *
 * ── WHY THIS EXISTS: ONE TRIP WAS MAKING THIRTEEN IDENTICAL REQUESTS ────────
 * `listAccounts(profileId)` is not filtered by platform. It returns every
 * account under the profile and `reconcileAccounts` narrows the list in memory.
 * The return route calls it once per platform, so a single connect fired one
 * request per entry in `ZERNIO_PLATFORMS` — thirteen requests for one answer,
 * twelve of them thrown away.
 *
 * That is not merely wasteful. MEASURED 2026-08-26 from the live response
 * headers: `x-ratelimit-limit: 60` per minute, and `x-ratelimit-remaining` was
 * 47 at the time of the check. Thirteen per trip means three connect attempts
 * inside a minute come close to the ceiling on their own, and a 429 surfaces as
 * a READ failure — so the account the customer connected thirty seconds ago is
 * reported as not found, on a trip where nothing was actually wrong with it.
 *
 * The list was five long until 2026-08-26 and became thirteen the same day the
 * connect-only platforms landed, so this got 2.6x worse in the change that
 * introduced them.
 *
 * Splitting the fetch from the filter lets a caller pay for one request and ask
 * it thirteen questions. `reconcileAccounts` above keeps the one-platform form
 * for callers that genuinely want a single answer.
 */
export function reconcileFromAccounts(
  accounts: readonly ZernioAccount[],
  args: { profileId: string; zernioPlatform: string },
): ReconciledAccount[] {
  return accounts
    .filter((a) => a.platform === args.zernioPlatform)
    .filter((a) => profileIdOf(a) === args.profileId)
    .map((a) => ({
      accountId: a._id,
      profileId: args.profileId,
      username: a.username ?? a.displayName ?? null,
      needsReconnection: a.needsReconnection === true,
      platformStatus: a.platformStatus ?? null,
      tokenExpiresAt: a.tokenExpiresAt ?? null,
    }))
}

function profileIdOf(a: ZernioAccount): string | undefined {
  return typeof a.profileId === 'string' ? a.profileId : a.profileId?._id
}
