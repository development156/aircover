import 'server-only'

import { cookies } from 'next/headers'

import { createServerSupabase } from '@/lib/supabase/server'

// The active-workspace pointer is a UI convenience, NOT an authorization grant:
// RLS decides what each request may read, so an unknown/stale slug simply falls
// back to the first membership (see resolveActiveWorkspace).
export const ACTIVE_WORKSPACE_COOKIE = 'sahoda_ws'

/** View-model projection of `workspaces` — the switcher needs only these three. */
export interface WorkspaceOption {
  id: string
  name: string
  slug: string
}

/**
 * Workspaces the signed-in user can see, RLS-scoped via the Clerk session JWT.
 * Empty until the wt-db `bootstrap_workspace` RPC lands (no INSERT path yet).
 * Any read hiccup degrades to an empty switcher — the app shell never crashes.
 */
export async function listWorkspaces(): Promise<WorkspaceOption[]> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('workspaces')
      .select('id, name, slug')
      .order('created_at', { ascending: true })

    if (error || !data) {
      if (error) console.error('[workspaces] read failed', error.message)
      return []
    }
    return data as WorkspaceOption[]
  } catch (error) {
    console.error('[workspaces] read threw', error)
    return []
  }
}

export async function getActiveWorkspaceSlug(): Promise<string | null> {
  const store = await cookies()
  return store.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null
}

/**
 * Resolve which workspace is active: the cookie choice when it is still a
 * membership, otherwise the first. Returns null only when there are none.
 */
export function resolveActiveWorkspace(
  workspaces: readonly WorkspaceOption[],
  activeSlug: string | null,
): WorkspaceOption | null {
  const [first] = workspaces
  if (!first) return null
  const chosen = activeSlug ? workspaces.find((w) => w.slug === activeSlug) : undefined
  return chosen ?? first
}
