import 'server-only'

import { BrandMemoryPayloadSchema, type BrandMemoryPayload } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The workspace's saved Brand Brain.
 *
 * `brand_memory` carries `app.apply_tenant_read_policy`, so members may SELECT
 * it — writes are the `resolve_brand_memory` RPC only. Until now nothing in
 * `apps/web` read the table at all, which is exactly why re-entering
 * `/onboarding` started from a blank screen even for a workspace that had
 * finished the flow: the brain was there, and nobody asked for it.
 *
 * Unlike `activeThemeTokens()` this filters on `workspace_id` explicitly. RLS
 * scopes the read to the caller's MEMBERSHIPS, not to the workspace they are
 * currently in — so someone who belongs to two workspaces would otherwise get
 * whichever row sorted first, which is a different workspace's brand.
 */
export interface SavedBrain {
  payload: BrandMemoryPayload
  version: number
  /** 'resolved' | 'manual' | 'system'. A 'system' row is a demo fallback. */
  source: string
  updatedAt: string
}

/**
 * Is the next resolve free for this workspace?
 *
 * The signal is "has this workspace ever SAVED a Brand Brain", not "has it ever
 * spent credits" — we charge for output and never for the product working out
 * who someone is, and a user who resolved, disliked what came back and left
 * without approving it took no output.
 *
 * It lives here rather than in the `'use server'` action module because every
 * export of one of those is a callable endpoint, and a workspace-id-taking
 * predicate has no business being reachable from a browser. `brand_memory` is
 * only writable through `resolve_brand_memory`, so this cannot be reset from
 * the client either way.
 *
 * KNOWN CONSEQUENCE, accepted deliberately: free resolves are not counted, so
 * a user who keeps re-resolving without ever approving keeps getting them free.
 * That follows from the rule as stated — they have taken no output — and there
 * is no durable per-workspace counter to bound it without a schema change.
 * `apps/web/REQUESTS.md` asks wt-db for one.
 */
export async function isFirstResolve(workspaceId: string): Promise<boolean> {
  return (await activeBrandMemory(workspaceId)) === null
}

export async function activeBrandMemory(workspaceId: string): Promise<SavedBrain | null> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('brand_memory')
      .select('payload, version, source, updated_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .maybeSingle()

    if (error || !data) return null

    const row = data as {
      payload: unknown
      version: number
      source: string
      updated_at: string
    }
    const parsed = BrandMemoryPayloadSchema.safeParse(row.payload)
    // An unparseable payload degrades to "no saved brain" rather than to a
    // half-populated editor. A row that predates a contract change should send
    // the user through the flow, not hand them cards with fields missing.
    if (!parsed.success) return null

    return {
      payload: parsed.data,
      version: row.version,
      source: row.source,
      updatedAt: row.updated_at,
    }
  } catch {
    return null
  }
}
