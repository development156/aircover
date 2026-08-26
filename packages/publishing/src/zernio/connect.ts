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

/** One Zernio profile per workspace, named so a human can find it in their UI. */
export function profileNameForWorkspace(workspaceId: string, workspaceName: string): string {
  return `sahoda:${workspaceName} (${workspaceId.slice(0, 8)})`
}

/**
 * Find-or-create the Zernio profile for a workspace, idempotently.
 *
 * Looks up by exact name first — the spec offers `?name=` precisely to "recover a
 * profile id after an ambiguous create (timeout followed by a 409 on retry)" — and
 * only creates when there is genuinely none. The workspace id seeds the
 * Idempotency-Key so a double-submit cannot mint two profiles for one workspace.
 */
export async function ensureZernioProfile(
  client: ZernioClient,
  args: { workspaceId: string; workspaceName: string },
): Promise<string> {
  const name = profileNameForWorkspace(args.workspaceId, args.workspaceName)

  const existing = await client.listProfiles(name)
  const match = existing.find((p) => p.name === name)
  if (match) return assertUsableProfile(match._id)

  const created = await client.createProfile(name, `sahoda-profile:${args.workspaceId}`)
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
  const accounts = await client.listAccounts(args.profileId)

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
