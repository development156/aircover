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
  const { data, error } = await supabase
    .from('connections')
    .select('workspace_id, external_account, status')
    .eq('workspace_id', workspaceId)
    .eq('platform', platform)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw new ScopeError(`Could not read this workspace’s ${platform} connection: ${error.message}`)
  }
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
