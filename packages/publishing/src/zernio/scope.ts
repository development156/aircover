/**
 * Tenant scoping for Zernio reads, enforced by the type system.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * Doc 13 §3: profiles are ORGANISATIONAL, not authorisational. Zernio validates an
 * accountId against your whole team, so a wrong id does not error — it returns 200
 * and reads (or publishes) someone else's data. There is no server-side tenant
 * boundary on their side. Ours has to be structural.
 *
 * §2.3 recorded this for `GET /accounts`, where an unfiltered call returned an account
 * from a different profile. The same hazard is on every read surface: `/analytics`,
 * `/inbox/conversations`, `/inbox/comments` and `/inbox/reviews` all take `profileId`
 * as an OPTIONAL filter that **defaults to every profile on the key**. Omitting it is
 * not a narrow read — it is a read across all tenants, and it is the default.
 *
 * A convention ("always pass profileId") cannot hold that line; §10 is a written record
 * of a runtime check that was simply forgotten. So the ids below are branded: a plain
 * string is not assignable to them, and the only constructors take a row that has
 * already been fetched for a known workspace. Omission is a compile error, and so is
 * passing an id that came from anywhere else.
 *
 * ── TWO BRANDS, BECAUSE ZERNIO HAS TWO SCOPES ────────────────────────────────
 * Not every endpoint accepts `profileId`. `/analytics/post-timeline` and the
 * `/analytics/instagram/*` family are scoped by `accountId` instead and take no
 * profile filter at all. Applying the same rule to whichever parameter actually
 * exists is what makes this exhaustive rather than merely tidy.
 */

declare const profileBrand: unique symbol
declare const accountBrand: unique symbol

/**
 * A Zernio profile id proven to belong to a specific Sahoda workspace.
 *
 * Only `scopeProfile` can produce one. Never widen this to `string`, and never cast
 * into it — the cast is the tenant boundary failing.
 */
export type ScopedProfileId = string & { readonly [profileBrand]: 'workspace-scoped' }

/**
 * A Zernio account id proven to belong to a specific Sahoda workspace.
 *
 * Only `scopeAccount` can produce one. This is the id doc 13 §3 warns about by name:
 * wrong, it publishes to another customer's Instagram and returns HTTP 200.
 */
export type ScopedAccountId = string & { readonly [accountBrand]: 'workspace-scoped' }

/** The `zernio_profiles` row: one profile per workspace, 1:1, enforced in Postgres. */
export interface ZernioProfileRow {
  workspace_id: string
  profile_id: string
}

/** The `connections` row's `external_account` payload, as the OAuth return writes it. */
export interface ZernioConnectionRow {
  workspace_id: string
  external_account: { id?: unknown; profileId?: unknown } | null
}

/** Zernio ids are 24-char lowercase hex (doc 13 §1). Not UUIDs. */
const ZERNIO_ID = /^[0-9a-f]{24}$/

export class ScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScopeError'
  }
}

/**
 * Mint a scoped profile id from the workspace's own `zernio_profiles` row.
 *
 * `workspaceId` is passed SEPARATELY and checked against the row rather than being
 * read out of it. That is the whole point: the caller states which workspace it
 * believes it is acting for, and a row fetched for a different one is refused instead
 * of being trusted. A mis-joined query becomes an exception, not a cross-tenant read.
 */
export function scopeProfile(row: ZernioProfileRow | null, workspaceId: string): ScopedProfileId {
  if (!row) {
    throw new ScopeError('No Zernio profile is mapped to this workspace.')
  }
  if (row.workspace_id !== workspaceId) {
    throw new ScopeError(
      'Zernio profile row belongs to a different workspace than the one requested.',
    )
  }
  if (typeof row.profile_id !== 'string' || !ZERNIO_ID.test(row.profile_id)) {
    throw new ScopeError('Zernio profile id is not a 24-char hex id.')
  }
  return row.profile_id as ScopedProfileId
}

/**
 * Mint a scoped account id from one of the workspace's own `connections` rows.
 *
 * Also requires the account to sit under the workspace's profile — the two ids are
 * stored together on the row precisely so this can be checked, and checking it closes
 * the case where a connection was written before a profile remap.
 */
export function scopeAccount(
  row: ZernioConnectionRow | null,
  workspaceId: string,
  profile: ScopedProfileId,
): ScopedAccountId {
  if (!row) {
    throw new ScopeError('No connection row for this workspace and channel.')
  }
  if (row.workspace_id !== workspaceId) {
    throw new ScopeError('Connection row belongs to a different workspace than the one requested.')
  }
  const id = row.external_account?.id
  const rowProfile = row.external_account?.profileId
  if (typeof id !== 'string' || !ZERNIO_ID.test(id)) {
    throw new ScopeError('Connection carries no 24-char hex Zernio account id.')
  }
  if (rowProfile !== profile) {
    throw new ScopeError(
      'Connection account sits under a different Zernio profile than this workspace’s.',
    )
  }
  return id as ScopedAccountId
}
