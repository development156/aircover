import 'server-only'

import {
  ScopeError,
  scopeAccount,
  scopeProfile,
  type ScopedAccountId,
  type ScopedProfileId,
} from '@sahoda/publishing'
import type { ZernioPlatform } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The ONLY way an app-side caller obtains a scoped Zernio id.
 *
 * `@sahoda/publishing` defines the branded types and refuses to mint one from a bare
 * string; this is the lookup that supplies the row. Together they mean a read cannot be
 * issued without a workspace having been resolved first — the omission that would
 * otherwise read across every tenant on the API key is a compile error, not a review
 * item (doc 13 §2.3, §3).
 *
 * `workspaceId` is threaded through and re-checked against the row inside
 * `scopeProfile`/`scopeAccount`. That is deliberate belt-and-braces: RLS already scopes
 * the query, and the check catches the case RLS cannot — a service-role client, or a
 * workspace id that came from somewhere other than the session.
 */

/** Thrown as-is so a caller can distinguish "not connected" from "query failed". */
export { ScopeError }

export async function profileForWorkspace(workspaceId: string): Promise<ScopedProfileId> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('zernio_profiles')
    .select('workspace_id, profile_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) {
    // Never degrade to an unscoped read. No profile means no call.
    throw new ScopeError(`Could not read this workspace’s Zernio profile: ${error.message}`)
  }
  return scopeProfile(data, workspaceId)
}

export async function accountForWorkspace(
  workspaceId: string,
  platform: ZernioPlatform,
  profile: ScopedProfileId,
): Promise<ScopedAccountId> {
  const supabase = createServerSupabase()
  // ── `.limit(1)` AND AN ORDER, NEVER `.maybeSingle()` ────────────────────────
  // This was `.maybeSingle()`, which asks PostgREST to enforce a cardinality of at
  // most one and answers PGRST116 when two rows match. A workspace holding two
  // active Instagram accounts is not an error — the unique index is
  // `(workspace_id, platform, external_account ->> 'id')`, so it is a shape the
  // schema has always allowed — but every caller of this function reached it
  // through `scopeForWorkspace`, so the second account did not degrade a reading:
  // it threw a `ScopeError` and took /analytics and /audience down with it.
  //
  // The order is what makes the answer a DECISION rather than whichever row
  // Postgres happened to return. Callers here ask for "this workspace's
  // Instagram", which with several accounts has no single true answer, so the
  // rule is stated instead of guessed: the FIRST account connected is the one a
  // platform-shaped question resolves to. A screen that means a specific account
  // addresses it by id through `accountFromRoute` below, which is the path that
  // exists precisely because this one cannot tell two accounts apart.
  const { data, error } = await supabase
    .from('connections')
    .select('workspace_id, external_account, status, created_at')
    .eq('workspace_id', workspaceId)
    .eq('platform', platform)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) {
    throw new ScopeError(`Could not read this workspace’s ${platform} connection: ${error.message}`)
  }
  return scopeAccount(data?.[0] ?? null, workspaceId, profile)
}

/**
 * Scope an account id that arrived from a URL segment.
 *
 * ── WHY THIS EXISTS ALONGSIDE `accountForWorkspace` ──────────────────────────
 * That one looks a connection up by PLATFORM and `.maybeSingle()`s it — fine for a
 * screen that means "this workspace's Instagram", wrong for a route. An inbox thread
 * is addressed by its account id, a workspace may hold two accounts on one platform,
 * and the id in the URL is attacker-supplied: it is whatever the customer typed.
 *
 * So the id is used as a QUERY FILTER against this workspace's own rows, never as
 * something to trust. If no row matches, `scopeAccount` gets `null` and throws, and
 * the route turns that into a 404. The id never reaches Zernio unless a row in THIS
 * workspace, carrying THIS workspace's profile, already held it.
 *
 * That is the whole reason the routes are two-segment: a one-segment thread URL would
 * have no account to check, so it would have to read against whichever account Zernio
 * matched — across tenants, since the profile filter defaults to the entire API key.
 *
 * ── THE ID SPACE THIS JOIN ASSUMES ───────────────────────────────────────────
 * The inbox builds these URLs from `ZernioConversation.accountId`, and this looks that
 * value up against `external_account->>'id'`. Those must be the same id space or every
 * thread link 404s while the list renders perfectly — the failure would read as a
 * routing bug, not an id mismatch. This is the same defect class the analytics lane
 * already shipped once (Zernio's 24-hex `_id` vs the platform's own post id).
 *
 * VERIFIED: `external_account->>'id'` is Zernio's account `_id`. The OAuth return writes
 * `account.accountId` from `ZernioAccount._id`
 * (`app/api/oauth/zernio/return/route.ts`), `upsert_zernio_connection` names it
 * ("id is Zernio's account _id"), and both `scopeAccount` and
 * `assert_account_in_workspace_profile` reject anything but 24-char lowercase hex.
 *
 * SETTLED `[LIVE 2026-08-10]`: `/inbox/*` reports that same `_id` as `accountId`. Three
 * values were compared against the first real payloads —
 *
 *   `ZernioAccount._id`                     = `6a75caf7d0fe733d1afcc1f4`
 *   `ZernioConversation.accountId`          = `6a75caf7d0fe733d1afcc1f4`
 *   `ZernioCommentedPost.accountId`         = `6a75caf7d0fe733d1afcc1f4`
 *
 * — and `ZernioMessage.accountId` agrees. The join below is correct, and the failure
 * feared here (a perfectly-rendered list in which every row 404s, reading as a routing
 * bug) does not occur. Pinned by `packages/publishing/src/zernio/inbox-live.test.ts`
 * against committed captures, including the commented-post sibling: closing one row
 * type and leaving the other is the defect class this repo has shipped before.
 */
export async function accountByIdForWorkspace(
  workspaceId: string,
  accountId: string,
  profile: ScopedProfileId,
): Promise<ScopedAccountId> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('connections')
    .select('workspace_id, external_account')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .eq('external_account->>id', accountId)
    .maybeSingle()

  if (error) {
    throw new ScopeError(`Could not read this workspace’s connections: ${error.message}`)
  }
  // Re-mints from the ROW, not from the parameter. The returned brand therefore
  // certifies the stored id, and a row whose id somehow differed would be refused
  // rather than silently blessing the URL's version of it.
  return scopeAccount(data, workspaceId, profile)
}

/**
 * Both ids for one platform, for the common case where a screen needs each.
 *
 * Sequential rather than parallel on purpose: the account check needs the profile to
 * compare against, and a mismatch is exactly the cross-tenant case worth catching.
 */
export async function scopeForWorkspace(
  workspaceId: string,
  platform: ZernioPlatform,
): Promise<{ profile: ScopedProfileId; account: ScopedAccountId }> {
  const profile = await profileForWorkspace(workspaceId)
  const account = await accountForWorkspace(workspaceId, platform, profile)
  return { profile, account }
}
