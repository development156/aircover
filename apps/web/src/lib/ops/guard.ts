import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import { OpsAdminSchema, type OpsAdmin, type OpsRole } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The authoritative `/admin` gate (doc 13 §2).
 *
 * Middleware refuses anonymous requests early, but this is the check that
 * decides: it reads ops_admins through the caller's own Clerk JWT, so RLS —
 * `app.is_ops_admin()` — has to agree before a row comes back at all. A
 * non-admin gets an empty result rather than a row with status 'revoked', and
 * both end here as null.
 *
 * Non-admins get 404, never a sign-in upsell: an internal surface should not
 * confirm its own existence to someone who has no business on it.
 */
export async function getOpsAdmin(): Promise<OpsAdmin | null> {
  const { userId } = await auth()
  if (!userId) return null

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('ops_admins')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return null

  const parsed = OpsAdminSchema.safeParse(data)
  if (!parsed.success) return null

  // Belt and braces: RLS already filters revoked seats, but the status is the
  // whole point of the table and this file should not depend on a policy
  // somewhere else staying written the way it is today.
  return parsed.data.status === 'active' ? parsed.data : null
}

/** Use in the `/admin` layout, every server action, and every `/api/admin/*` handler. */
export async function requireOpsAdmin(): Promise<OpsAdmin> {
  const admin = await getOpsAdmin()
  if (!admin) notFound()
  return admin
}

/**
 * Role gate for the actions a viewer must never reach — approving an
 * application, granting credits, changing a seat. `viewer` is read-only by
 * definition (doc 13 §2), so it is never in an allowed list.
 */
export async function requireOpsRole(allowed: readonly OpsRole[]): Promise<OpsAdmin> {
  const admin = await requireOpsAdmin()
  if (!allowed.includes(admin.role)) notFound()
  return admin
}

/** True when this seat may act, as opposed to only look. */
export function canWrite(admin: OpsAdmin): boolean {
  return admin.role === 'owner' || admin.role === 'admin'
}
